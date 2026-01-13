# RLS Tenant Boundary DOD-08 Alignment Spec v0.1

## Overview
- Purpose: add clinic_id scoping for tenant tables and unify RLS role source.
- DoD: DOD-08 (docs/stabilization/DoD-v0.1.md).
- One task = one PR (migration change requires rollback plan).
- Priority: Critical
- Risk: cross-tenant data access or denial of access.
- Status: DRAFT

## Evidence (current behavior)
- `supabase/migrations/20251104000200_reservation_system_rls.sql`:
  - Policies `reservations_*`, `blocks_*`, `customers_*`, `menus_*`, `resources_*`, `reservation_history_*`
  - Qual uses `public.user_role()` only and does not check clinic_id.
- `supabase/migrations/20251224000400_rename_ai_comments.sql`:
  - Policies `ai_comments_select`, `ai_comments_insert`, `ai_comments_update`
  - Qual uses `public.profiles` subquery and `p.role IN (...)` instead of helper functions.
- `supabase/migrations/20251224001000_auth_helper_functions.sql`:
  - Canonical helpers exist: `public.get_current_role()`, `public.get_current_clinic_id()`,
    `public.belongs_to_clinic(UUID)`, `public.is_admin()`.

## Scope
- Tables: reservations, blocks, customers, menus, resources, reservation_history, ai_comments.
- Policies: all policies on the above tables.
- Out of scope: chat tables, new indexes, data migration, schema changes.

## Tenant model
- Parent tenant: `admin` (HQ). Cross-clinic access is allowed.
- Child tenant: clinic-scoped roles (`clinic_admin`, `manager`, `therapist`, `staff`, `customer`).
- Admin may have `clinic_id = null`; policies must not block admin on missing clinic_id.
- Patients do not log in; public booking flows must not rely on authenticated customer JWTs.

## Decisions
- RLS role source of truth: `public.get_current_role()` and `public.get_current_clinic_id()` from
  `supabase/migrations/20251224001000_auth_helper_functions.sql`.
- Every policy on tenant tables must include clinic scoping via
  `public.belongs_to_clinic(<table>.clinic_id)` or `public.get_current_clinic_id() = <table>.clinic_id`.
- Remove all `profiles` references from RLS (ai_comments policies).
- Role lists follow `src/lib/constants/roles.ts`:
  - STAFF_ROLES: admin, clinic_admin, manager, therapist, staff.
  - CLINIC_ADMIN_ROLES: admin, clinic_admin, manager.
- Customer policies are removed in this change (patients are not authenticated in this SaaS).
- Public booking/menu access must go through server APIs with explicit clinic_id validation (out of scope).

## Dependencies / assumptions
- `public.belongs_to_clinic(UUID)` and `public.is_admin()` are used to allow parent-tenant (admin)
  cross-clinic access even when `clinic_id` is null.
- No patient login; direct anon access to tenant tables is not allowed by RLS.

## Plan (implementation)
1. Add migration `supabase/migrations/20260102000400_rls_dod08_align.sql`.
2. Drop and recreate policies for each table below with clinic_id scoping.
3. Validate with DOD-08 query.

## Target policies

### reservations
- reservations_select_for_staff:
  - `public.get_current_role() IN ('admin','clinic_admin','manager','therapist','staff')`
  - `public.belongs_to_clinic(clinic_id)`
- reservations_insert_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- reservations_update_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- reservations_delete_for_managers:
  - `public.get_current_role() IN ('admin','clinic_admin','manager')`
  - `public.belongs_to_clinic(clinic_id)`

### blocks
- blocks_select_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- blocks_insert_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- blocks_update_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- blocks_delete_for_admin:
  - `public.get_current_role() IN ('admin','clinic_admin')`
  - `public.belongs_to_clinic(clinic_id)`

### customers
- customers_select_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- customers_insert_for_staff:
  - `public.get_current_role() IN ('admin','clinic_admin','manager','staff')`
  - `public.belongs_to_clinic(clinic_id)`
- customers_update_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- customers_delete_for_admin:
  - `public.get_current_role() = 'admin'`
  - `public.belongs_to_clinic(clinic_id)`

### menus
- menus_select_for_staff:
  - `public.get_current_role() IN ('admin','clinic_admin','manager','therapist','staff')`
  - `public.belongs_to_clinic(clinic_id)`
- menus_select_public: removed (no unauthenticated direct access).
- menus_insert_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- menus_update_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- menus_delete_for_admin:
  - `public.get_current_role() = 'admin'`
  - `public.belongs_to_clinic(clinic_id)`

### resources
- resources_select_for_staff:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- resources_insert_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- resources_update_for_managers:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- resources_delete_for_admin:
  - `public.get_current_role() = 'admin'`
  - `public.belongs_to_clinic(clinic_id)`

### reservation_history
- reservation_history_select_for_staff:
  - staff roles + `EXISTS` join to reservations with `public.belongs_to_clinic(r.clinic_id)`
- reservation_history_insert_for_all:
  - keep `WITH CHECK (true)`
- reservation_history_update_for_admin:
  - `public.is_admin()` + `EXISTS` join to reservations with `public.belongs_to_clinic(r.clinic_id)`
- reservation_history_delete_for_admin:
  - `public.is_admin()` + `EXISTS` join to reservations with `public.belongs_to_clinic(r.clinic_id)`

### ai_comments
- ai_comments_select:
  - staff roles + `public.belongs_to_clinic(clinic_id)`
- ai_comments_insert:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- ai_comments_update:
  - clinic admin roles + `public.belongs_to_clinic(clinic_id)`
- ai_comments_delete:
  - `public.is_admin()` + `public.belongs_to_clinic(clinic_id)`

## Rollback plan
- Store rollback SQL outside `supabase/migrations` to avoid auto-apply:
  `docs/stabilization/rollbacks/20260102000500_rls_dod08_align_rollback.sql`.
- Steps:
  1. Drop the new policies created above.
  2. Recreate original policies exactly as defined in:
     - `supabase/migrations/20251104000200_reservation_system_rls.sql`
       (function: `public.user_role()`, policy names `*_for_staff`, `*_for_managers`).
     - `supabase/migrations/20251224000400_rename_ai_comments.sql`
       (policies `ai_comments_*` using `public.profiles` subquery).
- Rollback risk: restores role-only checks and profiles-based policies; tenant boundary is weaker.

## Acceptance criteria (DoD)
- DOD-08: `pg_policies.qual` for each policy on tenant tables includes
  `public.belongs_to_clinic` or `public.get_current_clinic_id`.
- DOD-08: policies use a single helper source (`public.get_current_role`,
  `public.get_current_clinic_id`, `public.belongs_to_clinic`, `public.is_admin`).
- Non-admin users cannot access other clinic data.
- Admin users can access all clinics.

## Verification
- DOD-08 query:
  - `supabase db query "select tablename, policyname, qual from pg_policies where schemaname='public' and tablename in ('reservations','blocks','customers','menus','resources','reservation_history','ai_comments');"`
- If the CLI does not support `--local`, use `psql` against the local DB URL.
