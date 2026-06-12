# Manager Staff Analysis Spec v0.1

- Status: draft
- Date: 2026-06-12
- File: `docs/stabilization/spec-manager-staff-analysis-v0.1.md`
- Target repository: `IFs1991/seikotsuin_no_saas`
- Feature: manager 向けスタッフ分析

---

## 1. Summary

Manager 向けに、担当院全体と各院ごとのスタッフ状況を分析できる画面を追加する。

この画面はスタッフの人事評価画面ではなく、担当エリア内の稼働、予約対応、売上貢献、日報・シフト状況を横断的に把握し、支援が必要な院やスタッフを見つけるための read-only 分析画面とする。

manager の実効 clinic scope は、active `manager_clinic_assignments` のみに限定する。

以下は manager のアクセス権として扱わない。

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- クライアント側の clinic 選択状態
- URL query の `clinic_id`

---

## 2. Core Decision

### 2.1 全体と院別の2階層で見る

manager は複数院を担当するため、スタッフ分析は以下の2階層を基本にする。

1. 担当エリア全体
2. 各院ごと

担当エリア全体では、担当院すべてのスタッフ稼働と成果を横断集計する。

各院ごとでは、選択した担当院内のスタッフ一覧、院内ランキング、日別推移、要確認スタッフを表示する。

### 2.2 新規 manager API を追加する

manager staff analysis は新規 API を追加する。

```txt
GET /api/manager/staff-analysis
```

Query:

```txt
target=total | clinic
clinic_id=<uuid>
period=today | week | month | last_month | last_3_months | year | custom | all
from=YYYY-MM-DD
to=YYYY-MM-DD
compare=previous_period | none
```

Rules:

- `target=total` は担当院すべてを集計する。
- `target=clinic` は `clinic_id` 必須。
- `clinic_id` が指定された場合、必ず active `manager_clinic_assignments` に含まれるかサーバー側で検証する。
- 担当外 `clinic_id` は `403`。
- manager 以外は `403`。
- 未認証は `401`。
- 担当院が0件の場合は空データを返す。

### 2.3 既存 staff 管理画面とは分離する

この画面はスタッフアカウント管理や権限管理ではない。

既存の `/admin/users` やスタッフ管理 API は変更せず、分析用途の read-only API と UI として追加する。

---

## 3. Goals

- manager が担当院全体のスタッフ状況を確認できる。
- manager が院ごとのスタッフ状況を確認できる。
- 期間を切り替えて、スタッフ稼働と成果の変化を確認できる。
- スタッフ別の予約対応数、施術数、売上、キャンセル率、平均単価を確認できる。
- 院別のスタッフ成果差分を比較できる。
- 要確認スタッフを見つけやすくする。
- 分析画面は read-only とし、スタッフ作成、権限変更、売上編集、予約編集などの write action は表示しない。
- manager の clinic scope は `manager_clinic_assignments` のみを使用する。
- 非 manager の既存画面挙動は変更しない。

---

## 4. Non-Goals

- スタッフの人事評価、給与計算、査定、勤怠承認は含めない。
- スタッフアカウント作成、ロール変更、権限変更は含めない。
- manager から予約、患者、売上、日報、シフトを編集できるようにしない。
- 新しい Supabase table や migration は原則追加しない。
- RLS、manager assignment、role guard の仕様は変更しない。
- AI による評価コメントや自動改善提案は含めない。
- 院をまたいだスタッフ所属ルールの変更は含めない。
- `supabase db push`、`supabase migration up`、`supabase db reset` はこの仕様の実装では実行しない。

---

## 5. Current State

Relevant files:

- `src/lib/auth/manager-scope.ts`
- `src/app/api/manager/dashboard/route.ts`
- `src/lib/manager-dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/lib/navigation/items.ts`
- `src/app/(app)/reservations/page.tsx`
- `src/app/api/reservations/route.ts`
- `src/app/api/revenue/route.ts`
- `src/app/api/manager/patients/analysis/route.ts`
- `src/lib/manager-patient-analysis.ts`
- `src/lib/admin/users.ts`
- `public.manager_clinic_assignments`
- `public.clinics`
- `public.profiles`
- `public.user_permissions`
- `public.staff`
- `public.reservation_list_view`
- `public.daily_reports`
- `public.daily_report_items`

Notes:

- 既存の manager dashboard、患者分析、収益分析と同じく、manager の担当院解決には `resolveManagerAssignedClinics` 系の helper を使う。
- `daily_reports.status` は存在しない前提で扱う。日報提出状態は row の有無や review signal から派生する。
- DB schema の列名は実装前に必ず確認する。

---

## 6. UX Requirements

### 6.1 Route

候補 route:

```txt
/staff-analysis
```

Navigation:

- manager のサイドバーに「スタッフ分析」を追加する。
- admin / clinic_admin / therapist / staff のメニューには今回追加しない。
- 既存の「スタッフ管理」と混同しないラベルにする。

### 6.2 Header

表示:

- タイトル: `スタッフ分析`
- 説明: `担当院のスタッフ稼働、予約対応、売上貢献を確認できます。`
- 最終更新日時
- 再読み込みボタン

### 6.3 Filters

Filters:

- 表示対象
  - `担当エリア全体`
  - `院別`
- 院選択
  - `院別` の場合に有効
  - active assignments の担当院のみ表示
- 期間
  - 今日
  - 今週
  - 今月
  - 先月
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

### 6.4 Empty State

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

---

## 7. Dashboard Layout

### 7.1 Summary KPIs

担当エリア全体、院別の両方で表示する。

- スタッフ数
- 出勤スタッフ数
- 総予約対応数
- 施術・対応件数
- 総売上
- 平均単価
- キャンセル率
- 日報未提出または確認待ち件数

Definitions:

- `staffCount`: 対象 clinic scope に紐づく active staff 数。
- `workingStaffCount`: 対象期間内にシフト、予約対応、日報のいずれかがある staff 数。
- `reservationCount`: 対象期間内の予約件数。
- `completedReservationCount`: 完了扱いの予約件数。
- `totalRevenue`: 対象期間内の売上合計。会計確定データがなければ日報売上推定を使用する。
- `averageUnitPrice`: `totalRevenue / completedReservationCount`。分母0の場合は0。
- `cancellationRate`: キャンセル・無断キャンセル件数 / 予約件数。分母0の場合は0。
- `dailyReportIssueCount`: 日報未提出または確認待ちの件数。

### 7.2 Staff Ranking Table

Columns:

- スタッフ名
- 所属院
- 予約対応数
- 完了件数
- 売上
- 平均単価
- キャンセル率
- 前期間比
- 状態

Sort options:

- 売上
- 予約対応数
- 完了件数
- 平均単価
- キャンセル率
- 前期間比

Default sort:

- `totalRevenue desc`
- tie-breaker: `staffName asc`

### 7.3 Clinic Comparison

担当エリア全体 view で表示する。

Columns:

- 院名
- スタッフ数
- 出勤スタッフ数
- 予約対応数
- 総売上
- スタッフ平均売上
- キャンセル率
- 要確認スタッフ数

### 7.4 Staff Trend Chart

対象期間に応じて bucket を切り替える。

Bucket rule:

- 31日以下: daily
- 180日以下: weekly
- 181日以上: monthly

Series:

- 売上
- 予約対応数
- 完了件数
- キャンセル率

担当エリア全体 view:

- staff aggregate の時系列
- 院別比較の stacked または multi-line

院別 view:

- 選択院の staff aggregate
- 上位スタッフの比較

### 7.5 Attention Items

要確認スタッフとして表示する。

Types:

- `high_cancellation_rate`
- `reservation_drop`
- `revenue_drop`
- `missing_daily_report`
- `low_activity`
- `workload_concentration`

Severity:

- `critical`
- `warning`
- `info`

Rules:

- キャンセル率が 20% 以上: `warning`
- キャンセル率が 30% 以上かつ予約件数が5件以上: `critical`
- 前期間比で予約対応数が 30% 以上低下: `warning`
- 前期間比で売上が 30% 以上低下: `warning`
- シフトまたは予約対応があるのに日報がない: `warning`
- 院内の予約対応が特定スタッフに 50% 以上集中: `info`

Sort:

1. severity: critical, warning, info
2. clinicName asc
3. staffName asc
4. type asc

---

## 8. API Response Shape

```ts
type ManagerStaffAnalysisResponse = {
  generatedAt: string
  period: {
    preset: string
    from: string | null
    to: string | null
    bucket: 'daily' | 'weekly' | 'monthly'
    compare: 'previous_period' | 'none'
  }
  scope: {
    target: 'total' | 'clinic'
    clinicId: string | null
    clinics: ManagerStaffAnalysisClinic[]
  }
  summary: ManagerStaffAnalysisSummary
  staff: ManagerStaffAnalysisStaffRow[]
  clinicComparison: ManagerStaffAnalysisClinicComparisonRow[]
  trends: ManagerStaffAnalysisTrendPoint[]
  attentionItems: ManagerStaffAnalysisAttentionItem[]
}
```

```ts
type ManagerStaffAnalysisClinic = {
  id: string
  name: string
}

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

type ManagerStaffAnalysisStaffRow = {
  staffId: string
  userId: string | null
  staffName: string
  clinicId: string
  clinicName: string
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  averageUnitPrice: number
  cancellationRate: number
  revenueChangeRate: number | null
  reservationChangeRate: number | null
  dailyReportStatus: 'submitted' | 'missing' | 'needs_review' | 'not_applicable'
}

type ManagerStaffAnalysisClinicComparisonRow = {
  clinicId: string
  clinicName: string
  staffCount: number
  workingStaffCount: number
  reservationCount: number
  totalRevenue: number
  averageRevenuePerStaff: number
  cancellationRate: number
  attentionStaffCount: number
}

type ManagerStaffAnalysisTrendPoint = {
  date: string
  clinicId: string | null
  clinicName: string | null
  staffId: string | null
  staffName: string | null
  reservationCount: number
  completedReservationCount: number
  totalRevenue: number
  cancellationRate: number
}

type ManagerStaffAnalysisAttentionItem = {
  id: string
  type:
    | 'high_cancellation_rate'
    | 'reservation_drop'
    | 'revenue_drop'
    | 'missing_daily_report'
    | 'low_activity'
    | 'workload_concentration'
  severity: 'critical' | 'warning' | 'info'
  clinicId: string
  clinicName: string
  staffId: string
  staffName: string
  title: string
  description: string
  metricValue: number | null
}
```

---

## 9. Data Sources

Primary:

- `manager_clinic_assignments`
- `clinics`
- `staff`
- `profiles`
- `user_permissions`
- `reservation_list_view`
- `daily_reports`
- `daily_report_items`

Revenue source priority:

1. 会計確定または収益集計 view が既存にある場合はそれを使う。
2. なければ manager revenue analysis と同じ日報売上推定系の helper / view を使う。
3. どちらも使えない場合、v0.1 では売上を `0` とし、予約・稼働中心の分析として実装する。

Implementation note:

- 実装前に既存の staff / reservation / revenue schema を確認する。
- 予約担当者、施術担当者、作成者のどれを staff attribution に使うかは既存 schema に合わせる。
- staff attribution が曖昧な場合、v0.1 では「予約担当スタッフ」を優先し、仕様コメントに明記する。

---

## 10. Security Requirements

- API は manager のみ許可する。
- manager の clinic scope は active `manager_clinic_assignments` のみ。
- `permissions.clinic_id`、`profiles.clinic_id`、JWT `clinic_scope_ids` は manager のアクセス権として使用しない。
- クライアントから渡された `clinic_id` は必ず assignment scope と照合する。
- 担当外 clinic_id は fail-closed で `403`。
- 担当院なしは `200` で空データを返す。
- API response に担当外 clinic / staff / reservation / patient data を含めない。
- 患者個人情報はこの画面には返さない。
- staff email や phone など個人連絡先は v0.1 では返さない。

---

## 11. Performance Requirements

- API は担当院数に比例した N+1 query を避ける。
- 期間集計は可能な限り `clinic_id in (...)` と期間条件でまとめて取得する。
- UI component 内で重い集計を行わない。
- 集計ロジックは `src/lib/manager-staff-analysis.ts` の pure domain builder に寄せる。
- 期間 bucket は API response 側で正規化する。
- 初期表示は担当エリア全体、今月、前期間比ありを default とする。
- 大量 staff の場合は client table の表示件数を制限し、必要なら pagination または top N を検討する。

---

## 12. Implementation Plan

Create:

- `src/types/manager-staff-analysis.ts`
- `src/lib/manager-staff-analysis.ts`
- `src/hooks/useManagerStaffAnalysis.ts`
- `src/app/api/manager/staff-analysis/route.ts`
- `src/components/staff-analysis/manager-staff-analysis.tsx`
- `src/app/(app)/staff-analysis/page.tsx`
- `src/__tests__/lib/manager-staff-analysis.test.ts`
- `src/__tests__/api/manager-staff-analysis-route.test.ts`
- `src/__tests__/components/staff-analysis/manager-staff-analysis.test.tsx`

Update:

- `src/lib/navigation/items.ts`

Optional update:

- shared period helper if patient / revenue analysis already has duplicated period parsing logic.

Do not update:

- Supabase migrations
- RLS policies
- manager assignment schema
- existing user permission write APIs

---

## 13. TDD Plan

Add failing tests first.

API tests:

- unauthenticated request returns `401`.
- non-manager request returns `403`.
- manager with no active assignments returns empty response.
- manager `target=total` only aggregates assigned clinics.
- manager `target=clinic` with assigned clinic returns data.
- manager `target=clinic` with unassigned clinic returns `403`.
- manager does not fallback to `permissions.clinic_id`.
- manager does not use JWT `clinic_scope_ids`.

Domain tests:

- summary totals are calculated correctly.
- average unit price handles zero denominator.
- cancellation rate handles zero denominator.
- previous period change rate handles previous zero as `null`.
- attention items are generated for high cancellation rate.
- attention items are generated for reservation drop.
- attention items are generated for revenue drop.
- attention sort order is severity, clinicName, staffName, type.
- bucket selection follows 31/180 day rule.

Component tests:

- title and description render.
- assigned clinics appear in filter.
- total view renders summary KPI and clinic comparison.
- clinic view renders selected clinic staff rows.
- no assigned clinics shows empty state.
- no data for selected period shows no-data state.
- write actions are not rendered.

Navigation tests:

- manager menu includes `スタッフ分析`.
- non-manager menus are unchanged unless already expected.

Verification:

```powershell
npm run test -- --runInBand --runTestsByPath src\__tests__\api\manager-staff-analysis-route.test.ts src\__tests__\lib\manager-staff-analysis.test.ts src\__tests__\components\staff-analysis\manager-staff-analysis.test.tsx src\__tests__\lib\navigation-items.test.ts
npm run type-check
npm run lint
git diff --check
```

---

## 14. Open Questions

実装前に確認する。

1. スタッフ別 attribution は予約担当者、施術担当者、日報作成者のどれを正とするか。
2. 売上は会計確定ベース、予約ベース、日報推定ベースのどれを v0.1 の正本にするか。
3. 院をまたいで勤務するスタッフがいる場合、所属院表示をどう扱うか。
4. 日報未提出をスタッフ別に出すための staff linkage が既存 schema で十分か。
5. `/staff-analysis` という route 名でよいか。既存のスタッフ管理と混同する場合は `/manager/staff-analysis` も検討する。

---

## 15. Acceptance Criteria

- manager が `スタッフ分析` 画面を開ける。
- manager は担当エリア全体のスタッフ分析を見られる。
- manager は各院ごとのスタッフ分析を見られる。
- manager は担当外 clinic_id の分析を取得できない。
- manager の実効 scope は active `manager_clinic_assignments` のみ。
- 画面に write action が表示されない。
- 担当院0件の空状態が表示される。
- 期間指定、院選択、全体/院別切り替えができる。
- API / domain / component / navigation の targeted tests がある。
- `npm run type-check`、`npm run lint`、対象 test、`git diff --check` が通る。
