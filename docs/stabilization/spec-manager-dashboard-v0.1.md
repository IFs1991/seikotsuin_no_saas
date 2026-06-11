# Manager Dashboard Spec v0.1

- Status: draft
- Date: 2026-06-12
- File: `docs/stabilization/spec-manager-dashboard-v0.1.md`

## Summary

Manager 向けに、担当院全体の今日の状態を一画面で把握できる `/dashboard` を作り直す。

既存の単院 `/dashboard` は `profile.clinicId` を前提にした clinic_admin / staff / therapist 向け画面であり、所属拠点が任意になった manager には合わない。manager の `/dashboard` は「分析の詳細画面」ではなく、担当院の状況、要確認事項、主要画面への導線をまとめる日常業務の入口にする。

Manager の実効 clinic scope は引き続き active `manager_clinic_assignments` のみに限定する。`permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids`、クライアント側の選択状態を manager のアクセス権として扱わない。

## Goals

- manager が `/dashboard` を開いたとき、担当院横断の manager 専用ダッシュボードを表示する。
- 担当院数、本日の売上、来院数、予約数、日報提出状況をまとめて確認できるようにする。
- 日報未提出、レビュー待ち、予約の偏り、売上低下など、今日確認すべき院を見つけやすくする。
- 担当院別に、今日の主要 KPI と状態をカード形式で表示する。
- 日報管理、予約タイムライン、患者分析、収益分析、店舗比較分析、スタッフ管理へすぐ移動できる導線を置く。
- manager 画面は read-only とし、日報入力、新規予約、患者編集、売上編集などの write action は表示しない。
- 非manager の既存 `/dashboard` 挙動は維持する。

## Non-Goals

- 新しい DB table や Supabase migration は追加しない。
- RLS、manager assignment、role guard の仕様は変更しない。
- AI コメント生成、需要予測、異常検知モデルは実装しない。
- 会計確定、請求確定、入金管理、未収金管理は含めない。
- manager から日報、予約、患者、売上を編集できるようにしない。
- clinic_admin / staff / therapist 向けの単院 `/dashboard` を作り直さない。
- `/admin` の管理ホームを削除しない。`/admin` は管理機能の入口、`/dashboard` は日常確認の入口として分ける。

## Current State

Relevant files:

- `src/app/(app)/dashboard/page.tsx`
- `src/components/dashboard/admin-dashboard.tsx`
- `src/hooks/useDashboard.ts`
- `src/lib/navigation/items.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/admin/dashboard/route.ts`
- `src/app/api/manager/daily-reports/overview/route.ts`
- `src/app/api/manager/patients/analysis/route.ts`
- `src/app/api/manager/revenue/analysis/route.ts`
- `src/lib/auth/manager-scope.ts`
- `src/app/api/clinics/accessible/route.ts`

Current behavior:

- `/dashboard` は `profile.clinicId` を使って単院 `/api/dashboard` を取得する。
- manager は所属拠点が任意のため、`profile.clinicId = null` の場合に「クリニック情報が見つかりません」と表示される。
- 暫定対応として manager の `/dashboard` に既存 `AdminDashboard` の area-manager variant を表示できるが、内容は「管理ホーム」に寄っており、日常業務の確認画面としては弱い。
- manager 向けにはすでに日報一覧、予約タイムライン、患者分析、収益分析が実装されている。新ダッシュボードはこれらの詳細画面を置き換えず、入口として集約する。

## Route and Access

### Page Route

```txt
GET /dashboard
```

Role behavior:

- `manager`: manager 専用ダッシュボードを表示する。
- `clinic_admin`, `therapist`, `staff`: 既存の単院ダッシュボードを表示する。
- `admin`: 既存の navigation 方針に従い、基本は `/admin` 管理ホームを使う。`/dashboard` の挙動は今回の主対象外。
- `customer`: 既存の認可方針を維持する。

Manager dashboard access:

- 認証済み manager のみ表示する。
- manager の担当院は active `manager_clinic_assignments` から解決する。
- 担当院が 0 件の場合は、空状態を表示する。

Empty state:

```txt
担当院がまだ設定されていません。
管理者にマネージャー管理から担当店舗の設定を依頼してください。
```

## Data Sources

新規 DB migration は追加しない。既存 API / RPC / table を再利用する。

Primary data:

- 担当院リスト: `/api/clinics/accessible`
- 日報概要: `/api/manager/daily-reports/overview`
- 患者分析概要: `/api/manager/patients/analysis`
- 収益分析概要: `/api/manager/revenue/analysis`
- 予約タイムラインまたは予約集計: 既存予約 API の manager scope 対応済み endpoint を再利用する。既存 endpoint が集計に適さない場合は、manager read-only の軽量 API を追加する。

Manager dashboard 用に新 API を追加する場合:

```txt
GET /api/manager/dashboard
```

Allowed:

- manager only

Denied:

- admin
- clinic_admin
- therapist
- staff
- customer

Security:

- `resolveManagerAssignedClinics()` を使い、active assignments の院だけを対象にする。
- `permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids` に fallback しない。
- service role / admin client を使う場合も、必ず manager assignment で対象 clinic ids を絞ってから読む。

Recommended response shape:

```ts
type ManagerDashboardResponse = {
  generatedAt: string;
  clinics: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    assignedClinicCount: number;
    todayRevenue: number;
    todayVisitCount: number;
    todayReservationCount: number;
    submittedDailyReportCount: number;
    missingDailyReportCount: number;
    needsReviewCount: number;
  };
  attentionItems: Array<{
    id: string;
    clinicId: string;
    clinicName: string;
    type:
      | 'missing_daily_report'
      | 'needs_review'
      | 'low_revenue'
      | 'low_reservations'
      | 'high_cancellations';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    href: string;
  }>;
  clinicCards: Array<{
    clinicId: string;
    clinicName: string;
    todayRevenue: number;
    todayVisitCount: number;
    todayReservationCount: number;
    dailyReportStatus: 'submitted' | 'missing' | 'needs_review';
    revenueChangeRateFromPreviousDay: number | null;
    reservationChangeRateFromPreviousWeekday: number | null;
    links: {
      dailyReports: string;
      reservations: string;
      patients: string;
      revenue: string;
    };
  }>;
  timeline: Array<{
    id: string;
    occurredAt: string;
    clinicId: string;
    clinicName: string;
    label: string;
    detail: string;
    href: string;
  }>;
};
```

## UI Requirements

### Layout

`/dashboard` の manager 画面は、次の順番で表示する。

1. Header
   - タイトル: `担当エリアダッシュボード`
   - 説明: `担当院の今日の状況と確認すべき項目をまとめています。`
   - 最終更新時刻
   - 再読み込みボタン

2. Summary KPI
   - 担当院数
   - 本日売上
   - 本日来院数
   - 本日予約数
   - 日報提出状況
   - 要確認件数

3. 今日の要確認
   - severity 順に表示する。
   - 日報未提出、レビュー待ち、売上低下、予約低下、キャンセル増加を表示対象にする。
   - 各 item は該当詳細画面へ遷移できる。

4. 担当院別カード
   - 院名
   - 本日売上
   - 本日来院数
   - 本日予約数
   - 日報ステータス chip
   - 前日比 / 前週同曜日比
   - `日報を見る`, `予約を見る`, `患者分析`, `収益分析` の read-only 導線

5. タイムライン
   - 当日の担当院イベントを時系列で表示する。
   - v0.1 では日報提出、レビュー待ち、予約集中、売上注意などの既存データから作れるイベントに限定する。

6. ショートカット
   - 日報管理: `/daily-reports`
   - 予約タイムライン: `/reservations?view=timeline`
   - 患者分析: `/patients`
   - 収益分析: `/revenue`
   - 店舗比較分析: `/multi-store`
   - スタッフ管理: `/admin/users`

### Visual Direction

- SaaS 管理画面として、落ち着いた業務向け UI にする。
- 大きな hero やマーケティング風の装飾は使わない。
- カードは情報単位で使い、カードの中にさらにカードを入れない。
- mobile では KPI を 2 列または 1 列に折り返す。
- 長い院名や文言がボタン・chip からはみ出さないようにする。
- 主要 action はボタン、詳細遷移はリンクまたは icon+text button にする。
- lucide icons を使える箇所では使う。

## Business Rules

### Date

- v0.1 の dashboard は JST 当日を対象にする。
- 期間選択は入れない。期間分析は `/patients` と `/revenue` に任せる。
- 比較値は以下を基本にする。
  - 売上: 前日比
  - 予約: 前週同曜日比
  - 日報: 当日提出状況

### Attention Rules

v0.1 では複雑な AI 判定は行わず、決定的なルールだけを使う。

- `missing_daily_report`
  - JST 当日分の日報が未提出。
- `needs_review`
  - 日報または収益見込みにレビュー待ちがある。
- `low_revenue`
  - 本日売上が前日売上より 30% 以上低い。
  - 前日売上が 0 の場合は判定しない。
- `low_reservations`
  - 本日予約数が前週同曜日より 30% 以上低い。
  - 前週同曜日予約数が 0 の場合は判定しない。
- `high_cancellations`
  - キャンセル数が取得できる場合のみ表示する。
  - v0.1 で取得が難しい場合は未実装でよい。

### Read-only

manager dashboard から直接 mutation は行わない。

表示しないもの:

- 日報入力ボタン
- 新規予約ボタン
- 患者作成・編集ボタン
- 売上編集ボタン
- 担当院割当変更ボタン

## Implementation Notes

- `/dashboard` の page は role-aware にする。
  - manager: `ManagerDashboard` を表示。
  - 非manager: 既存の `ClinicDashboard` を表示。
- manager dashboard 用の hook を追加する場合は `useManagerDashboard` とする。
- manager dashboard 用の client API helper を追加する場合は `api.managerDashboard.get()` とする。
- API を追加する場合は `src/app/api/manager/dashboard/route.ts` に置く。
- domain builder を追加する場合は `src/lib/manager-dashboard.ts` に集計・attention 生成ロジックを集約する。
- Supabase client の直接呼び出しや response shaping を React component に置かない。
- `useDashboard` は非manager 単院画面専用として扱う。manager dashboard から呼ばない。

## Testing Requirements

### Unit / Component Tests

- manager が `/dashboard` を開くと `担当エリアダッシュボード` が表示される。
- manager で `clinicId = null` でも「クリニック情報が見つかりません」を表示しない。
- non-manager の `/dashboard` は既存の単院画面を表示する。
- manager dashboard は日報入力、新規予約などの write action を表示しない。
- 担当院 0 件の場合だけ空状態を表示する。
- attention item が severity 順に表示される。
- clinic card のリンクが各詳細画面へ向く。

### API Tests

`/api/manager/dashboard` を追加する場合:

- manager の active assignments のみ集計対象にする。
- `permissions.clinic_id` に fallback しない。
- JWT `clinic_scope_ids` に fallback しない。
- 担当院 0 件では空 response を返す。
- manager 以外は 403。
- 日報未提出、レビュー待ち、売上低下、予約低下の attention を生成する。

### Regression Tests

- `src/__tests__/lib/navigation-items.test.ts`
  - manager の dashboard href は `/dashboard` のまま。
  - manager の予約サブメニューは担当院タイムラインのみ。
  - manager の日報サブメニューに日報入力を出さない。

### Verification Commands

実装後に実行する。

```powershell
npm run test -- --runInBand --runTestsByPath src\__tests__\pages\dashboard.test.tsx src\__tests__\components\dashboard\manager-dashboard.test.tsx src\__tests__\api\manager-dashboard-route.test.ts src\__tests__\lib\navigation-items.test.ts
npm run type-check
npm run lint
git diff --check
```

API を追加しない実装の場合、`manager-dashboard-route.test.ts` は不要。

## Rollout Notes

- Supabase migration は不要。
- `supabase db push`、`supabase migration up`、`supabase db reset` は実行しない。
- 既存 manager assignment の本番データを変更しない。
- 既存 `/admin` 管理ホームは残す。

## Open Questions for v0.2

- manager dashboard に期間切り替えを入れるか、期間分析は `/patients` `/revenue` に完全に任せるか。
- 予約キャンセル数を v0.1 で含めるか、予約 API 側の整理後に入れるか。
- 店舗別目標値を導入して、売上低下ではなく目標未達を出すか。
- Slack / メール通知など、要確認事項の通知連携を行うか。
