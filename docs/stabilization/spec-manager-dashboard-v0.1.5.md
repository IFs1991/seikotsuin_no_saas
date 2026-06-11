# Manager Dashboard Spec v0.1.5 — Codex Ready

- Status: ready for implementation
- Date: 2026-06-12
- Target file: `docs/stabilization/spec-manager-dashboard-v0.1.5.md`
- Source: `docs/stabilization/spec-manager-dashboard-v0.1.md`
- Target repository: `IFs1991/seikotsuin_no_saas`
- Feature: manager 専用 `/dashboard`

---

## 1. Summary

Manager 向けに、担当院全体の今日の状態を一画面で把握できる `/dashboard` を実装する。

既存の単院 `/dashboard` は `profile.clinicId` を前提にした `clinic_admin` / `staff` / `therapist` 向け画面であり、所属拠点が任意になった `manager` には合わない。manager の `/dashboard` は「分析の詳細画面」ではなく、担当院の状況、要確認事項、主要画面への導線をまとめる **日常業務の入口** として実装する。

manager の実効 clinic scope は、active `manager_clinic_assignments` のみに限定する。

以下は manager のアクセス権として扱わない。

- `permissions.clinic_id`
- `profiles.clinic_id`
- JWT `clinic_scope_ids`
- クライアント側の clinic 選択状態
- URL query の `clinic_id`

---

## 2. Core Decision

### 2.1 新規 API を追加する

manager dashboard は新規 API を追加する。

```txt
GET /api/manager/dashboard
```

既存の `/api/admin/dashboard` は流用しない。

理由:

- `/api/admin/dashboard` は管理ホーム寄りで、日常確認の入口として弱い。
- 既存 admin dashboard は `clinic_scope_ids` / `permissions.clinic_id` 系の scope 解決に寄っている可能性がある。
- 今回の manager scope 要件は `manager_clinic_assignments` のみであり、既存 admin dashboard と責務が違う。
- manager dashboard は JST 当日の担当院横断集計が中心で、既存 admin dashboard の集計粒度と異なる。

### 2.2 既存 `AdminDashboard` を manager dashboard に使わない

`src/app/(app)/dashboard/page.tsx` の manager branch は、既存 `AdminDashboard` ではなく新規 `ManagerDashboard` を表示する。

### 2.3 既存 `useDashboard` を manager で使わない

`useDashboard` は単院 dashboard 専用として維持する。

manager dashboard は新規 `useManagerDashboard` を使う。

---

## 3. Goals

- manager が `/dashboard` を開いたとき、担当院横断の manager 専用 dashboard を表示する。
- manager の `profile.clinicId = null` でも dashboard が壊れないようにする。
- 担当院数、本日の売上、来院数、予約数、日報提出状況、要確認件数をまとめて確認できるようにする。
- 日報未提出、レビュー待ち、予約低下、売上低下、キャンセル増加など、今日確認すべき院を見つけやすくする。
- 担当院別に、今日の主要 KPI と状態をカード形式で表示する。
- 日報管理、予約タイムライン、患者分析、収益分析、店舗比較分析、スタッフ管理へすぐ移動できる導線を置く。
- manager 画面は read-only とし、write action は表示しない。
- 非 manager の既存 `/dashboard` 挙動は維持する。
- 集計ロジックは React component に置かず、domain builder に集約する。
- manager dashboard の API / domain / component / page / navigation regression test を整備する。

---

## 4. Non-Goals

- 新しい DB table や Supabase migration は追加しない。
- RLS、manager assignment、role guard の仕様は変更しない。
- `supabase db push`、`supabase migration up`、`supabase db reset` は実行しない。
- AI コメント生成、需要予測、異常検知モデルは実装しない。
- 会計確定、請求確定、入金管理、未収金管理は含めない。
- manager から日報、予約、患者、売上を編集できるようにしない。
- `clinic_admin` / `staff` / `therapist` 向けの単院 `/dashboard` を作り直さない。
- `/admin` の管理ホームを削除しない。
- dashboard から担当院割当を変更できるようにしない。

---

## 5. Current State

Relevant files:

```txt
src/app/(app)/dashboard/page.tsx
src/components/dashboard/admin-dashboard.tsx
src/hooks/useDashboard.ts
src/lib/navigation/items.ts
src/app/api/dashboard/route.ts
src/app/api/admin/dashboard/route.ts
src/app/api/manager/daily-reports/overview/route.ts
src/app/api/manager/patients/analysis/route.ts
src/app/api/manager/revenue/analysis/route.ts
src/lib/auth/manager-scope.ts
src/app/api/clinics/accessible/route.ts
src/app/api/reservations/route.ts
src/types/supabase.ts
```

Current behavior:

- `/dashboard` は単院 dashboard を基本にしている。
- 単院 dashboard は `profile.clinicId` を前提にしている。
- manager は所属拠点が任意のため、`profile.clinicId = null` の場合がある。
- 暫定対応として manager の `/dashboard` に既存 `AdminDashboard` の area-manager variant を表示できるが、内容は管理ホーム寄りであり、日常確認画面として弱い。
- manager 向けにはすでに日報一覧、予約タイムライン、患者分析、収益分析が存在する。
- 新 dashboard は既存詳細画面を置き換えず、入口として集約する。

---

## 6. Route and Access

### 6.1 Page Route

```txt
GET /dashboard
```

Role behavior:

| Role | Behavior |
|---|---|
| `manager` | manager 専用 dashboard を表示する |
| `clinic_admin` | 既存の単院 dashboard を表示する |
| `therapist` | 既存の単院 dashboard を表示する |
| `staff` | 既存の単院 dashboard を表示する |
| `admin` | 既存 navigation 方針を維持。基本は `/admin` 管理ホームを使う。今回の主対象外 |
| `customer` | 既存の認可方針を維持 |

### 6.2 API Route

```txt
GET /api/manager/dashboard
```

Allowed:

- `manager`

Denied:

- `admin`
- `clinic_admin`
- `therapist`
- `staff`
- `customer`
- unauthenticated user

### 6.3 Auth Pattern

API は既存の `processApiRequest` を使う。

```ts
processApiRequest(request, {
  allowedRoles: ['manager'],
  requireClinicMatch: false,
})
```

必要なら `normalizeRole(authResult.permissions.role) === 'manager'` の明示確認を追加してよい。

### 6.4 Manager Scope

manager の担当院は必ず以下で解決する。

```ts
const assignments = await resolveManagerAssignedClinics(adminClient, authResult.auth.id)
const clinicIds = assignments.map((assignment) => assignment.clinic_id)
```

`clinicIds` に含まれる clinic だけを対象にする。

禁止:

```ts
permissions.clinic_id
profiles.clinic_id
permissions.clinic_scope_ids
jwt.clinic_scope_ids
request.nextUrl.searchParams.get('clinic_id')
client selected clinic id
```

service role / admin client を使う場合も、必ず active manager assignment で対象 clinic ids を絞ってから読む。

### 6.5 Empty State

担当院が 0 件の場合、API は 200 を返す。

UI は以下を表示する。

```txt
担当院がまだ設定されていません。
管理者にマネージャー管理から担当店舗の設定を依頼してください。
```

---

## 7. Data Sources

新規 DB migration は追加しない。既存 API / RPC / table / view を再利用する。

### 7.1 Primary Data

| Data | Source |
|---|---|
| 担当院リスト | `resolveManagerAssignedClinics()` |
| 日報 | `daily_reports` |
| 日報明細 / review signal | `daily_report_items` |
| 予約 | `reservation_list_view` |
| 患者分析詳細画面 | existing `/api/manager/patients/analysis` |
| 収益分析詳細画面 | existing `/api/manager/revenue/analysis` |
| 日報概要詳細画面 | existing `/api/manager/daily-reports/overview` |

### 7.2 Do Not Fetch N Times From Client

manager dashboard の予約集計で、フロントから `/api/reservations?clinic_id=...` を担当院数分叩かない。

予約集計は `/api/manager/dashboard` 内で `reservation_list_view` を `clinic_id in assignedClinicIds` でまとめて取得する。

理由:

- N+1 fetch になる。
- scope enforcement が分散する。
- 日付境界とキャンセル判定が UI に漏れる。
- エラー処理が複雑になる。

---

## 8. Date Rules

### 8.1 Timezone

v0.1.5 の dashboard は JST 当日を対象にする。

```ts
timezone: 'Asia/Tokyo'
```

UTC の `new Date().toISOString().slice(0, 10)` を JST 日付として使わない。

### 8.2 Required Date Keys

API response には以下を含める。

```ts
date: {
  today: string;
  previousDay: string;
  previousWeekday: string;
  timezone: 'Asia/Tokyo';
}
```

### 8.3 Comparison Rules

| KPI | Comparison |
|---|---|
| 売上 | 前日比 |
| 予約 | 前週同曜日比 |
| 日報 | 当日提出状況 |
| キャンセル | 当日予約関連ステータスからキャンセル率 |

### 8.4 Period Selector

期間選択は入れない。

期間分析は以下の既存詳細画面に任せる。

- `/patients`
- `/revenue`
- `/multi-store`

---

## 9. Response Shape

Create `src/types/manager-dashboard.ts` if useful.

```ts
export type ManagerDashboardAttentionType =
  | 'missing_daily_report'
  | 'needs_review'
  | 'low_revenue'
  | 'low_reservations'
  | 'high_cancellations';

export type ManagerDashboardSeverity = 'info' | 'warning' | 'critical';

export type ManagerDashboardDailyReportStatus =
  | 'submitted'
  | 'missing'
  | 'needs_review';

export type ManagerDashboardTimelineType =
  | 'daily_report_submitted'
  | 'daily_report_missing'
  | 'needs_review'
  | 'low_revenue'
  | 'low_reservations'
  | 'high_cancellations';

export type ManagerDashboardResponse = {
  generatedAt: string;
  date: {
    today: string;
    previousDay: string;
    previousWeekday: string;
    timezone: 'Asia/Tokyo';
  };
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
    lowRevenueClinicCount: number;
    lowReservationClinicCount: number;
    highCancellationClinicCount: number;
  };
  attentionItems: Array<{
    id: string;
    clinicId: string;
    clinicName: string;
    type: ManagerDashboardAttentionType;
    severity: ManagerDashboardSeverity;
    title: string;
    description: string;
    href: string;
  }>;
  clinicCards: Array<{
    clinicId: string;
    clinicName: string;
    todayRevenue: number;
    previousDayRevenue: number;
    todayVisitCount: number;
    todayReservationCount: number;
    previousWeekdayReservationCount: number;
    todayCancellationCount: number;
    dailyReportStatus: ManagerDashboardDailyReportStatus;
    revenueChangeRateFromPreviousDay: number | null;
    reservationChangeRateFromPreviousWeekday: number | null;
    cancellationRate: number | null;
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
    type: ManagerDashboardTimelineType;
    label: string;
    detail: string;
    href: string;
  }>;
};
```

---

## 10. Aggregation Rules

### 10.1 Assigned Clinics

Use only:

```ts
resolveManagerAssignedClinics(adminClient, managerUserId)
```

Expected clinic object shape should be normalized to:

```ts
{
  id: string;
  name: string;
}
```

### 10.2 Daily Reports

Fetch assigned clinics only.

Required date range:

- `today`
- `previousDay`

Fields:

```txt
id
clinic_id
report_date
total_patients
total_revenue
insurance_revenue
private_revenue
updated_at
```

Do not strongly depend on `daily_reports.status`.

Reason:

- SQL schema may contain `daily_reports.status`.
- Generated Supabase types may not include `daily_reports.status`.
- Depending on it can create TypeScript errors or stale type drift.

Status logic:

| Condition | dailyReportStatus |
|---|---|
| no today report | `missing` |
| today report exists and review signal exists | `needs_review` |
| today report exists and no review signal | `submitted` |

### 10.3 Review Signal

Use `daily_report_items.estimate_status` or existing review-related source already present in the repository.

Preferred statuses:

```txt
needs_review
draft
rejected
blocked
```

If exact statuses differ, inspect existing tests/routes and use statuses already used in the repository.

Do not add migration.

### 10.4 Reservations

Use `reservation_list_view` inside `/api/manager/dashboard`.

Fetch assigned clinics only.

Date filters:

- today JST range
- previousWeekday JST range

Count logic:

| Count | Rule |
|---|---|
| todayReservationCount | exclude `cancelled`, `no_show` |
| previousWeekdayReservationCount | exclude `cancelled`, `no_show` |
| todayCancellationCount | include `cancelled`, `no_show` |
| unknown/null status | do not count as cancellation |

### 10.5 Rate Calculation

Use pure helper.

```ts
function calculateChangeRate(current: number, base: number): number | null {
  if (base === 0) return null;
  return (current - base) / base;
}
```

Examples:

| Current | Base | Result |
|---:|---:|---:|
| 70 | 100 | `-0.3` |
| 50 | 100 | `-0.5` |
| 120 | 100 | `0.2` |
| 0 | 0 | `null` |

### 10.6 Cancellation Rate

```ts
const denominator = todayReservationCount + todayCancellationCount;
const cancellationRate = denominator > 0 ? todayCancellationCount / denominator : null;
```

---

## 11. Attention Rules

Generate deterministic attention only.

Do not implement AI judgement.

### 11.1 `missing_daily_report`

Condition:

- JST 当日分の日報が存在しない。

Severity:

```txt
critical
```

Link:

```txt
/daily-reports?clinic_id=<clinicId>
```

### 11.2 `needs_review`

Condition:

- `daily_report_items.estimate_status` or equivalent review signal indicates review is needed.

Severity:

```txt
warning
```

Link:

```txt
/daily-reports?clinic_id=<clinicId>
```

### 11.3 `low_revenue`

Condition:

- previous day revenue > 0
- today revenue <= previous day revenue * 0.7

Severity:

| Drop | Severity |
|---:|---|
| >= 50% | `critical` |
| >= 30% | `warning` |

Link:

```txt
/revenue?clinic_id=<clinicId>
```

### 11.4 `low_reservations`

Condition:

- previous weekday reservation count > 0
- today reservation count <= previous weekday reservation count * 0.7

Severity:

| Drop | Severity |
|---:|---|
| >= 50% | `critical` |
| >= 30% | `warning` |

Link:

```txt
/reservations?view=timeline&clinic_id=<clinicId>
```

### 11.5 `high_cancellations`

Condition:

- `todayReservationCount + todayCancellationCount >= 3`
- `cancellationRate >= 0.25`

Severity:

| Cancellation Rate | Severity |
|---:|---|
| >= 0.4 | `critical` |
| >= 0.25 | `warning` |

Link:

```txt
/reservations?view=timeline&clinic_id=<clinicId>
```

### 11.6 Attention Sort

Sort attention items by:

1. `critical`
2. `warning`
3. `info`
4. `clinicName` ascending
5. `type` ascending

---

## 12. Timeline Rules

v0.1.5 timeline is generated from deterministic events.

Sources:

- submitted daily report
- missing daily report
- review signal
- low revenue attention
- low reservation attention
- high cancellation attention

Timeline event types:

```txt
daily_report_submitted
daily_report_missing
needs_review
low_revenue
low_reservations
high_cancellations
```

Sort:

1. `occurredAt` descending
2. severity derived order if same timestamp
3. clinic name ascending

When exact event time is unavailable:

- Use `generatedAt` for alert-like events.
- Use `daily_reports.updated_at` for submitted daily report events.

---

## 13. UI Requirements

Create:

```txt
src/components/dashboard/manager-dashboard.tsx
```

### 13.1 Layout Order

Render in this order:

1. Header
2. Summary KPI
3. 今日の要確認
4. 担当院別カード
5. タイムライン
6. ショートカット

### 13.2 Header

Title:

```txt
担当エリアダッシュボード
```

Description:

```txt
担当院の今日の状況と確認すべき項目をまとめています。
```

Show:

- 最終更新時刻
- 再読み込みボタン

### 13.3 Summary KPI

Show:

- 担当院数
- 本日売上
- 本日来院数
- 本日予約数
- 日報提出状況
- 要確認件数
- キャンセル注意

### 13.4 今日の要確認

- severity 順に表示する。
- Empty state を用意する。
- 各 item は該当詳細画面へ遷移できる。

Empty text:

```txt
現時点で緊急の確認事項はありません。
```

### 13.5 担当院別カード

Each card shows:

- 院名
- 本日売上
- 前日比
- 本日来院数
- 本日予約数
- 前週同曜日比
- キャンセル率
- 日報ステータス chip
- Links:
  - 日報を見る
  - 予約を見る
  - 患者分析
  - 収益分析

Do not nest cards inside cards.

### 13.6 Timeline

Show:

- time or date label
- clinic name
- event label
- detail
- link

Empty text:

```txt
本日のタイムラインに表示できるイベントはまだありません。
```

### 13.7 Shortcuts

| Label | Href |
|---|---|
| 日報管理 | `/daily-reports` |
| 予約タイムライン | `/reservations?view=timeline` |
| 患者分析 | `/patients` |
| 収益分析 | `/revenue` |
| 店舗比較分析 | `/multi-store` |
| スタッフ管理 | `/admin/users` |

### 13.8 Forbidden UI Actions

Do not show:

- 日報入力
- 新規予約
- 患者作成
- 患者編集
- 売上編集
- 担当院割当
- 店舗追加
- スタッフ招待 mutation action

### 13.9 Visual Direction

- SaaS 管理画面として、落ち着いた業務向け UI にする。
- 大きな hero やマーケティング風の装飾は使わない。
- カードは情報単位で使い、カードの中にさらにカードを入れない。
- mobile では KPI を 2 列または 1 列に折り返す。
- desktop では KPI を 3〜6列で表示する。
- 長い院名や文言がボタン・chip からはみ出さないようにする。
- 主要 action は button、詳細遷移は link または icon + text button にする。
- lucide-react icons を使える箇所では使う。
- 既存 UI component がある場合は優先利用する。

---

## 14. Hook Requirements

Create:

```txt
src/hooks/useManagerDashboard.ts
```

Responsibilities:

- Fetch `/api/manager/dashboard`
- expose loading state
- expose error state
- expose refetch function
- do not accept `clinicId`
- do not call `useDashboard`

Suggested shape:

```ts
export function useManagerDashboard() {
  // fetch manager dashboard response
}
```

Follow existing project conventions for hooks and data fetching.

---

## 15. Domain Builder Requirements

Create:

```txt
src/lib/manager-dashboard.ts
```

Put all aggregation and shaping here.

Responsibilities:

- JST date helpers
- number normalization
- rate calculation
- cancellation rate calculation
- daily report status calculation
- attention generation
- attention sorting
- clinic card link generation
- timeline generation
- response builder

React components should not contain raw Supabase response shaping or business-rule branching beyond display-level branching.

Export pure functions for tests.

Suggested exports:

```ts
export function getManagerDashboardDateKeys(now?: Date): ManagerDashboardDate;
export function calculateChangeRate(current: number, base: number): number | null;
export function calculateCancellationRate(active: number, cancelled: number): number | null;
export function buildClinicLinks(clinicId: string): ManagerDashboardClinicCard['links'];
export function buildManagerDashboardResponse(input: BuildManagerDashboardInput): ManagerDashboardResponse;
export function generateAttentionItems(input: GenerateAttentionInput): ManagerDashboardResponse['attentionItems'];
export function sortAttentionItems(items: ManagerDashboardResponse['attentionItems']): ManagerDashboardResponse['attentionItems'];
export function generateTimeline(input: GenerateTimelineInput): ManagerDashboardResponse['timeline'];
```

---

## 16. Files to Create / Modify

### 16.1 Create

```txt
src/app/api/manager/dashboard/route.ts
src/lib/manager-dashboard.ts
src/hooks/useManagerDashboard.ts
src/components/dashboard/manager-dashboard.tsx
src/types/manager-dashboard.ts
src/__tests__/api/manager-dashboard-route.test.ts
src/__tests__/lib/manager-dashboard.test.ts
src/__tests__/components/dashboard/manager-dashboard.test.tsx
```

`src/types/manager-dashboard.ts` is optional if existing project convention prefers colocated types.

### 16.2 Modify

```txt
src/app/(app)/dashboard/page.tsx
src/__tests__/pages/dashboard.test.tsx
src/__tests__/lib/navigation-items.test.ts
```

Do not remove `/admin` management home.

---

## 17. Page Implementation Requirement

In:

```txt
src/app/(app)/dashboard/page.tsx
```

Change manager branch from `AdminDashboard` to `ManagerDashboard`.

Expected logic:

```tsx
if (role === 'manager') {
  return <ManagerDashboard />;
}

return <ClinicDashboard />;
```

Actual code should follow existing role normalization conventions.

Non-manager behavior must remain unchanged.

---

## 18. API Implementation Outline

Create:

```txt
src/app/api/manager/dashboard/route.ts
```

Pseudo flow:

```ts
export async function GET(request: NextRequest) {
  return processApiRequest(request, {
    allowedRoles: ['manager'],
    requireClinicMatch: false,
    handler: async ({ authResult, supabaseAdmin }) => {
      const managerUserId = authResult.auth.id;

      const assignments = await resolveManagerAssignedClinics(
        supabaseAdmin,
        managerUserId,
      );

      const clinics = normalizeAssignedClinics(assignments);
      const clinicIds = clinics.map((clinic) => clinic.id);

      if (clinicIds.length === 0) {
        return NextResponse.json(
          buildManagerDashboardResponse({
            generatedAt: new Date().toISOString(),
            clinics: [],
            dailyReports: [],
            dailyReportItems: [],
            reservations: [],
            now: new Date(),
          }),
        );
      }

      const dateKeys = getManagerDashboardDateKeys(new Date());

      const [dailyReports, reviewSignals, reservations] = await Promise.all([
        fetchDailyReportsForDashboard(supabaseAdmin, clinicIds, dateKeys),
        fetchReviewSignalsForDashboard(supabaseAdmin, clinicIds, dateKeys),
        fetchReservationsForDashboard(supabaseAdmin, clinicIds, dateKeys),
      ]);

      const response = buildManagerDashboardResponse({
        generatedAt: new Date().toISOString(),
        date: dateKeys,
        clinics,
        dailyReports,
        reviewSignals,
        reservations,
      });

      return NextResponse.json(response);
    },
  });
}
```

Exact helper names may differ. Keep the same architectural boundary.

---

## 19. Testing Requirements

### 19.1 API Tests

Create:

```txt
src/__tests__/api/manager-dashboard-route.test.ts
```

Cover:

- manager can access.
- non-manager gets 403.
- unauthenticated user gets unauthorized response according to existing API convention.
- active manager assignments only are aggregated.
- inactive assignments are ignored.
- inactive clinics are ignored if `resolveManagerAssignedClinics()` already filters them.
- no fallback to `permissions.clinic_id`.
- no fallback to JWT `clinic_scope_ids`.
- assigned clinic 0 returns empty dashboard response.
- missing daily report creates critical attention.
- review signal creates warning attention.
- low revenue creates warning / critical attention.
- low reservations creates warning / critical attention.
- high cancellations creates warning / critical attention.
- GET only; no mutation behavior is added.

### 19.2 Domain Tests

Create:

```txt
src/__tests__/lib/manager-dashboard.test.ts
```

Cover:

- JST today calculation.
- previous day calculation.
- previous weekday calculation.
- rate calculation when base is 0 returns null.
- revenue drop threshold.
- reservation drop threshold.
- cancellation rate threshold.
- severity sort.
- clinic card link generation.
- daily report status logic.
- summary aggregation.
- timeline generation.

### 19.3 Component Tests

Create:

```txt
src/__tests__/components/dashboard/manager-dashboard.test.tsx
```

Cover:

- title `担当エリアダッシュボード` appears.
- description appears.
- empty state appears when clinics = [].
- KPI cards render formatted yen and counts.
- attention items sorted by severity.
- forbidden write actions are absent:
  - `日報入力`
  - `新規予約`
  - `患者作成`
  - `売上編集`
  - `担当院割当`
- clinic card links point to expected URLs.
- reload button calls refetch or reload handler.
- long clinic names do not break test snapshots if snapshots are used.

### 19.4 Page Tests

Update:

```txt
src/__tests__/pages/dashboard.test.tsx
```

Cover:

- manager shows `担当エリアダッシュボード`.
- manager with `clinicId = null` does not show `クリニック情報が見つかりません`.
- non-manager still shows existing clinic dashboard behavior.

### 19.5 Navigation Regression Tests

Update or preserve:

```txt
src/__tests__/lib/navigation-items.test.ts
```

Cover:

- manager dashboard href remains `/dashboard`.
- manager reservation submenu only shows timeline.
- manager daily report submenu does not show daily report input.

---

## 20. Verification Commands

Run after implementation.

```bash
npm run test -- --runInBand --runTestsByPath \
  src/__tests__/pages/dashboard.test.tsx \
  src/__tests__/components/dashboard/manager-dashboard.test.tsx \
  src/__tests__/api/manager-dashboard-route.test.ts \
  src/__tests__/lib/manager-dashboard.test.ts \
  src/__tests__/lib/navigation-items.test.ts

npm run type-check
npm run lint
git diff --check
```

If test paths differ in the current repo, inspect existing test file locations and adapt paths without reducing coverage.

---

## 21. Acceptance Criteria

- `/dashboard` for manager renders manager-specific dashboard.
- `/dashboard` for `clinic_admin` / `staff` / `therapist` is unchanged.
- manager with `profile.clinicId = null` still works.
- assigned clinic 0 shows empty state.
- manager dashboard aggregates only active `manager_clinic_assignments`.
- no fallback to profile / permissions / JWT clinic scope.
- no write actions appear.
- reservation aggregation does not call `/api/reservations` N times from client.
- JST date logic is covered by tests.
- attention rules are deterministic and tested.
- all data shaping is outside React components.
- tests pass.
- type-check passes.
- lint passes.
- `git diff --check` passes.

---

## 22. Rollout Notes

- Supabase migration is not required.
- Do not run database migration commands.
- Do not change existing manager assignment production data.
- Keep existing `/admin` management home.
- Deploy behind existing auth/role guard.
- This feature is read-only, so rollout risk is mostly data visibility / scope correctness.

---

## 23. Risk Register

| Risk Type | Severity | Risk | Mitigation |
|---|---:|---|---|
| Technical | High | Existing admin dashboard scope is accidentally reused | Create dedicated `/api/manager/dashboard`; forbid `/api/admin/dashboard` reuse |
| Security | High | Manager sees clinics outside active assignment | Use only `resolveManagerAssignedClinics()`; test no fallback |
| Data | Medium | `daily_reports.status` type/schema drift | Do not strongly depend on it; use report existence + review signal |
| Performance | Medium | Client performs N+1 reservation fetches | Aggregate in server API |
| UX | Medium | Dashboard becomes too analytic and duplicates detail pages | Keep as daily entrance; detailed analysis stays in `/patients`, `/revenue`, `/multi-store` |
| Ops | Medium | `needs_review` semantics are unclear | Define review signal source explicitly |
| Date | Medium | UTC/JST boundary creates wrong “today” | Dedicated JST helper and tests |

---

## 24. Codex Implementation Prompt

Use this prompt when assigning to Codex.

```md
Implement `Manager Dashboard Spec v0.1.5` in `IFs1991/seikotsuin_no_saas`.

Read `docs/stabilization/spec-manager-dashboard-v0.1.5.md` carefully and implement it end-to-end.

Hard constraints:

- Do not add Supabase migrations.
- Do not run `supabase db push`, `supabase migration up`, or `supabase db reset`.
- Do not reuse `/api/admin/dashboard` or `AdminDashboard` for manager dashboard.
- Manager clinic scope must come only from active `manager_clinic_assignments` via `resolveManagerAssignedClinics()`.
- Do not fallback to `permissions.clinic_id`, `profiles.clinic_id`, JWT `clinic_scope_ids`, URL `clinic_id`, or client-side selected clinic.
- Manager dashboard is read-only.
- Do not show write actions.
- Do not call `/api/reservations` once per clinic from the client.
- Use JST date logic for today / previous day / previous weekday.
- Keep non-manager `/dashboard` behavior unchanged.

Create / modify the files listed in the spec.

After implementation, run:

```bash
npm run test -- --runInBand --runTestsByPath \
  src/__tests__/pages/dashboard.test.tsx \
  src/__tests__/components/dashboard/manager-dashboard.test.tsx \
  src/__tests__/api/manager-dashboard-route.test.ts \
  src/__tests__/lib/manager-dashboard.test.ts \
  src/__tests__/lib/navigation-items.test.ts

npm run type-check
npm run lint
git diff --check
```

If paths differ, adapt to the repository's existing test layout while preserving coverage.
```

---

## 25. Open Questions for v0.2

- manager dashboard に期間切り替えを入れるか。
- 店舗別目標値を導入して、売上低下ではなく目標未達を表示するか。
- Slack / メール通知など、要確認事項の通知連携を行うか。
- キャンセル率以外に無断キャンセル率を別 KPI として出すか。
- AI コメント生成を追加するか。
- 店舗ごとの目標 / 予算 / 人員配置と dashboard を接続するか。
- `needs_review` を日報レビュー専用概念として DB schema に正式追加するか。
```
