# Revenue RLS app_private JWT Repair - 2026-05-08

## Problem

`/api/revenue` returned `success: true` with zeroed aggregation even though `daily_reports` and `daily_report_items` contained rows for the requested clinic and date range.

The earlier repair updated `public.get_current_role()`, `public.jwt_clinic_id()`, and `public.can_access_clinic()`. Current RLS policies, however, were rewritten by `20260507000300_repair_app_private_policy_references.sql` to call `app_private.*` helpers. The active helper definitions still read top-level JWT claims such as `clinic_id` and `user_role`.

Supabase JWTs place Auth metadata under `claims.app_metadata.*`. Top-level `role` is the Supabase database role (`authenticated`), not the application role (`clinic_admin`, `manager`, etc.). The result is fail-closed RLS behavior: authorized rows are hidden, so the revenue API aggregates empty result sets.

## Change

Add `20260508000300_app_private_jwt_app_metadata_rls_helpers.sql`.

The migration updates the active `app_private` RLS helpers to read:

- `claims.app_metadata.user_role` / `claims.app_metadata.role`
- `claims.app_metadata.clinic_id`
- `claims.app_metadata.clinic_scope_ids`
- legacy top-level `user_role`, `clinic_id`, and `clinic_scope_ids`

The migration does not point policies back to `public.*` and does not restore public RPC exposure. It keeps tenant isolation fail-closed by returning no role or `false` when the JWT and DB fallback cannot establish scope.

## Rollback Plan

Rollback SQL is provided in `supabase/rollbacks/20260508000300_app_private_jwt_app_metadata_rls_helpers_rollback.sql`.

Rollback restores the `app_private` helper definitions from `20260507000200_security_advisor_rpc_hardening.sql`. Only use it if the app_metadata-aware helper definitions create an unexpected authorization regression. After rollback, users whose JWT only contains `app_metadata.*` claims will again be unable to read tenant-scoped rows through these RLS policies.

## DoD Link

This repair supports `docs/stabilization/DoD-v0.1.md`:

- `DOD-01`: authenticated local API reads should return expected data.
- `DOD-08`: tenant-scoped RLS helpers and policy references must share a single active source of truth.
