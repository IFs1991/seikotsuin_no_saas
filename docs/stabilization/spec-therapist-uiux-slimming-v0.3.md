# Therapist UI/UX Slimming Spec v0.3

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-therapist-uiux-slimming-v0.3.md`
- Canonical target repository: `IFs1991/seikotsuin_no_saas`
- Referenced / legacy repository name: `IFs1991/seikotsuin_management_saas`
- Feature: therapist（施術者）ロール向けの導線スリム化
- Primary goal:
  - therapist はログイン直後に予約管理へ遷移する
  - therapist には経営・分析系メニューを表示しない
  - desktop / mobile / header home 導線で体験を揃える

---

## 0. Why v0.3

v0.2 の方向性は正しいが、実コードとズレているパス・id・href があった。

v0.3 では、実リポジトリ上の現コードに合わせて以下を修正する。

- `mobile-bottom-nav.tsx` の実パス
- `header.tsx` の実パス
- `app-shell.tsx` の実パス
- quick access の実 id / href
- mobile nav の実 id
- `MobileAwarePage` と `AppShell` の role 受け渡しの違い
- `/patients/[id]` が therapist で既に成立している前提への格下げ

---

## 1. Current Facts from Repository

### 1.1 Repository name

GitHub API 上の canonical repository name は以下。

```text
IFs1991/seikotsuin_no_saas
```

ただし、会話・既存仕様上は以下の名前も参照されている。

```text
IFs1991/seikotsuin_management_saas
```

実装者は clone 済みローカルの実ディレクトリ名に合わせること。仕様上は canonical name として `IFs1991/seikotsuin_no_saas` を使う。

---

### 1.2 Relevant files

| concern | actual file |
|---|---|
| desktop navigation / quick access | `src/lib/navigation/items.ts` |
| mobile bottom nav | `src/components/navigation/mobile-bottom-nav.tsx` |
| header home navigation | `src/components/navigation/header.tsx` |
| app shell role wiring | `src/app/(app)/app-shell.tsx` |
| login redirect | `src/app/(public)/login/actions.ts` |
| patient detail page | `src/app/(app)/patients/[id]/page.tsx` |
| customer API | `src/app/api/customers/route.ts` |
| role helpers | `src/lib/constants/roles.ts` |

---

### 1.3 Desktop operation menu

`OPERATION_MENU_ITEMS` currently includes:

| id | label | href | therapist policy |
|---|---|---|---|
| `dashboard` | ダッシュボード | `/dashboard` | hide |
| `daily-reports` | 日報管理 | `/daily-reports` | show |
| `reservations` | 予約管理 | `/reservations` | show / home |
| `patients` | 患者分析 | `/patients` | hide |
| `revenue` | 収益分析 | `/revenue` | hide |
| `staff` | スタッフ分析 | `/staff` | hide |
| `shift-requests` | 希望シフト | `/staff/shift-requests` | show |
| `ai-insights` | AI分析 | `/ai-insights` | hide |

Important:

- `daily-reports` appears before `reservations` in the current array.
- Therefore, therapist menu must not be built with filter-only logic.
- therapist menu order must be explicitly defined as:
  1. `reservations`
  2. `daily-reports`
  3. `shift-requests`

---

### 1.4 Quick access

Actual `QUICK_ACCESS_ITEMS` are:

| id | label | href | therapist policy |
|---|---|---|---|
| `quick-daily-input` | 日報入力 | `/daily-reports/input` | show |
| `quick-reservation` | 新規予約 | `/reservations?view=register` | show |
| `quick-patient` | 患者検索 | `/patients` | hide |
| `quick-revenue` | 収益レポート | `/revenue` | hide |

Important:

- Do not use `new-reservation`.
- Do not use `daily-report-input`.
- Do not use `/reservations/new`.
- Do not use `/daily-reports/new`.

Those ids / hrefs do not match the current code and would produce a broken or empty therapist quick access list.

---

### 1.5 Mobile bottom nav

Actual `BASE_ITEMS` in `src/components/navigation/mobile-bottom-nav.tsx` are:

| id | label | href | therapist policy |
|---|---|---|---|
| `dashboard` | ホーム | `/dashboard` | hide |
| `reports` | 日報 | `/daily-reports` | show |
| `reservations` | 予約 | `/reservations` | show |
| `patients` | 患者 | `/patients` | hide |
| `revenue` | 収益 | `/revenue` | hide |
| `ai` | AI | `/ai-insights` | hide |

Important:

- mobile nav uses `reports`, not `daily-reports`.
- mobile nav does not currently have a shift request item.
- therapist mobile nav requires a new item for shift requests.

Therapist mobile nav should be explicitly defined:

```ts
const THERAPIST_MOBILE_ITEMS: readonly MobileNavigationItem[] = [
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

---

### 1.6 Mobile role wiring

`MobileBottomNav` itself accepts `role`.

`AppShell` already passes:

```tsx
<MobileBottomNav
  isAdmin={canAccessAdminNavigation}
  profileLoading={profileLoading}
  role={profileRole}
/>
```

So the main app shell path is likely safe.

However, `MobileAwarePage` currently renders:

```tsx
<MobileBottomNav isAdmin={isAdmin} />
```

This means `role` defaults to `null` when `MobileAwarePage` is used.

Implementation must handle one of the following:

1. Update `MobileAwarePage` to accept and pass `role`, or
2. Verify `MobileAwarePage` is not used for authenticated therapist pages, and document that finding.

Do not ignore this. A therapist-specific branch inside `MobileBottomNav` will not fire if the caller passes no role.

---

### 1.7 Header home navigation

`src/components/navigation/header.tsx` currently has:

```ts
const handleNavigateHome = useCallback(() => {
  closeMenus();
  router.push('/');
}, [closeMenus, router]);
```

Therefore, the issue is not `/dashboard` hardcoding in Header.

The actual issue is:

- Header pushes `/`
- The behavior of `/` for authenticated therapist must be confirmed
- If `/` routes or renders dashboard-like content for authenticated users, therapist can escape the intended `/reservations` home flow

v0.3 policy:

- Add role-aware home resolver to Header.
- therapist home target must be `/reservations`.
- non-therapist behavior should remain unchanged unless root behavior is explicitly refactored.

Suggested implementation:

```ts
import { isTherapistRole } from '@/lib/constants/roles';

const homeHref = isTherapistRole(profileRole) ? '/reservations' : '/';

const handleNavigateHome = useCallback(() => {
  closeMenus();
  router.push(homeHref);
}, [closeMenus, router, homeHref]);
```

---

### 1.8 Patient detail route

`/patients/[id]` already blocks manager only.

therapist is not blocked by the page-level role check.

Patient detail fetches customer data through:

```text
/api/customers?clinic_id=${clinicId}&id=${patientId}
```

`/api/customers` uses `processApiRequest` with:

```ts
requireClinicMatch: true
```

and then queries by both `clinic_id` and `id`.

Therefore:

- appointment detail → patient detail is already expected to work for same-clinic therapist
- this is no longer an open risk
- keep a regression test, but do not frame this as likely guard work

---

## 2. Summary

therapist ロールに専用の operation menu / quick access / mobile nav / header home href を割り当てる。

Expected therapist UX:

| surface | therapist behavior |
|---|---|
| login redirect | `/reservations` |
| desktop side nav | `予約管理 / 日報管理 / 希望シフト` |
| quick access | `新規予約 / 日報入力` |
| mobile bottom nav | `予約 / 日報 / シフト` |
| header logo / home | `/reservations` |
| patient detail | 予約詳細経由で same-clinic patient を表示 |
| authorization | DB/RLS/API 権限は現状維持 |

---

## 3. Scope

### 3.1 In scope

1. Add `isTherapistRole()` helper
2. Add therapist desktop operation menu
3. Add therapist quick access items
4. Update `getOperationMenuItemsForRole()`
5. Update `getVisibleNavigationItems()`
6. Update `getQuickAccessItemsForRole()`
7. Change therapist login redirect to `/reservations`
8. Add therapist branch to `getMobileNavigationItems()`
9. Add therapist mobile nav item for shift requests
10. Make Header home navigation therapist-aware
11. Verify or update `MobileAwarePage` role passing
12. Add regression tests

### 3.2 Out of scope

- DB schema changes
- RLS changes
- reservation write permission changes
- therapist authorization shrink
- clinic_admin UX optimization
- shared-PC admin password gate
- staff role slimming
- manager route policy changes

---

## 4. Role Policy

therapist is a lightweight field role in UI.

However, this spec does not remove existing write permissions.

Specifically:

- therapist can still create / edit reservations if existing permissions allow it
- therapist can still read same-clinic patient details through reservation context
- therapist should not see top-level business analytics surfaces

This is a UX routing/navigation change, not an authorization downgrade.

---

## 5. Design

### 5.1 Add `isTherapistRole()`

File:

```text
src/lib/constants/roles.ts
```

Implementation:

```ts
export function isTherapistRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'therapist';
}
```

---

### 5.2 Add therapist desktop menu

File:

```text
src/lib/navigation/items.ts
```

Expected ids:

```ts
['reservations', 'daily-reports', 'shift-requests']
```

Do not use filter-only logic because current source order is wrong for therapist.

Suggested helper:

```ts
function pickNavigationItemsById(
  items: readonly NavigationItem[],
  ids: readonly string[]
): readonly NavigationItem[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return ids
    .map(id => byId.get(id))
    .filter((item): item is NavigationItem => Boolean(item));
}
```

Implementation:

```ts
const THERAPIST_OPERATION_MENU_ITEM_IDS = [
  'reservations',
  'daily-reports',
  'shift-requests',
] as const;

const THERAPIST_OPERATION_MENU_ITEMS = pickNavigationItemsById(
  OPERATION_MENU_ITEMS,
  THERAPIST_OPERATION_MENU_ITEM_IDS
);
```

---

### 5.3 Update operation menu resolver

File:

```text
src/lib/navigation/items.ts
```

Expected:

```ts
export function getOperationMenuItemsForRole(
  role: string | null | undefined
): readonly NavigationItem[] {
  const aiInsightsEnabled = isAiInsightsEnabled();
  const aiFlag = aiInsightsEnabled ? 'enabled' : 'disabled';

  if (isTherapistRole(role)) {
    return THERAPIST_OPERATION_MENU_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag]
    : OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag];
}
```

Note:

- `aiFlag` is not needed for therapist because therapist never receives AI insights.
- It can remain above for minimal diff.

---

### 5.4 Update visible navigation resolver

File:

```text
src/lib/navigation/items.ts
```

Inside `!showAdminMenus` branch:

```ts
if (!showAdminMenus) {
  if (isTherapistRole(role)) {
    return THERAPIST_OPERATION_MENU_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag]
    : OPERATION_MENU_ITEMS_BY_AI_FLAG[aiFlag];
}
```

No change for admin / clinic_admin / manager / staff.

---

### 5.5 Update quick access

File:

```text
src/lib/navigation/items.ts
```

Actual therapist quick access ids:

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
const THERAPIST_QUICK_ACCESS_ITEM_IDS = [
  'quick-reservation',
  'quick-daily-input',
] as const;

const THERAPIST_QUICK_ACCESS_ITEMS = pickNavigationItemsById(
  QUICK_ACCESS_ITEMS,
  THERAPIST_QUICK_ACCESS_ITEM_IDS
);
```

Resolver:

```ts
export function getQuickAccessItemsForRole(
  role: string | null | undefined
): readonly NavigationItem[] {
  if (isTherapistRole(role)) {
    return THERAPIST_QUICK_ACCESS_ITEMS;
  }

  return isAreaManagerRole(role)
    ? AREA_MANAGER_QUICK_ACCESS_ITEMS
    : QUICK_ACCESS_ITEMS;
}
```

---

### 5.6 Login redirect

File:

```text
src/app/(public)/login/actions.ts
```

Current policy:

- HQ admin → `/admin`
- area manager → `/manager`
- no clinic → `/onboarding`
- default → `/dashboard`

New policy:

- HQ admin → unchanged
- area manager → unchanged
- no clinic → unchanged
- therapist → `/reservations`
- default → unchanged

Therapist branch should be inserted before final default redirect.

---

### 5.7 Mobile bottom nav

File:

```text
src/components/navigation/mobile-bottom-nav.tsx
```

Add import:

```ts
import { isTherapistRole } from '@/lib/constants/roles';
```

Add constant:

```ts
const THERAPIST_MOBILE_ITEMS: readonly MobileNavigationItem[] = [
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

Update `getMobileNavigationItems()` after `aiInsightsEnabled` and before admin branches:

```ts
if (isTherapistRole(navigationMode.role)) {
  return THERAPIST_MOBILE_ITEMS;
}
```

Recommended position:

```ts
const aiInsightsEnabled = isAiInsightsEnabled();

if (isTherapistRole(navigationMode.role)) {
  return THERAPIST_MOBILE_ITEMS;
}

if (navigationMode.isHqAdmin) {
  return ADMIN_ONLY_ITEMS;
}
```

Reason:

- therapist should never receive AI item
- therapist does not use admin navigation
- therapist branch should be explicit and early

---

### 5.8 MobileAwarePage

File:

```text
src/components/navigation/mobile-bottom-nav.tsx
```

Current:

```tsx
export function MobileAwarePage({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <div className={cn('min-h-screen', 'md:pb-0 pb-20')}>
      {children}
      <MobileBottomNav isAdmin={isAdmin} />
    </div>
  );
}
```

Risk:

- `role` is not passed
- therapist branch will not fire if this wrapper is used

Required action:

Option A: Update component signature.

```tsx
export function MobileAwarePage({
  children,
  isAdmin = false,
  profileLoading = false,
  role = null,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  profileLoading?: boolean;
  role?: string | null;
}) {
  return (
    <div className={cn('min-h-screen', 'md:pb-0 pb-20')}>
      {children}
      <MobileBottomNav
        isAdmin={isAdmin}
        profileLoading={profileLoading}
        role={role}
      />
    </div>
  );
}
```

Option B: Search all usages of `MobileAwarePage`.

- If unused, leave it but add a test or comment
- If used in authenticated app pages, update call sites to pass `role`

Do not leave this unverified.

---

### 5.9 Header home href

File:

```text
src/components/navigation/header.tsx
```

Current:

```ts
router.push('/');
```

New:

```ts
const homeHref = isTherapistRole(profileRole) ? '/reservations' : '/';

const handleNavigateHome = useCallback(() => {
  closeMenus();
  router.push(homeHref);
}, [closeMenus, router, homeHref]);
```

Add import:

```ts
import { isTherapistRole } from '@/lib/constants/roles';
```

Keep non-therapist behavior unchanged.

---

### 5.10 Patient detail

No route guard change is expected.

Keep regression tests only.

Expected same-clinic therapist flow:

```text
/reservations
  → AppointmentDetail
    → /patients/[id]
      → /api/customers?clinic_id={therapistClinicId}&id={customerId}
      → 200
```

Expected cross-clinic behavior:

```text
/api/customers?clinic_id={otherClinicId}&id={customerId}
→ rejected by clinic scope guard / RLS
```

---

## 6. Tests

### 6.1 Navigation tests

1. `getOperationMenuItemsForRole('therapist')` returns exactly:

```ts
['reservations', 'daily-reports', 'shift-requests']
```

2. It excludes:

```ts
['dashboard', 'patients', 'revenue', 'staff', 'ai-insights']
```

3. AI flag ON still excludes `ai-insights`.

4. `reservations` subItems are preserved:

```ts
['reservation-timeline', 'reservation-register', 'reservation-list']
```

5. `daily-reports` subItems are preserved:

```ts
['daily-input', 'daily-list']
```

6. `getVisibleNavigationItems(...)` returns therapist menu in non-admin operation mode.

7. admin / clinic_admin / manager / staff regression unchanged.

---

### 6.2 Quick access tests

1. `getQuickAccessItemsForRole('therapist')` returns exactly:

```ts
['quick-reservation', 'quick-daily-input']
```

2. It excludes:

```ts
['quick-patient', 'quick-revenue']
```

3. hrefs are:

```ts
[
  '/reservations?view=register',
  '/daily-reports/input',
]
```

4. manager / clinic_admin / staff regression unchanged.

---

### 6.3 Login redirect tests

1. therapist successful login redirects to:

```ts
'/reservations'
```

2. clinic_admin remains:

```ts
'/dashboard'
```

3. staff remains:

```ts
'/dashboard'
```

4. manager remains:

```ts
'/manager'
```

5. HQ admin remains:

```ts
'/admin'
```

6. no clinic remains:

```ts
'/onboarding'
```

---

### 6.4 Mobile bottom nav tests

1. therapist mobile nav returns exactly:

```ts
['reservations', 'reports', 'shift-requests']
```

2. therapist mobile nav excludes:

```ts
['dashboard', 'patients', 'revenue', 'ai', 'admin']
```

3. AI flag ON still excludes `ai`.

4. `shift-requests` is newly present with href:

```ts
'/staff/shift-requests'
```

5. admin / clinic_admin / manager / staff regression unchanged.

6. If `MobileAwarePage` is used, verify therapist role is passed or prove the component is unused.

---

### 6.5 Header tests

1. therapist header home pushes:

```ts
'/reservations'
```

2. non-therapist header home still pushes:

```ts
'/'
```

3. closeMenus behavior remains intact.

---

### 6.6 Patient detail tests

1. therapist can open same-clinic patient detail from appointment detail.

2. manager remains blocked on `/patients/[id]`.

3. therapist cannot read cross-clinic customer data.

---

## 7. Acceptance Criteria

### UX

- therapist login lands on `/reservations`
- therapist desktop nav shows only:
  - `reservations`
  - `daily-reports`
  - `shift-requests`
- therapist quick access shows only:
  - `quick-reservation`
  - `quick-daily-input`
- therapist mobile nav shows only:
  - `reservations`
  - `reports`
  - `shift-requests`
- therapist header home navigates to `/reservations`
- therapist can still open same-clinic patient detail from appointment detail
- therapist does not see top-level patient search / revenue / staff / AI analytics

### Security

- No DB schema changes
- No RLS changes unless a regression test reveals a real bug
- No therapist write permission removal
- UI hiding is not treated as authorization

### Regression

Unchanged behavior for:

- admin
- clinic_admin
- manager
- staff

---

## 8. Implementation Order

1. Add `isTherapistRole()`
2. Add `pickNavigationItemsById()`
3. Add `THERAPIST_OPERATION_MENU_ITEMS`
4. Add `THERAPIST_QUICK_ACCESS_ITEMS`
5. Update operation / visible / quick access resolvers
6. Add login redirect branch
7. Add `THERAPIST_MOBILE_ITEMS`
8. Update `getMobileNavigationItems()`
9. Verify/update `MobileAwarePage`
10. Update Header home resolver
11. Add tests
12. Run lint / typecheck / tests

---

## 9. Rollback

Rollback is code-only.

Revert:

- `isTherapistRole()`
- therapist menu constants
- therapist resolver branches
- therapist login redirect
- therapist mobile nav branch
- Header home resolver
- MobileAwarePage role wiring if changed
- tests

No migration rollback required.

---

## 10. Codex Implementation Prompt

```md
You are working in the repository currently known by GitHub as `IFs1991/seikotsuin_no_saas`.
The project may also be referenced as `IFs1991/seikotsuin_management_saas`.

Implement:
`docs/stabilization/spec-therapist-uiux-slimming-v0.3.md`

Goal:
- therapist users should land on `/reservations` after login.
- therapist desktop navigation should show only:
  1. `reservations`
  2. `daily-reports`
  3. `shift-requests`
- therapist quick access should show only:
  1. `quick-reservation` -> `/reservations?view=register`
  2. `quick-daily-input` -> `/daily-reports/input`
- therapist mobile bottom nav should show only:
  1. `reservations` -> `/reservations`
  2. `reports` -> `/daily-reports`
  3. `shift-requests` -> `/staff/shift-requests`
- therapist Header home/logo navigation should push `/reservations`.
- Do not change DB schema, RLS, or reservation write permissions.
- Do not change behavior for admin, clinic_admin, manager, or staff.

Actual files:
- `src/lib/constants/roles.ts`
- `src/lib/navigation/items.ts`
- `src/app/(public)/login/actions.ts`
- `src/components/navigation/mobile-bottom-nav.tsx`
- `src/components/navigation/header.tsx`
- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/patients/[id]/page.tsx`
- `src/app/api/customers/route.ts`

Important implementation constraints:
- Add `isTherapistRole()` using `normalizeRole(role) === 'therapist'`.
- Do not build therapist desktop menu with filter-only logic; current source order is wrong.
- AI insights must never appear for therapist, even when `NEXT_PUBLIC_ENABLE_AI_INSIGHTS=true`.
- Use actual quick access ids:
  - `quick-reservation`
  - `quick-daily-input`
- Use actual quick access hrefs:
  - `/reservations?view=register`
  - `/daily-reports/input`
- Use actual mobile daily report id:
  - `reports`
- Add a new therapist mobile item:
  - `shift-requests` -> `/staff/shift-requests`
- Verify `MobileAwarePage` usage. It currently does not pass role into `MobileBottomNav`.
- Header currently pushes `/`; make it therapist-aware without changing non-therapist behavior.
- `/patients/[id]` already allows therapist and blocks manager. Do not add unnecessary guard work unless tests prove a real issue.

Suggested tests:
1. `getOperationMenuItemsForRole('therapist')` returns exactly:
   `['reservations', 'daily-reports', 'shift-requests']`
2. It excludes:
   `dashboard`, `patients`, `revenue`, `staff`, `ai-insights`
3. AI flag ON still excludes `ai-insights`
4. reservation subItems are preserved:
   `reservation-timeline`, `reservation-register`, `reservation-list`
5. daily report subItems are preserved:
   `daily-input`, `daily-list`
6. `getQuickAccessItemsForRole('therapist')` returns exactly:
   `['quick-reservation', 'quick-daily-input']`
7. quick access hrefs are:
   `/reservations?view=register`, `/daily-reports/input`
8. therapist login redirects to `/reservations`
9. clinic_admin / staff / manager / admin redirects are unchanged
10. therapist mobile nav returns exactly:
    `['reservations', 'reports', 'shift-requests']`
11. therapist mobile nav excludes:
    `dashboard`, `patients`, `revenue`, `ai`, `admin`
12. therapist Header home pushes `/reservations`
13. non-therapist Header home still pushes `/`
14. therapist can open same-clinic patient detail from appointment detail
15. manager remains blocked on `/patients/[id]`
16. therapist cannot read cross-clinic customer data

Keep the change small and role-scoped.
```

---

## 11. Final Decision

v0.2 の方針は維持する。

ただし、実装に流す仕様は v0.3 とする。

Reason:

- mobile / header まで含める判断は正しい
- しかし v0.2 の path / id / href の誤りは実装バグに直結する
- patient detail は既に成立しているため、guard 調整リスクとして扱わない
- `MobileAwarePage` の role 未渡しだけは実装時の確認対象として残す

Proceed with v0.3.
