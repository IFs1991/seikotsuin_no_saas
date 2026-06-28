# Supabase Schema + RLS Handoff (Stabilization)

This document is a quick handoff for the current Supabase schema layout and RLS design.
It references the canonical migration files and the active RLS helper functions.

## Source of truth and drift

- Canonical schema source: `supabase/migrations/*` (per `docs/DBスキーマ複線化_解消計画書.md`).
- Legacy or secondary references (do not treat as canonical unless merged into migrations):
  - `src/api/database/schema.sql` (legacy schema snapshot).
  - `src/database/schemas/*` (draft/newer schema concepts).
  - `sql/migrations/*` (reservation system SQL, now mirrored in `supabase/migrations/*`).

## Schema map (by domain)

### Tenant + identity
- `public.clinics` + `clinics.parent_id` for parent-child scope.
  - Files: `supabase/migrations/20250817000100_schema.sql` (table), `supabase/migrations/20260112000100_add_clinics_parent_id.sql` (parent_id).
- `public.profiles` for auth user profile data.
  - Files: `supabase/migrations/20250817000300_profiles.sql` (table), `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql` (RLS + UPDATE column guard).
- `public.user_permissions` is the authZ source-of-truth for role + clinic.
  - Files: `supabase/migrations/20250817000100_schema.sql` (table), `supabase/migrations/20251224001000_auth_helper_functions.sql` (policies), `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql` (parent-scope policy alignment).
- `public.onboarding_states` and `public.staff_invites` for onboarding + invites.
  - Files: `supabase/migrations/20251225000100_onboarding_tables.sql` (tables + RPC), `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql` (staff_invites scope fix).

### Legacy operational data (clinic-scoped)
- Core operational tables: `staff`, `patients`, `visits`, `revenues`, `staff_performance`, `daily_reports`.
  - Files: `supabase/migrations/20250817000100_schema.sql` (tables), `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql` (RLS aligned to `public.can_access_clinic()`).
- AI comments table rename: `daily_ai_comments` -> `ai_comments`.
  - Files: `supabase/migrations/20251224000400_rename_ai_comments.sql` (rename), `supabase/migrations/20260102000400_rls_dod08_align.sql` (RLS policy rewrite).
- Legacy scheduling: `appointments`.
  - Files: `supabase/migrations/20250817000400_appointments.sql` (table), `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql` (RLS).

### Reservation system
- Reservation domain tables: `customers`, `menus`, `resources`, `reservations`, `blocks`, `reservation_history`.
  - Files: `supabase/migrations/20251104000100_reservation_system_schema.sql` (tables),
    `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql` (clinic_id add),
    `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql` (RLS policies).
- Views and stats: `reservation_list_view`, `daily_reservation_stats`.
  - Files: `supabase/migrations/20251104000100_reservation_system_schema.sql` (view),
    `supabase/migrations/20251104000200_reservation_system_rls.sql` (materialized view + grants),
    `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql` (view update).

### Admin/settings and staffing
- `public.clinic_settings` for admin settings persistence.
  - Files: `supabase/migrations/20251231000100_clinic_settings_table.sql` (table + RPC),
    `supabase/migrations/20260114000200_rls_parent_scope_remaining.sql` (RLS realigned).
- `public.staff_shifts` and `public.staff_preferences` for shift optimization inputs.
  - Files: `supabase/migrations/20251231000101_staff_shifts_preferences.sql` (tables),
    `supabase/migrations/20260114000200_rls_parent_scope_remaining.sql` (RLS realigned).
- `public.improvement_backlog` for beta backlog.
  - Files: `supabase/migrations/20251224000200_create_improvement_backlog.sql` (table + RLS).

### Sessions, security, MFA
- Session management: `user_sessions`, `security_events`, `session_policies`, `registered_devices`.
  - Files: `supabase/migrations/20250825000500_05_session_management.sql` (tables + RLS),
    `supabase/migrations/20260101000100_security_events_operations.sql` (security_events extensions),
    `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`
    (service-role-only inserts for `security_events` + `notifications`).
- Notifications: `public.notifications`.
  - Files: `supabase/migrations/20260101000100_security_events_operations.sql` (table + RLS),
    `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`
    (service-role-only insert policy).
- MFA tables: `user_mfa_settings`, `mfa_setup_sessions`, `mfa_usage_stats`.
  - Files: `supabase/migrations/20250826000600_06_mfa_tables.sql` (tables + initial RLS),
    `supabase/migrations/20260102000300_mfa_rls_role_alignment.sql` (clinic_admin role alignment).
- Audit and secrets: `audit_logs`, `encryption_keys`.
  - Files: `supabase/migrations/20250817000100_schema.sql` (tables),
    `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql` (RLS restrictions).

## RLS design (current state)

### Helper functions and JWT claims
- Role and clinic helpers (user_permissions as source-of-truth):
  - `public.get_current_role()`, `public.get_current_clinic_id()`, `public.is_admin()`,
    `public.user_role()` in `supabase/migrations/20251224001000_auth_helper_functions.sql`.
- JWT-fast helpers and tenant boundary:
  - `public.jwt_clinic_id()`, `public.jwt_is_admin()`, `public.can_access_clinic(UUID)`
    in `supabase/migrations/20260111000100_rls_tenant_boundary_fix.sql` and updated in
    `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`.
- Parent-child scope support:
  - `public.custom_access_token_hook(jsonb)` in `supabase/migrations/20260111000100_rls_tenant_boundary_fix.sql`
    updated in `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`
    and `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`.
  - `supabase/config.toml` setting `[auth.hook.custom_access_token]` must remain enabled.
  - `public.get_sibling_clinic_ids(UUID)` in `supabase/migrations/20260112000100_add_clinics_parent_id.sql`.
- Deprecated helper:
  - `public.belongs_to_clinic(UUID)` now delegates to `public.can_access_clinic()` in
    `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`.

### Tenant boundary rules (parent-scope model)
- `clinic_scope_ids` is the primary claim for scope; `clinic_id` is the fallback.
  - Implementation: `public.can_access_clinic(UUID)` in
    `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`.
- Parent-child hierarchy uses `clinics.parent_id`:
  - Source: `supabase/migrations/20260112000100_add_clinics_parent_id.sql`.
- Admin is scoped (no global bypass):
  - Policies updated in `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`
    and `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`.

### Policy patterns by table group
- Reservation domain tables (`reservations`, `blocks`, `customers`, `menus`, `resources`,
  `reservation_history`, `ai_comments`) use `public.can_access_clinic(...)` in
  `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql` and
  `supabase/migrations/20260102000400_rls_dod08_align.sql`.
- Reservation history insert guard uses clinic scope:
  - `reservation_history_insert_for_all` in `supabase/migrations/20260115000100_rls_reservation_history_insert_guard.sql`.
- Legacy operational tables (`staff`, `patients`, `visits`, `revenues`, `staff_performance`,
  `daily_reports`, `ai_comments`, `appointments`) use `public.can_access_clinic(...)` in
  `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`.
- `clinics` and `user_permissions` policies align to parent-scope via
  `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`.
- `clinic_settings`, `staff_shifts`, `staff_preferences` policies align to parent-scope via
  `supabase/migrations/20260114000200_rls_parent_scope_remaining.sql`.
- `public.profiles` has RLS + column-level UPDATE guard:
  - RLS and GRANTs are in `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`.
- System tables:
  - `audit_logs` SELECT is scoped + admin-only; INSERT is service-role-only in
    `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`.
  - `security_events` and `notifications` INSERT is service-role-only in
    `supabase/migrations/20260126000100_rls_hardening_profiles_legacy_tables.sql`.
- MFA tables still rely on `profiles` role checks:
  - `user_mfa_settings`, `mfa_usage_stats` policies in
    `supabase/migrations/20250826000600_06_mfa_tables.sql` and
    `supabase/migrations/20260102000300_mfa_rls_role_alignment.sql`.

### Customer/public access model
- Customer self-access policies were removed:
  - `reservations_select_for_customer`, `reservations_insert_for_customer`, `customers_select_for_self`
    dropped in `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`.
- Public menu access policy removed:
  - `menus_select_public` dropped in `supabase/migrations/20260114000200_rls_parent_scope_remaining.sql`.
- Public booking flows go through server APIs:
  - `src/app/api/public/menus/route.ts` and `src/app/api/public/reservations/route.ts`.

### Role taxonomy (application side)
- Canonical roles and compatibility mapping are defined in
  `src/lib/constants/roles.ts` (see `normalizeRole()` and deprecated `clinic_manager` mapping).

## Stabilization DoD mapping (schema + RLS)

- DOD-08 (tenant boundary + RLS source-of-truth):
  - Policy source: `public.can_access_clinic()` in
    `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`.
  - Verification command (from `docs/stabilization/DoD-v0.1.md`):
    `supabase db query --local "select tablename, policyname, qual from pg_policies where schemaname='public' and tablename in ('reservations','blocks','customers','menus','resources','reservation_history','ai_comments');"`
- DOD-09 (no client bypass):
  - Server guard: `ensureClinicAccess()` in `src/lib/supabase/guards.ts`.
  - Verification command (from `docs/stabilization/DoD-v0.1.md`):
    `rg -n "createClient\\(|from\\('blocks'\\)|from\\('reservations'\\)" src`
- DOD-04 (schema drift visibility):
  - Canonical diff check: `supabase db push --local --dry-run` with schema source in `supabase/migrations/*`
    per `docs/DBスキーマ複線化_解消計画書.md`.

## Quick troubleshooting

- JWT claims missing or incorrect:
  - Check `supabase/config.toml` `[auth.hook.custom_access_token]` and
    `public.custom_access_token_hook(jsonb)` in the RLS migrations listed above.
- Parent-scope behavior is off:
  - Verify `clinics.parent_id` exists (`supabase/migrations/20260112000100_add_clinics_parent_id.sql`)
    and `public.can_access_clinic(UUID)` logic (`supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`).
- RLS test coverage references:
  - E2E isolation: `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts`.
  - Unit mocks: `src/__tests__/security/rls-policies.test.ts`.
