# RLS Policy Helper Rewrite Repair - 2026-05-07

## Problem

`20260507000200_security_advisor_rpc_hardening.sql` moved RLS/auth helpers from `public` to `app_private` and revoked `public` EXECUTE grants from `anon` / `authenticated`.

On applied databases, `pg_policies` can render policy expressions with unqualified helper names such as `can_access_clinic(id)` instead of `public.can_access_clinic(id)`. The previous rewrite loop only matched schema-qualified `public.*` forms, so policies on tables such as `public.clinics`, `public.profiles`, and `public.user_permissions` could continue to call the revoked `public` helpers.

Observed impact:

- Login may surface Supabase Auth/token-hook failures as `Server error: 500`.
- `/api/admin/dashboard` can fail while reading `public.clinics`, returning `クリニック情報の取得に失敗しました`.

## Change

Add `20260507000300_repair_app_private_policy_references.sql`.

The migration rewrites public RLS policies that reference moved helpers, including both:

- schema-qualified forms: `public.can_access_clinic(...)`, `"public"."can_access_clinic"(...)`
- unqualified forms: `can_access_clinic(...)`, `get_current_role()`, `jwt_is_admin()`

The target remains `app_private.*`. This preserves tenant isolation and keeps the helper functions outside the exposed Supabase Data API schema.

## Rollback Plan

Rollback SQL is provided in `supabase/rollbacks/20260507000300_repair_app_private_policy_references_rollback.sql`.

Rollback restores policy references to `public.*` and grants only the minimal public helper EXECUTE privileges needed for those policies to run. If the entire Security Advisor RPC hardening needs to be reverted, apply this rollback before `supabase/rollbacks/20260507000200_security_advisor_rpc_hardening_rollback.sql`.

## DoD Link

This repair supports `docs/stabilization/DoD-v0.1.md`:

- `DOD-01`: local Supabase authenticated reads should not fail after migrations.
- `DOD-08`: tenant boundary and RLS helper source-of-truth remain consistent.
