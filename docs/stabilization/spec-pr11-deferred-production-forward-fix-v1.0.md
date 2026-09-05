# PR-11 deferred production forward-fix v1.0

## Status and scope

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Recovery migration: `20260815104957_pr11_deferred_production_forward_fix`
- Production incident: the approved `20260716160342` and `20260716160402`
  migrations were applied after the already-present CRM migrations. The
  `20260718011731` exact-head preflight therefore refused execution before any
  of its catalog mutations.
- Scope is limited to restoring the final PR-11 function, policy, index, and
  authorization-helper contract. No application data is mutated.

## Release contract

The release operator must perform the following sequence:

1. Verify that `20260716160342` and `20260716160402` are applied and that
   `20260718011731` is absent from the hosted migration history.
2. Mark `20260718011731` as applied using `supabase migration repair`. This is
   history-only recovery; its SQL is not executed by that command.
3. Apply the pending LINE migrations and this append-only recovery migration.
4. Verify that the hosted history is fully synchronized and a subsequent
   `supabase db push --dry-run` reports no pending migration.

The recovery migration compares the complete 66-version approved history from
the squashed baseline through `20260814010908` in both directions. Missing or
additional versions are rejected. It requires `postgres`, a 5-second lock
timeout, a 120-second statement timeout, no active transaction older than five
minutes, and target tables no larger than 64 MiB for ordinary index creation.

## State handling

- Deferred production state: the helper and two final indexes are all absent.
  The migration verifies the original blocks function and the two original
  SELECT-policy predicates before installing the final contract.
- Clean replay state: the helper and two indexes are all present because
  `20260718011731` executed normally. The migration reasserts the identical
  final definitions and permissions.
- Partial state: one or two of the three identifying artifacts are present.
  The migration rejects the deployment and rolls back.
- Any additional index with the same `(clinic_id, id)` key order is rejected in
  both deferred and clean-replay states, so the final index identity remains
  exact.

The final helper is `SECURITY DEFINER`, owned by `postgres`, uses the fixed
`pg_catalog` search path, is executable only by `authenticated`, and continues
to authorize every returned clinic through `app_private.can_access_clinic`.
The blocks trigger function remains `SECURITY INVOKER`. The two RLS policies
remain `TO authenticated` and use the DB-authoritative clinic helper.

## Verification and rollback

- A clean local migration replay must apply both the original and recovery
  migrations successfully.
- `commercial:verify:pr11:deferred:local` must refuse non-loopback databases
  and require the explicit `PR11_DEFERRED_LOCAL_RESET_APPROVED=1` opt-in. It
  resets the local test database through `20260716160402`, repairs
  `20260718011731` as history-only, proves that the three identifying artifacts
  are absent, applies the remaining migrations, runs the full pgTAP suite and
  executes the validation-only rollback guard. It then restores the local test
  database to the full migration head. Local test data is intentionally
  destructive; no linked or hosted database is addressed by this verifier.
- Existing PR-11 pgTAP tests remain the behavioral and tenant-isolation proof
  for the final state.
- Static Jest checks bind the recovery migration to this specification,
  validation-only rollback, approved history, idempotent DDL, bounded rollout,
  and exact postflight markers.
- Rollback is validation-only. Reverting to the slower or pre-fix authorization
  path is not automated; any corrective change must be a new reviewed
  append-only migration. The guard verifies the function, trigger, source
  helpers, table owner/RLS/ACL, policy, index, blocks FK/unique contracts and
  all three cross-table clinic relationships before returning success.
