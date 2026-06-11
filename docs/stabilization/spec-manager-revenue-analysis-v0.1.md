# Manager Revenue Analysis Spec v0.1

## Summary

Manager 向けに、担当院の収益状況を横断して確認できる収益分析画面を追加する。

患者分析は「患者数、新患、再来、離脱リスク、患者単価」を中心に見る画面であり、収益分析は「売上の構造、推移、内訳、院別差分」を見る画面として分離する。Manager は担当院の合計、院別比較、選択院の詳細を切り替えながら、売上が増減した原因を `売上 = 来院数 x 客単価` に分解して確認できるようにする。

本仕様では、Manager の実効 clinic scope は引き続き active `manager_clinic_assignments` のみに限定する。`permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids`、クライアント側の選択状態を manager のアクセス権として扱わない。

## Goals

- `/revenue` の manager 分岐として、担当院横断の収益分析を表示する。
- 担当院合計、院別比較、選択院詳細を切り替えられるようにする。
- 全期間、今月、先月、直近3か月、今年、任意期間で分析できるようにする。
- 売上、来院数、客単価、前期間比、構成比を確認できるようにする。
- 保険、自費、物販、回数券、交通事故、労災などの収益カテゴリ内訳を確認できるようにする。
- 日別、週別、月別の推移チャートを表示する。
- 院別比較で、伸びている院、落ちている院、客単価が低い院を見つけられるようにする。
- manager 画面は read-only とし、売上、日報、予約、患者情報の write action は表示しない。
- 既存の admin / clinic_admin 向け `/revenue` 挙動は維持する。

## Non-Goals

- 会計確定、請求確定、入金消込、未収金管理は含めない。
- manager から日報、日報明細、売上見込み、予約、患者情報を編集できるようにしない。
- manager に患者一覧や患者詳細を開放しない。
- スタッフ別給与、原価、利益率、粗利分析は含めない。
- AI 予測、需要予測、異常検知の自動コメント生成は含めない。
- 既存の clinic_admin / therapist / staff 向け権限を変更しない。
- 既存の `public.revenues` など legacy table を新たな正本として採用しない。

## Current State

Relevant files:

- `src/app/(app)/revenue/page.tsx`
- `src/app/api/revenue/route.ts`
- `src/hooks/useRevenue.ts`
- `src/lib/revenue-context.ts`
- `src/lib/revenue-estimate.ts`
- `src/lib/manager-daily-reports.ts`
- `src/lib/auth/manager-scope.ts`
- `src/lib/supabase/guards.ts`
- `src/lib/navigation/items.ts`
- `public.daily_reports`
- `public.daily_report_items`
- `public.daily_report_revenue_context_summary`
- `public.daily_report_revenue_breakdown_summary`
- `public.daily_report_revenue_estimate_summary`
- `public.manager_clinic_assignments`

Current `/revenue` behavior:

- `src/app/(app)/revenue/page.tsx` は `useUserProfile()` の `clinicId` を使って単一 clinic の `/api/revenue` を取得する。
- manager は独立ロールとして扱われ、所属拠点は任意になったため、`profile.clinicId` 依存のままでは manager の担当院横断分析に使えない。
- `/api/revenue` は `ensureClinicAccess` による単一 clinic access を前提にしている。
- 既存の `useRevenue` は単一 `clinicId` を必須としている。
- Manager の担当院スコープ解決は `src/lib/auth/manager-scope.ts` に集約済み。

Current data facts:

- `daily_reports` は日次の運営入力値として `total_revenue`, `insurance_revenue`, `private_revenue`, `total_patients` を持つ。
- `daily_report_items` は施術、金額、ケアエピソード、収益コンテキストの集計元として使われる。
- `daily_report_revenue_context_summary` は収益コンテキスト単位の集計 view。
- `daily_report_revenue_breakdown_summary` と `daily_report_revenue_estimate_summary` は経営分析用の見込み金額であり、請求確定額ではない。
- 患者分析 v0.2 では `reservations` を source of truth として期間別の患者/売上推移を出しているが、収益分析では日報・収益見込みの文脈も扱うため、同じ意味の売上として混同しない。

## Revenue Definition

### Operating Revenue

画面上の主要な `総売上` は、運営分析用売上として定義する。

```txt
operating_revenue = coalesce(daily_reports.total_revenue, daily_reports.insurance_revenue + daily_reports.private_revenue, 0)
```

これは現場の日報入力に基づく管理用売上であり、請求確定額や入金済み売上ではない。

### Revenue Breakdown

収益内訳は以下を区別して扱う。

- `insurance_revenue`: 日報上の保険売上
- `private_revenue`: 日報上の自費売上
- `product_revenue`: 収益コンテキスト上の物販売上
- `ticket_revenue`: 収益コンテキスト上の回数券売上
- `traffic_accident_revenue`: 交通事故の管理用概算
- `workers_comp_revenue`: 労災の管理用概算
- `patient_copay_estimated`: 患者負担見込み
- `insurer_receivable_estimated`: 保険者請求見込み
- `private_revenue_estimated`: 自費売上見込み

UI では `売上` と `見込み` をラベルで明確に分ける。交通事故・労災は公式確定額ではないことを表示する。

### Average Revenue

```txt
average_revenue_per_patient = operating_revenue / patient_count
```

`patient_count` は `daily_reports.total_patients` の期間合計を使う。日報未提出日は 0 として扱い、未提出日数を別 KPI として表示する。

### Comparison

前期間比は、選択期間と同じ日数の直前期間を比較対象とする。

例:

- 2026-04-01 から 2026-04-30 を選択した場合、比較期間は 2026-03-02 から 2026-03-31
- `今月` は当月開始から当日まで、比較期間は同日数の直前期間
- `全期間` は前期間比を表示しない

前年同月比は v0.1 では任意表示とし、十分な前年データがある場合のみ表示する。

## Access Control Requirements

Manager:

- allowed: `/revenue` の manager 収益分析画面
- denied: revenue write action
- denied: daily report edit action
- denied: patient detail action
- denied: unassigned clinic data

Manager effective clinic scope:

```txt
public.manager_clinic_assignments
where manager_user_id = auth.uid()
and revoked_at is null
```

The implementation must not use the following as manager access grants:

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- client-side selected clinic state

API must fail closed:

- manager が未担当 `clinic_id` を指定した場合は `403`
- manager に active assignments がない場合は empty data を `200` で返す
- invalid period/date query は `400`
- authenticated ではない場合は `401`
- manager 以外が manager API を呼んだ場合は `403`

Non-manager roles:

- 既存 `/api/revenue` と `/revenue` の挙動を維持する。
- clinic_admin / staff / therapist の clinic scope を広げない。

## Proposed Routes

### UI

`/revenue`

- manager の場合は manager 用収益分析画面を表示する。
- manager 以外は既存画面を維持する。
- manager は所属拠点が未指定でも active assignments があれば表示できる。

### API

Create:

- `GET /api/manager/revenue/analysis`

Query:

```txt
target=total | clinic
clinic_id=uuid
period=all | month | previous_month | last_3_months | year | custom
start_date=YYYY-MM-DD
end_date=YYYY-MM-DD
compare=previous_period | none
```

Rules:

- `target=total`: assigned clinics 全体を集計する。`clinic_id` は無視または拒否のどちらかに統一する。推奨は拒否せず無視し、response に `target: total` を返す。
- `target=clinic`: `clinic_id` は必須。assigned clinics に含まれない場合は `403`。
- `period=custom`: `start_date` と `end_date` は必須。
- `period=all`: `start_date` と `end_date` は送らない。
- 任意期間は最大 1095 日。
- バケットは API 側で期間長から決定する。

Response shape:

```ts
type ManagerRevenueAnalysisResponse = {
  period: {
    type: 'all' | 'month' | 'previous_month' | 'last_3_months' | 'year' | 'custom';
    startDate: string | null;
    endDate: string | null;
    bucket: 'daily' | 'weekly' | 'monthly';
    label: string;
  };
  target: {
    type: 'total' | 'clinic';
    clinicId: string | null;
  };
  assignedClinics: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    clinicCount: number;
    operatingRevenue: number;
    insuranceRevenue: number;
    privateRevenue: number;
    productRevenue: number;
    ticketRevenue: number;
    trafficAccidentRevenue: number;
    workersCompRevenue: number;
    patientCopayEstimated: number;
    insurerReceivableEstimated: number;
    privateRevenueEstimated: number;
    patientCount: number;
    averageRevenuePerPatient: number;
    reportDays: number;
    missingReportDays: number;
    needsReviewCount: number;
    blockedCount: number;
  };
  comparison: {
    previousOperatingRevenue: number | null;
    operatingRevenueChangeRate: number | null;
    previousPatientCount: number | null;
    patientCountChangeRate: number | null;
    previousAverageRevenuePerPatient: number | null;
    averageRevenuePerPatientChangeRate: number | null;
  };
  charts: {
    revenue: Array<TimeSeriesPoint>;
    patientCount: Array<TimeSeriesPoint>;
    averageRevenuePerPatient: Array<TimeSeriesPoint>;
    insurancePrivateBreakdown: Array<StackedTimeSeriesPoint>;
    contextBreakdown: Array<BreakdownPoint>;
    clinicRevenueComparison: Array<ClinicComparisonPoint>;
    clinicAverageRevenueComparison: Array<ClinicComparisonPoint>;
  };
  clinicComparison: Array<{
    clinicId: string;
    clinicName: string;
    operatingRevenue: number;
    revenueShare: number;
    patientCount: number;
    averageRevenuePerPatient: number;
    missingReportDays: number;
    needsReviewCount: number;
    operatingRevenueChangeRate: number | null;
  }>;
  disclaimers: string[];
};
```

## Data Design

### Preferred Foundation

For manager aggregate queries, prefer DB-side aggregation via stable SQL functions instead of fetching raw rows and aggregating in the API.

Reason:

- `supabase/config.toml` has `max_rows = 1000`; raw PostgREST selects can silently truncate large ranges.
- Manager can have multiple assigned clinics.
- `all` and multi-year custom periods can exceed row limits.
- DB-side aggregation reduces network transfer and keeps calculation consistent.

Proposed SQL functions:

- `public.manager_revenue_period_totals(p_clinic_ids uuid[], p_start date, p_end date)`
- `public.manager_revenue_period_series(p_clinic_ids uuid[], p_start date, p_end date, p_bucket text)`
- `public.manager_revenue_clinic_comparison(p_clinic_ids uuid[], p_start date, p_end date, p_compare_start date, p_compare_end date)`
- `public.manager_revenue_context_breakdown(p_clinic_ids uuid[], p_start date, p_end date)`

Security:

- Functions are called only from server-side API with service role client.
- `execute` is granted to `service_role` only.
- `public`, `anon`, and `authenticated` execute privileges are revoked.
- API must resolve active manager assignments before calling RPC and pass only assigned clinic IDs.
- RPC must not accept user ID or infer auth scope. Scope enforcement belongs to API and assignment resolver.

Rollback:

- Each migration adding RPCs must have a rollback under `supabase/rollbacks/`.
- Rollback must drop only the functions added by that migration.
- No destructive table data changes are expected for v0.1.

### Source Tables / Views

Primary source:

- `daily_reports`

Breakdown sources:

- `daily_report_revenue_context_summary`
- `daily_report_revenue_breakdown_summary`
- `daily_report_revenue_estimate_summary`

Detail source:

- `daily_report_items`

### Bucket Rules

- 1 to 93 days: daily
- 94 to 366 days: weekly
- 367 days or more: monthly
- `period=all`: monthly

Date timezone:

- Date boundaries are interpreted in Asia/Tokyo.
- `daily_reports.report_date` is a date and should be compared as local business date.

## UX Requirements

### Page Layout

Manager の `/revenue` は次の構成にする。

1. Header
   - title: `収益分析`
   - subtitle: `担当院の売上推移と収益構造を確認できます。`

2. Filter Bar
   - 対象:
     - `担当院合計`
     - `選択院`
   - 院選択:
     - active assignments のみ
     - `選択院` の場合だけ有効
   - 期間:
     - `全期間`
     - `今月`
     - `先月`
     - `直近3か月`
     - `今年`
     - `任意期間`
   - 任意期間:
     - start date
     - end date
     - native `<input type="date">`
   - 比較:
     - `前期間比`
     - `比較なし`
   - apply button
   - reset button

3. Summary Cards
   - 担当院数
   - 総売上
   - 前期間比
   - 来院数
   - 客単価
   - 保険売上
   - 自費売上
   - 見込み要確認
   - 日報未提出日数

4. Charts
   - 売上推移
   - 来院数推移
   - 客単価推移
   - 保険 / 自費 推移
   - 収益カテゴリ内訳
   - 院別売上比較
   - 院別客単価比較

5. Clinic Comparison Table
   - 院名
   - 総売上
   - 構成比
   - 来院数
   - 客単価
   - 前期間比
   - 日報未提出日数
   - 要確認件数

6. Selected Clinic Detail
   - 選択院の売上推移
   - 選択院の収益カテゴリ内訳
   - メニュー別売上ランキング
   - 要確認 / blocked の件数
   - 患者分析への導線
   - 日報一覧への導線

### Empty / Error States

担当院なし:

```txt
担当院がまだ設定されていません。
管理者に担当店舗の設定を依頼してください。
```

期間内データなし:

```txt
選択期間の収益データはまだありません。
日報が提出されるとここに集計されます。
```

日報未提出がある場合:

```txt
未提出の日報があるため、期間集計は暫定値です。
```

交通事故・労災・見込み金額を含む場合:

```txt
一部の金額は経営分析用の概算です。請求確定額ではありません。
```

### Navigation

- Manager sidebar に `収益分析` を追加する。
- HQ admin menu / clinic_admin menu の既存導線は維持する。
- manager を global `ADMIN_UI_ROLES` に追加しない。
- manager を `HQ_ROLES` / `CROSS_CLINIC_ROLES` に追加しない。

## Implementation Plan

### PR-01: API / Data Foundation

- `docs/stabilization/spec-manager-revenue-analysis-v0.1.md` を実装仕様として参照する。
- manager revenue aggregation RPC を追加する。
- rollback SQL を追加する。
- `GET /api/manager/revenue/analysis` を追加する。
- active `manager_clinic_assignments` のみから assigned clinics を解決する。
- query parser を追加する。
- empty data / 403 / 400 の挙動をテストで固定する。
- 既存 `/api/revenue` は変更しない。

### PR-02: Manager Revenue UI

- `/revenue` に manager 分岐を追加する。
- `useManagerRevenueAnalysis` を追加する。
- 期間フィルタ、対象切替、チャート、院別比較を実装する。
- manager sidebar に `収益分析` を追加する。
- read-only UI として write action を出さない。

### PR-03: Breakdown / Drilldown

- 収益カテゴリ内訳を充実させる。
- メニュー別売上ランキングを選択院詳細に追加する。
- 要確認 / blocked の内訳を表示する。
- 患者分析、日報一覧への導線を追加する。

### PR-04: Performance / Polish

- 長期間・多店舗の RPC 実行計画を確認する。
- 必要なら `daily_reports(clinic_id, report_date)`、`daily_report_items(clinic_id, report_date)` 相当の index を追加する。
- chart empty state、loading skeleton、数値フォーマットを調整する。
- 期間変更時の stale response 対策を確認する。

## TDD / Test Plan

### API / Auth Tests

- manager with active assignments can fetch total revenue analysis.
- manager with active assignments can fetch assigned clinic detail.
- manager requesting unassigned `clinic_id` gets `403`.
- manager with no active assignments gets empty data with `200`.
- manager does not fallback to `permissions.clinic_id`.
- manager does not fallback to `profiles.clinic_id`.
- manager does not fallback to JWT `clinic_scope_ids`.
- clinic_admin / therapist / staff calling manager API gets `403`.
- unauthenticated request gets `401`.
- invalid date format gets `400`.
- custom period without start/end gets `400`.
- start date after end date gets `400`.
- custom period over 1095 days gets `400`.

### Query Parser Tests

- `period=all` returns null start/end and monthly bucket.
- `period=month` returns current JST month range.
- `period=previous_month` returns previous JST month range.
- `period=last_3_months` returns expected JST date range.
- `period=year` returns current JST year range.
- `period=custom` accepts valid date range.
- bucket is selected from period length.
- `target=clinic` requires `clinic_id`.

### SQL / Migration Text Tests

- migration creates manager revenue RPC functions.
- RPC grants execute only to `service_role`.
- migration revokes execute from `public`, `anon`, `authenticated`.
- functions aggregate by `clinic_id` and date range.
- functions do not infer manager access from `auth.uid()`.
- rollback drops the added functions.

### UI Tests

- manager sees `収益分析` manager screen on `/revenue`.
- manager with assignments sees filter bar and charts.
- manager with zero assignments sees担当院未設定 message.
- selecting `選択院` enables clinic select.
- unchecking or changing target resets invalid selected clinic state.
- custom period validates start/end before fetch.
- manager screen does not render write buttons.
- manager screen shows disclaimer when estimate values are present.
- clinic comparison table renders assigned clinics only.

### Hook Tests

- hook sends `target`, `clinic_id`, `period`, `start_date`, `end_date`, `compare`.
- hook ignores stale responses after rapid filter changes.
- hook updates summary and chart state after successful response.
- hook preserves previous data during background reload only when filters are unchanged.

## Verification Commands

After implementation:

```powershell
npm run test -- manager-revenue revenue
npm run type-check
npm run lint
git diff --check
supabase db push --local --dry-run
```

If a migration is added, also run the targeted migration text test.

## Performance Requirements

- Manager revenue API P95 target: 800ms or less for 10 clinics x 12 months.
- API must not fetch raw `daily_report_items` rows for multi-clinic totals unless a limited drilldown explicitly requires it.
- Summary and chart series should be aggregated in DB.
- UI should render charts from chart-ready API response without additional client aggregation over large row sets.
- Clinic comparison should be sorted server-side or over a small aggregated result set.

## Security Requirements

- Manager effective access must remain DB-assignment-only.
- No manager access decision may use `permissions.clinic_id`, `profiles.clinic_id`, JWT clinic scope, or client selected clinic.
- Server API must validate assigned clinic membership before passing clinic IDs into RPC.
- RPC must be service-role-only and not exposed to authenticated clients.
- Existing RLS assumptions must not be weakened.
- Existing non-manager `/api/revenue` behavior must not be widened.

## Open Questions

- `総売上` を日報ベースに統一するか、患者分析と同じ reservation ベース売上も併記するか。
  - v0.1 recommendation: 収益分析は日報ベース、患者分析は reservation ベースとして明示的に分ける。
- `全期間` のデフォルト表示を月次推移にする場合、最古 report date をどこで取得するか。
  - v0.1 recommendation: RPC 側で assigned clinics の最古 `daily_reports.report_date` を解決する。
- メニュー別売上を初期実装に含めるか。
  - v0.1 recommendation: PR-03 以降。MVP は総売上、内訳、院別比較を優先する。
- 交通事故・労災の金額をカードに出すか、内訳セクション内に留めるか。
  - v0.1 recommendation: summary では `見込み要確認` として集約し、詳細内訳で表示する。

## Assumptions

- Manager は担当院の経営状況を読むだけで、売上データを書き換えない。
- Manager の担当院は active `manager_clinic_assignments` のみで決まる。
- 所属拠点は表示・人事メタデータであり、収益分析のアクセス権には使わない。
- 日報未提出がある期間の売上は暫定値として表示する。
- 収益見込みは経営分析用であり、請求確定額ではない。
- Supabase migration を追加する場合は、同時に rollback と migration text test を追加する。
