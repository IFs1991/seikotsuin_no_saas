# PR-04 local clean replay after-state

- Date: 2026-07-13 (Asia/Tokyo)
- Command: `supabase db reset --local --no-seed`
- Approval: explicit destructive-operation approval obtained before execution
- Scope: local Supabase only; no linked, hosted, staging, or production change
- Result: PASS

The reset recreated the database and applied all 53 repository migrations from
`00000000000001_squashed_baseline.sql` through
`20260713004754_commercial_function_execution_hardening.sql`. Seed execution
was intentionally disabled so the result proves migration-only bootstrap
reproducibility.

## Post-replay verification

- `supabase test db --local`: PASS, 7 files / 133 tests.
- `npm run commercial:red:db`: PASS, 7 expected GREEN / 3 intentionally RED
  for later phases.
- Security-preserving rollback guard: PASS via local container `psql`; the
  guard emitted its forward-fix notice and committed no catalog change.
- Fail-closed negative probe: PASS. An `anon` EXECUTE grant on
  `app_private.get_sibling_clinic_ids(uuid)` injected inside the guard
  transaction was rejected as `unexpected`; connection rollback left
  `has_function_privilege(...)=false` afterward.
- Migration history rows: 53.
- Last applied migration: `20260713004754`.
- Reviewed SECURITY DEFINER routines: 3 / 3.
- Explicit RLS-helper EXECUTE grants: 26 / 26.
- Exact non-owner `app_private` EXECUTE matrix: 28 / 28, with no missing or
  unexpected role grant.
- Exact non-owner `app_private` schema-privilege matrix: 4 / 4 `USAGE`, with
  no missing or unexpected privilege.
- `app_private` PUBLIC EXECUTE entries: 0.
- Reviewed trigger-function client EXECUTE pairs: 0.
- Unsafe global function-default entries: 0.
- Unsafe explicit global/`public`/`app_private` function-default entries: 0.

The exact 15-routine after-state is captured in
`function-boundary-local-after.csv`.
