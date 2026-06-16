# Tiramisu 読み込み速度改善 仕様書 v0.1

作成日: 2026-06-16  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象: Next.js / Supabase / Auth / Daily Reports / User Profile  
優先度: P0.5（PoC/社内導入前に解消推奨）

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

1. 計測ログを追加して、Auth / DB / mapping の時間を分離する
2. `daily_reports` API の `select('*')` を必要カラムだけに絞る
3. `getUserAccessContext` に既取得 `user` / `session` を渡せるようにし、重複 `auth.getUser()` / `getSession()` を削減する
4. 中期対応として `/api/dashboard/bootstrap` を追加し、profile + initial data を1リクエスト化する
5. 既存RLS/権限境界は緩めない。速度改善のために安全性を落とさない

---

## 2. 前提

### 技術前提

- Next.js 15系
- React 19
- Supabase Auth / Postgres / RLS
- App Router
- API Route経由でDBアクセス
- 多店舗・親子テナント・clinic scopeあり

### 既存の関連ファイル

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

### 非対象

今回の仕様では以下は直接扱わない。

- 予約画面全体のUX刷新
- RLSポリシーの全面再設計
- DB schemaの大規模変更
- Recharts等のbundle分割
- Supabaseリージョン変更
- Edge Runtime化

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
- total_patients
- new_patients
- total_revenue
- insurance_revenue
- private_revenue
- report_text
- created_at
- staff_id

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
| Auth + permission重複 | 複数回 | 可能な限り1回化 |
| 初期画面の体感待機 | 1〜2秒 | 500ms〜1秒未満へ圧縮 |

### 4.2 品質目標

- 権限境界を弱めない
- clinic scope checkを削除しない
- Service Roleの使用範囲を拡大しない
- RLS bypassを安易に増やさない
- 既存テストを壊さない
- 計測可能な状態にする

---

## 5. 実装方針

## Phase 1: 計測ログ追加

### 5.1 対象

```txt
src/app/api/auth/profile/route.ts
src/app/api/daily-reports/route.ts
src/lib/supabase/guards.ts
src/lib/supabase/server.ts
```

### 5.2 共通計測ユーティリティ

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

export function logPerf(label: string, start: number, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_PERF_LOG !== 'true') {
    return;
  }

  console.log('[perf]', label, {
    ms: elapsedMs(start),
    ...extra,
  });
}
```

### 5.3 `/api/auth/profile` 計測

```ts
const tTotal = nowMs();

const tAuth = nowMs();
const { data: { user }, error: authError } = await supabase.auth.getUser();
logPerf('auth.profile.getUser', tAuth);

const tAccess = nowMs();
const accessContext = await getUserAccessContext(user.id, supabase, { user });
logPerf('auth.profile.getUserAccessContext', tAccess);

const tClinic = nowMs();
const clinicName = await fetchClinicName(clinicId);
logPerf('auth.profile.fetchClinicName', tClinic);

logPerf('auth.profile.total', tTotal);
```

### 5.4 `/api/daily-reports` 計測

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

### 5.5 完了条件

- local devで各APIの処理時間がconsoleに出る
- productionでは `ENABLE_PERF_LOG=true` の時だけ出る
- Auth / permission / DB / mapping の時間を分離できる

---

## Phase 2: `daily_reports` のselect句削減

### 6.1 現状

```ts
.select(
  `
  *,
  staff(name, role)
`
)
```

### 6.2 修正後

```ts
.select(
  `
  id,
  report_date,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at,
  staff:staff_id (
    name,
    role
  )
`
)
```

### 6.3 個別取得側も同様に修正

`reportId` がある場合の個別取得でも `*` を使わない。

### 6.4 注意

Supabaseの外部キー名・relation名によっては `staff:staff_id` が失敗する可能性がある。  
その場合は既存の `staff(name, role)` を維持しつつ、daily_reports側だけカラム指定する。

代替案。

```ts
.select(
  `
  id,
  report_date,
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

### 6.5 完了条件

- `/api/daily-reports` GETが従来と同一レスポンス形式を返す
- `reports[].staffName` が壊れない
- summary / monthlyTrends が壊れない
- TypeScriptエラーなし
- 既存テスト通過

---

## Phase 3: `getUserAccessContext` の重複Auth削減

### 7.1 目的

すでに取得済みの `user` / `session` を再利用し、内部での重複 `auth.getUser()` / `getSession()` を減らす。

### 7.2 型追加

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

### 7.3 `getUserAccessContext` のsignature変更

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

### 7.4 `getUserPermissions` / `getUserPermissionsUncached` にoptionsを伝搬

現状。

```ts
const permissionsPromise = getUserPermissionsUncached(userId, supabase)
```

修正後。

```ts
const permissionsPromise = getUserPermissionsUncached(userId, supabase, options)
```

### 7.5 `getUserPermissionsUncached` の修正

現状では内部で `getCurrentUser(supabase)` を呼んでいる。

```ts
const currentUser = await getCurrentUser(supabase);
```

修正後。

```ts
const currentUser = options.user ?? await getCurrentUser(supabase);
```

`getSession()` も可能ならoptions.sessionを優先する。

```ts
let session = options.session ?? null;

if (!session) {
  const result = await supabase.auth.getSession();
  session = result.data.session;
}
```

### 7.6 互換性

既存呼び出しは壊さない。  
第三引数はoptionalにする。

```ts
getUserAccessContext(user.id, supabase)
```

も従来通り動くこと。

### 7.7 `/api/auth/profile` 側の修正

```ts
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();

const accessContext = await getUserAccessContext(user.id, supabase, { user });
```

### 7.8 `ensureClinicAccess` 側の修正

`ensureClinicAccess` では `getCurrentUser()` でuserを取っているため、そのuserを渡す。

```ts
const user = await getCurrentUser(supabase);
const accessContext = await getUserAccessContext(user.id, supabase, { user });
```

### 7.9 完了条件

- 既存の認証・権限テストが通る
- `getUserAccessContext` の呼び出し互換性が維持される
- `/api/auth/profile` の `getUserAccessContext` 時間が短縮される
- `/api/daily-reports` の `ensureClinicAccess` 時間が短縮される

---

## Phase 4: Dashboard Bootstrap API追加

このPhaseは必須ではないが、1〜2秒の体感改善には最も効く可能性が高い。

### 8.1 目的

初期表示で必要なprofileと日報データを1APIで返し、client-side waterfallを削減する。

### 8.2 新規API

```txt
src/app/api/dashboard/bootstrap/route.ts
```

### 8.3 Request

```http
GET /api/dashboard/bootstrap?clinic_id=<uuid>
```

### 8.4 Response

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
      reports: DailyReportApiResponse[];
      summary: {
        totalReports: number;
        averagePatients: number;
        averageRevenue: number;
        totalRevenue: number;
      };
      monthlyTrends: MonthlyTrend[];
    };
  };
};
```

### 8.5 処理

```txt
1. createClient()
2. auth.getUser()
3. getUserAccessContext(user.id, supabase, { user })
4. clinicIdを検証
5. clinicName取得
6. dailyReports取得
7. profile + dailyReports をまとめて返す
```

### 8.6 注意

- `clinic_id` が指定されない場合は `accessContext.clinicId` を使う
- 指定clinic_idがscope外なら403
- 既存 `/api/auth/profile` と `/api/daily-reports` は残す
- まずはdashboard用の追加APIとして導入し、既存APIを破壊しない

### 8.7 client側

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

---

## Phase 5: React Query導入検討

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
そのため `idx_daily_reports_clinic_date` は重複として削除されている。

現時点では追加indexは必須ではない。

### 9.2 追加検討index

計測で遅い場合のみ検討。

```sql
create index concurrently if not exists idx_daily_reports_clinic_report_date_desc
on public.daily_reports (clinic_id, report_date desc);
```

ただし、既存unique indexと用途が近いため、`EXPLAIN ANALYZE` を見てから判断する。

### 9.3 必ず確認するEXPLAIN

```sql
explain analyze
select
  id,
  report_date,
  total_patients,
  new_patients,
  total_revenue,
  insurance_revenue,
  private_revenue,
  report_text,
  created_at,
  staff_id
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

### 10.3 パフォーマンステスト

local / previewで以下を比較。

| API | 修正前 | 修正後 | 目標 |
|---|---:|---:|---:|
| `/api/auth/profile` | 計測 | 計測 | -30%以上 |
| `/api/daily-reports` | 計測 | 計測 | -20%以上 |
| initial dashboard load | 計測 | 計測 | 500ms以上短縮を目標 |

---

## 11. 受け入れ条件

### 必須

- [ ] `/api/daily-reports` の `select('*')` が削除されている
- [ ] API処理時間を `auth / access / query / mapping / total` で分離計測できる
- [ ] `getUserAccessContext` が既取得 `user` を受け取れる
- [ ] 既存呼び出し互換性が維持されている
- [ ] 権限チェックが弱体化していない
- [ ] `npm run type-check` が通る
- [ ] `npm run lint` が通る
- [ ] 主要APIが手動確認で期待レスポンスを返す

### 推奨

- [ ] `/api/dashboard/bootstrap` が追加されている
- [ ] 初期表示でprofile取得とdaily reports取得のwaterfallが削減されている
- [ ] preview環境で1秒未満の体感表示に近づいている

---

## 12. リスク

### 技術リスク

| リスク | 致命度 | 対策 |
|---|---:|---|
| `staff:staff_id` relation指定が壊れる | 中 | 既存 `staff(name, role)` 形式へ戻す |
| `getUserAccessContext` のsignature変更で型エラー | 中 | 第三引数optionalで互換維持 |
| session再利用でJWT claim反映漏れ | 中 | user優先、sessionはfallback扱い |
| bootstrap APIで責務が肥大化 | 中 | dashboard初期表示専用に限定 |
| perf logが本番ログを汚す | 低 | `ENABLE_PERF_LOG=true` の時のみproduction出力 |

### 市場/プロダクトリスク

読み込みが遅いままだと、現場スタッフから「便利だけど重い」という評価になりやすい。  
SaaSは機能数よりも「毎日使ってストレスがない」が重要。特に日報・予約・分析は業務導線なので、1〜2秒の積み重ねは解約理由になる。

### 法務/セキュリティリスク

速度改善のためにRLSやscope checkを削るのは不可。  
今回の仕様では権限境界は維持し、重複処理だけを減らす。

### オペレーションリスク

計測なしで最適化すると、効果が見えずに沼る。  
最初に必ずログを入れる。

### 資金/時間リスク

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
productionでは ENABLE_PERF_LOG=true の場合のみ出力してください。

Phase 2:
src/app/api/daily-reports/route.ts の select('*') を削除し、必要カラムだけ取得してください。
必要カラム:
- id
- report_date
- total_patients
- new_patients
- total_revenue
- insurance_revenue
- private_revenue
- report_text
- created_at
- staff.name
- staff.role

既存レスポンス形式は変えないでください。
staffName, summary, monthlyTrends が壊れないようにしてください。

Phase 3:
getUserAccessContext に第三引数 options を追加し、既取得 user/session を渡せるようにしてください。
既存呼び出しは壊さないでください。

例:
getUserAccessContext(user.id, supabase, { user })

getUserPermissionsUncached 内で getCurrentUser(supabase) を呼ぶ前に options.user を優先してください。
getSession も options.session がある場合はそれを優先してください。

ensureClinicAccess と /api/auth/profile では、すでに取得済みの user を getUserAccessContext に渡してください。

Phase 4 optional:
可能なら /api/dashboard/bootstrap を追加し、profile + dailyReports を1リクエストで返してください。
ただし既存APIは削除しないでください。

受け入れ条件:
- npm run type-check が通る
- npm run lint が通る
- /api/auth/profile が従来通り動く
- /api/daily-reports が従来通りのレスポンス形式を返す
- 未認証は401
- scope外clinic_idは403
- 権限チェックを弱めない
- performance logで処理時間を分離確認できる

注意:
速度改善のためにRLS、ensureClinicAccess、clinic scope checkを削除しないでください。
Service Roleの利用範囲を広げないでください。
```

---

## 14. 実装優先順位

1. 計測ログ追加
2. `daily_reports` のselect句削減
3. `getUserAccessContext` の既取得user再利用
4. `ensureClinicAccess` からuserを渡す
5. `/api/auth/profile` からuserを渡す
6. 実測
7. まだ遅ければ bootstrap API
8. それでも遅ければDB EXPLAIN / bundle分析

---

## 15. 判断

この修正はペイする。  
理由は、今の遅延が機能追加で自然悪化する構造だから。

放置すると、日報だけでなく予約・分析・管理画面でも同じAuth/API waterfallが増殖する。  
今のうちに「Auth contextを1回作って使い回す」設計へ寄せるべき。
