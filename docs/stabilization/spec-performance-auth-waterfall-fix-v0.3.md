# Tiramisu 読み込み速度改善 仕様書 v0.3

作成日: 2026-06-16  
改訂: 再レビューチーム指摘反映版  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象: Next.js / Supabase / Auth / Daily Reports / User Profile  
優先度: P0.5（PoC/社内導入前に解消推奨）

---

## 0. v0.3 改訂要点

v0.1 / v0.2 に対するレビューチーム指摘を反映し、以下を修正した。

1. Phase 1  
   - `ENABLE_PERF_LOG` は任意フラグとして `process.env` 直参照にする
   - `assertEnv` / env必須スキーマには追加しない
   - productionでは `ENABLE_PERF_LOG=true` の場合のみ `[perf]` ログを出す

2. Phase 2  
   - `staff:staff_id(name, role)` alias案を第一候補から外す
   - 既存互換を優先し、`staff(name, role)` を維持する
   - `daily_reports` 必要カラムに `staff_id` を明示追加する

3. Phase 3  
   - `getUserPermissions` の request cache は「同一リクエスト内」のみ有効であり、複数API間では共有されないことを明記
   - `getUserPermissionsUncached` で `options.user` を使う場合も、必ず `user.id === userId` の不変条件を維持する

4. Phase 4  
   - bootstrap APIでscope判定を手書きしない
   - `ensureClinicAccess(request, '/api/dashboard/bootstrap', clinicId)` を必ず再利用する
   - manager階層scopeの判定差分を避ける
   - `daily_reports` 取得・summary・monthlyTrends生成は共有ヘルパーに抽出する

5. 受け入れ条件  
   - `id === userId` 不変条件維持
   - bootstrap APIの認可判定が `ensureClinicAccess` と同一であること
   - manager階層scopeの回帰テストを追加

6. v0.3 追加補強  
   - `getUserPermissions` にも `options` 引数を明示的に追加し、`getUserAccessContext` から伝搬することを明記
   - `userPermissionsRequestCache` のキーに `options` を含めないことを明記
   - bootstrap APIでは fallback 後の **非null clinicId** を `ensureClinicAccess` に渡すことを明記
   - `fetchDailyReportsReadModel` は一覧/bootstrap専用に限定し、`reportId` を引数から外す方針へ修正
   - 個別取得は `fetchDailyReportByIdReadModel` など別関数に分離する方針を追加

---

## 1. 要約

現状、画面読み込み時に 1〜2 秒程度のレイテンシーが発生している。  
静的解析上の主因候補は、DB単体の遅さよりも **認証・プロフィール取得・権限確認・日報取得が直列化していること**。

特に以下の流れが重い。

```txt
useUserProfile
  → /api/auth/profile
    → auth.getUser
    → getUserAccessContext
    → fetchClinicName
  → profile / clinicId 確定
  → useDailyReports
    → /api/daily-reports
      → ensureClinicAccess
        → auth.getUser
        → getUserAccessContext
      → daily_reports query
```

改善方針は以下。

1. 計測ログを追加して、Auth / access / DB / mapping の時間を分離する
2. `daily_reports` API の `select('*')` を必要カラムだけに絞る
3. `getUserAccessContext` に既取得 `user` / `session` を渡せるようにし、同一リクエスト内の重複 `auth.getUser()` / `getSession()` を削減する
4. 中期対応として `/api/dashboard/bootstrap` を追加する場合は、必ず `ensureClinicAccess` を再利用する
5. 既存RLS/権限境界は緩めない。速度改善のために安全性を落とさない

---

## 2. 前提

### 2.1 技術前提

- Next.js 15系
- React 19
- Supabase Auth / Postgres / RLS
- App Router
- API Route経由でDBアクセス
- 多店舗・親子テナント・clinic scopeあり
- managerロールには階層scope解決が存在する

### 2.2 既存の関連ファイル

```txt
src/hooks/useUserProfile.ts
src/hooks/useDailyReports.ts
src/app/api/auth/profile/route.ts
src/app/api/daily-reports/route.ts
src/lib/supabase/guards.ts
src/lib/supabase/server.ts
src/lib/supabase/auth-context.ts
src/providers/user-profile-context.tsx
```

### 2.3 非対象

今回の仕様では以下は直接扱わない。

- 予約画面全体のUX刷新
- RLSポリシーの全面再設計
- DB schemaの大規模変更
- Recharts等のbundle分割
- Supabaseリージョン変更
- Edge Runtime化
- Service Role使用範囲の拡大

---

## 3. 現状の問題

### 3.1 Profile取得と日報取得が直列

`useDailyReports` は `useUserProfileContext()` の `profile.clinicId` に依存している。  
そのため、初期表示では profile が確定するまで `/api/daily-reports` を呼べない。

```ts
const { profile } = useUserProfileContext();
const clinicId = profile?.clinicId ?? null;
```

この構造により、以下のwaterfallが発生する。

```txt
profile取得完了
  ↓
clinicId確定
  ↓
daily reports取得開始
```

### 3.2 `/api/auth/profile` が複数処理を含む

`/api/auth/profile` は以下を実行している。

- `supabase.auth.getUser()`
- `getUserAccessContext(user.id, supabase)`
- `fetchClinicName(clinicId)`

これ自体は正しいが、後続APIでも類似の処理を再実行している。

### 3.3 `/api/daily-reports` でも `ensureClinicAccess` が重複実行される

`/api/daily-reports` は冒頭で `ensureClinicAccess()` を呼び、内部で以下が走る。

- `createClient()`
- `getCurrentUser()`
- `getUserAccessContext()`
- clinic scope check

つまり、profile取得済みであってもAPI単位で認証・権限確認が再実行される。

### 3.4 `getUserAccessContext` 内部でAuth取得が重複しうる

`getUserPermissionsUncached()` 内で以下が発生する。

- `fetchUserPermissionsRecord(adminClient, userId)`
- `getCurrentUser(supabase)`
- `supabase.auth.getSession()`
- 必要に応じてclinic scope解決

呼び出し元で既に `user` を取得済みの場合でも、内部で再度取得している。

重要な前提として、`userPermissionsRequestCache` は同一 `SupabaseServerClient` に紐づく request cache であり、**同一APIリクエスト内では有効**だが、**複数APIリクエスト間では共有されない**。  
したがって Phase 3 の効果は「複数API間の共有」ではなく、「1リクエスト内の初回 `getUserPermissionsUncached` における重複 `getUser` / `getSession` の削減」である。

### 3.5 `select('*')` が残っている

`/api/daily-reports` では以下のように広いselectをしている。

```ts
.select(`
  *,
  staff(name, role)
`)
```

しかしレスポンスに使っているカラムは限定的。

必要カラムは以下。

```txt
daily_reports:
- id
- report_date
- staff_id
- total_patients
- new_patients
- total_revenue
- insurance_revenue
- private_revenue
- report_text
- created_at

staff:
- name
- role
```

---

## 4. 目標

### 4.1 パフォーマンス目標

| 指標 | 現状目安 | 目標 |
|---|---:|---:|
| 初期profile解決 | 不明 | 300ms未満を目指す |
| `/api/daily-reports` | 不明 | 500ms未満を目指す |
| Auth + permission重複 | 1リクエスト内で複数回 | 可能な限り1回化 |
| 初期画面の体感待機 | 1〜2秒 | 500ms〜1秒未満へ圧縮 |

### 4.2 品質目標

- 権限境界を弱めない
- clinic scope checkを削除しない
- manager階層scopeの判定を壊さない
- Service Roleの使用範囲を拡大しない
- RLS bypassを安易に増やさない
- 既存テストを壊さない
- 計測可能な状態にする

---

## 5. 実装方針

---

# Phase 1: 計測ログ追加

## 5.1 対象

```txt
src/app/api/auth/profile/route.ts
src/app/api/daily-reports/route.ts
src/lib/supabase/guards.ts
src/lib/supabase/server.ts
```

## 5.2 共通計測ユーティリティ

新規作成候補。

```txt
src/lib/performance/server-timing.ts
```

実装例。

```ts
export function nowMs(): number {
  return performance.now();
}

export function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function shouldLogPerf(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_PERF_LOG === 'true';
}

export function logPerf(
  label: string,
  start: number,
  extra?: Record<string, unknown>
): void {
  if (!shouldLogPerf()) {
    return;
  }

  console.log('[perf]', label, {
    ms: elapsedMs(start),
    ...extra,
  });
}
```

## 5.3 注意

- `ENABLE_PERF_LOG` は任意フラグ
- `src/lib/env.ts` の必須env検証には追加しない
- `assertEnv('ENABLE_PERF_LOG')` は使わない
- productionでは `ENABLE_PERF_LOG=true` の場合だけ出力する
- `[perf]` プレフィックスを必ず付け、grep可能にする

## 5.4 `/api/auth/profile` 計測

```ts
const tTotal = nowMs();

const tAuth = nowMs();
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();
logPerf('auth.profile.getUser', tAuth);

const tAccess = nowMs();
const accessContext = await getUserAccessContext(user.id, supabase, { user });
logPerf('auth.profile.getUserAccessContext', tAccess);

const tClinic = nowMs();
const clinicName = await fetchClinicName(clinicId);
logPerf('auth.profile.fetchClinicName', tClinic);

logPerf('auth.profile.total', tTotal);
```

## 5.5 `/api/daily-reports` 計測

```ts
const tTotal = nowMs();

const tAccess = nowMs();
const { supabase } = await ensureClinicAccess(request, PATH, clinicId);
logPerf('dailyReports.ensureClinicAccess', tAccess, { clinicId });

const tQuery = nowMs();
const { data: reports, error: reportsError } = await query
  .order('report_date', { ascending: false })
  .limit(30);
logPerf('dailyReports.query', tQuery, { count: reports?.length ?? 0 });

const tMapping = nowMs();
// mapping処理
logPerf('dailyReports.mapping', tMapping);

logPerf('dailyReports.total', tTotal);
```

## 5.6 完了条件

- local devで各APIの処理時間がconsoleに出る
- productionでは `ENABLE_PERF_LOG=true` の時だけ出る
- Auth / access / permission / DB / mapping の時間を分離できる

---

# Phase 2: `daily_reports` のselect句削減

## 6.1 現状

```ts
.select(
  `
  *,
  staff(name, role)
`
)
```

## 6.2 修正方針

既存の `getStaffNameFromReport()` は `report.staff` を配列/オブジェクト両対応で読んでいるため、relation aliasを変えない。  
第一候補は `staff(name, role)` を維持し、`daily_reports` 側だけカラム指定する。

## 6.3 修正後

```ts
.select(
  `
  id,
  report_date,
  staff_id,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at,
  staff(name, role)
`
)
```

## 6.4 個別取得側も同様に修正

`reportId` がある場合の個別取得でも `*` を使わない。

```ts
.select(
  `
  id,
  report_date,
  staff_id,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at,
  staff(name, role)
`
)
```

## 6.5 禁止

以下は初回実装では避ける。

```ts
staff:staff_id (
  name,
  role
)
```

理由:

- 既存の `getStaffNameFromReport()` が `report.staff` を前提にしている
- relation alias変更でレスポンスshapeが変わる恐れがある
- 今回の目的はpayload削減であり、relation名変更ではない

## 6.6 完了条件

- `/api/daily-reports` GETが従来と同一レスポンス形式を返す
- `reports[].staffName` が壊れない
- summary / monthlyTrends が壊れない
- TypeScriptエラーなし
- 既存テスト通過

---

# Phase 3: `getUserAccessContext` の重複Auth削減

## 7.1 目的

すでに取得済みの `user` / `session` を再利用し、同一リクエスト内での重複 `auth.getUser()` / `getSession()` を減らす。

重要:  
これは複数APIリクエスト間の共有ではない。  
APIリクエストをまたいだcacheは今回の対象外。

## 7.2 型追加

対象:

```txt
src/lib/supabase/server.ts
```

追加候補。

```ts
import type { User, Session } from '@supabase/supabase-js';

interface UserAccessContextOptions {
  user?: User | null;
  session?: Session | null;
}
```

## 7.3 `getUserAccessContext` のsignature変更

現状。

```ts
export async function getUserAccessContext(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserAccessContext>
```

修正後。

```ts
export async function getUserAccessContext(
  userId: string,
  client?: SupabaseServerClient,
  options: UserAccessContextOptions = {}
): Promise<UserAccessContext>
```

## 7.4 `getUserPermissions` / `getUserPermissionsUncached` にoptionsを伝搬

`getUserAccessContext` と `getUserPermissionsUncached` の間にある `getUserPermissions` にも、明示的に `options` 引数を追加する。

現状。

```ts
export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserPermissions | null>
```

修正後。

```ts
export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient,
  options: UserAccessContextOptions = {}
): Promise<UserPermissions | null>
```

`getUserAccessContext` からの呼び出しも以下のように変更する。

```ts
const [permissions, profileStatus] = await Promise.all([
  getUserPermissions(userId, supabase, options),
  fetchProfileStatus(supabase, userId),
]);
```

`getUserPermissions` 内では、初回取得時に `options` を `getUserPermissionsUncached` へ伝搬する。

現状。

```ts
const permissionsPromise = getUserPermissionsUncached(userId, supabase)
```

修正後。

```ts
const permissionsPromise = getUserPermissionsUncached(userId, supabase, options)
```

### 7.4.1 request cache の扱い

`userPermissionsRequestCache` のキャッシュキーは **従来通り `userId` のみ** とする。  
`options` はキャッシュキーに含めない。

理由:

- `options.user` / `options.session` は結果を変える入力ではなく、同じ `userId` のAuth再取得を減らすための最適化情報である
- permissionsの論理結果は `userId` に対して同一であるべき
- `options` をキャッシュキーに含めると、同一リクエスト内cacheの効果が落ちる
- 初回呼び出し時に渡された `options` が有効になれば十分

したがって、以下はやらない。

```ts
const cacheKey = JSON.stringify({ userId, hasUser: Boolean(options.user) });
```

正しくは従来通り。

```ts
const cachedPermissions = cachedPermissionsByUser.get(userId);
```

## 7.5 `getUserPermissionsUncached` の修正

現状では内部で `getCurrentUser(supabase)` を呼んでいる。

```ts
const currentUser = await getCurrentUser(supabase);
const permissions = resolvePermissionRecord(
  permissionsData,
  currentUser && currentUser.id === userId ? currentUser : null
);
```

修正後も、**`currentUser.id === userId` の不変条件を必ず維持する**。

```ts
const currentUserCandidate = options.user ?? await getCurrentUser(supabase);
const currentUser =
  currentUserCandidate && currentUserCandidate.id === userId
    ? currentUserCandidate
    : null;

const permissions = resolvePermissionRecord(
  permissionsData,
  currentUser
);
```

## 7.6 session再利用

`getSession()` も `options.session` がある場合は優先する。  
ただし、sessionを使う場合もuser id整合性を確認する。

```ts
let session = options.session ?? null;

if (session?.user?.id !== userId) {
  session = null;
}

if (!session) {
  const result = await supabase.auth.getSession();
  session = result.data.session;
}
```

JWT claims利用時も、`session.user.id === userId` が成立するsessionのみ使う。

## 7.7 互換性

既存呼び出しは壊さない。  
第三引数はoptionalにする。

```ts
getUserAccessContext(user.id, supabase)
```

も従来通り動くこと。

## 7.8 `/api/auth/profile` 側の修正

```ts
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();

const accessContext = await getUserAccessContext(user.id, supabase, { user });
```

## 7.9 `ensureClinicAccess` 側の修正

`ensureClinicAccess` では `getCurrentUser()` でuserを取っているため、そのuserを渡す。

```ts
const user = await getCurrentUser(supabase);
const accessContext = await getUserAccessContext(user.id, supabase, { user });
```

## 7.10 完了条件

- 既存の認証・権限テストが通る
- `getUserAccessContext` の呼び出し互換性が維持される
- `/api/auth/profile` の `getUserAccessContext` 時間が短縮される
- `/api/daily-reports` の `ensureClinicAccess` 時間が短縮される
- `id === userId` の不変条件が維持されている

---

# Phase 4: Dashboard Bootstrap API追加

Phase 4は任意。ただし実装する場合は、v0.1の「手書きscope検証」案は禁止。  
認可判定は必ず既存の `ensureClinicAccess` を再利用する。

## 8.1 目的

初期表示で必要なprofileと日報データを1APIで返し、client-side waterfallを削減する。

## 8.2 新規API

```txt
src/app/api/dashboard/bootstrap/route.ts
```

## 8.3 Request

```http
GET /api/dashboard/bootstrap?clinic_id=<uuid>
```

`clinic_id` が指定されない場合は、認可済みユーザーの `permissions.clinic_id` をfallbackにできる。  
ただし、fallback後も `ensureClinicAccess` を通すこと。

重要:  
`ensureClinicAccess` は `clinicId` が `null` の場合、既定の `requireClinicMatch` が `false` になり、clinic scope checkをスキップしうる。  
そのため bootstrap APIでは、**fallbackで解決した非nullの `clinicId` を `ensureClinicAccess` に渡すこと**。  
`clinicId` を解決できない場合は、`ensureClinicAccess` に `null` を渡して進めるのではなく、400または403でfail-closedする。

## 8.4 Response

```ts
type DashboardBootstrapResponse = {
  success: true;
  data: {
    profile: {
      id: string;
      email: string | null;
      role: string | null;
      clinicId: string | null;
      clinicName: string | null;
      isActive: boolean;
      isAdmin: boolean;
    };
    dailyReports: {
      reports: Array<{
        id: unknown;
        reportDate: string;
        staffName: string;
        totalPatients: number;
        newPatients: number;
        totalRevenue: number;
        insuranceRevenue: number;
        privateRevenue: number;
        reportText?: string | null;
        createdAt: string;
      }>;
      summary: {
        totalReports: number;
        averagePatients: number;
        averageRevenue: number;
        totalRevenue: number;
      };
      monthlyTrends: Array<{
        month: string;
        reports: number;
        totalPatients: number;
        totalRevenue: number;
      }>;
    };
  };
};
```

注意:  
`DailyReportApiResponse` の `id` 型は既存API応答に合わせる。  
DB実型がuuid / bigint / numberのどれかを新規に決め打ちしない。  
可能なら `src/types/supabase.ts` の生成型に合わせる。

## 8.5 処理

禁止される処理:

```txt
getUserAccessContextだけを使って独自にscope判定する
canAccessClinicScopeだけで判定する
manager階層scopeを手書きで再実装する
```

正しい処理:

```txt
1. requestからclinic_idを読む
2. clinic_id未指定なら、一度認証情報を取得してfallback clinic_idを決める
3. fallback後のclinicIdがnullなら400または403でfail-closedする
4. 非nullのclinicIdを ensureClinicAccess(request, '/api/dashboard/bootstrap', clinicId) に渡す
5. ensureClinicAccessが返した user / permissions / supabase を使う
6. profileを構築する
7. dailyReports共有ヘルパーで日報データを取得する
8. profile + dailyReports をまとめて返す
```

## 8.6 認可の不変条件

bootstrap APIは、既存 `/api/daily-reports` と同一の認可境界を持つこと。

必須:

```ts
if (!clinicId) {
  return NextResponse.json(
    { error: 'clinic_id could not be resolved' },
    { status: 403 }
  );
}

const { supabase, user, permissions } = await ensureClinicAccess(
  request,
  '/api/dashboard/bootstrap',
  clinicId
);
```

`clinicId` はこの時点で必ず非nullであること。  
`null` のまま `ensureClinicAccess` に渡さない。

これにより、managerロールの階層scope解決も既存実装と同一になる。

## 8.7 daily_reports取得ロジックの共有化

既存 `/api/daily-reports` と bootstrap APIで、日報取得・summary・monthlyTrends生成を二重実装しない。

新規ヘルパー候補。

```txt
src/lib/daily-reports/read-model.ts
```

責務:

```ts
export async function fetchDailyReportsReadModel(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<{
  reports: DailyReportApiResponse[];
  summary: DailyReportsSummary;
  monthlyTrends: MonthlyTrend[];
}>
```

このヘルパー内で以下を行う。

- 必要カラムだけselect
- `staff(name, role)` relation維持
- summary計算
- monthlyTrends計算
- 既存レスポンスshape維持

### 8.7.1 個別取得は別関数に分ける

既存 `/api/daily-reports?id=...` の個別取得は、一覧/bootstrapとは戻り値shapeが異なる。  
そのため `fetchDailyReportsReadModel` に `reportId` を持たせて単一取得まで担わせない。

個別取得が必要な場合は、別関数に分離する。

```ts
export async function fetchDailyReportByIdReadModel(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  reportId: string;
}): Promise<DailyReportApiResponse | null>
```

理由:

- 一覧/bootstrapは `{ reports, summary, monthlyTrends }`
- 個別取得は単一 `DailyReportApiResponse`
- 1つの関数に両方を持たせると型が歪む
- 実装者が `reportId` 有無で戻り値を分岐させると、呼び出し側が不安定になる

## 8.8 client側

新規hook候補。

```txt
src/hooks/useDashboardBootstrap.ts
```

役割。

- 初期profile
- 初期daily reports
- loading state
- error state

既存 `useUserProfile` / `useDailyReports` は段階的に残す。

## 8.9 Phase 4 完了条件

- bootstrap APIが `ensureClinicAccess` を再利用している
- scope判定を手書きしていない
- manager階層scopeで既存 `/api/daily-reports` と同じ判定になる
- daily report query / summary / monthlyTrends は共有ヘルパー化されている
- 既存 `/api/auth/profile` と `/api/daily-reports` は削除しない
- 既存APIのレスポンスshapeは変えない

---

# Phase 5: React Query導入検討

`package.json` には `@tanstack/react-query` が既に存在する。  
ただし今回のP0対応では必須にしない。

中期的には以下のようにする。

```ts
useQuery({
  queryKey: ['dailyReports', clinicId],
  queryFn: () => fetchDailyReports(clinicId),
  enabled: Boolean(clinicId),
  staleTime: 60_000,
});
```

期待効果。

- 同一画面内の重複fetch削減
- キャッシュによる戻る/再表示高速化
- loading/error管理の統一

---

## 9. DB / Index方針

### 9.1 `daily_reports`

既存migration上、`daily_reports` には `UNIQUE (clinic_id, report_date)` の暗黙indexがある前提。  
ただし、この前提は実装前に `supabase/migrations/` をSSOTとして確認すること。

確認対象:

```txt
daily_reports_clinic_id_report_date_key
UNIQUE (clinic_id, report_date)
```

### 9.2 追加indexは原則まだ不要

`/api/daily-reports` の主要クエリは以下。

```sql
where clinic_id = ...
order by report_date desc
limit 30
```

`UNIQUE (clinic_id, report_date)` が存在するなら概ねカバーされる見込み。  
追加indexは `EXPLAIN ANALYZE` で必要性を確認してから判断する。

### 9.3 追加検討index

計測で遅い場合のみ検討。

```sql
create index concurrently if not exists idx_daily_reports_clinic_report_date_desc
on public.daily_reports (clinic_id, report_date desc);
```

ただし、既存unique indexと用途が近いため、`EXPLAIN ANALYZE` を見てから判断する。

### 9.4 必ず確認するEXPLAIN

```sql
explain analyze
select
  id,
  report_date,
  staff_id,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at
from public.daily_reports
where clinic_id = '<clinic_id>'
order by report_date desc
limit 30;
```

見るべき項目。

```txt
Index Scan
Bitmap Index Scan
Seq Scan
Sort
Execution Time
Rows Removed by Filter
```

`Seq Scan` かつ件数増加で遅い場合のみindexを追加する。

---

## 10. テスト方針

### 10.1 Unit / Integration

最低限以下を確認。

```bash
npm run type-check
npm run lint
npm test
```

該当テストがある場合は優先実行。

```bash
npm test -- daily-reports
npm test -- auth
npm test -- api
npm test -- manager
```

### 10.2 API手動確認

#### `/api/auth/profile`

期待。

- 200
- profileが返る
- clinicNameが返る
- roleがnormalizeされる
- 未認証は401

#### `/api/daily-reports`

期待。

- 200
- reports配列が返る
- summaryが返る
- monthlyTrendsが返る
- staffNameが壊れない
- scope外clinic_idは403

#### `/api/dashboard/bootstrap`

Phase 4実装時。

- 200
- profile + dailyReportsが一括で返る
- scope外clinic_idは403
- 未認証は401
- manager階層scopeの許可/拒否が `ensureClinicAccess` と一致する

### 10.3 回帰テスト

追加推奨。

```txt
src/__tests__/api/dashboard-bootstrap-access.test.ts
src/__tests__/lib/get-user-access-context-options.test.ts
src/__tests__/api/daily-reports-select-shape.test.ts
```

検証内容。

1. `getUserAccessContext(userId, client, { user })`
   - `user.id === userId` の場合のみJWT/app_metadata fallbackに使う
   - `user.id !== userId` の場合はfallbackに使わない

2. `/api/daily-reports`
   - `select('*')` を使わなくても既存shapeを返す
   - `staffName` が維持される

3. `/api/dashboard/bootstrap`
   - `ensureClinicAccess` を通る
   - manager階層scopeが既存APIと同じ判定になる

### 10.4 パフォーマンステスト

local / previewで以下を比較。

| API | 修正前 | 修正後 | 目標 |
|---|---:|---:|---:|
| `/api/auth/profile` | 計測 | 計測 | -30%以上 |
| `/api/daily-reports` | 計測 | 計測 | -20%以上 |
| initial dashboard load | 計測 | 計測 | 500ms以上短縮を目標 |

---

## 11. 受け入れ条件

### 11.1 必須

- [ ] `/api/daily-reports` の `select('*')` が削除されている
- [ ] `staff(name, role)` relation名を維持している
- [ ] `staff_id` が必要カラムに含まれている
- [ ] API処理時間を `auth / access / query / mapping / total` で分離計測できる
- [ ] productionでは `ENABLE_PERF_LOG=true` の時だけ `[perf]` ログが出る
- [ ] `getUserAccessContext` が既取得 `user` / `session` を受け取れる
- [ ] `getUserPermissions` にも `options` 引数が追加され、`getUserAccessContext` から伝搬されている
- [ ] `userPermissionsRequestCache` のキーに `options` を含めていない
- [ ] 既存呼び出し互換性が維持されている
- [ ] `getUserPermissionsUncached` 内の `user.id === userId` 不変条件が維持されている
- [ ] session再利用時も `session.user.id === userId` が確認されている
- [ ] 権限チェックが弱体化していない
- [ ] `npm run type-check` が通る
- [ ] `npm run lint` が通る
- [ ] 主要APIが手動確認で期待レスポンスを返す

### 11.2 Phase 4 実装時の必須条件

- [ ] bootstrap APIが `ensureClinicAccess` を再利用している
- [ ] bootstrap APIでscope判定を手書きしていない
- [ ] fallback後の非null `clinicId` を `ensureClinicAccess` に渡している
- [ ] `clinicId` を解決できない場合はfail-closedしている
- [ ] manager階層scopeの判定が既存APIと一致している
- [ ] daily report一覧取得・summary・monthlyTrends生成が共有ヘルパー化されている
- [ ] 個別取得と一覧/bootstrapのread modelが混在していない
- [ ] 既存 `/api/auth/profile` と `/api/daily-reports` を削除していない
- [ ] 既存APIレスポンスshapeが変わっていない

### 11.3 推奨

- [ ] `/api/dashboard/bootstrap` が追加されている
- [ ] 初期表示でprofile取得とdaily reports取得のwaterfallが削減されている
- [ ] preview環境で1秒未満の体感表示に近づいている
- [ ] React Query導入方針が整理されている

---

## 12. リスク

### 12.1 技術リスク

| リスク | 致命度 | 対策 |
|---|---:|---|
| relation alias変更でstaffNameが壊れる | 中 | alias変更禁止。`staff(name, role)` 維持 |
| `getUserAccessContext` のsignature変更で型エラー | 中 | 第三引数optionalで互換維持 |
| `options.user` で別userを誤用する | 高 | `user.id === userId` 必須 |
| `options.session` で別sessionを誤用する | 高 | `session.user.id === userId` 必須 |
| bootstrap APIで認可判定がズレる | 高 | `ensureClinicAccess` 必須再利用 |
| manager階層scopeが壊れる | 高 | 既存guard経由、回帰テスト追加 |
| perf logが本番ログを汚す | 低 | `ENABLE_PERF_LOG=true` の時のみproduction出力 |

### 12.2 市場/プロダクトリスク

読み込みが遅いままだと、現場スタッフから「便利だけど重い」という評価になりやすい。  
SaaSは機能数よりも「毎日使ってストレスがない」が重要。特に日報・予約・分析は業務導線なので、1〜2秒の積み重ねは解約理由になる。

### 12.3 法務/セキュリティリスク

速度改善のためにRLSやscope checkを削るのは不可。  
今回の仕様では権限境界は維持し、重複処理だけを減らす。

### 12.4 オペレーションリスク

計測なしで最適化すると、効果が見えずに沼る。  
最初に必ずログを入れる。

### 12.5 資金/時間リスク

最小対応は Phase 1〜3。  
Phase 4以降は余力でよい。

---

## 13. Codex実装指示

以下をそのままCodexへ渡す。

```md
IFs1991/seikotsuin_no_saas の読み込み速度改善を実装してください。

目的:
画面初期読み込みで1〜2秒程度のレイテンシーがあるため、Auth/API waterfallと不要なDB payloadを削減する。

対象ファイル:
- src/hooks/useUserProfile.ts
- src/hooks/useDailyReports.ts
- src/app/api/auth/profile/route.ts
- src/app/api/daily-reports/route.ts
- src/lib/supabase/guards.ts
- src/lib/supabase/server.ts
- src/lib/supabase/auth-context.ts

Phase 1:
API計測ログを追加してください。
新規ファイル候補:
- src/lib/performance/server-timing.ts

要件:
- logPerf / nowMs / elapsedMs を実装
- local devでは [perf] ログを出す
- productionでは process.env.ENABLE_PERF_LOG === 'true' の場合のみ出す
- ENABLE_PERF_LOG は任意フラグなので assertEnv には追加しない
- /api/auth/profile
  - auth.getUser
  - getUserAccessContext
  - fetchClinicName
  - total
- /api/daily-reports
  - ensureClinicAccess
  - daily_reports query
  - response mapping
  - total

Phase 2:
src/app/api/daily-reports/route.ts の select('*') を削除し、必要カラムだけ取得してください。

重要:
- relation aliasは変えないでください
- staff:staff_id(name, role) にはしないでください
- 既存互換のため staff(name, role) を維持してください

必要カラム:
- id
- report_date
- staff_id
- total_patients
- new_patients
- total_revenue
- insurance_revenue
- private_revenue
- report_text
- created_at
- staff(name, role)

既存レスポンス形式は変えないでください。
staffName, summary, monthlyTrends が壊れないようにしてください。

Phase 3:
getUserAccessContext に第三引数 options を追加し、既取得 user/session を渡せるようにしてください。
既存呼び出しは壊さないでください。

例:
getUserAccessContext(user.id, supabase, { user })
getUserAccessContext(user.id, supabase, { user, session })

getUserPermissions にも options 引数を追加し、getUserAccessContext から getUserPermissions、さらに getUserPermissionsUncached へ options を伝搬してください。

重要:
- userPermissionsRequestCache のキーは従来通り userId のみにしてください
- options はキャッシュキーに含めないでください
- options は結果を変える入力ではなく、Auth再取得を減らす最適化情報です

getUserPermissionsUncached 内で getCurrentUser(supabase) を呼ぶ前に options.user を優先してください。

ただし、必ず以下の不変条件を維持してください:
- options.user を使う場合も user.id === userId の時だけ resolvePermissionRecord のfallbackに使う
- options.session を使う場合も session.user.id === userId の時だけJWT/app_metadata参照に使う
- id不一致なら options.user/options.session は無視し、既存fallbackへ戻す

ensureClinicAccess と /api/auth/profile では、すでに取得済みの user を getUserAccessContext に渡してください。

Phase 4 optional:
可能なら /api/dashboard/bootstrap を追加し、profile + dailyReports を1リクエストで返してください。

ただし、bootstrap APIではscope判定を手書きしないでください。
必ず ensureClinicAccess(request, '/api/dashboard/bootstrap', clinicId) を再利用してください。
canAccessClinicScope だけで代替しないでください。
managerロールの階層scope判定が既存APIとズレるためです。

clinic_id が未指定の場合:
- 認証情報からfallback clinicIdを解決してください
- fallback後もclinicIdがnullなら400または403でfail-closedしてください
- clinicIdがnullのままensureClinicAccessへ渡さないでください
- ensureClinicAccessには非nullのclinicIdを渡してください

daily_reports の一覧query/summary/monthlyTrends処理は共有ヘルパーへ抽出してください。
候補:
- src/lib/daily-reports/read-model.ts

read model helperの方針:
- fetchDailyReportsReadModel は一覧/bootstrap専用にしてください
- reportId は引数に含めないでください
- 個別取得は fetchDailyReportByIdReadModel など別関数に分けてください

受け入れ条件:
- npm run type-check が通る
- npm run lint が通る
- /api/auth/profile が従来通り動く
- /api/daily-reports が従来通りのレスポンス形式を返す
- 未認証は401
- scope外clinic_idは403
- 権限チェックを弱めない
- getUserPermissionsUncached の user.id === userId 不変条件を維持
- getUserPermissions の cache key に options を含めない
- bootstrap APIを実装する場合、ensureClinicAccessを必ず再利用
- fallback後の非null clinicIdをensureClinicAccessに渡す
- manager階層scopeで既存APIとbootstrap APIの判定が一致する
- performance logで処理時間を分離確認できる

禁止:
- RLSを削除しない
- ensureClinicAccessを削除しない
- clinic scope checkを削除しない
- Service Roleの利用範囲を広げない
- staff relation aliasを変更しない
```

---

## 14. 実装優先順位

1. 計測ログ追加
2. `daily_reports` のselect句削減
3. `getUserAccessContext` の既取得user/session再利用
4. `getUserPermissions` へのoptions伝搬を明示実装
5. `id === userId` 不変条件のテスト追加
6. `ensureClinicAccess` からuserを渡す
7. `/api/auth/profile` からuserを渡す
8. 実測
9. まだ遅ければ `daily_reports` read model helper抽出
10. それでも遅ければ `dashboard/bootstrap` API
11. それでも遅ければDB EXPLAIN / bundle分析

---

## 15. 判断

この修正はペイする。  
理由は、今の遅延が機能追加で自然悪化する構造だから。

ただし、Phase 4は雑にやると危険。  
特にmanager階層scopeを `canAccessClinicScope` だけで代替すると、既存の `ensureClinicAccess` と認可判定がズレる。

したがって実装判断は以下。

```txt
Phase 1〜3: すぐ着手可
Phase 4: ensureClinicAccess再利用 + fallback clinicId非null保証 + read model共有化を前提に着手
```

放置すると、日報だけでなく予約・分析・管理画面でも同じAuth/API waterfallが増殖する。  
今のうちに「同一リクエスト内のAuth重複削減」と「初期表示データの束ね方」を整理すべき。
