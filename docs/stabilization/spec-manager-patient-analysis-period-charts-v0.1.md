# Manager Patient Analysis Period Charts Spec v0.1

## Summary

Manager 向け患者分析ページに、期間指定とチャート分析を追加する。

現在の `/patients` の manager 分岐は、担当院合計・院別サマリー・選択院の患者分析を表示できる。一方で、期間別の推移や任意期間の比較はまだ十分ではない。今後は、全期間だけでなく「1月から4月まで」「今月」「直近3か月」などの期間を選び、担当院合計と院別の両方で分析できるようにする。

この仕様では、UI だけで数字を作るのではなく、`public.reservations` を日付軸の source of truth として扱い、manager の実効 clinic scope は引き続き active `manager_clinic_assignments` のみに限定する。

## Goals

- `/patients` の manager 画面で期間フィルタを使えるようにする。
- 全期間 / プリセット期間 / 任意期間を切り替えられるようにする。
- 担当院合計と各院個別の分析を切り替えられるようにする。
- 売上・患者数・新患・再来・来院数・患者単価・離脱リスクをチャートで見られるようにする。
- 院別比較で、担当院間の差と変化を見られるようにする。
- manager の患者分析は read-only のまま維持する。
- manager の実効 clinic scope は active `manager_clinic_assignments` のみとする。

## Non-Goals

- 患者一覧や患者詳細を manager に開放しない。
- manager から患者情報を編集できるようにしない。
- manager から予約・日報・売上データを書き換えられるようにしない。
- AI 予測や高度な将来予測モデルは含めない。
- LINE 連絡、フォローアップタスク作成、通知送信は含めない。
- 既存の clinic_admin / therapist / staff 向け患者分析の挙動を変更しない。

## Current State

Relevant files:

- `src/app/(app)/patients/page.tsx`
- `src/hooks/useManagerPatientAnalysis.ts`
- `src/lib/manager-patient-analysis.ts`
- `src/app/api/manager/patients/analysis/route.ts`
- `src/lib/services/patient-analysis-service.ts`
- `public.patient_visit_summary`
- `public.reservations`

Current manager API:

- `GET /api/manager/patients/analysis`
- manager only
- active `manager_clinic_assignments` から担当院を解決する
- `permissions.clinic_id` / `profiles.clinic_id` / JWT `clinic_scope_ids` には fallback しない
- `period`, `start_date`, `end_date` の query parsing は存在する
- ただし、現状の `periodApplied` は `false` で、期間別の正確な集計には未対応

Current data limitation:

- `public.patient_visit_summary` は患者単位の累計ビューである。
- `visit_count`, `total_revenue`, `first_visit_date`, `last_visit_date` は全期間集計として有用。
- しかし「2026-01-01 から 2026-04-30 の売上推移」「月別新患数」「期間中の再来数」などを正確に出すには、`reservations.start_time` を使った期間集計が必要。

## Recommended PR Split

### PR-01: Data/API Foundation

- manager 患者分析 API の期間集計を正確化する。
- 必要なら Supabase migration を追加し、日次/月次集計に使う read-only view または RPC を作る。
- UI は大きく変えず、API response に chart-ready な series を追加する。

### PR-02: Manager UI Charts

- `/patients` の manager 分岐に期間フィルタ、カレンダー、チャート、院別比較 UI を追加する。
- 既存の read-only 方針と fail-closed 方針を維持する。

### PR-03: Polish / Performance

- チャートのローディング状態、空状態、比較表示を調整する。
- API query の取得列、集計単位、キャッシュ方針を見直す。

## Access Control Requirements

Manager:

- allowed: `/patients` の manager 分析画面
- denied: `/patients/list`
- denied: `/patients/[id]`
- denied: patient write actions

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

- manager が未担当 clinic_id を指定した場合は `403`
- manager に active assignments がない場合は empty data
- invalid period/date query は `400`

## UX Requirements

### Page Layout

Manager の `/patients` は次の構成にする。

1. Header
   - title: `患者分析`
   - subtitle: `担当院の患者動向を期間別に確認できます。`

2. Filter Bar
   - 対象:
     - `担当院合計`
     - 各担当院
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
     - カレンダー UI
   - apply button
   - reset button

3. Summary Cards
   - 担当院数
   - 患者数
   - 新患数
   - 再来患者数
   - 新患再来率
   - 来院数
   - 平均来院回数
   - 総売上
   - 患者単価
   - 離脱リスク高

4. Charts
   - 売上推移
   - 患者数推移
   - 新患 / 再来 推移
   - 来院数推移
   - 新患再来率推移
   - 院別売上比較
   - 院別患者数比較

5. Clinic Comparison
   - 院名
   - 患者数
   - 新患数
   - 再来患者数
   - 新患再来率
   - 来院数
   - 総売上
   - 患者単価
   - 離脱リスク高

6. Selected Clinic Detail
   - 選択中の院のセグメント
   - 選択中の院の離脱リスク
   - 選択中の院の LTV 上位
   - follow-up 候補
   - `連絡する` などの write action は表示しない

### Period UX

Default:

- period: `month`
- start/end: 当月の開始日から終了日
- target: `担当院合計`

When `全期間` is selected:

- `start_date` / `end_date` は送らない。
- UI label は `全期間`。

When `任意期間` is selected:

- start date と end date は必須。
- start date > end date はクライアントで送信前に止める。
- API でも `400` を返す。

### Chart Bucket Rules

期間の長さに応じて bucket を切り替える。

- 31日以内: daily
- 32日から 180日: weekly
- 181日以上: monthly
- 全期間: monthly

UI は API から返された `bucket` をそのまま表示し、フロント側で独自に再集計しない。

## Metric Rules

Qualifying reservation:

```txt
public.reservations
where is_deleted = false
and status in ('completed', 'arrived')
```

Date basis:

- `reservations.start_time`
- display timezone: `Asia/Tokyo`
- start date: selected day 00:00:00 Asia/Tokyo inclusive
- end date: selected day 23:59:59.999 Asia/Tokyo inclusive

### Patient Count

`患者数` は、対象期間内に qualifying reservation が1件以上ある distinct `customer_id` 数。

全期間の場合は既存の `patient_visit_summary.totalPatients` と同等の意味に寄せる。

### New Patients

`新患数` は、患者の最初の qualifying reservation が対象期間内にある distinct `customer_id` 数。

### Repeat Patients

`再来患者数` は、対象期間内に2回目以降の qualifying reservation がある distinct `customer_id` 数。

### Conversion Rate

`新患再来率` は、対象期間内に初回来院した患者のうち、対象期間終了日時点で2回目の qualifying reservation が存在する患者の割合。

```txt
conversion_rate = converted_new_patients / new_patients * 100
```

`new_patients = 0` の場合は `0`。

### Visit Count

`来院数` は、対象期間内の qualifying reservation 件数。

### Average Visit Count

```txt
average_visit_count = visit_count / patient_count
```

`patient_count = 0` の場合は `0`。

### Revenue

`総売上` は対象期間内の qualifying reservation の金額合計。

```txt
amount = coalesce(actual_price, price, 0)
```

### Average Revenue Per Patient

```txt
average_revenue_per_patient = total_revenue / patient_count
```

`patient_count = 0` の場合は `0`。

### High Risk Patients

`離脱リスク高` は、対象期間終了日時点の最終来院日を基準に算出する。

- 全期間の場合: today を基準にする。
- 任意期間/プリセット期間の場合: `end_date` を基準にする。
- 患者名つきリストは selected clinic detail のみに含める。
- 担当院合計や非選択院では、件数だけ返す。

## API Contract

### GET `/api/manager/patients/analysis`

Allowed:

- manager only

Denied:

- admin
- clinic_admin
- therapist
- staff
- customer

Query:

```txt
clinic_id?: uuid
target?: total | clinic
period?: all | month | previous_month | last_3_months | year | custom
start_date?: YYYY-MM-DD
end_date?: YYYY-MM-DD
bucket?: daily | weekly | monthly
```

Rules:

- `clinic_id` が未指定なら担当院合計を返す。
- `clinic_id` が指定された場合は active assignments に含まれる clinic のみ許可。
- `period=custom` では `start_date` と `end_date` が必須。
- `period=all` では start/end を無視する。
- `bucket` 未指定なら API 側で期間長から決定する。

Response:

```ts
type ManagerPatientAnalysisResponse = {
  summary: ManagerPatientAnalysisSummary;
  clinics: ManagerPatientClinicSummary[];
  selectedClinic: ManagerPatientClinicDetail | null;
  period: {
    type:
      | 'all'
      | 'month'
      | 'previous_month'
      | 'last_3_months'
      | 'year'
      | 'custom';
    startDate: string | null;
    endDate: string | null;
    bucket: 'daily' | 'weekly' | 'monthly';
    periodApplied: true;
  };
  charts: {
    revenue: TimeSeriesPoint[];
    patients: TimeSeriesPoint[];
    newPatients: TimeSeriesPoint[];
    repeatPatients: TimeSeriesPoint[];
    visits: TimeSeriesPoint[];
    conversionRate: TimeSeriesPoint[];
    clinicRevenueComparison: ClinicSeriesPoint[];
    clinicPatientComparison: ClinicSeriesPoint[];
  };
};
```

```ts
type TimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  value: number;
};

type ClinicSeriesPoint = {
  clinicId: string;
  clinicName: string;
  value: number;
};
```

## Data Design

### Preferred Data Source

Use `public.reservations` for period-based analysis.

The current `public.patient_visit_summary` can still be used for:

- all-time patient lifetime summary
- selected clinic detail
- LTV ranking
- current churn risk

But period trend charts should not be derived only from `patient_visit_summary`, because it is cumulative and does not contain per-day revenue or per-day visit records.

### Recommended DB Support

If performance or correctness requires DB-side aggregation, add a migration with one of the following:

1. read-only view for reservation facts
2. stable SQL function returning period aggregates
3. materialized view only if needed later

Recommended initial approach:

- Do not add materialized view in the first implementation.
- Query `reservations` through the server API using the service role client.
- Filter by active manager assignment clinic ids.
- Select only required columns:
  - `id`
  - `clinic_id`
  - `customer_id`
  - `start_time`
  - `status`
  - `is_deleted`
  - `actual_price`
  - `price`
- If query volume becomes high, add a DB-side function in a follow-up PR.

Recommended index review:

- Existing indexes include `idx_reservations_clinic_status` and date indexes.
- For period charts, consider a future partial index:

```sql
create index concurrently if not exists idx_reservations_clinic_start_completed
on public.reservations (clinic_id, start_time)
where is_deleted = false
  and status in ('completed', 'arrived');
```

Use a normal non-concurrent migration if the migration runner does not support concurrent index creation.

## UI Components

Prefer small local components under `src/app/(app)/patients/page.tsx` unless the file becomes too large. If extracting:

- `src/components/patients/manager-patient-analysis-filter.tsx`
- `src/components/patients/manager-patient-analysis-charts.tsx`
- `src/components/patients/manager-clinic-comparison-table.tsx`

Chart library:

- Use an existing chart dependency if already present.
- Do not add a new chart dependency without approval.
- If no chart library exists, implement simple accessible SVG charts first.

Calendar:

- Use existing date input or existing date picker components if present.
- Do not add a new calendar dependency without approval.
- Native `<input type="date">` is acceptable for v0.1.

## Empty / Loading / Error States

Loading:

```txt
患者分析を読み込んでいます。
```

No assigned clinics:

```txt
担当院がまだ設定されていません。
管理者に担当店舗の設定を依頼してください。
```

No data in selected period:

```txt
選択した期間の患者分析データはまだありません。
期間を変更するか、来院データの登録状況を確認してください。
```

Invalid custom period:

```txt
開始日は終了日以前の日付を指定してください。
```

API error:

```txt
患者分析の取得に失敗しました。時間をおいて再度お試しください。
```

## Performance Requirements

- API must fetch all assigned clinic data in one request where reasonable.
- Do not request one API call per clinic for initial load.
- Patient-name lists must be returned only for selected clinic detail.
- Aggregate and chart responses must not include patient names.
- Limit selected clinic patient lists to the existing top list limits.
- Avoid frontend-side filtering over large raw reservation lists when DB-side filtering is available.
- Request cancellation / stale response protection in `useManagerPatientAnalysis` must be preserved.

## Security Requirements

- Manager scope must be DB-only from active `manager_clinic_assignments`.
- API must validate `clinic_id` before querying patient or reservation facts.
- Query must include only assigned clinic IDs.
- Do not expose patient-level rows for non-selected clinics.
- Do not expose patient detail links for manager.
- Do not show write actions such as contact, edit, reservation creation, or follow-up creation.
- Do not weaken existing RLS assumptions.

## TDD / Test Plan

Add failing tests first.

### Unit Tests

- `parseManagerPatientAnalysisQuery`
  - accepts `period=all`
  - accepts preset periods
  - accepts valid custom start/end
  - rejects invalid date format
  - rejects start date after end date
  - rejects invalid clinic_id

- period resolver
  - resolves current month
  - resolves previous month
  - resolves last 3 months
  - resolves year
  - resolves all period as null start/end
  - chooses daily/weekly/monthly bucket based on period length

- manager patient aggregation
  - counts patients by selected period
  - counts new patients by first qualifying reservation
  - counts repeat patients by second-or-later qualifying reservation
  - sums revenue using `actual_price` before `price`
  - excludes `cancelled`, `no_show`, deleted reservations
  - computes clinic comparison series
  - does not include patient lists for non-selected clinics

### API Tests

- manager with active assignments receives period-applied response.
- manager with no assignments receives empty data.
- manager cannot request unassigned `clinic_id`.
- manager does not fallback to `permissions.clinic_id`.
- invalid custom date returns `400`.
- non-manager roles are denied.

### UI Tests

- manager sees period controls.
- manager can switch from all clinics to a selected clinic.
- manager can choose custom start/end dates.
- manager sees charts after data load.
- manager sees no-data message for empty period.
- manager does not see patient list tab as an available workflow.
- manager does not see patient detail links or contact buttons.

## Verification Commands

Use npm.

```powershell
npm run test -- manager-patient-analysis patients
npm run type-check
npm run lint
git diff --check
```

If a Supabase migration is added:

```powershell
supabase db push --local --dry-run
npm run supabase:types
```

Do not run `supabase db push` or `supabase db reset` without explicit approval.

## Rollback Plan

If this is implemented without DB migration:

1. Revert manager patient analysis API changes.
2. Revert `useManagerPatientAnalysis` changes.
3. Revert `/patients` manager UI changes.
4. Revert related tests.

If a DB migration is added:

1. Include a matching rollback SQL file.
2. Roll back only the new period analysis view/function/index.
3. Do not modify or drop `manager_clinic_assignments`.
4. Do not weaken `app_private.can_access_clinic(uuid)`.

## Acceptance Criteria

- Manager can select all period, preset periods, and custom date ranges.
- Manager can view assigned clinic total and individual clinic analysis.
- Charts are generated from period-applied data.
- Revenue and visit metrics are based on qualifying reservations in the selected period.
- New patient metrics use first qualifying reservation date.
- Repeat metrics use second-or-later qualifying reservation logic.
- Manager cannot access unassigned clinics by query manipulation.
- Manager patient analysis does not use `permissions.clinic_id`, `profiles.clinic_id`, or JWT clinic scope as access grants.
- No patient write action is exposed to manager.
- Non-manager patient analysis behavior is preserved.
