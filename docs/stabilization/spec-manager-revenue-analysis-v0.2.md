# Manager Revenue Analysis Spec v0.2

- Status: draft (v0.1 レビュー反映版)
- Date: 2026-06-11
- File: `docs/stabilization/spec-manager-revenue-analysis-v0.2.md`
- Supersedes: spec-manager-revenue-analysis-v0.1

## Changes from v0.1

レビュー指摘の反映による変更点。実装前に必ず本節を読むこと。

1. バケット閾値を患者分析 v0.2 の `chooseBucket`（31日以下: daily / 180日以下: weekly / それ以上: monthly）に統一した。v0.1 の 93/366 閾値は廃止。期間パーサーは共通モジュールへ抽出して両分析画面で共用する。
2. `month` / `last_3_months` / `year` の期間終端を JST 当日で clamp することを明文化した（未来日が `missingReportDays` に算入されるのを防ぐ）。
3. `operating_revenue` の coalesce 式を null 安全な形に修正した（片方 null で合計が 0 に落ちる問題）。既存 `/api/revenue` との算出差は意図的な差分として明記。
4. `target=total` 時も `clinic_id` が指定されていれば常に検証し、未担当なら `403` に変更した（v0.1 の「無視」を撤回。患者分析 API と fail-closed 挙動を統一）。
5. `summary.needsReviewCount` / `blockedCount` のソースを `daily_report_revenue_estimate_summary` に確定した。
6. 患者分析の `averageRevenuePerPatient`（ユニーク患者あたり）との同名異義を解消するため、API フィールドを `visitCount` / `averageRevenuePerVisit`（延べ来院あたり）に改名した。UI ラベル「客単価」は維持し、定義を「来院1回あたり売上」と明記。
7. `missingReportDays` の詳細セマンティクスを定義した（休診日含む暫定値、院ごとの最古日報日を下限、target=total は各院合算、当日 clamp）。
8. 非アクティブ院（`clinics.is_active = false`）は集計から除外されることを仕様として明記した（`resolveManagerAssignedClinics` の現挙動を踏襲）。
9. ゼロ除算規約（変化率 prev=0 → null、平均 visitCount=0 → 0、構成比 total=0 → 0）を定義した。
10. `compare=previous_period` かつ `period=all` の API 挙動（comparison 非アクティブ・全フィールド null）を定義した。
11. RPC を 4 本から 3 本に整理した。比較期間の集計は `manager_revenue_period_totals` を比較期間境界で再呼び出しして得る（v0.1 の `manager_revenue_clinic_comparison` は廃止）。
12. 週バケットの開始曜日（`date_trunc('week')` = 月曜）と期間端への clamp を患者分析 RPC と同一規約にすることを明記した。series の戻り値に保険/自費列を含めることを明記した。
13. Response shape の未定義型（`TimeSeriesPoint` / `StackedTimeSeriesPoint` / `RevenueBreakdownPoint` / `ClinicComparisonPoint`）を定義した。
14. ナビゲーションは「追加」ではなく「既存導線の維持をテストで固定」に修正した（`OPERATION_MENU_ITEMS` の `収益分析` は manager にも表示済み）。
15. データソース注記（日報ベースであり患者分析の予約ベース売上と一致しない）を常時表示 disclaimer に追加した。
16. `supabase db push` 系コマンドの実行に明示的な承認を必須とする注意書きを追加した（患者分析 v0.2 と同じ運用）。

## Summary

Manager 向けに、担当院の収益状況を横断して確認できる収益分析画面を追加する。

患者分析は「患者数、新患、再来、離脱リスク、患者単価」を中心に見る画面であり、収益分析は「売上の構造、推移、内訳、院別差分」を見る画面として分離する。Manager は担当院の合計、院別比較、選択院の詳細を切り替えながら、売上が増減した原因を `売上 = 来院数 x 客単価` に分解して確認できるようにする。

本仕様では、Manager の実効 clinic scope は引き続き active `manager_clinic_assignments` のみに限定する。`permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids`、クライアント側の選択状態を manager のアクセス権として扱わない。

## Goals

- `/revenue` の manager 分岐として、担当院横断の収益分析を表示する。
- 担当院合計、院別比較、選択院詳細を切り替えられるようにする。
- 全期間、今月、先月、直近3か月、今年、任意期間で分析できるようにする。
- 売上、来院数、客単価（来院1回あたり売上）、前期間比、構成比を確認できるようにする。
- 保険、自費、物販、回数券、交通事故、労災などの収益カテゴリ内訳を確認できるようにする。
- 日別、週別、月別の推移チャートを表示する。
- 院別比較で、伸びている院、落ちている院、客単価が低い院を見つけられるようにする。
- manager 画面は read-only とし、売上、日報、予約、患者情報の write action は表示しない。
- 既存の admin / clinic_admin 向け `/revenue` 挙動は維持する。
- 期間パーサー・バケット規約を患者分析と共通化し、manager 分析画面間で粒度と挙動を揃える。

## Non-Goals

- 会計確定、請求確定、入金消込、未収金管理は含めない。
- manager から日報、日報明細、売上見込み、予約、患者情報を編集できるようにしない。
- manager に患者一覧や患者詳細を開放しない。
- スタッフ別給与、原価、利益率、粗利分析は含めない。
- AI 予測、需要予測、異常検知の自動コメント生成は含めない。
- 既存の clinic_admin / therapist / staff 向け権限を変更しない。
- 既存の `public.revenues` など legacy table を新たな正本として採用しない。
- 休診日カレンダーの導入と、それに基づく未提出日数の精緻化は含めない（暫定値表示で対応）。
- 前年同月比の本実装は含めない（将来バージョンで検討）。
- 既存 `/api/revenue` の `operating_revenue` 算出（`total_revenue ?? 0`、保険+自費フォールバックなし）の変更は含めない。

## Current State

Relevant files:

- `src/app/(app)/revenue/page.tsx`
- `src/app/api/revenue/route.ts`
- `src/hooks/useRevenue.ts`
- `src/lib/revenue-context.ts`
- `src/lib/revenue-estimate.ts`
- `src/lib/manager-daily-reports.ts`
- `src/lib/manager-patient-analysis.ts`
- `src/app/api/manager/patients/analysis/route.ts`
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
- manager は独立ロールとして扱われ、所属拠点は任意になったため、`profile.clinicId` 依存のままでは manager の担当院横断分析に使えない（clinicId 未設定の manager には「店舗情報が設定されていません」が表示される）。
- `/api/revenue` は `ensureClinicAccess` による単一 clinic access を前提にしている。
- 既存の `useRevenue` は単一 `clinicId` を必須としている。
- Manager の担当院スコープ解決は `src/lib/auth/manager-scope.ts` に集約済み。`resolveManagerAssignedClinics` は active assignment かつ `clinics.is_active = true` の院のみ返す。
- サイドバーの `収益分析`（`/revenue`）は `OPERATION_MENU_ITEMS` に定義済みで、`AREA_MANAGER_OPERATION_MENU_ITEMS` でも除外されないため、manager には現状でも表示されている。クイックアクセスの `収益レポート` も同様。

Current data facts:

- `daily_reports` は日次の運営入力値として `total_revenue`, `insurance_revenue`, `private_revenue`, `total_patients` を持つ。
- `daily_report_items` は施術、金額、ケアエピソード、収益コンテキストの集計元として使われる。
- `daily_report_revenue_context_summary` は収益コンテキスト単位の集計 view（`needs_review_count` / `blocked_count` を含む）。
- `daily_report_revenue_breakdown_summary` と `daily_report_revenue_estimate_summary` は経営分析用の見込み金額であり、請求確定額ではない。`daily_report_revenue_estimate_summary` も独自の `needs_review_count` / `blocked_count` を持つ（context summary のカウントとは別物）。
- 患者分析 v0.2 は `reservations` を source of truth として期間別の患者/売上推移を出している。収益分析は日報・収益見込みベースであり、同じ「売上」でも数値は一致しない。混同しないこと。
- `manager-daily-reports.ts` の overview に `missingReportDays` / `averageRevenuePerPatient` の先行セマンティクスが存在する（単院・最大93日・カレンダー日ベース）。本仕様の未提出日数はこのセマンティクスを多院・長期間へ拡張したもの。
- `supabase/config.toml` は `max_rows = 1000`。10院 x 12か月の daily_reports は約 3,650 行となり、PostgREST 素朴 select では truncation する。

## Revenue Definition

### Operating Revenue

画面上の主要な `総売上` は、運営分析用売上として定義する。

```txt
operating_revenue = coalesce(
  daily_reports.total_revenue,
  coalesce(daily_reports.insurance_revenue, 0) + coalesce(daily_reports.private_revenue, 0),
  0
)
```

注意:

- `coalesce(total_revenue, insurance_revenue + private_revenue, 0)` と書いてはならない。保険・自費の片方が null のとき加算結果が null になり、もう片方の値が捨てられて 0 にフォールバックする。
- 既存 `/api/revenue`（単院画面）は `total_revenue ?? 0` でありフォールバックを行わない。`total_revenue` が null のレコードが存在する場合、単院画面と manager 画面で総売上が異なり得る。これは意図的な差分であり、既存 API は変更しない（Non-Goals 参照）。

これは現場の日報入力に基づく管理用売上であり、請求確定額や入金済み売上ではない。

### Revenue Breakdown

収益内訳は以下を区別して扱う。

- `insurance_revenue`: 日報上の保険売上（`daily_reports`）
- `private_revenue`: 日報上の自費売上（`daily_reports`）
- `product_revenue`: 収益コンテキスト上の物販売上（`daily_report_revenue_context_summary`）
- `ticket_revenue`: 収益コンテキスト上の回数券売上（同上）
- `traffic_accident_revenue`: 交通事故の手入力概算（同上。公式確定額ではない）
- `workers_comp_revenue`: 労災の手入力概算（同上。公式確定額ではない）
- `patient_copay_estimated`: 患者負担見込み（`daily_report_revenue_breakdown_summary`）
- `insurer_receivable_estimated`: 保険者請求見込み（同上）
- `private_revenue_estimated`: 自費売上見込み（同上）

UI では `売上` と `見込み` をラベルで明確に分ける。交通事故・労災は公式確定額ではないことを表示する。

### Visit Count / Average Revenue Per Visit

```txt
visit_count = sum(daily_reports.total_patients)        -- 期間内の延べ来院数
average_revenue_per_visit = operating_revenue / visit_count   -- visit_count = 0 のときは 0
```

- UI ラベルは `客単価` を維持するが、定義は「来院1回あたり売上（延べ来院ベース）」である。
- 患者分析の `averageRevenuePerPatient`（ユニーク患者あたり）とは定義が異なるため、API フィールド名は `averageRevenuePerVisit` とし、`averageRevenuePerPatient` という名前を本 API で使ってはならない。
- 日報未提出日の来院数は 0 として扱い、未提出日数を別 KPI として表示する。

### Report Days / Missing Report Days

院ごとに次の規則で算出し、`target=total` では各院の値を合算する。

```txt
effective_end(clinic)   = least(期間終了日, JST当日)
effective_start(clinic) = greatest(期間開始日, その院の最古 daily_reports.report_date)
expected_days(clinic)   = effective_start..effective_end のカレンダー日数（負なら 0）
report_days(clinic)     = 期間内に日報が存在する日数
missing_report_days(clinic) = expected_days - report_days
```

- 未来日は未提出に数えない（JST 当日で clamp）。
- 院の最古日報日より前の日は未提出に数えない（開業前・運用開始前の過大計上防止）。`period=all` でもこの規則により院ごとに正しく起算される。
- 日報が 1 件もない院は expected_days = 0、missing_report_days = 0 とする（運用開始日を推定しない）。
- 休診日カレンダーは存在しないため、定休日も未提出に数える。よって本 KPI は暫定値であり、UI の disclaimer で明示する（Non-Goals 参照）。

### Comparison

前期間比は、選択期間と同じ日数の直前期間を比較対象とする。

例:

- 2026-04-01 から 2026-04-30 を選択した場合、比較期間は 2026-03-02 から 2026-03-31
- `今月`（当日が 2026-06-11 の場合 2026-06-01..2026-06-11、11日間）の比較期間は 2026-05-21..2026-05-31
- `全期間` は比較を行わない（comparison 非アクティブ）

規約:

- 変化率 = (当期 - 前期) / 前期。前期値が 0 のときは null。
- `compare=none` または `period=all` のとき、comparison は非アクティブとなり全フィールド null。
- 比較期間に日報が 1 件もない場合、前期値は 0 として扱う（null にしない）。変化率は上記規則により null になる。
- 前年同月比は本バージョンでは実装しない（Non-Goals 参照）。

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

かつ `clinics.is_active = true`（`resolveManagerAssignedClinics` の現挙動を踏襲する）。

- 院が非アクティブ化されると、その院の過去データは合計・比較・全期間集計から除外される。これは現時点のプロダクト判断であり、本仕様で変更しない（Open Questions 参照）。

The implementation must not use the following as manager access grants:

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- client-side selected clinic state

API must fail closed:

- 認証されていない場合は `401`
- manager 以外が manager API を呼んだ場合は `403`（admin を含む。患者分析 API と同じ）
- `clinic_id` が指定されており、active assignments に含まれない場合は **target の値に関係なく** `403`
- manager に active assignments がない場合は empty data を `200` で返す
- invalid period/date query は `400`

実装は患者分析 API と同じ枠組みを使う:

- `processApiRequest(request, { allowedRoles: ['manager'], requireClinicMatch: false })`
- データ読み出しは `createAdminClient()`（service role）経由とし、必ず事前に `resolveManagerAssignedClinics` でスコープを解決してから assigned clinic IDs のみを渡す

Non-manager roles:

- 既存 `/api/revenue` と `/revenue` の挙動を維持する。
- clinic_admin / staff / therapist の clinic scope を広げない。

## Proposed Routes

### UI

`/revenue`

- manager の場合は manager 用収益分析画面を表示する。
- manager 以外は既存画面を維持する。
- manager は所属拠点（primary clinic）が未指定でも active assignments があれば表示できる。

### API

Create:

- `GET /api/manager/revenue/analysis`

Query:

```txt
target=total | clinic            (default: total)
clinic_id=uuid
period=all | month | previous_month | last_3_months | year | custom   (default: month)
start_date=YYYY-MM-DD
end_date=YYYY-MM-DD
compare=previous_period | none   (default: previous_period)
```

Rules:

- `clinic_id` は指定された場合、target の値に関係なく常に検証する。UUID 形式でなければ `400`、active assignments に含まれなければ `403`。
- `target=total`: assigned clinics 全体を集計する。検証済みの `clinic_id` が指定されていても集計対象には影響しない。response は `target: { type: 'total', clinicId: null }` を返す。
- `target=clinic`: `clinic_id` は必須（欠落は `400`）。
- `period=custom`: `start_date` と `end_date` は必須（欠落は `400`）。`start_date > end_date` は `400`。最大 1095 日（患者分析と同じ `MAX_CUSTOM_PERIOD_DAYS`）。
- `period=custom` 以外で `start_date` / `end_date` が送られた場合: 形式は検証する（不正なら `400`）が、期間解決には使わず無視する（患者分析パーサーと同挙動）。
- バケットは API 側で期間長から決定する（Bucket Rules 参照）。
- エラーメッセージ文言は患者分析パーサーと同一にする（例: `期間は最大3年（1095日）以内で指定してください`）。

Period resolution（JST 基準）:

```txt
month          = 当月1日 .. JST当日（month-to-date）
previous_month = 前月1日 .. 前月末日
last_3_months  = 2か月前の月初 .. JST当日
year           = 当年1月1日 .. JST当日（year-to-date）
custom         = start_date .. end_date（ユーザー指定のまま。未提出日数の算出時のみ当日で clamp）
all            = null .. null（RPC 側でデータから解決。終端は JST 当日で clamp）
```

注意: 患者分析 v0.2 の `month` / `year` / `last_3_months` は月末・年末までの範囲を返す。収益分析は未提出日数の正確性のため to-date 方式を採る。これは画面間の意図的な差分であり、共通パーサー抽出時には「終端 clamp の有無」をオプションとして実装する（患者分析の既存挙動は変えない）。

Response shape:

```ts
type TimeSeriesPoint = {
  bucketStart: string; // YYYY-MM-DD
  bucketEnd: string; // YYYY-MM-DD
  label: string;
  value: number;
};

type StackedTimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  insuranceRevenue: number;
  privateRevenue: number;
};

type RevenueBreakdownPoint = {
  code:
    | 'insurance'
    | 'private'
    | 'product'
    | 'ticket'
    | 'traffic_accident'
    | 'workers_comp'
    | 'other';
  name: string;
  value: number;
  share: number; // 合計が 0 のときは 0
  needsReviewCount: number; // context summary 由来
  blockedCount: number; // context summary 由来
};

type ClinicComparisonPoint = {
  clinicId: string;
  clinicName: string;
  value: number;
};

type ManagerRevenueAnalysisResponse = {
  period: {
    type: 'all' | 'month' | 'previous_month' | 'last_3_months' | 'year' | 'custom';
    startDate: string | null; // all のときは null
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
    visitCount: number;
    averageRevenuePerVisit: number; // visitCount = 0 のときは 0
    reportDays: number;
    missingReportDays: number;
    needsReviewCount: number; // daily_report_revenue_estimate_summary 由来
    blockedCount: number; // daily_report_revenue_estimate_summary 由来
  };
  comparison: {
    active: boolean; // compare=none / period=all のとき false
    previousStartDate: string | null;
    previousEndDate: string | null;
    previousOperatingRevenue: number | null;
    operatingRevenueChangeRate: number | null; // 前期 0 のときは null
    previousVisitCount: number | null;
    visitCountChangeRate: number | null;
    previousAverageRevenuePerVisit: number | null;
    averageRevenuePerVisitChangeRate: number | null;
  };
  charts: {
    revenue: TimeSeriesPoint[];
    visits: TimeSeriesPoint[];
    averageRevenuePerVisit: TimeSeriesPoint[]; // series の revenue / visits から API 側で算出（0除算は 0）
    insurancePrivateBreakdown: StackedTimeSeriesPoint[];
    contextBreakdown: RevenueBreakdownPoint[];
    clinicRevenueComparison: ClinicComparisonPoint[];
    clinicAverageRevenueComparison: ClinicComparisonPoint[];
  };
  clinicComparison: Array<{
    clinicId: string;
    clinicName: string;
    operatingRevenue: number;
    revenueShare: number; // 合計 0 のときは 0
    visitCount: number;
    averageRevenuePerVisit: number;
    reportDays: number;
    missingReportDays: number;
    needsReviewCount: number; // estimate summary 由来
    operatingRevenueChangeRate: number | null;
  }>;
  disclaimers: string[];
};
```

Target とデータセットの対応:

- `summary` / `comparison` / `charts.revenue|visits|averageRevenuePerVisit|insurancePrivateBreakdown|contextBreakdown`: target のスコープ（total = 全担当院、clinic = 選択院のみ）を反映する。
- `clinicComparison` / `charts.clinicRevenueComparison|clinicAverageRevenueComparison`: target に関係なく常に全担当院を対象とする（選択院を見ながら他院との比較コンテキストを維持するため。患者分析と同じ構造）。
- `clinicComparison` は `operatingRevenue` 降順でサーバー側ソートして返す。

型の共有:

- `TimeSeriesPoint` / `ClinicComparisonPoint` は患者分析の `TimeSeriesPoint` / `ClinicSeriesPoint` と同形である。共通期間モジュール抽出時に共有型として配置する（Data Design 参照）。

## Data Design

### Shared Period Module

PR-01 で、患者分析の期間・バケットロジックを共通モジュールに抽出する。

- 抽出元: `src/lib/manager-patient-analysis.ts` の `parseManagerPatientAnalysisQuery` 相当のクエリ検証、`resolveManagerPatientAnalysisPeriod` 相当の期間解決、`chooseBucket`、`MAX_CUSTOM_PERIOD_DAYS`、日付ユーティリティ、`TimeSeriesPoint` 系の型。
- 配置先: `src/lib/manager-analysis-period.ts`（命名は実装時に確定してよいが、manager 分析共通であることがわかる名前にする）。
- 患者分析は抽出後のモジュールを参照する形にリファクタリングするが、**挙動は一切変えない**。既存の患者分析テストは修正なしで green を維持すること（挙動不変の証明とする）。
- 終端 clamp（to-date 方式）は収益分析専用のオプションとして実装する。患者分析のデフォルト挙動（月末・年末まで）は変更しない。

### Preferred Foundation

For manager aggregate queries, prefer DB-side aggregation via stable SQL functions instead of fetching raw rows and aggregating in the API.

Reason:

- `supabase/config.toml` has `max_rows = 1000`; raw PostgREST selects can silently truncate large ranges.
- Manager can have multiple assigned clinics.
- `all` and multi-year custom periods can exceed row limits.
- DB-side aggregation reduces network transfer and keeps calculation consistent.

Proposed SQL functions (3本):

```txt
public.manager_revenue_period_totals(p_clinic_ids uuid[], p_start date, p_end date)
  returns 院ごと1行:
    clinic_id,
    operating_revenue, insurance_revenue, private_revenue,
    product_revenue, ticket_revenue,
    traffic_accident_revenue, workers_comp_revenue,
    patient_copay_estimated, insurer_receivable_estimated, private_revenue_estimated,
    visit_count, report_days, missing_report_days,
    needs_review_count, blocked_count,   -- estimate summary 由来
    first_report_date

public.manager_revenue_period_series(p_clinic_ids uuid[], p_start date, p_end date, p_bucket text)
  returns バケットごと1行:
    bucket_start, bucket_end,
    operating_revenue, insurance_revenue, private_revenue, visit_count

public.manager_revenue_context_breakdown(p_clinic_ids uuid[], p_start date, p_end date)
  returns 収益コンテキストごと1行:
    revenue_context_code, revenue_context_name,
    total_revenue, item_count, needs_review_count, blocked_count
```

Rules:

- 前期間比は `manager_revenue_period_totals` を比較期間境界（`previousStartDate` / `previousEndDate`）で再度呼び出して取得する。専用の比較 RPC は作らない。
- 引数は `date` 型とする。`daily_reports.report_date` は date（JST 業務日）であり、患者分析 RPC（reservations の timestamptz）と異なり timezone 変換が不要なため。
- `p_start` / `p_end` が null（`period=all`）の場合、RPC 側で対象院の `daily_reports.report_date` の min/max から境界を解決する。
- 終端は RPC 内でも `(now() at time zone 'Asia/Tokyo')::date` で clamp する（API 側 clamp との二重防御）。
- `missing_report_days` は Revenue Definition の規則（院ごとの first_report_date 下限、当日 clamp）どおり RPC 内で算出する。
- series の週バケットは `date_trunc('week', ...)`（月曜開始）とし、バケットの開始・終了は要求期間に clamp する（患者分析 `manager_patient_period_series` と同一規約。チャートのラベル・境界を画面間で揃えるため）。
- `p_bucket` は `daily | weekly | monthly` のみ受け付ける。

Security:

- Functions are `security invoker` with `set search_path = public`（`security definer` を使わない。患者分析 RPC と同じ）。
- Functions are called only from server-side API with service role client.
- `execute` is granted to `service_role` only.
- `public`, `anon`, and `authenticated` execute privileges are revoked.
- API must resolve active manager assignments before calling RPC and pass only assigned clinic IDs.
- RPC must not accept user ID or infer auth scope (`auth.uid()` を参照しない). Scope enforcement belongs to API and assignment resolver.

Rollback:

- Each migration adding RPCs must have a rollback under `supabase/rollbacks/`（例: `supabase/rollbacks/<timestamp>_manager_revenue_analysis_rpcs_rollback.sql`）。
- Rollback must drop only the functions added by that migration.
- No destructive table data changes are expected for this version.

### Source Tables / Views

Primary source:

- `daily_reports`

Breakdown sources:

- `daily_report_revenue_context_summary`（コンテキスト別売上・要確認・ブロック）
- `daily_report_revenue_breakdown_summary`（見込み金額の amount_role 別集計）
- `daily_report_revenue_estimate_summary`（見込み件数・要確認・ブロック。summary カードのソース）

Detail source:

- `daily_report_items`（PR-03 のメニュー別ランキングのみ。多院合算では直接 fetch しない）

### Bucket Rules

患者分析 v0.2 の `chooseBucket` と同一（共通モジュール経由で同一実装を使う）:

- 31 日以下: daily
- 32 〜 180 日: weekly
- 181 日以上: monthly
- `period=all`（境界 null）: monthly

Date timezone:

- Date boundaries are interpreted in Asia/Tokyo.
- `daily_reports.report_date` is a date and should be compared as local business date.
- `month` / `last_3_months` / `year` の終端、および未提出日数算出時の終端は JST 当日で clamp する。

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
     - `前期間比`（default）
     - `比較なし`
   - apply button
   - reset button

3. Summary Cards
   - 担当院数
   - 総売上
   - 前期間比
   - 来院数
   - 客単価（定義: 来院1回あたり売上。ツールチップまたは補足テキストで明示する）
   - 保険売上
   - 自費売上
   - 見込み要確認（`daily_report_revenue_estimate_summary` の needs_review 件数）
   - 日報未提出日数（暫定値。休診日を含む）

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

6. Selected Clinic Detail（`target=clinic` のとき表示）
   - 選択院の売上推移
   - 選択院の収益カテゴリ内訳
   - メニュー別売上ランキング（PR-03）
   - 要確認 / blocked の件数
   - 患者分析への導線
   - 日報一覧への導線

### Disclaimers / Empty / Error States

常時表示（disclaimers 配列で返す）:

```txt
この画面の売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。
患者分析の売上（予約ベース）とは集計方法が異なるため、数値は一致しません。
```

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

日報未提出がある場合（missingReportDays > 0）:

```txt
未提出の日報があるため、期間集計は暫定値です。
※未提出日数には定休日も含まれます。
```

交通事故・労災・見込み金額を含む場合:

```txt
一部の金額は経営分析用の概算です。請求確定額ではありません。
```

### Navigation

- サイドバーの `収益分析`（`/revenue`）は既に manager に表示されている（`OPERATION_MENU_ITEMS` 由来）。新規追加は不要。既存導線が manager 分岐画面に到達することをテストで固定する。
- HQ admin menu / clinic_admin menu の既存導線は維持する。
- manager を global `ADMIN_UI_ROLES` に追加しない。
- manager を `HQ_ROLES` / `CROSS_CLINIC_ROLES` に追加しない。

## Implementation Plan

### PR-01: API / Data Foundation

- `docs/stabilization/spec-manager-revenue-analysis-v0.2.md` を実装仕様として参照する。
- 共通期間モジュールを抽出し、患者分析を挙動不変でリファクタリングする（既存テスト無修正で green）。
- manager revenue aggregation RPC（3本）を追加する。
- rollback SQL を追加する。
- migration text test を追加する。
- `GET /api/manager/revenue/analysis` を追加する。
- active `manager_clinic_assignments`（かつ active clinics）のみから assigned clinics を解決する。
- query parser（共通モジュール + 収益分析固有の compare / clamp）を追加する。
- empty data / 401 / 403 / 400 / clamp / coalesce の挙動をテストで固定する。
- 既存 `/api/revenue` は変更しない。

### PR-02: Manager Revenue UI

- `/revenue` に manager 分岐を追加する。
- `useManagerRevenueAnalysis` を追加する（`useManagerPatientAnalysis` の規約に合わせる）。
- 期間フィルタ、対象切替、チャート、院別比較を実装する。
- 既存サイドバー導線（収益分析）から manager 画面に到達することをテストで固定する。
- read-only UI として write action を出さない。
- disclaimers（データソース注記・暫定値注記）を表示する。

### PR-03: Breakdown / Drilldown

- 収益カテゴリ内訳を充実させる（context / estimate の要確認・blocked 内訳の出し分けを含む）。
- メニュー別売上ランキングを選択院詳細に追加する。単院・期間限定の絞り込みでも `max_rows` 超過が起こり得る場合は、`manager_revenue_menu_ranking` RPC をこの PR で追加する。
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
- manager requesting unassigned `clinic_id` gets `403` (both `target=clinic` and `target=total`).
- manager with no active assignments gets empty data with `200`.
- manager does not fallback to `permissions.clinic_id`.
- manager does not fallback to `profiles.clinic_id`.
- manager does not fallback to JWT `clinic_scope_ids`.
- admin / clinic_admin / therapist / staff calling manager API gets `403`.
- unauthenticated request gets `401`.
- invalid date format gets `400`.
- invalid `clinic_id` format (non-UUID) gets `400`.
- `target=clinic` without `clinic_id` gets `400`.
- custom period without start/end gets `400`.
- start date after end date gets `400`.
- custom period over 1095 days gets `400`.

### Query Parser / Period Tests

- `period=all` returns null start/end and monthly bucket.
- `period=month` returns current JST month start through JST today (month-to-date).
- `period=previous_month` returns previous JST month full range.
- `period=last_3_months` returns first day of two months ago through JST today.
- `period=year` returns Jan 1 through JST today (year-to-date).
- `period=custom` accepts valid date range.
- non-custom period ignores provided start/end after format validation.
- bucket is selected from period length with shared thresholds (31 / 180).
- shared module: patient analysis behavior is unchanged (existing patient analysis tests pass without modification).

### Aggregation / Calculation Tests

- operating revenue falls back to insurance + private when `total_revenue` is null.
- operating revenue does not collapse to 0 when only one of insurance/private is null.
- `averageRevenuePerVisit` is 0 when visit count is 0.
- change rate is null when previous value is 0.
- comparison is inactive (all null) for `compare=none` and for `period=all`.
- comparison window dates match the same-day-count rule (e.g. Apr 1-30 vs Mar 2-31).
- `missingReportDays` does not count future days.
- `missingReportDays` does not count days before the clinic's first report date.
- clinic with zero reports yields 0 expected / 0 missing days.
- `revenueShare` is 0 when total operating revenue is 0.
- summary `needsReviewCount` / `blockedCount` come from estimate summary, not context summary.

### SQL / Migration Text Tests

- migration creates the three manager revenue RPC functions.
- functions are declared `security invoker` with pinned `search_path`.
- RPC grants execute only to `service_role`.
- migration revokes execute from `public`, `anon`, `authenticated`.
- functions aggregate by `clinic_id` and date range.
- functions do not reference `auth.uid()`.
- rollback drops exactly the added functions.

### UI Tests

- manager sees `収益分析` manager screen on `/revenue`.
- existing sidebar `収益分析` item routes manager to the manager screen.
- manager with assignments sees filter bar and charts.
- manager with zero assignments sees 担当院未設定 message.
- selecting `選択院` enables clinic select.
- unchecking or changing target resets invalid selected clinic state.
- custom period validates start/end before fetch.
- manager screen does not render write buttons.
- manager screen always shows the data-source disclaimer, and shows the estimate disclaimer when estimate values are present.
- manager screen shows the provisional-value note when missingReportDays > 0.
- clinic comparison table renders assigned clinics only, sorted by operating revenue desc.

### Hook Tests

- hook sends `target`, `clinic_id`, `period`, `start_date`, `end_date`, `compare`.
- hook ignores stale responses after rapid filter changes.
- hook updates summary and chart state after successful response.
- hook preserves previous data during background reload only when filters are unchanged.

## Verification Commands

After implementation:

```powershell
npm run test -- manager-revenue manager-analysis-period revenue
npm run type-check
npm run lint
git diff --check
supabase db push --local --dry-run
```

- If a migration is added, also run the targeted migration text test.
- Do not run `supabase db push` or `supabase db reset` without explicit approval.

## Performance Requirements

- Manager revenue API P95 target: 800ms or less for 10 clinics x 12 months.
- 1リクエストあたりの RPC 呼び出しは最大 4 回（totals / series / context breakdown / 比較期間 totals）とし、`Promise.all` で並列実行する。
- API must not fetch raw `daily_report_items` rows for multi-clinic totals. 選択院のメニュー別ランキング（PR-03）のみ限定的なドリルダウンとして許可する。
- Summary and chart series should be aggregated in DB.
- UI should render charts from chart-ready API response without additional client aggregation over large row sets.
- Clinic comparison is sorted server-side（または集計済みの小さな結果セット上で行う）。

## Security Requirements

- Manager effective access must remain DB-assignment-only.
- No manager access decision may use `permissions.clinic_id`, `profiles.clinic_id`, JWT clinic scope, or client selected clinic.
- Server API must validate assigned clinic membership before passing clinic IDs into RPC. 指定された `clinic_id` は target に関係なく検証する。
- RPC must be service-role-only (`security invoker`, execute revoked from `public` / `anon` / `authenticated`) and not exposed to authenticated clients.
- RPC must not reference `auth.uid()` or infer scope.
- Existing RLS assumptions must not be weakened.
- Existing non-manager `/api/revenue` behavior must not be widened.

## Resolved Questions (from v0.1)

- `総売上` のベース: 収益分析は日報ベース、患者分析は reservation ベースとして明示的に分ける。UI に常時データソース注記を表示する。
- `全期間` の境界解決: RPC 側で assigned clinics の最古 `daily_reports.report_date` を解決する。未提出日数は院ごとの最古日報日を下限とする。
- メニュー別売上: PR-03 以降。MVP は総売上、内訳、院別比較を優先する。
- 交通事故・労災のカード表示: summary では `見込み要確認` として集約し、詳細内訳で表示する。
- `target=total` 時の `clinic_id`: 無視ではなく常に検証し、未担当は `403`（患者分析と統一）。
- バケット閾値: 患者分析と同一（31 / 180）に統一し、共通モジュール化する。

## Open Questions

- 非アクティブ化された院の過去実績を通期集計に含めるオプションが将来必要か。
  - v0.2 recommendation: 現状は除外のまま（患者分析と同じ）。HQ 側の要望が出た時点で `include_inactive` のような明示パラメータを検討する。
- 休診日カレンダー（定休日マスタ）を導入して未提出日数を精緻化するか。
  - v0.2 recommendation: 本仕様の範囲外。disclaimer での注記運用とし、カレンダー導入時に `missingReportDays` の定義を改訂する。
- 前年同月比をいつ導入するか。
  - v0.2 recommendation: 前期間比の利用状況を見てから。導入時は同日数比較ではなく暦月比較として別仕様を切る。

## Assumptions

- Manager は担当院の経営状況を読むだけで、売上データを書き換えない。
- Manager の担当院は active `manager_clinic_assignments`（かつ active clinics）のみで決まる。
- 所属拠点（primary clinic）は表示・人事メタデータであり、収益分析のアクセス権には使わない。
- 日報未提出がある期間の売上は暫定値として表示する。未提出日数には定休日が含まれる。
- 収益見込みは経営分析用であり、請求確定額ではない。
- Supabase migration を追加する場合は、同時に rollback と migration text test を追加する。
- 共通期間モジュールの抽出は患者分析の挙動を変えない。既存テストが無修正で通ることをもって確認する。