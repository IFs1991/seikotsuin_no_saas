# Manager Staff Analysis Spec v0.2

- Status: draft
- Date: 2026-06-12
- File: `docs/stabilization/spec-manager-staff-analysis-v0.2.md`
- Target repository: `IFs1991/seikotsuin_no_saas`
- Feature: manager 向け担当院スタッフ分析
- Supersedes: `spec-manager-staff-analysis-v0.1.md`

---

## 0. Revision Summary

v0.2 では、v0.1 の方針を維持しつつ、migration / current schema と突き合わせた結果に基づき、実装事故を防ぐために以下を明確化する。

### Main changes from v0.1

1. **canonical staff identity を `public.resources.id` に固定する**
   - `resources.type = 'staff'` を分析上のスタッフ正本とする。
   - `public.staff` は legacy table として扱い、v0.1/v0.2 の主集計には使わない。

2. **route を `/manager/staff-analysis` に変更する**
   - 既存の `/staff` や「スタッフ分析」導線との混同を避ける。

3. **period query を既存 manager analysis helper に寄せる**
   - `period=month | previous_month | last_3_months | year | custom | all`
   - `start_date`, `end_date` を使用する。
   - v0.2 では `today`, `week`, `from`, `to`, `last_month` は採用しない。

4. **revenue source を `daily_report_items` ベースに明記する**
   - スタッフ別売上は `daily_report_items.staff_resource_id = resources.id` に紐づく `fee` 合計とする。
   - 予約ベース指標と売上明細ベース指標の一致は保証しない。

5. **staff row の `dailyReportStatus` を削除する**
   - `daily_reports` は院・日付単位の性格が強く、スタッフ別提出状態として扱うと誤判定リスクが高い。
   - v0.2 では staff row に `dailyReportStatus` を持たせない。
   - 日報系 issue は `dailyReportIssueCount` または `attentionItems` の院単位 signal に限定する。

6. **`disclaimers` を API response に追加する**
   - 人事評価・給与査定用途ではないこと。
   - スタッフ別売上の集計制約。
   - 予約件数と日報明細売上が一致しない可能性。

---

## 1. Summary

Manager 向けに、担当院全体および各院ごとのスタッフ稼働・予約対応・売上貢献・キャンセル傾向を確認できる read-only 分析画面を追加する。

この画面は **スタッフの人事評価・給与査定・勤怠承認画面ではない**。

目的は、manager が担当エリア内で以下を早期に把握することである。

- 稼働が偏っている院
- 予約対応が落ちているスタッフ
- キャンセル率が高いスタッフ
- 売上貢献が急落しているスタッフ
- 支援・確認が必要な院またはスタッフ

manager の実効 clinic scope は、active `public.manager_clinic_assignments` のみに限定する。

以下は manager のアクセス権判定には使用しない。

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- クライアント側の clinic 選択状態
- URL query の `clinic_id`

---

## 2. Core Decisions

### 2.1 Staff identity は `resources(type='staff')` を正本にする

v0.2 のスタッフ分析における canonical staff id は `public.resources.id` とする。

理由:

- `public.reservations.staff_id` は `public.resources(id)` を参照する。
- `public.staff_shifts.staff_id` は `public.resources(id)` を参照する。
- `public.daily_report_items.staff_resource_id` は `public.resources(id)` を参照する。
- `public.staff` は legacy table であり、新規開発では `resources(type='staff')` を使用する前提である。

API response の `staffId` は `resources.id` を返す。

```ts
type StaffIdentityRule = {
  staffId: 'resources.id'
  staffName: 'resources.name'
  clinicId: 'resources.clinic_id'
}
```

`public.staff`, `public.profiles`, `public.user_permissions` は v0.2 の主集計には使用しない。必要な場合のみ optional enrichment とする。

---

### 2.2 全体と院別の2階層で見る

manager は複数院を担当するため、スタッフ分析は以下の2階層を基本にする。

1. 担当エリア全体
2. 各院ごと

担当エリア全体では、担当院すべての staff resource の稼働と成果を横断集計する。

各院ごとでは、選択した担当院内の staff resource 一覧、院内ランキング、日別/週別/月別推移、要確認スタッフを表示する。

---

### 2.3 新規 manager API を追加する

```txt
GET /api/manager/staff-analysis
```

Query:

```txt
target=total | clinic
clinic_id=<uuid>
period=month | previous_month | last_3_months | year | custom | all
start_date=YYYY-MM-DD
end_date=YYYY-MM-DD
compare=previous_period | none
```

Rules:

- `target=total` は担当院すべてを集計する。
- `target=clinic` は `clinic_id` 必須。
- `clinic_id` が指定された場合、必ず active `manager_clinic_assignments` に含まれるかサーバー側で検証する。
- 担当外 `clinic_id` は `403`。
- manager 以外は `403`。
- 未認証は `401`。
- 担当院が0件の場合は `200` で空データを返す。
- `period=custom` の場合のみ `start_date` / `end_date` を読む。
- `start_date` / `end_date` の不正値は `400`。
- `compare` 未指定時は `previous_period` を default とする。

Implementation note:

- 既存の `manager-analysis-period` 系 helper がある場合は、それを再利用する。
- v0.2 では `today`, `week`, `from`, `to`, `last_month` は採用しない。
- 既存 helper の命名と差分がある場合は、仕様より既存 helper の安定性を優先する。

---

### 2.4 既存 staff 管理画面とは分離する

この画面はスタッフアカウント管理や権限管理ではない。

既存の `/staff`, `/admin/users`, スタッフ管理 API、権限管理 API は変更しない。

v0.2 では manager 専用の read-only analysis route として追加する。

```txt
Route: /manager/staff-analysis
Navigation label: 担当院スタッフ分析
Navigation id: manager-staff-analysis
```

---

## 3. Goals

- manager が担当院全体の staff resource 状況を確認できる。
- manager が院ごとの staff resource 状況を確認できる。
- 期間を切り替えて、スタッフ稼働と成果の変化を確認できる。
- スタッフ別の予約対応数、完了/来院件数、売上、キャンセル率、平均単価を確認できる。
- 院別のスタッフ成果差分を比較できる。
- 要確認スタッフを見つけやすくする。
- 分析画面は read-only とし、スタッフ作成、権限変更、売上編集、予約編集などの write action は表示しない。
- manager の clinic scope は active `manager_clinic_assignments` のみを使用する。
- 非 manager の既存画面挙動は変更しない。
- migration / RLS / manager assignment schema は変更しない。

---

## 4. Non-Goals

- スタッフの人事評価、給与計算、査定、勤怠承認は含めない。
- スタッフアカウント作成、ロール変更、権限変更は含めない。
- manager から予約、患者、売上、日報、シフトを編集できるようにしない。
- 新しい Supabase table や migration は追加しない。
- RLS、manager assignment、role guard の仕様は変更しない。
- AI による評価コメントや自動改善提案は含めない。
- 院をまたいだスタッフ所属ルールの変更は含めない。
- `public.staff` を新規分析機能の canonical staff table として扱わない。
- staff row で厳密な日報提出ステータスを表示しない。
- 予約ベース売上と日報明細ベース売上の完全一致を保証しない。
- `supabase db push`、`supabase migration up`、`supabase db reset` はこの仕様の実装では実行しない。

---

## 5. Current State / Schema Assumptions

Relevant files / modules:

- `src/lib/auth/manager-scope.ts`
- `src/app/api/manager/dashboard/route.ts`
- `src/lib/manager-dashboard.ts`
- `src/app/api/manager/patients/analysis/route.ts`
- `src/lib/manager-patient-analysis.ts`
- `src/lib/manager-revenue-analysis.ts`
- `src/lib/manager-analysis-period.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/lib/navigation/items.ts`
- `src/app/(app)/reservations/page.tsx`
- `src/app/api/reservations/route.ts`
- `src/app/api/revenue/route.ts`
- `src/lib/admin/users.ts`

Relevant tables / views:

Primary:

- `public.manager_clinic_assignments`
- `public.clinics`
- `public.resources`
- `public.reservations`
- `public.reservation_list_view`
- `public.staff_shifts`
- `public.daily_reports`
- `public.daily_report_items`

Legacy / optional:

- `public.staff`
- `public.profiles`
- `public.user_permissions`

Notes:

- manager の担当院解決には既存の `resolveManagerAssignedClinics` 系 helper を使う。
- `daily_reports.status` は存在しない前提で扱う。
- 日報提出状態は staff row では扱わない。
- DB schema の列名は実装前に必ず確認する。
- `resources.is_deleted`, `resources.is_active`, `resources.type` の実カラム名・型は実装時に確認する。
- `reservations.status` の完了扱い status は既存 revenue / reservation helper に合わせる。

---

## 6. Data Source Rules

### 6.1 Staff master

v0.2 の staff master は `public.resources` とする。

Base condition:

```sql
resources.clinic_id in (:assigned_clinic_ids)
and resources.type = 'staff'
and resources.is_deleted = false
```

Active staff condition:

```sql
resources.is_active = true
```

`staffCount` では active staff のみを数える。

`workingStaffCount` では、対象期間内に reservation / shift / daily report item のいずれかが存在する staff resource を数える。

`is_bookable` は v0.2 では staffCount の必須条件には含めない。理由は、予約可能ではないが院内業務を持つ staff resource が存在する可能性があるため。

---

### 6.2 Reservation metrics

予約系指標は `public.reservations` または `public.reservation_list_view` を使う。

Staff attribution:

```sql
reservations.staff_id = resources.id
```

Metrics:

- `reservationCount`
- `completedReservationCount`
- `canceledReservationCount`
- `noShowReservationCount`
- `cancellationRate`

Status mapping は既存実装に合わせる。

Recommended status groups:

```ts
type ReservationStatusGroup = {
  completed: ['completed', 'arrived']
  canceled: ['canceled', 'cancelled', 'no_show']
}
```

Implementation note:

- 実際の status enum / text values は実装前に schema と既存 helper で確認する。
- 既存 revenue summary が `completed` / `arrived` を完了扱いにしている場合はそれに合わせる。
- `no_show` が存在しない場合は通常 cancel に含めない。

---

### 6.3 Shift metrics

シフト系指標は `public.staff_shifts` を使う。

Staff attribution:

```sql
staff_shifts.staff_id = resources.id
```

Usage:

- `workingStaffCount`
- `low_activity` 判定の補助
- 将来の勤務/予約負荷比較の拡張余地

v0.2 では詳細な勤怠分析・承認状態は扱わない。

---

### 6.4 Revenue metrics

スタッフ別売上は `public.daily_report_items` を使う。

Staff attribution:

```sql
daily_report_items.staff_resource_id = resources.id
```

Amount:

```sql
sum(daily_report_items.fee)
```

Date:

```sql
daily_report_items.report_date
```

Clinic scope:

```sql
daily_report_items.clinic_id in (:assigned_clinic_ids)
```

Important:

- `staff_resource_id is null` の明細は staff row の売上には含めない。
- 院全体売上には含めるかどうかを実装で明確化する。
- v0.2 の推奨は、clinic comparison の `totalRevenue` も staff-attributed revenue に揃える。
- 予約ベース売上と日報明細ベース売上の一致は保証しない。

Recommended v0.2 rule:

```txt
summary.totalRevenue:
  staff_resource_id に紐づく daily_report_items.fee の合計

staff.totalRevenue:
  staff_resource_id ごとの daily_report_items.fee の合計

clinicComparison.totalRevenue:
  clinic_id ごとの staff-attributed daily_report_items.fee の合計
```

Reason:

- summary / staff rows / clinic comparison の整合性を優先する。
- staff_resource_id が null の売上を含めると、スタッフ別合計と summary がズレる。
- v0.2 では「スタッフ分析」画面なので、スタッフ帰属可能な売上に限定する。

---

### 6.5 Daily report metrics

`daily_reports` は院・日付単位の日報として扱う。

v0.2 では staff row に `dailyReportStatus` を持たせない。

Allowed metrics:

- `dailyReportIssueCount`
- `attentionItems` の clinic-level signal
- `missing_daily_report` は staff-specific ではなく clinic/date issue として扱うか、v0.2 では省略する。

Recommended v0.2 rule:

```txt
dailyReportIssueCount:
  対象期間内で、予約または売上明細が存在する clinic/date に daily_reports row が存在しない件数
```

If this is expensive or ambiguous, set to `0` and add disclaimer.

---

## 7. Security Requirements

- API は manager のみ許可する。
- manager の clinic scope は active `manager_clinic_assignments` のみ。
- `permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids` は manager のアクセス権として使用しない。
- クライアントから渡された `clinic_id` は必ず assignment scope と照合する。
- 担当外 clinic_id は fail-closed で `403`。
- 担当院なしは `200` で空データを返す。
- API response に担当外 clinic / staff / reservation / patient data を含めない。
- 患者個人情報はこの画面には返さない。
- staff email や phone など個人連絡先は v0.2 では返さない。
- staff profile details は返さない。
- write action は UI に表示しない。
- API は write 処理を持たない。

---

## 8. UX Requirements

### 8.1 Route

```txt
/manager/staff-analysis
```

Navigation:

- manager のサイドバーに「担当院スタッフ分析」を追加する。
- admin / clinic_admin / therapist / staff のメニューには今回追加しない。
- 既存の「スタッフ分析」や「スタッフ管理」と混同しないラベルにする。

---

### 8.2 Header

表示:

- タイトル: `担当院スタッフ分析`
- 説明: `担当院のスタッフ稼働、予約対応、売上貢献、キャンセル傾向を確認できます。`
- 補足: `この画面は人事評価・給与査定用ではありません。`
- 最終更新日時
- 再読み込みボタン

---

### 8.3 Filters

Filters:

- 表示対象
  - `担当エリア全体`
  - `院別`
- 院選択
  - `院別` の場合に有効
  - active assignments の担当院のみ表示
- 期間
  - 今月
  - 前月
  - 直近3か月
  - 今年
  - 全期間
  - 任意期間
- 比較
  - 前期間比
  - 比較なし

Rules:

- 担当院が0件の場合はフィルターを無効化し、空状態を表示する。
- 院別選択で担当外 clinic_id が URL に入っていても、API は `403` とする。
- UI は担当外 clinic_id を選択肢に出さない。
- custom period の日付不正は UI で予防し、API でも `400` とする。

---

### 8.4 Empty State

担当院が0件:

```txt
担当院がまだ設定されていません。
管理者にマネージャー管理から担当店舗の設定を依頼してください。
```

対象期間にデータがない:

```txt
選択した期間のスタッフ分析データがありません。
期間または担当院を変更してください。
```

スタッフ帰属可能な売上がない:

```txt
スタッフに紐づく売上明細がありません。
予約・稼働データを中心に表示しています。
```

---

## 9. Dashboard Layout

### 9.1 Summary KPIs

担当エリア全体、院別の両方で表示する。

- スタッフ数
- 出勤/稼働スタッフ数
- 総予約対応数
- 完了/来院件数
- スタッフ帰属売上
- 平均単価
- キャンセル率
- 日報確認件数

Definitions:

```ts
type ManagerStaffAnalysisSummary = {
  staffCount: number
  workingStaffCount: number
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  averageUnitPrice: number
  cancellationRate: number
  dailyReportIssueCount: number
  revenueChangeRate: number | null
  reservationChangeRate: number | null
}
```

Detailed definitions:

- `staffCount`
  - 対象 clinic scope に紐づく active `resources(type='staff')` 数。

- `workingStaffCount`
  - 対象期間内に reservation / staff_shift / daily_report_item のいずれかがある staff resource 数。

- `reservationCount`
  - 対象期間内の予約件数。
  - Source: `reservations` or `reservation_list_view`

- `completedReservationCount`
  - 完了/来院扱いの予約件数。
  - Status group は既存 helper に合わせる。

- `totalRevenue`
  - `daily_report_items.staff_resource_id` に紐づく `fee` 合計。
  - staff attribution がない明細は含めない。

- `averageUnitPrice`
  - `totalRevenue / completedReservationCount`
  - 分母0の場合は0。

- `cancellationRate`
  - キャンセル・無断キャンセル件数 / 予約件数。
  - 分母0の場合は0。

- `dailyReportIssueCount`
  - v0.2 では clinic/date 単位の確認件数。
  - 算出が曖昧な場合は0とし、disclaimerに明記する。

---

### 9.2 Staff Ranking Table

Columns:

- スタッフ名
- 所属院
- 予約対応数
- 完了/来院件数
- スタッフ帰属売上
- 平均単価
- キャンセル率
- 売上前期間比
- 予約前期間比
- 状態

Sort options:

- 売上
- 予約対応数
- 完了/来院件数
- 平均単価
- キャンセル率
- 売上前期間比
- 予約前期間比

Default sort:

1. `totalRevenue desc`
2. `reservationCount desc`
3. `staffName asc`

Status label examples:

- `要確認`
- `安定`
- `データ不足`

v0.2 では staff row に日報提出 status は表示しない。

---

### 9.3 Clinic Comparison

担当エリア全体 view で表示する。

Columns:

- 院名
- スタッフ数
- 稼働スタッフ数
- 予約対応数
- スタッフ帰属売上
- スタッフ平均売上
- キャンセル率
- 要確認スタッフ数

Definitions:

- `averageRevenuePerStaff`
  - `totalRevenue / workingStaffCount`
  - 分母0の場合は0。

---

### 9.4 Staff Trend Chart

対象期間に応じて bucket を切り替える。

Bucket rule:

- 31日以下: `daily`
- 180日以下: `weekly`
- 181日以上: `monthly`

Series:

- 売上
- 予約対応数
- 完了/来院件数
- キャンセル率

担当エリア全体 view:

- staff aggregate の時系列
- 院別比較の multi-line または stacked

院別 view:

- 選択院の staff aggregate
- 上位スタッフの比較

v0.2 implementation note:

- trend chart は初期実装で重い場合、table / summary 後に追加してよい。
- API response shape は最初から `trends` を持つ。
- データがない場合は空配列を返す。

---

### 9.5 Attention Items

要確認スタッフとして表示する。

Types:

```ts
type ManagerStaffAnalysisAttentionType =
  | 'high_cancellation_rate'
  | 'reservation_drop'
  | 'revenue_drop'
  | 'low_activity'
  | 'workload_concentration'
  | 'clinic_daily_report_missing'
```

Severity:

```ts
type ManagerStaffAnalysisAttentionSeverity =
  | 'critical'
  | 'warning'
  | 'info'
```

v0.2 required types:

- `high_cancellation_rate`
- `reservation_drop`
- `revenue_drop`
- `low_activity`

v0.2 optional types:

- `workload_concentration`
- `clinic_daily_report_missing`

Rules:

- キャンセル率が 20% 以上: `warning`
- キャンセル率が 30% 以上かつ予約件数が5件以上: `critical`
- 前期間比で予約対応数が 30% 以上低下: `warning`
- 前期間比で売上が 30% 以上低下: `warning`
- 対象期間内に active staff だが予約・シフト・売上明細がすべて0: `info`
- 院内の予約対応が特定スタッフに 50% 以上集中: `info`
- clinic/date で予約または日報明細があるのに daily report row がない: `warning`

Sort:

1. severity: critical, warning, info
2. clinicName asc
3. staffName asc
4. type asc

---

## 10. API Response Shape

```ts
type ManagerStaffAnalysisResponse = {
  generatedAt: string
  period: ManagerStaffAnalysisPeriod
  scope: ManagerStaffAnalysisScope
  summary: ManagerStaffAnalysisSummary
  staff: ManagerStaffAnalysisStaffRow[]
  clinicComparison: ManagerStaffAnalysisClinicComparisonRow[]
  trends: ManagerStaffAnalysisTrendPoint[]
  attentionItems: ManagerStaffAnalysisAttentionItem[]
  disclaimers: string[]
}
```

```ts
type ManagerStaffAnalysisPeriod = {
  preset: 'month' | 'previous_month' | 'last_3_months' | 'year' | 'custom' | 'all'
  startDate: string | null
  endDate: string | null
  bucket: 'daily' | 'weekly' | 'monthly'
  compare: 'previous_period' | 'none'
}
```

```ts
type ManagerStaffAnalysisScope = {
  target: 'total' | 'clinic'
  clinicId: string | null
  clinics: ManagerStaffAnalysisClinic[]
}
```

```ts
type ManagerStaffAnalysisClinic = {
  id: string
  name: string
}
```

```ts
type ManagerStaffAnalysisSummary = {
  staffCount: number
  workingStaffCount: number
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  averageUnitPrice: number
  cancellationRate: number
  dailyReportIssueCount: number
  revenueChangeRate: number | null
  reservationChangeRate: number | null
}
```

```ts
type ManagerStaffAnalysisStaffRow = {
  staffId: string // resources.id
  staffName: string // resources.name
  clinicId: string
  clinicName: string
  isActive: boolean
  isBookable: boolean | null
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  averageUnitPrice: number
  cancellationRate: number
  revenueChangeRate: number | null
  reservationChangeRate: number | null
  status: 'needs_attention' | 'stable' | 'insufficient_data'
}
```

```ts
type ManagerStaffAnalysisClinicComparisonRow = {
  clinicId: string
  clinicName: string
  staffCount: number
  workingStaffCount: number
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  averageRevenuePerStaff: number
  cancellationRate: number
  attentionStaffCount: number
}
```

```ts
type ManagerStaffAnalysisTrendPoint = {
  date: string
  clinicId: string | null
  clinicName: string | null
  staffId: string | null // resources.id
  staffName: string | null
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  cancellationRate: number
}
```

```ts
type ManagerStaffAnalysisAttentionItem = {
  id: string
  type:
    | 'high_cancellation_rate'
    | 'reservation_drop'
    | 'revenue_drop'
    | 'low_activity'
    | 'workload_concentration'
    | 'clinic_daily_report_missing'
  severity: 'critical' | 'warning' | 'info'
  clinicId: string
  clinicName: string
  staffId: string | null // null allowed for clinic-level issue
  staffName: string | null
  title: string
  description: string
  metricValue: number | null
}
```

---

## 11. Default Disclaimers

API response should include default disclaimers.

```ts
const DEFAULT_MANAGER_STAFF_ANALYSIS_DISCLAIMERS = [
  'この画面は人事評価・給与査定・勤怠承認用ではありません。担当院の支援・状況把握を目的とした read-only 分析画面です。',
  'スタッフ別売上は daily_report_items.staff_resource_id に紐づく明細のみを集計しています。',
  'staff_resource_id が未設定の売上明細はスタッフ別ランキングには含まれません。',
  '予約件数と日報明細売上の件数・金額は一致しない場合があります。',
  '患者個人情報、スタッフの個人連絡先、権限情報はこの画面では表示しません。',
]
```

---

## 12. Error Handling

### 12.1 Unauthenticated

```txt
Status: 401
```

### 12.2 Non-manager

```txt
Status: 403
```

### 12.3 Manager with no active assignments

```txt
Status: 200
```

Response:

```ts
{
  generatedAt,
  period,
  scope: {
    target,
    clinicId: null,
    clinics: []
  },
  summary: zeroSummary,
  staff: [],
  clinicComparison: [],
  trends: [],
  attentionItems: [],
  disclaimers
}
```

### 12.4 Unassigned clinic_id

```txt
Status: 403
```

### 12.5 Invalid query

```txt
Status: 400
```

Invalid examples:

- `target=clinic` without `clinic_id`
- invalid UUID
- invalid period
- `period=custom` without valid `start_date` / `end_date`
- `start_date > end_date`
- invalid compare value

---

## 13. Performance Requirements

- API は担当院数に比例した N+1 query を避ける。
- 期間集計は可能な限り `clinic_id in (...)` と期間条件でまとめて取得する。
- UI component 内で重い集計を行わない。
- 集計ロジックは `src/lib/manager-staff-analysis.ts` の pure domain builder に寄せる。
- 期間 bucket は API response 側で正規化する。
- 初期表示は担当エリア全体、今月、前期間比ありを default とする。
- 大量 staff の場合は client table の表示件数を制限し、必要なら pagination または top N を検討する。
- `daily_report_items` は `clinic_id`, `staff_resource_id`, `report_date` で絞り込める形にする。
- `reservations` は `clinic_id`, `staff_id`, reservation date で絞り込める形にする。
- `resources` は assigned clinic scope でまとめて取得する。

---

## 14. Implementation Plan

Create:

- `src/types/manager-staff-analysis.ts`
- `src/lib/manager-staff-analysis.ts`
- `src/hooks/useManagerStaffAnalysis.ts`
- `src/app/api/manager/staff-analysis/route.ts`
- `src/components/staff-analysis/manager-staff-analysis.tsx`
- `src/app/(app)/manager/staff-analysis/page.tsx`
- `src/__tests__/lib/manager-staff-analysis.test.ts`
- `src/__tests__/api/manager-staff-analysis-route.test.ts`
- `src/__tests__/components/staff-analysis/manager-staff-analysis.test.tsx`

Update:

- `src/lib/navigation/items.ts`

Optional update:

- shared period helper if patient / revenue analysis already has duplicated period parsing logic.
- shared manager analysis layout components if existing pages already have common cards/tables.

Do not update:

- Supabase migrations
- RLS policies
- manager assignment schema
- existing user permission write APIs
- existing staff management APIs
- existing `/staff` page behavior

---

## 15. Domain Builder Design

Recommended pure builder:

```ts
type BuildManagerStaffAnalysisInput = {
  generatedAt: string
  period: ManagerStaffAnalysisPeriod
  target: 'total' | 'clinic'
  requestedClinicId: string | null
  assignedClinics: ManagerStaffAnalysisClinic[]
  staffResources: StaffResourceRecord[]
  reservations: ReservationMetricRecord[]
  shifts: StaffShiftMetricRecord[]
  dailyReportItems: DailyReportItemMetricRecord[]
  previousReservations: ReservationMetricRecord[]
  previousDailyReportItems: DailyReportItemMetricRecord[]
}
```

Records:

```ts
type StaffResourceRecord = {
  id: string
  name: string
  clinicId: string
  clinicName: string
  isActive: boolean
  isDeleted: boolean
  isBookable: boolean | null
}
```

```ts
type ReservationMetricRecord = {
  id: string
  clinicId: string
  staffId: string // resources.id
  status: string
  startsAt: string
}
```

```ts
type StaffShiftMetricRecord = {
  id: string
  clinicId: string
  staffId: string // resources.id
  shiftDate: string
}
```

```ts
type DailyReportItemMetricRecord = {
  id: string
  clinicId: string
  staffResourceId: string | null // resources.id
  reportDate: string
  fee: number
}
```

Builder responsibilities:

- scope-filtering defense in depth
- current period aggregation
- previous period aggregation
- change rate calculation
- summary generation
- staff rows generation
- clinic comparison generation
- trend generation
- attention items generation
- disclaimers injection

Route responsibilities:

- auth
- role guard
- manager assigned clinic resolution
- query validation
- DB fetch
- passing records into builder
- returning JSON

UI responsibilities:

- filter state
- fetch hook call
- display
- no heavy aggregation

---

## 16. Calculation Rules

### 16.1 Change rate

```ts
function calculateChangeRate(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}
```

### 16.2 Average unit price

```ts
averageUnitPrice =
  completedReservationCount === 0
    ? 0
    : totalRevenue / completedReservationCount
```

### 16.3 Cancellation rate

```ts
cancellationRate =
  reservationCount === 0
    ? 0
    : canceledReservationCount / reservationCount
```

### 16.4 Working staff

A staff resource is working if at least one of the following exists in the selected period:

- reservation assigned to staff
- staff shift
- daily report item assigned to staff

### 16.5 Insufficient data

A staff row is `insufficient_data` when:

```txt
reservationCount < 3
and totalRevenue = 0
```

### 16.6 Needs attention

A staff row is `needs_attention` when it has at least one staff-level attention item with severity `critical` or `warning`.

Otherwise:

```txt
status = stable
```

---

## 17. TDD Plan

Add failing tests first.

### 17.1 API tests

- unauthenticated request returns `401`.
- non-manager request returns `403`.
- manager with no active assignments returns empty response.
- manager `target=total` only aggregates assigned clinics.
- manager `target=clinic` with assigned clinic returns data.
- manager `target=clinic` with unassigned clinic returns `403`.
- manager does not fallback to `permissions.clinic_id`.
- manager does not use JWT `clinic_scope_ids`.
- invalid `target=clinic` without `clinic_id` returns `400`.
- invalid custom period returns `400`.
- API response includes `disclaimers`.

### 17.2 Domain tests

- uses `resources.id` as staffId.
- excludes deleted staff resources.
- counts only active staff resources for staffCount.
- workingStaffCount includes reservation-based working staff.
- workingStaffCount includes shift-based working staff.
- workingStaffCount includes daily-report-item-based working staff.
- reservation totals are calculated correctly.
- completed reservation totals are calculated correctly.
- totalRevenue uses `daily_report_items.staff_resource_id`.
- daily report items with `staff_resource_id = null` are excluded from staff revenue.
- average unit price handles zero denominator.
- cancellation rate handles zero denominator.
- previous period change rate handles previous zero as `null`.
- attention items are generated for high cancellation rate.
- attention items are generated for reservation drop.
- attention items are generated for revenue drop.
- attention sort order is severity, clinicName, staffName, type.
- bucket selection follows 31/180 day rule.
- staff row does not include `dailyReportStatus`.

### 17.3 Component tests

- title and description render.
- disclaimer text renders.
- assigned clinics appear in filter.
- total view renders summary KPI and clinic comparison.
- clinic view renders selected clinic staff rows.
- no assigned clinics shows empty state.
- no data for selected period shows no-data state.
- write actions are not rendered.
- staff email / phone are not rendered.
- `/manager/staff-analysis` page is manager-only.

### 17.4 Navigation tests

- manager menu includes `担当院スタッフ分析`.
- nav item href is `/manager/staff-analysis`.
- non-manager menus are unchanged unless already expected.
- existing `/staff` navigation remains unchanged.

---

## 18. Verification

```powershell
npm run test -- --runInBand --runTestsByPath src\__tests__\api\manager-staff-analysis-route.test.ts src\__tests__\lib\manager-staff-analysis.test.ts src\__tests__\components\staff-analysis\manager-staff-analysis.test.tsx src\__tests__\lib\navigation-items.test.ts
npm run type-check
npm run lint
git diff --check
```

If project uses Vitest path syntax differently, adapt command to existing test runner.

Do not run:

```powershell
supabase db push
supabase migration up
supabase db reset
```

---

## 19. Open Questions

Implementation前に確認する。

1. `reservations.status` の完了扱いは `completed` / `arrived` の両方でよいか。
2. `reservations` の日付カラムは `start_time`, `starts_at`, `date` のどれを既存 helper が使っているか。
3. `daily_report_items.fee` は税込/税抜どちらとして表示するか。
4. `daily_report_items.staff_resource_id is null` の売上を summary に含めない方針でよいか。
5. `resources.is_bookable=false` の staff resource も表示対象に含めるか。
6. `clinic_daily_report_missing` を v0.2 に入れるか、v0.3 に送るか。

Recommended answers for v0.2:

1. 完了扱いは既存 revenue helper に合わせる。
2. 既存 reservations API / reservation_list_view に合わせる。
3. v0.2 では DB値をそのまま表示し、税区分は表示しない。
4. 含めない。スタッフ分析なので staff-attributed revenue に揃える。
5. 含める。ただし `isBookable` を row に表示可能にする。
6. v0.3 送り。v0.2 はスタッフ別予約・売上・キャンセルに集中する。

---

## 20. Acceptance Criteria

- manager が `/manager/staff-analysis` を開ける。
- manager の navigation に `担当院スタッフ分析` が表示される。
- manager は担当エリア全体のスタッフ分析を見られる。
- manager は各院ごとのスタッフ分析を見られる。
- manager は担当外 `clinic_id` の分析を取得できない。
- manager の実効 scope は active `manager_clinic_assignments` のみ。
- `staffId` は `resources.id` である。
- `public.staff` を canonical staff table として使っていない。
- スタッフ別売上は `daily_report_items.staff_resource_id` に紐づく `fee` で集計される。
- `staff_resource_id is null` の売上明細は staff row revenue に含まれない。
- API response に `disclaimers` が含まれる。
- 画面に write action が表示されない。
- staff email / phone / 権限情報が表示されない。
- staff row に `dailyReportStatus` が含まれない。
- 担当院0件の空状態が表示される。
- 期間指定、院選択、全体/院別切り替えができる。
- API / domain / component / navigation の targeted tests がある。
- `npm run type-check`、`npm run lint`、対象 test、`git diff --check` が通る。

---

## 21. Codex Implementation Prompt

```txt
You are implementing manager staff analysis for IFs1991/seikotsuin_no_saas.

Read this spec first:
docs/stabilization/spec-manager-staff-analysis-v0.2.md

Critical constraints:
- Do not create or modify Supabase migrations.
- Do not run supabase db push, migration up, or db reset.
- Do not modify RLS policies or manager assignment schema.
- Do not modify existing staff management write APIs.
- This is a read-only manager analysis feature.

Manager scope:
- Use active manager_clinic_assignments only.
- Do not fallback to permissions.clinic_id, profiles.clinic_id, JWT clinic_scope_ids, client selected clinic, or URL clinic_id.
- target=clinic with unassigned clinic_id must return 403.
- manager with no active assignments returns 200 with empty data.

Staff identity:
- Canonical staff id is public.resources.id where resources.type = 'staff'.
- Do not use public.staff as the canonical staff table.
- reservations.staff_id points to resources.id.
- staff_shifts.staff_id points to resources.id.
- daily_report_items.staff_resource_id points to resources.id.

Revenue:
- Staff revenue uses sum(daily_report_items.fee) grouped by staff_resource_id.
- Exclude daily_report_items where staff_resource_id is null from staff row revenue.
- Add API disclaimers explaining that staff revenue is daily-report-item based and may not match reservation-based totals.

Route:
- API: GET /api/manager/staff-analysis
- Page: /manager/staff-analysis
- Navigation label: 担当院スタッフ分析

Period:
- Use existing manager analysis period helper if available.
- period values: month, previous_month, last_3_months, year, custom, all.
- Use start_date/end_date for custom period.

Response:
- Include generatedAt, period, scope, summary, staff, clinicComparison, trends, attentionItems, disclaimers.
- Staff row must not include dailyReportStatus.

Testing:
- Add API, domain, component, and navigation tests.
- Add tests proving resources.id is used as staffId.
- Add tests proving public.staff is not the canonical source.
- Add tests proving manager scope does not fallback to permissions/JWT/client clinic.
- Run targeted tests, type-check, lint, and git diff --check.
```

---

## 22. Future Extensions

v0.3以降で検討:

- staff profile/account linkage
- staff email/phone visibility by role with explicit permission
- staff-level daily report submission model
- shift-hour based productivity
- appointment duration / revenue per hour
- repeat patient contribution
- new patient contribution
- nomination / 指名分析
- AI-generated support suggestions
- payroll / evaluation integration
- export CSV
- top N / pagination / virtualized table
