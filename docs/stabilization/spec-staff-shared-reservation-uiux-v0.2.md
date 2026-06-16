# Staff Shared Reservation UI/UX Spec v0.2

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-staff-shared-reservation-uiux-v0.2.md`
- Canonical target repository: `IFs1991/seikotsuin_no_saas`
- Related spec: `docs/stabilization/spec-therapist-uiux-slimming-v0.3.md`
- Feature: staff ロールの現場導線スリム化と予約管理UI/UX共通化
- Primary goal:
  - staff はログイン直後に予約管理へ遷移する
  - staff は therapist / clinic_admin と同じ予約管理画面を使う
  - staff 専用の予約管理UIを作らない
  - staff には dashboard / patient analytics / revenue analytics / staff analytics / AI insights / admin settings を表示しない
  - staff には therapist と同じ現場メニューとして `予約管理 / 日報管理 / 希望シフト` を表示する
  - role 差分は画面 fork ではなく navigation / capability / permission で制御する

---

## 0. Decision

staff は therapist と同じ「現場ロール群」として扱う。

したがって、staff の operation menu は therapist と揃える。

```text
staff:
1. 予約管理
2. 日報管理
3. 希望シフト
```

ただし、staff に経営・分析・管理系の導線は表示しない。

表示しないもの:

```text
dashboard
patient analytics
revenue analytics
staff analytics
AI insights
admin settings
```

予約管理画面は clinic_admin / therapist / staff で共通化する。

重要なのは、現場全員が同じ予約表・同じ情報構造・同じ画面レイアウトを見ていること。

---

## 1. Compatibility with Therapist UI/UX Slimming v0.3

`spec-therapist-uiux-slimming-v0.3.md` treats staff as out of scope and expects staff behavior to remain unchanged.

This staff spec intentionally changes that expectation.

In therapist v0.3, staff login may have been expected to remain:

```text
staff login -> /dashboard
```

After this spec, the new expected staff behavior is:

```text
staff login -> /reservations
```

Therefore, any old regression test asserting the following must be updated or removed:

```ts
staff login -> '/dashboard'
```

Replace with:

```ts
staff login -> '/reservations'
```

This spec does not conflict with therapist v0.3's therapist behavior.
It extends the same field-role navigation philosophy to staff.

---

## 2. Product Principle

### 2.1 Field role consistency

staff and therapist are both field roles.

Therefore, both should receive the same field-role navigation set:

```text
reservations
daily-reports
shift-requests
```

This keeps daily operations consistent across the clinic floor.

### 2.2 Shared operational surface

予約管理は全ロール共通の operational surface とする。

対象ロール:

- `clinic_admin`
- `therapist`
- `staff`

共通化するもの:

- 予約カレンダー
- 予約タイムライン
- 予約一覧
- 新規予約
- 予約詳細
- 予約編集
- 予約キャンセル
- 患者名
- 担当者
- メニュー
- 時間枠
- 予約メモ

分けるもの:

- サイドバー / bottom nav
- quick access
- home redirect
- 押せるボタン
- 表示する管理メニュー
- 分析画面への導線
- 管理設定への導線
- 日報・シフト内の操作権限

### 2.3 Do not fork reservation UI by role

予約管理画面を role ごとに fork しない。

禁止:

```tsx
if (role === 'staff') {
  return <StaffReservationPage />;
}

if (role === 'therapist') {
  return <TherapistReservationPage />;
}

return <AdminReservationPage />;
```

推奨:

```tsx
return (
  <ReservationManagementPage
    capabilities={reservationCapabilities}
  />
);
```

既存実装との整合を優先する場合:

```tsx
return <ReservationManagementPage role={profileRole} />;
```

ただし、長期的には `role` 直渡しではなく capability に変換する。

---

## 3. Non-goals

This spec does not change clinic_admin login redirect or clinic_admin home behavior.

clinic_admin may use the same `ReservationManagementPage` when navigating to `/reservations`,
but clinic_admin landing behavior remains unchanged unless another spec explicitly changes it.

This spec also does not grant new reservation write permissions to staff.

Reservation create / edit / cancel availability must follow existing permission and authorization rules.
The UI may hide analytics and admin surfaces, but authorization must remain enforced server-side.

---

## 4. Staff Role Definition

staff は therapist と同じ現場ロール群に属する。

staff の primary tasks:

- 予約表を見る
- 予約を作成する
- 予約を変更する
- 予約をキャンセルする
- 予約詳細を確認する
- 日報を入力・確認する
- 希望シフトを提出・確認する
- 必要に応じて患者情報を予約文脈で確認する
- 必要に応じて予約メモを確認・編集する

staff の非責務:

- 経営 dashboard を見る
- 患者分析を見る
- 収益分析を見る
- スタッフ分析を見る
- AI insights を見る
- 管理設定を触る
- staff 専用予約画面を使う
- staff 専用の来院/会計フローを持つ

---

## 5. UX Policy

### 5.1 Login destination

staff のログイン後 landing page は `/dashboard` ではなく `/reservations` とする。

```text
staff login
→ /reservations
```

理由:

- staff の primary task は dashboard 閲覧ではない
- 最初に開くべき画面は予約表
- therapist と staff の現場導線を揃える
- clinic_admin / therapist / staff が同じ予約表を見ることで現場説明が揃う

### 5.2 Header home behavior

staff が header logo / home を押した場合も `/reservations` へ戻す。

therapist も同様に `/reservations` へ戻す。

```ts
const homeHref = usesReservationAsHome(profileRole) ? '/reservations' : '/';
```

clinic_admin の home policy は既存仕様に合わせる。
このspecでは clinic_admin home を変更しない。

### 5.3 Desktop operation navigation

staff の desktop operation menu は therapist と同じ field-role menu とする。

```ts
const FIELD_ROLE_OPERATION_MENU_ITEM_IDS = [
  'reservations',
  'daily-reports',
  'shift-requests',
] as const;
```

対象:

```ts
staff
therapist
```

期待される表示順:

```text
1. 予約管理
2. 日報管理
3. 希望シフト
```

禁止:

- filter-only logic による順序依存
- source array の並びに依存した therapist/staff menu 生成
- staff 専用予約UIへの分岐

### 5.4 Quick access

staff quick access も therapist と揃える。

```ts
const FIELD_ROLE_QUICK_ACCESS_ITEM_IDS = [
  'quick-reservation',
  'quick-daily-input',
] as const;
```

Expected hrefs:

```ts
[
  '/reservations?view=register',
  '/daily-reports/input',
]
```

表示:

```text
新規予約
日報入力
```

非表示:

```text
患者検索
収益レポート
AI insights
```

Note:

- `/patients` が患者分析として実装されている場合、staff quick access に出さない
- 患者検索が必要なら、予約作成/編集フロー内の検索として扱う
- top-level patient analytics は出さない

### 5.5 Mobile bottom navigation

staff mobile bottom nav も therapist と揃える。

```ts
const FIELD_ROLE_MOBILE_ITEMS: readonly MobileNavigationItem[] = [
  {
    id: 'reservations',
    label: '予約',
    href: '/reservations',
    icon: Calendar,
  },
  {
    id: 'reports',
    label: '日報',
    href: '/daily-reports',
    icon: FileText,
  },
  {
    id: 'shift-requests',
    label: 'シフト',
    href: '/staff/shift-requests',
    icon: Users,
  },
];
```

staff mobile nav には AI / dashboard / revenue / patients を出さない。

---

## 6. Navigation Visibility Matrix

| surface | clinic_admin | therapist | staff |
|---|---:|---:|---:|
| `/reservations` | show | show | show |
| reservation UI layout | shared | shared | shared |
| dashboard | show/unchanged | hide | hide |
| daily-reports | show/unchanged | show | show |
| shift-requests | show/unchanged | show | show |
| patient analytics | show/unchanged | hide | hide |
| revenue analytics | show/unchanged | hide | hide |
| staff analytics | show/unchanged | hide | hide |
| AI insights | show/flag | hide | hide |
| admin settings | show | hide | hide |

Important:

- staff は therapist と同じ現場メニューを使う
- staff と therapist の予約管理画面は共通
- clinic_admin も `/reservations` では同じ予約管理画面を使う
- clinic_admin の landing / home behavior はこのspecでは変更しない

---

## 7. Reservation Management UI Policy

### 7.1 Shared component

予約管理画面は単一の共通コンポーネントを使う。

Expected component grouping:

```text
ReservationManagementPage
├─ ReservationCalendar
├─ ReservationTimeline
├─ ReservationList
├─ ReservationDetail
├─ ReservationForm
└─ ReservationMemo
```

role ごとの専用 component を作らない。

禁止:

```text
StaffReservationManagementPage
TherapistReservationManagementPage
ClinicAdminReservationManagementPage
```

許可:

```text
ReservationManagementPage
ReservationManagementPageShell
ReservationCalendar
ReservationDetail
ReservationForm
```

### 7.2 Shared layout

以下は role で変えない。

- カレンダーの基本レイアウト
- タイムラインの並び
- 予約カードの基本構造
- 予約詳細 drawer / modal の基本構造
- 予約作成フォームの基本構造
- 予約編集フォームの基本構造

### 7.3 Capability-based control

role 差分は UI fork ではなく capability で扱う。

Suggested type:

```ts
type ReservationCapabilities = {
  canViewReservations: boolean;
  canCreateReservation: boolean;
  canEditReservation: boolean;
  canCancelReservation: boolean;
  canChangeAssignee: boolean;
  canViewPatientDetailFromReservation: boolean;
  canViewPatientAnalytics: boolean;
  canViewRevenueAnalytics: boolean;
  canViewStaffAnalytics: boolean;
  canViewDashboard: boolean;
  canAccessAdminSettings: boolean;
};
```

staff default concept:

```ts
const STAFF_RESERVATION_CAPABILITIES: ReservationCapabilities = {
  canViewReservations: true,

  // Do not grant new permissions here.
  // These must come from existing permission / authorization logic.
  canCreateReservation: existingPermission.canCreateReservation,
  canEditReservation: existingPermission.canEditReservation,
  canCancelReservation: existingPermission.canCancelReservation,
  canChangeAssignee: existingPermission.canChangeAssignee,
  canViewPatientDetailFromReservation:
    existingPermission.canViewPatientDetailFromReservation,

  // Analytics/admin surfaces are always hidden for staff.
  canViewPatientAnalytics: false,
  canViewRevenueAnalytics: false,
  canViewStaffAnalytics: false,
  canViewDashboard: false,
  canAccessAdminSettings: false,
};
```

This spec must not introduce new server-side permission grants.

---

## 8. Check-in / Accounting Policy

### 8.1 No staff-specific check-in or accounting flow

staff には check-in 専用導線や会計専用導線を作らない。

禁止:

- staff menu に `チェックイン` を出す
- staff menu に `来院ステータス` を出す
- staff menu に `会計ステータス` を出す
- staff 専用 check-in page を作る
- staff 専用 accounting page を作る

### 8.2 Shared reservation page must not be polluted

予約管理画面は共通なので、check-in / accounting の議論で staff 専用UIを足さない。

もし既存の共通 `ReservationManagementPage` に check-in 相当の操作が存在する場合:

- 画面レイアウトは共通のまま
- staff では existing permission / capability により非表示または disabled
- therapist / clinic_admin で必要なら既存挙動を維持
- このspecで新規追加しない

Suggested capability extension if needed:

```ts
type ReservationCapabilities = {
  canCheckInAppointment: boolean;
  canMarkAppointmentPaid: boolean;
};
```

staff default:

```ts
canCheckInAppointment: false;
canMarkAppointmentPaid: false;
```

---

## 9. Daily Report Policy

staff には `daily-reports` を表示する。

理由:

- 日報は分析ではなく現場入力/確認の業務導線である
- therapist と staff の現場導線を揃える
- 日報を消すと現場オペレーションが分断される

ただし、staff に収益分析・KPI分析としての日報導線は見せない。

許可:

```text
日報管理
日報入力
日報確認
```

禁止:

```text
収益分析
KPI分析
全院比較
スタッフ評価分析
AI経営インサイト
```

日報内の詳細操作権限は existing permission / authorization に従う。

---

## 10. Shift Request Policy

staff には `shift-requests` を表示する。

理由:

- 希望シフトは本人業務であり、分析/管理機能ではない
- staff も勤務希望の提出・確認が必要
- therapist と staff の現場導線を揃える

許可:

```text
希望シフト
シフト確認
希望休提出
```

禁止:

```text
スタッフ分析
人件費分析
全スタッフ評価
管理者向けシフト承認画面
```

シフト承認など manager / clinic_admin 向け操作は existing permission / authorization に従う。

---

## 11. Actual Files

Expected affected files:

```text
src/lib/constants/roles.ts
src/lib/navigation/items.ts
src/app/(public)/login/actions.ts
src/components/navigation/mobile-bottom-nav.tsx
src/components/navigation/header.tsx
src/app/(app)/app-shell.tsx
src/app/(app)/reservations/page.tsx
```

Related existing files from therapist UI/UX slimming work:

```text
src/app/(app)/patients/[id]/page.tsx
src/app/api/customers/route.ts
```

Do not touch patient detail / customer API unless tests reveal real regression.

---

## 12. Implementation Design

### 12.1 Add `isStaffRole()`

File:

```text
src/lib/constants/roles.ts
```

Implementation:

```ts
export function isStaffRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'staff';
}
```

### 12.2 Add or reuse `isTherapistRole()`

If not already present from therapist v0.3:

```ts
export function isTherapistRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'therapist';
}
```

### 12.3 Add `isFieldRole()`

Recommended:

```ts
export function isFieldRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);

  return normalizedRole === 'staff' || normalizedRole === 'therapist';
}
```

### 12.4 Add `usesReservationAsHome()`

Recommended:

```ts
export function usesReservationAsHome(
  role: string | null | undefined
): boolean {
  return isFieldRole(role);
}
```

Do not include clinic_admin in this helper in this spec.

### 12.5 Add field-role operation menu

File:

```text
src/lib/navigation/items.ts
```

Expected ids:

```ts
['reservations', 'daily-reports', 'shift-requests']
```

Implementation:

```ts
const FIELD_ROLE_OPERATION_MENU_ITEM_IDS = [
  'reservations',
  'daily-reports',
  'shift-requests',
] as const;

const FIELD_ROLE_OPERATION_MENU_ITEMS = pickNavigationItemsById(
  OPERATION_MENU_ITEMS,
  FIELD_ROLE_OPERATION_MENU_ITEM_IDS
);
```

If `THERAPIST_OPERATION_MENU_ITEMS` already exists from v0.3, replace or alias it:

```ts
const THERAPIST_OPERATION_MENU_ITEMS = FIELD_ROLE_OPERATION_MENU_ITEMS;
const STAFF_OPERATION_MENU_ITEMS = FIELD_ROLE_OPERATION_MENU_ITEMS;
```

Preferred resolver:

```ts
export function getOperationMenuItemsForRole(
  role: string | null | undefined
): readonly NavigationItem[] {
  const aiInsightsEnabled = isAiInsightsEnabled();
  const aiFlag = aiInsightsEnabled ? 'enabled' : 'disabled';

  if (isFieldRole(role)) {
    return FIELD_ROLE_OPERATION_MENU_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag]
    : OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag];
}
```

### 12.6 Update visible navigation resolver

Inside `!showAdminMenus` branch:

```ts
if (!showAdminMenus) {
  if (isFieldRole(role)) {
    return FIELD_ROLE_OPERATION_MENU_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag]
    : OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag];
}
```

### 12.7 Add field-role quick access

Expected ids:

```ts
['quick-reservation', 'quick-daily-input']
```

Expected hrefs:

```ts
[
  '/reservations?view=register',
  '/daily-reports/input',
]
```

Implementation:

```ts
const FIELD_ROLE_QUICK_ACCESS_ITEM_IDS = [
  'quick-reservation',
  'quick-daily-input',
] as const;

const FIELD_ROLE_QUICK_ACCESS_ITEMS = pickNavigationItemsById(
  QUICK_ACCESS_ITEMS,
  FIELD_ROLE_QUICK_ACCESS_ITEM_IDS
);
```

Resolver:

```ts
export function getQuickAccessItemsForRole(
  role: string | null | undefined
): readonly NavigationItem[] {
  if (isFieldRole(role)) {
    return FIELD_ROLE_QUICK_ACCESS_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_QUICK_ACCESS_ITEMS
    : QUICK_ACCESS_ITEMS;
}
```

### 12.8 Update login redirect

File:

```text
src/app/(public)/login/actions.ts
```

New policy:

- HQ admin -> unchanged
- area manager -> unchanged
- no clinic -> unchanged
- staff -> `/reservations`
- therapist -> `/reservations`
- clinic_admin -> unchanged
- default -> unchanged

Suggested:

```ts
if (usesReservationAsHome(profileRole)) {
  redirect('/reservations');
}
```

Insert this before final default redirect.

### 12.9 Update mobile bottom nav

File:

```text
src/components/navigation/mobile-bottom-nav.tsx
```

Add or reuse field-role constant:

```ts
const FIELD_ROLE_MOBILE_ITEMS: readonly MobileNavigationItem[] = [
  {
    id: 'reservations',
    label: '予約',
    href: '/reservations',
    icon: Calendar,
  },
  {
    id: 'reports',
    label: '日報',
    href: '/daily-reports',
    icon: FileText,
  },
  {
    id: 'shift-requests',
    label: 'シフト',
    href: '/staff/shift-requests',
    icon: Users,
  },
];
```

Resolver position:

```ts
const aiInsightsEnabled = isAiInsightsEnabled();

if (isFieldRole(navigationMode.role)) {
  return FIELD_ROLE_MOBILE_ITEMS;
}

if (navigationMode.isHqAdmin) {
  return ADMIN_ONLY_ITEMS;
}
```

Place field-role branch before admin / AI / default branches.

Reason:

- staff should never receive AI item
- therapist should never receive AI item
- staff/therapist should not fall through to default dashboard nav

### 12.10 Verify MobileAwarePage role passing

If `MobileAwarePage` renders `MobileBottomNav` without `role`, staff/therapist branch will not fire.

Required:

- Search usages of `MobileAwarePage`
- If used in authenticated pages, pass `role`
- If unused, document as verified unused
- Do not ignore this

Expected shape:

```tsx
<MobileBottomNav
  isAdmin={isAdmin}
  profileLoading={profileLoading}
  role={role}
/>
```

### 12.11 Update Header home href

File:

```text
src/components/navigation/header.tsx
```

Suggested:

```ts
const homeHref = usesReservationAsHome(profileRole) ? '/reservations' : '/';

const handleNavigateHome = useCallback(() => {
  closeMenus();
  router.push(homeHref);
}, [closeMenus, router, homeHref]);
```

Non-staff / non-therapist behavior remains unchanged.

---

## 13. Acceptance Criteria

### 13.1 UX

- staff login lands on `/reservations`
- therapist login remains `/reservations`
- clinic_admin login remains unchanged
- staff header home/logo navigates to `/reservations`
- therapist header home/logo remains `/reservations`
- non-field-role header home remains unchanged
- staff desktop nav shows:
  - `reservations`
  - `daily-reports`
  - `shift-requests`
- staff quick access shows:
  - `quick-reservation`
  - `quick-daily-input`
- staff mobile nav shows:
  - `reservations`
  - `reports`
  - `shift-requests`
- staff does not see dashboard
- staff does not see patient analytics
- staff does not see revenue analytics
- staff does not see staff analytics
- staff does not see AI insights
- staff does not see admin settings
- staff uses the same reservation management UI as therapist and clinic_admin
- no staff-specific reservation page is created

### 13.2 Shared reservation UI

- `/reservations` uses the same core page/component for clinic_admin / therapist / staff
- role-based differences are handled by capabilities or existing permission checks
- common layout remains aligned across roles
- reservation card structure remains aligned across roles
- reservation form structure remains aligned across roles

### 13.3 Daily report / shift

- staff can see `daily-reports`
- staff can see `shift-requests`
- staff quick access can show daily input
- staff mobile bottom nav can show reports and shift
- staff does not receive manager/admin-only daily report analytics
- staff does not receive manager/admin-only shift approval/analytics unless existing permission already allows it

### 13.4 Check-in / accounting

- no staff check-in menu
- no staff accounting menu
- no staff visit status menu
- no staff-specific check-in page
- no staff-specific accounting page
- if check-in exists in shared reservation page, staff does not receive new check-in behavior from this spec

### 13.5 Security

- no DB schema changes
- no RLS changes
- no API authorization downgrade
- UI hiding is not treated as authorization
- direct route access remains governed by route guards / server authorization
- reservation write permissions remain governed by existing permission logic

### 13.6 Regression

Unchanged unless explicitly covered:

- admin
- clinic_admin
- manager
- existing therapist behavior
- existing reservation write permissions
- existing patient detail permissions

Changed intentionally:

- staff login redirect changes from old `/dashboard` expectation to `/reservations`
- staff navigation changes to field-role menu

---

## 14. Tests

### 14.1 Navigation tests

1. `getOperationMenuItemsForRole('staff')` returns exactly:

```ts
['reservations', 'daily-reports', 'shift-requests']
```

2. `getOperationMenuItemsForRole('therapist')` returns exactly:

```ts
['reservations', 'daily-reports', 'shift-requests']
```

3. staff excludes:

```ts
['dashboard', 'patients', 'revenue', 'staff', 'ai-insights']
```

4. therapist excludes:

```ts
['dashboard', 'patients', 'revenue', 'staff', 'ai-insights']
```

5. AI flag ON still excludes `ai-insights` for both staff and therapist.

6. `reservations` subItems are preserved:

```ts
['reservation-timeline', 'reservation-register', 'reservation-list']
```

7. `daily-reports` subItems are preserved:

```ts
['daily-input', 'daily-list']
```

8. `getVisibleNavigationItems(...)` returns field-role menu in non-admin operation mode.

9. admin / clinic_admin / manager regression unchanged.

### 14.2 Quick access tests

1. `getQuickAccessItemsForRole('staff')` returns exactly:

```ts
['quick-reservation', 'quick-daily-input']
```

2. `getQuickAccessItemsForRole('therapist')` returns exactly:

```ts
['quick-reservation', 'quick-daily-input']
```

3. It excludes:

```ts
['quick-patient', 'quick-revenue']
```

4. hrefs are:

```ts
[
  '/reservations?view=register',
  '/daily-reports/input',
]
```

### 14.3 Login redirect tests

1. staff successful login redirects to:

```ts
'/reservations'
```

2. therapist successful login redirects to:

```ts
'/reservations'
```

3. clinic_admin remains unchanged.

4. manager remains unchanged.

5. HQ admin remains unchanged.

6. no clinic remains unchanged.

7. Remove or update old assertion:

```ts
staff login -> '/dashboard'
```

### 14.4 Mobile bottom nav tests

1. staff mobile nav returns exactly:

```ts
['reservations', 'reports', 'shift-requests']
```

2. therapist mobile nav returns exactly:

```ts
['reservations', 'reports', 'shift-requests']
```

3. staff mobile nav excludes:

```ts
['dashboard', 'patients', 'revenue', 'ai', 'admin']
```

4. therapist mobile nav excludes:

```ts
['dashboard', 'patients', 'revenue', 'ai', 'admin']
```

5. AI flag ON still excludes `ai`.

6. `shift-requests` is present with href:

```ts
'/staff/shift-requests'
```

7. If `MobileAwarePage` is used, verify field role is passed or prove the component is unused.

### 14.5 Header tests

1. staff header home pushes:

```ts
'/reservations'
```

2. therapist header home pushes:

```ts
'/reservations'
```

3. non-field-role header home remains unchanged.

4. closeMenus behavior remains intact.

### 14.6 Shared reservation UI tests

1. staff and therapist render the same `ReservationManagementPage` component.

2. clinic_admin uses the same `ReservationManagementPage` when accessing `/reservations`.

3. staff does not render `StaffReservationManagementPage`.

4. therapist does not render `TherapistReservationManagementPage`.

5. staff can open reservation detail using the same UI pattern as therapist.

6. staff can create/edit/cancel reservation only according to existing permission/capability rules.

---

## 15. Implementation Order

1. Add `isStaffRole()`
2. Add or reuse `isTherapistRole()`
3. Add `isFieldRole()`
4. Add or reuse `usesReservationAsHome()`
5. Add `FIELD_ROLE_OPERATION_MENU_ITEMS`
6. Add `FIELD_ROLE_QUICK_ACCESS_ITEMS`
7. Update operation / visible / quick access resolvers
8. Add staff login redirect to `/reservations`
9. Ensure therapist login redirect remains `/reservations`
10. Add or reuse `FIELD_ROLE_MOBILE_ITEMS`
11. Update `getMobileNavigationItems()`
12. Verify/update `MobileAwarePage` role passing
13. Update Header home resolver
14. Verify `/reservations` is shared and not role-forked
15. Add tests
16. Run lint / typecheck / tests

---

## 16. Rollback

Rollback is code-only.

Revert:

- `isStaffRole()`
- `isFieldRole()`
- `usesReservationAsHome()` if added
- field-role menu constants
- field-role resolver branches
- staff login redirect
- field-role mobile nav branch
- Header home resolver
- MobileAwarePage role wiring if changed
- tests

No migration rollback required.

---

## 17. Codex Implementation Prompt

```md
You are working in the repository currently known by GitHub as `IFs1991/seikotsuin_no_saas`.
The project may also be referenced as `IFs1991/seikotsuin_management_saas`.

Implement:
`docs/stabilization/spec-staff-shared-reservation-uiux-v0.2.md`

Goal:
- staff users should land on `/reservations` after login.
- therapist users should continue to land on `/reservations`.
- staff and therapist should share the same field-role navigation:
  1. `reservations`
  2. `daily-reports`
  3. `shift-requests`
- staff and therapist quick access should show:
  1. `quick-reservation` -> `/reservations?view=register`
  2. `quick-daily-input` -> `/daily-reports/input`
- staff and therapist mobile bottom nav should show:
  1. `reservations` -> `/reservations`
  2. `reports` -> `/daily-reports`
  3. `shift-requests` -> `/staff/shift-requests`
- staff and therapist Header home/logo navigation should push `/reservations`.
- staff must use the same reservation management UI as therapist and clinic_admin.
- Do not create a staff-specific reservation page.
- Do not fork reservation UI by role.
- Do not add check-in, accounting, or visit status flows for staff.
- Do not change clinic_admin login redirect or clinic_admin home behavior.
- Do not change DB schema, RLS, or reservation write permissions.
- Do not treat UI hiding as authorization.

Important compatibility note:
- `spec-therapist-uiux-slimming-v0.3.md` treated staff as out of scope and may have expected staff login to remain `/dashboard`.
- This spec intentionally supersedes that staff regression expectation.
- Update any old test asserting `staff login -> /dashboard` to `staff login -> /reservations`.

Actual files likely involved:
- `src/lib/constants/roles.ts`
- `src/lib/navigation/items.ts`
- `src/app/(public)/login/actions.ts`
- `src/components/navigation/mobile-bottom-nav.tsx`
- `src/components/navigation/header.tsx`
- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/reservations/page.tsx`

Implementation constraints:
- Add `isStaffRole()` using `normalizeRole(role) === 'staff'`.
- Add or reuse `isTherapistRole()` using `normalizeRole(role) === 'therapist'`.
- Prefer `isFieldRole()` for staff + therapist.
- Prefer `usesReservationAsHome()` for staff + therapist.
- Do not include clinic_admin in `usesReservationAsHome()` in this spec.
- Do not build field-role desktop menu with filter-only logic; current source order may be wrong.
- AI insights must never appear for staff or therapist, even when `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=true`.
- Use actual quick access ids:
  - `quick-reservation`
  - `quick-daily-input`
- Use actual quick access hrefs:
  - `/reservations?view=register`
  - `/daily-reports/input`
- Use actual mobile daily report id:
  - `reports`
- Add/reuse mobile item:
  - `shift-requests` -> `/staff/shift-requests`
- Verify `MobileAwarePage` usage. If it does not pass role into `MobileBottomNav`, field-role mobile branch will not fire.
- Header currently may push `/`; make it field-role-aware without changing non-field-role behavior.
- Do not create `StaffReservationManagementPage`.
- Do not create `TherapistReservationManagementPage`.
- Reservation create/edit/cancel permissions must remain governed by existing permission logic.

Suggested tests:
1. `getOperationMenuItemsForRole('staff')` returns exactly:
   `['reservations', 'daily-reports', 'shift-requests']`
2. `getOperationMenuItemsForRole('therapist')` returns exactly:
   `['reservations', 'daily-reports', 'shift-requests']`
3. staff and therapist exclude:
   `dashboard`, `patients`, `revenue`, `staff`, `ai-insights`
4. AI flag ON still excludes `ai-insights`
5. reservation subItems are preserved:
   `reservation-timeline`, `reservation-register`, `reservation-list`
6. daily report subItems are preserved:
   `daily-input`, `daily-list`
7. `getQuickAccessItemsForRole('staff')` returns exactly:
   `['quick-reservation', 'quick-daily-input']`
8. `getQuickAccessItemsForRole('therapist')` returns exactly:
   `['quick-reservation', 'quick-daily-input']`
9. quick access hrefs are:
   `/reservations?view=register`, `/daily-reports/input`
10. staff login redirects to `/reservations`
11. therapist login redirects to `/reservations`
12. clinic_admin / manager / admin redirects are unchanged
13. staff mobile nav returns exactly:
    `['reservations', 'reports', 'shift-requests']`
14. therapist mobile nav returns exactly:
    `['reservations', 'reports', 'shift-requests']`
15. staff and therapist mobile nav excludes:
    `dashboard`, `patients`, `revenue`, `ai`, `admin`
16. staff Header home pushes `/reservations`
17. therapist Header home pushes `/reservations`
18. non-field-role Header home remains unchanged
19. staff and therapist use the same reservation management component
20. clinic_admin uses the same reservation management component when accessing `/reservations`
21. no staff-specific reservation page/component is created
22. direct access to hidden analytics routes remains governed by route guards / server authorization

Keep the change small, role-scoped, and compatible with existing therapist slimming spec.
```

---

## 18. Final Decision

Proceed with this policy:

```text
staff = therapist と同じ現場ロール群
staff menu = 予約管理 / 日報管理 / 希望シフト
staff home = /reservations
staff reservation UI = clinic_admin / therapist / staff と共通
staff 専用予約UIは作らない
staff から分析・dashboard・AI・管理設定を消す
staff に check-in / 会計 / 来院ステータス専用導線を足さない
差分は navigation / capability / permission で制御する
```

Reason:

- 現場ロールの導線を揃えた方が導入教育が軽い
- 予約表は全員同じ画面で見る必要がある
- 日報とシフトは分析ではなく現場業務
- staff から分析系を消すのは正しいが、日報とシフトまで消すのは削りすぎ
- therapist v0.3 の実ファイル・id・href 前提と接続できる
