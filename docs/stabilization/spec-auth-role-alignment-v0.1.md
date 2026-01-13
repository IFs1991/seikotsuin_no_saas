# Auth Role Alignment Spec v0.1



## Overview

- Purpose: Remove role-name drift and unify authorization sources for consistent access control.

- DoD: DOD-08, DOD-09 (docs/stabilization/DoD-v0.1.md).

- One task = one PR.

- Priority: **Critical**

- Risk: **Security violation - unauthorized access or denial of legitimate access**

- **Status: ? Phase 1 IMPLEMENTED** (2026-01-06), **? Phase 2 IMPLEMENTED** (2026-01-07 ~ 2026-01-09), **? Phase 3 IN PROGRESS** (2026-01-09 ~ 2026-01-10, DOD-08追加修正)



## Implementation Summary



### Phase 1 - Completed Items (2026-01-06)

| Item | Status | Notes |

|------|--------|-------|

| Create `src/lib/constants/roles.ts` | ? | Central role definitions with helper functions |

| Update `guards.ts` | ? | Uses `CROSS_CLINIC_ROLES` import |

| Update `middleware.ts` | ? | Uses `ADMIN_UI_ROLES` + `user_permissions` priority |

| Update `layout.tsx` | ? | Uses `ADMIN_UI_ROLES` + `getUserPermissions` |

| Update `mfa-setup/page.tsx` | ? | Uses `ADMIN_UI_ROLES` import |

| Update `settings/route.ts` | ? | Uses `CLINIC_ADMIN_ROLES` |

| Update `login/actions.ts` | ? | HQ role detection + onboarding redirect |

| Update `fixtures.mjs` | ? | `clinic_manager` ->`clinic_admin`, admin `clinic_id` ->`null` |

| Update `server.ts` | ? | `requireAdminAuth` uses `ADMIN_UI_ROLES` |

| Update `middleware-auth.test.ts` | ? | Tests aligned with new spec |

| Create `roles.test.ts` | ? | 40 unit tests for role definitions |



### Phase 2 - Completed Items (2026-01-07)

| Item | Status | Notes |

|------|--------|-------|

| **2.2 Server API role checks** | | |

| `api-helpers.ts` | ? | `verifyAdminAuth` uses `ADMIN_UI_ROLES` |

| `admin/dashboard/route.ts` | ? | `ADMIN_UI_ROLES` + `clinic_admin` check |

| `admin/master-data/route.ts` | ? | `ADMIN_UI_ROLES` (GET/POST/PUT/DELETE) |

| `admin/tables/route.ts` | ? | `ADMIN_UI_ROLES` (4 occurrences) |

| `admin/settings/route.ts` | ? | `STAFF_ROLES` + `CLINIC_ADMIN_ROLES` |

| `admin/rate-limit/*` | ? | `CLINIC_ADMIN_ROLES` (whitelist/stats/reset) |

| `admin/users/route.ts` | ? | `ROLE_VALUES` updated to `clinic_admin` |

| `admin/users/[permission_id]/route.ts` | ? | `ROLE_VALUES` updated to `clinic_admin` |

| `admin/master-data/import/route.ts` | ? | `ADMIN_UI_ROLES` + `clinic_admin` check |

| `admin/master-data/export/route.ts` | ? | `ADMIN_UI_ROLES` + `clinic_admin` check |

| `admin/master-data/rollback/route.ts` | ? | `ADMIN_UI_ROLES` + `clinic_admin` check |

| `admin/security/csp-violations/route.ts` | ? | `CLINIC_ADMIN_ROLES` (GET/PATCH) |

| `admin/security/csp-stats/route.ts` | ? | `CLINIC_ADMIN_ROLES` |

| `staff/shifts/route.ts` | ? | `ADMIN_UI_ROLES` |

| `staff/route.ts` | ? | `ADMIN_UI_ROLES` |

| `chat/route.ts` | ? | `ADMIN_UI_ROLES.has()` for privileged check |

| **2.3 Client role derivation** | | |

| `useUserProfile.ts` | ? | `ADMIN_ROLES` updated to `clinic_admin` |

| `types/onboarding.ts` | ? | `StaffRole` + `ROLE_LABELS` updated |

| `onboarding/schema.ts` | ? | `ROLE_VALUES` updated |

| `InvitesStep.tsx` | ? | `AVAILABLE_ROLES` updated |

| `users/page.tsx` | ? | `ROLE_OPTIONS` + form default updated |

| **2.4 Multi-tenant best practices (DOD-09)** | | |

| `api/blocks/route.ts` | ? | New API route (GET/POST/DELETE) |

| `lib/services/block-service.ts` | ? | `server-only` + `clinic_id` scoping |

| `app/blocks/page.tsx` | ? | API-based access via `/api/blocks` |

| `hooks/useDailyReports.ts` | ? | API-based access via `/api/daily-reports` |

| `admin/(protected)/security-monitor/page.tsx` | ? | `useUserProfileContext` for clinic_id |

| `admin/(protected)/security-dashboard/page.tsx` | ? | `useUserProfileContext` for clinic_id |

| **2.5 Tests** | | |

| `useMultiStore.test.ts` | ? | Comment updated |

| `multi-store-kpi.test.ts` | ? | Comment updated |

| `MultiStorePage.test.tsx` | ? | Comment updated |

| `mfa-setup.test.tsx` | ? | Comments updated |



### Phase 2 - Remaining Tasks (Findings / Questions)



**Findings (要対忁E - ?COMPLETED (2026-01-07)**

- [DOD-08] ?Option B-1 互換マッピングを実裁E

  - `src/lib/constants/roles.ts`: `normalizeRole()`, `canAccessAdminUIWithCompat()`, `canAccessCrossClinicWithCompat()`, `canManageClinicSettingsWithCompat()` 関数追加

  - `middleware.ts`: `canAccessAdminUIWithCompat()` 使用

  - `src/lib/supabase/guards.ts`: `normalizeRole()` + `canAccessCrossClinicWithCompat()` 使用

  - `src/app/admin/(protected)/layout.tsx`: `canAccessAdminUIWithCompat()` 使用

  - `src/app/api/auth/profile/route.ts`: `normalizeRole()` + `canAccessAdminUIWithCompat()` 使用

  - `src/lib/supabase/server.ts`: `canAccessAdminUIWithCompat()` 使用

- [DOD-08] ?役割配Eの定数化を継綁E

  - `src/app/api/admin/security/events/route.ts`: `isAdmin` ->`canAccessAdminUIWithCompat()`, `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

  - `src/app/api/admin/notifications/route.ts`: `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

  - `src/app/api/admin/security/stats/route.ts`: `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

  - `src/app/api/admin/security/sessions/route.ts`: `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

  - `src/app/api/admin/security/sessions/terminate/route.ts`: `isAdmin` ->`canAccessAdminUIWithCompat()`, `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

  - `src/app/api/admin/security/metrics/route.ts`: `allowedRoles` ->`Array.from(ADMIN_UI_ROLES)`

- [DOD-08] ?認可の非直交を解涁E(MVPでも事故りやすい) - **COMPLETED (2026-01-08)**:

  - 解決筁E 互換マッピングをAPI入口の共通ガードで一貫適用し、UI/APIのrole判定を揁Eる、E
  - 修正佁E

    - `src/lib/api-helpers.ts` `verifyAdminAuth()`: `normalizeRole()` を適用し、返されるroleを正規化、E
    - `src/lib/api-helpers.ts` `processApiRequest()`: 同様に返されるroleを正規化、E
    - `src/app/api/admin/security/events/route.ts` `allowedRoles`: `normalizeRole()` 済みの role で判定し、`Array.from(ADMIN_UI_ROLES)` を使用E既存）、E
- [DOD-09] ?スタチE系GETのチEント墁Eの明示 - **COMPLETED (2026-01-08)**:

  - 解決筁E `GET` のクエリは忁E `permissions.clinic_id` でスコープし、欠落時E拒否する、E
  - 修正佁E

    - `src/app/api/staff/route.ts` `GET`: HQロール以外E`permissions.clinic_id`を忁Eとし、欠落時E403を返す。クエリは`permissions.clinic_id`で絞り込み、E
    - `src/app/api/staff/shifts/route.ts` `GET`: 同上、EQロール以外E`permissions.clinic_id`でスコープ、E
- [DOD-09] ?クライアント直アクセス排除 - **COMPLETED (2026-01-09)**:

  - 解決筁E チEントテーブルへのクライアント直アクセスを禁止し、API経由またEserver-only化、E
  - 修正佁E

    - **PR1**: `src/app/api/blocks/route.ts` 新規作E、`src/lib/services/block-service.ts` server-only化、`src/app/blocks/page.tsx` API経由に変更

      - セキュリチE強化！E026-01-09EE GET時EチEント墁E強制EEQロール以外E自clinic_idE、POST/DELETEを`CLINIC_ADMIN_ROLES`に制限、DELETEにclinic_id突き合わせ追加

    - **PR2**: `src/hooks/useDailyReports.ts` 直接Supabase使用を削除、`/api/daily-reports` API経由に変更

      - セキュリチE強化！E026-01-09EE `src/app/api/daily-reports/route.ts` DELETE時にclinic_id突き合わせによるチEント墁EチェチE追加

    - **PR3**: `src/app/admin/(protected)/security-monitor/page.tsx` および `security-dashboard/page.tsx` で `useUserProfileContext` 使用



**Questions (Decision needed) - ?RESOLVED (2026-01-07)**

- [DOD-08] ?Q1: `/api/admin/tables` の権限制御方釁E
  - **決宁E*: HQ専用EEdminのみEE
  - **実裁E*: `src/app/api/admin/tables/route.ts` GET/POST/PUT/DELETE めE`HQ_ROLES` に変更

- [DOD-08] ?Q2: グローバル設定E扱ぁE
  - **決宁E*: 参Eのみ許可、変更はadminのみ

  - **実裁E*: `src/app/api/admin/master-data/route.ts` POST/PUT/DELETE で `clinic_id=null` への操作E `isHQRole` チェチE追加

- [DOD-08] ?Q3: スタチE系GETの閲覧権陁E
  - **決宁E*: STAFF_ROLESまで許可E一般スタチEも閲覧可能、E院限定！E
  - **実裁E*: `src/app/api/staff/route.ts` GET, `src/app/api/staff/shifts/route.ts` GET に `STAFF_ROLES` 許可追加

- [DOD-08] ?Q4: `isAdmin` の定義統一

  - **決宁E*: managerを含めるEELINIC_ADMIN_ROLES使用EE
  - **実裁E*: `src/hooks/useUserProfile.ts` と `src/app/api/auth/profile/route.ts` で `CLINIC_ADMIN_ROLES` に統一



### Phase 2 Verification Results

```bash

# clinic_manager in allowedRoles - NONE FOUND

rg "allowedRoles:.*clinic_manager" src  # No matches



# clinic_manager in inline arrays - NONE FOUND

rg "\['admin', 'clinic_manager'" src  # No matches



# ADMIN_UI_ROLES usage - 9 files

# CLINIC_ADMIN_ROLES usage - 6 files

```



Remaining `clinic_manager` references (acceptable):

- `schema.sql`, `rls-policies.sql`: Database files (Phase 3/DOD-09)

- `middleware-auth.test.ts`, `roles.test.ts`: Deprecated role denial tests

- `mfa-setup.test.tsx`: Explanatory comments



### Test Results

- `roles.test.ts`: 40/40 PASS

- `middleware-auth.test.ts`: 23/23 PASS

- Auth-related unit tests: PASS



### Verified Behavior (from logs)

```

[Auth] Successful HQ admin login: { role: 'admin', clinic_id: null }

[Auth] Successful clinic login (no clinic assigned, redirecting to onboarding): { role: 'staff' }

```



### Phase 3 - Completed Items (2026-01-10)
| Item | Status | Notes |
|------|--------|-------|
| **3.1 Preflight Checks** | DONE | Executed and documented |
| auth.users with clinic_manager | DONE | 1 record found |
| public.profiles with clinic_manager | DONE | 1 record found |
| user_permissions with clinic_manager | DONE | 1 record found |
| RLS policies referencing clinic_manager | DONE | 0 tables (after 20260110000300) |
| **3.2 Migration File Created** | DONE | `20260109000100_migrate_clinic_manager_to_clinic_admin.sql` |
| **3.3 Migration Executed (Local)** | DONE | UPDATE 1 (user_permissions/profiles/auth.users) |
| **3.4 Post-Migration Verification** | WARN | auth.users raw_app_meta_data に clinic_manager が残存 (1) |
| **3.5 Complete Fix Migration (Local)** | FAIL | `20260110000100_dod08_clinic_manager_complete_fix.sql` rolled back: `public.invitations` missing |
| **3.6 Auth Users Meta Fix Migration (Local)** | DONE | `20260110000200_fix_auth_users_clinic_manager_meta.sql` UPDATE 1 |
| **3.7 RLS/Constraint Fix Migration (Local)** | DONE | `20260110000300_fix_rls_clinic_manager_roles.sql` |

**Migration File Details:**

- Location: `supabase/migrations/20260109000100_migrate_clinic_manager_to_clinic_admin.sql`

- Tables affected: `user_permissions`, `profiles`, `auth.users`

- Decision: Option B-1 (`clinic_manager` ->`clinic_admin`)

- Includes: Rollback plan in comments

- Location: `supabase/migrations/20260110000200_fix_auth_users_clinic_manager_meta.sql`

- Tables affected: `auth.users` only (raw_app_meta_data.role/user_role, raw_user_meta_data.user_role)

- Purpose: finalize auth.users metadata migration after Phase 3.4

- Location: `supabase/migrations/20260110000300_fix_rls_clinic_manager_roles.sql`

- Tables affected: `clinic_settings`, `staff_invites`, `staff_shifts`, `staff_preferences`

- Purpose: replace clinic_manager in RLS policies and staff_invites role check constraint



**Note:**
- RLS policies no longer reference `clinic_manager` (0 tables after 20260110000300).
- CHECK constraint on `public.staff_invites` no longer references `clinic_manager`.
- `20260110000100_dod08_clinic_manager_complete_fix.sql` failed locally because `public.invitations` does not exist.

**Update Log (2026-01-10)**
- Created local preflight data and recorded counts (auth.users/profiles/user_permissions).
- Executed `20260109000100_migrate_clinic_manager_to_clinic_admin.sql` locally.
- Attempted `20260110000100_dod08_clinic_manager_complete_fix.sql`; failed due to missing `public.invitations` and rolled back.
- Executed `20260110000200_fix_auth_users_clinic_manager_meta.sql` to finish auth.users metadata migration (UPDATE 1).
- Executed `20260110000300_fix_rls_clinic_manager_roles.sql` to remove clinic_manager from RLS/constraints.
- Cleaned up local preflight data records (auth.users/profiles/user_permissions/staff/clinic).

### Phase 3 - DOD-08 追加修正項目 (2026-01-10)

Phase 3マイグレーション後に判明した追加修正と実行結果を整理する。

#### 3.5 auth.users メタデータのカバレッジ不足
- 対象: `supabase/migrations/20260109000100_migrate_clinic_manager_to_clinic_admin.sql`
- 未対応キー: `auth.users.raw_app_meta_data.role`, `auth.users.raw_app_meta_data.user_role`, `auth.users.raw_user_meta_data.user_role`
- 現状: auth.users に clinic_manager が残存 (1)
- 対応: `supabase/migrations/20260110000200_fix_auth_users_clinic_manager_meta.sql` を追加 (未実行)

#### 3.6 RLS/制約の clinic_manager 残存と実行ブロッカー
- RLS: `pg_policies` で clinic_manager 参照が 0 テーブル (20260110000300 で解消)
- CHECK制約: `public.staff_invites` の `staff_invites_role_check` から clinic_manager を除去済み
- 20260110000100 は `public.invitations` を前提としており、ローカルではテーブル不在
- 実行結果: 20260110000100 は `public.invitations` 不在でエラー → トランザクション全体が ROLLBACK

#### 3.7 Preflight下準備チェックリスト

Phase 3のPreflightを正確に実行するためのチェックリスト。

**A. Preflight SQL（完全版）**
```sql
-- Check 1: auth.users での clinic_manager 使用状況（all keys）
SELECT
  'clinic_manager in auth.users (all keys)' as check_type,
  COUNT(*) as count
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'clinic_manager'
   OR raw_user_meta_data->>'user_role' = 'clinic_manager'
   OR raw_app_meta_data->>'role' = 'clinic_manager'
   OR raw_app_meta_data->>'user_role' = 'clinic_manager';

-- Check 2: public.profiles での clinic_manager 使用状況
SELECT
  'clinic_manager in public.profiles' as check_type,
  COUNT(*) as count
FROM public.profiles
WHERE role = 'clinic_manager';

-- Check 3: public.user_permissions での clinic_manager 使用状況
SELECT
  'clinic_manager in public.user_permissions' as check_type,
  COUNT(*) as count
FROM public.user_permissions
WHERE role = 'clinic_manager';

-- Check 4: RLS policies での clinic_manager 参照状況
SELECT
  'RLS policies referencing clinic_manager' as check_type,
  COUNT(DISTINCT tablename) as affected_tables
FROM pg_policies
WHERE qual ILIKE '%clinic_manager%'
   OR with_check ILIKE '%clinic_manager%';

-- Check 5: 全ロールの分布確認 (user_permissions)
SELECT role, COUNT(*) as count
FROM public.user_permissions
GROUP BY role
ORDER BY count DESC;

-- Check 6: 全ロールの分布確認 (profiles)
SELECT role, COUNT(*) as count
FROM public.profiles
GROUP BY role
ORDER BY count DESC;
```

**B. Local preflight data prep**
- 本文の「Phase 3実行前提条件の下準備」を参照。

**C. Evidence to record**
- 各チェックの数値
- 影響を受けるテーブル一覧（RLS）
- 事前件数と移行後件数の差分


## Evidence (Current Behavior)

### Role Definition Inconsistency

| File | Location | Roles Defined | Issue |
|------|----------|---------------|-------|
| guards.ts:13 | CROSS_CLINIC_ROLES | `admin`, `clinic_admin` | Uses `clinic_admin` |
| middleware.ts:154 | HQ_ROLES | `admin`, `clinic_manager`, `manager` | Uses `clinic_manager` |
| layout.tsx:5 | ADMIN_ROLES | `admin`, `clinic_admin` | Uses `clinic_admin` |
| mfa-setup/page.tsx | ADMIN_ROLES | `admin`, `clinic_admin` | Uses `clinic_admin` |
| route.ts (settings) | isAdmin() | `admin`, `clinic_manager`, `manager` | Uses `clinic_manager` |

**Critical Problem**: `clinic_admin` vs `clinic_manager` confusion causes:
- Users with `clinic_admin` role blocked from `/admin/**` routes (middleware uses `clinic_manager`)
- Users with `clinic_manager` role can access admin APIs but not admin UI

### Authorization Source Inconsistency

| File | Source Used |
|------|-------------|
| middleware.ts | `user_permissions` with profiles fallback (`is_active` from profiles) |
| guards.ts | `getUserPermissions()` via `user_permissions` table |
| layout.tsx | `user_permissions` + profiles `is_active` |

## Canonical Role Definitions

**Decision: Standardize on the following roles**

| Role | Description | Scope | Source Table |
|------|-------------|-------|--------------|
| `admin` | System administrator | Cross-clinic (HQ) | user_permissions |
| `clinic_admin` | Clinic administrator | Single clinic | user_permissions |
| `manager` | Clinic manager | Single clinic | user_permissions |
| `therapist` | Therapist/practitioner | Single clinic | user_permissions |
| `staff` | General staff | Single clinic | user_permissions |
| `customer` | Patient/customer (non-interactive) | Self only | auth.users |

**Deprecated roles** (to be migrated):
- `clinic_manager` → merge into `clinic_admin` or `manager`

**Note (product constraint)**:
- Customers do not log in to this SaaS. `customer` exists only for data modeling and must not be treated as an interactive role in auth checks or UI role selectors.

## Plan

### 1. Create centralized role constants (Priority: P0)

Create `src/lib/constants/roles.ts`:

```typescript
// src/lib/constants/roles.ts

/**
 * Role type union for type safety
 */
export type Role =
  | 'admin'
  | 'clinic_admin'
  | 'manager'
  | 'therapist'
  | 'staff'
  | 'customer';

/**
 * HQ roles - can access cross-clinic data and admin features
 */
export const HQ_ROLES: ReadonlySet<Role> = new Set(['admin']);

/**
 * Admin UI roles - can access /admin/** routes
 */
export const ADMIN_UI_ROLES: ReadonlySet<Role> = new Set(['admin', 'clinic_admin']);

/**
 * Cross-clinic roles - can view data across clinics (HQ view)
 */
export const CROSS_CLINIC_ROLES: ReadonlySet<Role> = new Set(['admin']);

/**
 * Clinic admin roles - can manage clinic settings
 */
export const CLINIC_ADMIN_ROLES: ReadonlySet<Role> = new Set(['admin', 'clinic_admin', 'manager']);

/**
 * Staff roles - can view/edit patient and reservation data
 */
export const STAFF_ROLES: ReadonlySet<Role> = new Set(['admin', 'clinic_admin', 'manager', 'therapist', 'staff']);

/**
 * Check if role has HQ (headquarters) privileges
 */
export function isHQRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && HQ_ROLES.has(role as Role);
}

/**
 * Check if role can access admin UI
 */
export function canAccessAdminUI(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && ADMIN_UI_ROLES.has(role as Role);
}

/**
 * Check if role can access cross-clinic data
 */
export function canAccessCrossClinic(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && CROSS_CLINIC_ROLES.has(role as Role);
}
```

### 2. Update all role references (Priority: P0)

| File | Current | Change To |
|------|---------|-----------|
| middleware.ts:154 | `['admin', 'clinic_manager', 'manager']` | `import { ADMIN_UI_ROLES } from '@/lib/constants/roles'` |
| guards.ts:13 | `new Set(['admin', 'clinic_admin'])` | `import { CROSS_CLINIC_ROLES } from '@/lib/constants/roles'` |
| layout.tsx:5 | `new Set(['admin', 'clinic_admin'])` | `import { ADMIN_UI_ROLES } from '@/lib/constants/roles'` |
| route.ts (settings) | `['admin', 'clinic_manager', 'manager'].includes(role)` | `CLINIC_ADMIN_ROLES.has(role)` |

### 3. Unify authorization source (Priority: P0)

**Decision: Use `user_permissions` as the single source of truth**

Update middleware.ts to use user_permissions instead of profiles:

```typescript
// middleware.ts - BEFORE
const { data: profile } = await supabase
  .from('profiles')
  .select('role, clinic_id, is_active')
  .eq('user_id', user.id)
  .single();

// middleware.ts - AFTER
import { getUserPermissions } from '@/lib/supabase';

const permissions = await getUserPermissions(user.id, supabase);
if (!permissions || !permissions.is_active || !canAccessAdminUI(permissions.role)) {
  return NextResponse.redirect(new URL('/unauthorized', request.url));
}
```

### 4. Define clinic_id null behavior (Priority: P0)

| Scenario | Current Behavior | Target Behavior |
|----------|------------------|-----------------|
| User with `clinic_id = null` attempts login | Rejected in clinicLogin() | Allow login, redirect to onboarding |
| User with `clinic_id = null` attempts /dashboard | Undefined | Redirect to /onboarding |
| Admin with `clinic_id = null` | Allowed | Allowed (admin is HQ role) |

Implementation:

```typescript
// src/app/login/actions.ts
export async function clinicLogin(email: string, password: string) {
  // ... authentication logic ...

  const permissions = await getUserPermissions(user.id, supabase);

  // Allow HQ roles without clinic_id
  if (isHQRole(permissions?.role)) {
    return { success: true, redirectTo: '/admin' };
  }

  // Redirect non-HQ users without clinic to onboarding
  if (!permissions?.clinic_id) {
    return { success: true, redirectTo: '/onboarding' };
  }

  return { success: true, redirectTo: '/dashboard' };
}
```

### 5. Update fixtures and tests (Priority: P1)

Update scripts/e2e/fixtures.mjs:

```javascript
export const FIXTURE_USERS = [
  {
    id: '...',
    email: 'admin@example.com',
    role: 'admin',           // Not 'clinic_manager'
    clinic_id: null,         // HQ admin has no clinic
    permissions_clinic_id: null,
  },
  {
    id: '...',
    email: 'clinic_admin@example.com',
    role: 'clinic_admin',    // Not 'clinic_manager'
    clinic_id: FIXTURE_CLINICS[0].id,
    permissions_clinic_id: FIXTURE_CLINICS[0].id,
  },
  // ... other fixtures
];
```

## Migration Plan

### Phase 1: Add constants (no breaking changes)
1. Create `src/lib/constants/roles.ts`
2. Add helper functions

### Phase 2: Update imports (parallel safe) ? COMPLETED (2026-01-07)
**Decision gate (required before code changes)**
Choose how to treat legacy `clinic_manager` **before** Phase 3 completes.

- Option A (strict): remove `clinic_manager` from all runtime checks and deploy only after Phase 3.
- Option B (compatibility): map `clinic_manager` to a canonical role at auth boundaries, then remove the mapping after Phase 3.

Record the choice in this spec before starting Phase 2.

**Decision (2026-01-07)**:
- Legacy `clinic_manager` will be treated as `clinic_admin` at auth boundaries until Phase 3 completes (Option B-1).
- DOD-09 remediation (client direct access removal) will be executed as separate PRs from Phase 2.

**Implementation (2026-01-07)**:
- All `['admin', 'clinic_manager']` patterns replaced with `Array.from(ADMIN_UI_ROLES)` or `Array.from(CLINIC_ADMIN_ROLES)`
- All `permissions.role === 'clinic_manager'` checks updated to `permissions.role === 'clinic_admin'`
- Client-side role definitions (`StaffRole`, `ROLE_VALUES`, `AVAILABLE_ROLES`, `ROLE_OPTIONS`) updated to use `clinic_admin`
- Test comments updated to reflect canonical roles

#### 2.1 Auth boundaries (DOD-08) ?
- `middleware.ts` (function: `middleware`)
  - Use `getUserPermissions()` as the single source for role + clinic_id.
  - Keep `profiles.is_active` as the only profiles dependency.
  - Apply the Phase 2 decision gate mapping here if Option B is chosen.
- `src/app/admin/(protected)/layout.tsx` (function: `resolveRole`)
  - Use `getUserPermissions()` for role + clinic_id.
  - Keep `profiles.is_active` only.
  - Apply the Phase 2 decision gate mapping here if Option B is chosen.
- `src/app/api/auth/profile/route.ts` (function: `GET`)
  - Return role from `user_permissions` only.
  - `isAdmin` must use `ADMIN_UI_ROLES`.

#### 2.2 Server API role checks (DOD-08) ?
Replace inline role arrays with constants:
- `src/lib/api-helpers.ts` (function: `verifyAdminAuth`)
  - Replace `['admin', 'clinic_manager']` with `ADMIN_UI_ROLES` or `CLINIC_ADMIN_ROLES` (choose per endpoint intent).
- API routes with `allowedRoles` arrays should switch to constants:
  - `src/app/api/admin/*` (e.g., `dashboard/route.ts`, `master-data/route.ts`, `tables/route.ts`)
  - `src/app/api/staff/shifts/route.ts` (function: `POST`)
  - `src/app/api/chat/route.ts` (role checks)
  - `src/app/api/admin/settings/route.ts` (all handlers)

Guideline:
- Admin UI access: `ADMIN_UI_ROLES`
- Clinic admin operations: `CLINIC_ADMIN_ROLES`
- Cross-clinic view: `CROSS_CLINIC_ROLES`

#### 2.3 Client role derivation + UI role lists ?
- `src/hooks/useUserProfile.ts` (const: `ADMIN_ROLES`)
  - Replace local set with `ADMIN_UI_ROLES` or `canAccessAdminUI`.
- `src/types/onboarding.ts` (type: `StaffRole`)
  - Remove `clinic_manager` from unions and labels.
- `src/components/onboarding/InvitesStep.tsx` (const: `AVAILABLE_ROLES`)
  - Align to canonical roles only.
- `src/app/admin/(protected)/users/page.tsx` (role options)
  - Align to canonical roles only.

#### 2.4 Multi-tenant best practices (DOD-09) ? - **COMPLETED (2026-01-09)**
For tenant tables, do not access Supabase directly from client code.
- Use API routes (server-side) or server components with `ensureClinicAccess()` and explicit `clinic_id` scoping.
- Avoid importing server-only Supabase modules in client components.

**Implementation Summary:**
Three PRs completed:

**PR1: Block系のクライアント直アクセス排除**
- ? `src/app/api/blocks/route.ts`: 新規作成（GET/POST/DELETE with clinic_id scoping）
  - GET: HQロール以外は`permissions.clinic_id`のみ参照可能（テナント境界強制）
  - POST/DELETE: `CLINIC_ADMIN_ROLES`に権限制限（admin, clinic_admin, manager）
  - DELETE: `clinic_id`突き合わせによるテナント境界チェック
- ? `src/lib/services/block-service.ts`: `server-only`追加、全メソッドに`clinic_id`パラメータ必須化
- ? `src/app/blocks/page.tsx`: `BlockService`直接使用を削除、`/api/blocks` API経由に変更

**PR2: DailyReportsの直Supabase排除**
- ? `src/hooks/useDailyReports.ts`:
  - 直接`@supabase/supabase-js`使用を削除
  - `/api/daily-reports` API経由に変更
  - `useUserProfileContext`でclinic_id取得
- ? `src/app/api/daily-reports/route.ts`:
  - DELETE: 削除前に`clinic_id`突き合わせによるテナント境界チェック追加

**PR3: Security dashboard系のserver-only client排除**
- ? `src/app/admin/(protected)/security-monitor/page.tsx`: `createClient`直接使用を削除、`useUserProfileContext`経由でclinic_id取得
- ? `src/app/admin/(protected)/security-dashboard/page.tsx`: 同上

**Note:** `src/lib/middleware-optimizer.ts` は存在しないため対応不要。

#### 2.5 Tests + fixtures ?
- Update tests that still use `clinic_manager` to the canonical role or to explicit "deprecated role is denied" expectations.
- `scripts/e2e/fixtures.mjs` should continue to use `clinic_admin` and `admin` with `clinic_id = null`.

#### 2.6 Verification ?
```bash
rg -n "clinic_manager" src
```
Expected: only docs/tests that explicitly assert deprecation; no runtime role checks.

### Phase 3: Data migration (if needed)

?? **重要: Phase 3は本番データベースへの変更を伴います**
- マイグレーション実行前に必ず以下の手順を完了してください
- データベーススナップショットを取得してください
- ロールバック計画を準備してください
- 影響範囲を完全に理解してから実行してください

**Phase 3開始前の必須手順**

Phase 3（データマイグレーション）を開始する前に、以下の手順を完了する必要があります：

1. **Preflight Checks実行** - データベースの現状を確認
   - `auth.users` テーブルでの `clinic_manager` 使用状況
   - `public.profiles` テーブルでの `clinic_manager` 使用状況
   - RLS policies での `clinic_manager` 参照状況
   - 結果を記録し、影響範囲を把握

2. **マイグレーション仕様書作成**
   - Preflight checksの結果に基づいた詳細計画
   - 影響を受けるテーブル・レコード数の明記
   - マイグレーション手順の詳細
   - 検証方法の定義
   - ロールバック手順の定義

3. **`clinic_manager` マッピング先の決定**
   - Option B-1: `clinic_manager` → `clinic_admin`
   - Option B-2: `clinic_manager` → `manager`
   - ビジネス要件に基づいて選択

4. **ロールバック計画の策定**
   - データベーススナップショット取得手順
   - ロールバックSQL準備
   - 検証手順の確認

**Phase 3実行前提条件の下準備**

Phase 3のPreflightが0件のまま進む場合は、ローカルで最小の疑似データを用意して検証する。

1. **検証用データの作成（local only）**
   - `auth.users`: `raw_user_meta_data` と `raw_app_meta_data` の両方に `role`/`user_role` を `clinic_manager` で入れる。
   - `public.profiles`: `role = 'clinic_manager'` のレコードを1件作成する。
   - `public.user_permissions`: `role = 'clinic_manager'` のレコードを1件作成する。

2. **Preflightの対象テーブル名を揃える**
   - `user_profiles` ではなく `public.profiles` を使用する。
   - `auth.users` は `raw_user_meta_data` と `raw_app_meta_data` の両方を確認する。

3. **検証の観点を固定する**
   - `clinic_manager` の件数がマイグレーション後に0になること。
   - `clinic_admin` の件数増加が `clinic_manager` の事前件数と一致すること。
   - `auth.users` の `role/user_role` が `clinic_manager` のまま残らないこと。

**Prerequisites**
- A written migration spec + rollback plan (required by project rules).
- Confirm which canonical role `clinic_manager` should map to.
- Execute and document preflight checks before proceeding.
- Note: RLS policies in `src/api/database/rls-policies.sql` and schema notes still reference `clinic_manager`.
  - Coordinate with `spec-rls-tenant-boundary-v0.1.md` if those policies must change.
  - Do not edit migrations without a written spec + rollback plan.

**Preflight Checks (read-only) - 実行必須**

Phase 3開始前に以下のSQLを実行し、結果を記録してください：

```sql
-- Check 1: auth.users での clinic_manager 使用状況
SELECT
  'clinic_manager in auth.users' as check_type,
  COUNT(*) as count
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'clinic_manager'
   OR raw_user_meta_data->>'user_role' = 'clinic_manager'
   OR raw_app_meta_data->>'role' = 'clinic_manager'
   OR raw_app_meta_data->>'user_role' = 'clinic_manager';

-- Check 2: public.profiles での clinic_manager 使用状況
SELECT
  'clinic_manager in public.profiles' as check_type,
  COUNT(*) as count
FROM public.profiles
WHERE role = 'clinic_manager';

-- Check 3: RLS policies での clinic_manager 参照状況
SELECT
  'RLS policies referencing clinic_manager' as check_type,
  COUNT(DISTINCT tablename) as affected_tables
FROM pg_policies
WHERE qual ILIKE '%clinic_manager%'
   OR with_check ILIKE '%clinic_manager%';

-- Check 4: 全ロールの分布確認 (user_permissions)
SELECT role, COUNT(*) as count
FROM public.user_permissions
GROUP BY role
ORDER BY count DESC;

-- Check 5: 全ロールの分布確認 (profiles)
SELECT role, COUNT(*) as count
FROM public.profiles
GROUP BY role
ORDER BY count DESC;
```

**結果の記録方法**
- 各チェックの結果を記録
- `clinic_manager` が存在する場合は影響範囲を明記
- RLS policies の影響を受けるテーブル一覧を取得
- マイグレーション仕様書に結果を反映

**Preflight Results (local, 2026-01-10)**
- auth.users: 1
- public.profiles: 1
- public.user_permissions: 1 (clinic_manager)
- RLS policies referencing clinic_manager: 4 tables
- CHECK constraints referencing clinic_manager: staff_invites_role_check on public.staff_invites

**Migration (choose one mapping)**
```sql
-- Option B-1: clinic_manager -> clinic_admin
update public.user_permissions set role = 'clinic_admin' where role = 'clinic_manager';
update public.profiles set role = 'clinic_admin' where role = 'clinic_manager';

-- Option B-2: clinic_manager -> manager
-- update public.user_permissions set role = 'manager' where role = 'clinic_manager';
-- update public.profiles set role = 'manager' where role = 'clinic_manager';
```

**Post-Migration Verification (必須)**

マイグレーション実行後、以下を確認してください：

```sql
-- Verify 1: clinic_manager が完全に削除されたことを確認
SELECT
  'Remaining clinic_manager in auth.users' as check_type,
  COUNT(*) as count
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'clinic_manager'
   OR raw_user_meta_data->>'user_role' = 'clinic_manager'
   OR raw_app_meta_data->>'role' = 'clinic_manager'
   OR raw_app_meta_data->>'user_role' = 'clinic_manager';
-- Expected: 0

SELECT
  'Remaining clinic_manager in public.profiles' as check_type,
  COUNT(*) as count
FROM public.profiles
WHERE role = 'clinic_manager';
-- Expected: 0

-- Verify 2: マイグレーション先ロールの増加を確認
SELECT role, COUNT(*) as count
FROM public.user_permissions
GROUP BY role
ORDER BY count DESC;
-- Expected: clinic_admin (or manager) のカウントが増加

SELECT role, COUNT(*) as count
FROM public.profiles
GROUP BY role
ORDER BY count DESC;
-- Expected: clinic_admin (or manager) のカウントが増加

-- Verify 3: 整合性チェック（全ユーザーがいずれかのロールを持つ）
SELECT
  COUNT(*) as users_without_valid_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE p.role IS NULL OR p.role NOT IN ('admin', 'hq_admin', 'clinic_admin', 'manager', 'staff', 'therapist');
-- Expected: 0
```

**検証結果の記録**
- Compare Preflight and Post-verify results
- Confirm clinic_manager count is 0 (or explain residuals)
- Confirm migrated role count matches preflight count
- Confirm no inconsistencies

**Post-Migration Results (local, 2026-01-10)**
- auth.users: 0
- public.profiles: 0
- public.user_permissions: 1 (clinic_admin)
- users_without_valid_role: 0
- RLS policies referencing clinic_manager: 0 tables
- CHECK constraints referencing clinic_manager: 0

**Rollback Plan**

マイグレーションに問題が発生した場合の手順：

1. **即座のロールバック（Option A）**
   ```sql
   -- データベーススナップショットから復元
   -- (Supabase の Point-in-Time Recovery を使用)
   ```

2. **手動ロールバック（Option B）**
   ```sql
   -- Option B-1 を実行した場合
   UPDATE public.user_permissions
   SET role = 'clinic_manager'
   WHERE role = 'clinic_admin'
   AND updated_at > '[migration_timestamp]';

   UPDATE public.profiles
   SET role = 'clinic_manager'
   WHERE role = 'clinic_admin'
   AND updated_at > '[migration_timestamp]';

   -- Option B-2 を実行した場合
   UPDATE public.user_permissions
   SET role = 'clinic_manager'
   WHERE role = 'manager'
   AND updated_at > '[migration_timestamp]';

   UPDATE public.profiles
   SET role = 'clinic_manager'
   WHERE role = 'manager'
   AND updated_at > '[migration_timestamp]';
   ```

3. **ロールバック後の検証**
   - Preflight checks と同じクエリを実行
   - 元の状態に戻ったことを確認



## Non-goals

- RLS policy updates (handled in spec-rls-tenant-boundary-v0.1.md).

- User role migration at the data level (deferred to Phase 3).

- Adding new roles.

- Customer login flows or UI.



## Acceptance Criteria (DoD)

- DOD-08: Role checks are consistent across middleware.ts, guards.ts, and /api/auth/profile.

- All role definitions use centralized constants from `src/lib/constants/roles.ts`.

- No hardcoded role strings in application code (except constants file).

- `clinic_id = null` users are properly routed to onboarding.

- DOD-09: Client paths do not directly access tenant tables; access is guarded server-side or explicitly scoped to clinic_id.



## Rollback

- If role unification blocks legitimate access, revert to the previous role lists and add a temporary compatibility map.

- Rollback steps:

  1. Revert imports to inline role arrays

  2. Add compatibility layer that accepts both `clinic_admin` and `clinic_manager`



## Verification



```bash

# Unit tests

npm run test -- --ci --testPathIgnorePatterns=e2e



# DOD-09 guardrail (manual review)

rg -n "from\\('(reservations|blocks|customers|menus|resources|reservation_history|ai_comments)'" src



# E2E tests

npm run test:e2e:pw -- src/__tests__/e2e-playwright/auth-context.spec.ts



# Manual verification matrix

```



| User Role | clinic_id | Expected Access |

|-----------|-----------|-----------------|

| admin | null | /admin/** ? /dashboard ?|

| clinic_admin | set | /admin/** ? /dashboard ?|

| manager | set | /admin/** ? /dashboard ?|

| therapist | set | /admin/** ? /dashboard ?|

| staff | set | /admin/** ? /dashboard ?|

| clinic_admin | null | /onboarding redirect |



## Files to Modify

- src/lib/constants/roles.ts (new file)

- src/lib/supabase/guards.ts

- middleware.ts

- src/app/admin/(protected)/layout.tsx

- src/app/admin/(protected)/mfa-setup/page.tsx

- src/app/api/admin/settings/route.ts

- src/app/login/actions.ts

- scripts/e2e/fixtures.mjs

- src/lib/api-helpers.ts

- src/hooks/useUserProfile.ts

- src/app/api/auth/profile/route.ts

- src/app/api/staff/shifts/route.ts

- src/app/api/admin/dashboard/route.ts

- src/app/api/admin/master-data/route.ts

- src/app/api/admin/tables/route.ts

- src/app/api/chat/route.ts

- src/types/onboarding.ts

- src/components/onboarding/InvitesStep.tsx

- src/app/admin/(protected)/users/page.tsx

- **DOD-09 files:**

- src/app/api/blocks/route.ts (new file)

- src/lib/services/block-service.ts

- src/app/blocks/page.tsx

- src/hooks/useDailyReports.ts

- src/app/admin/(protected)/security-monitor/page.tsx

- src/app/admin/(protected)/security-dashboard/page.tsx



## Security Considerations



1. **Principle of Least Privilege**: Default to no access if role is unknown

2. **Type Safety**: Use Role union type to catch typos at compile time

3. **Audit Trail**: Log all authorization decisions with role and clinic_id

4. **Tenant Boundary**: Do not access tenant tables directly from client code; use guarded APIs or explicit clinic scoping.

5. **Testing**: Add E2E tests for each role vs route combination



