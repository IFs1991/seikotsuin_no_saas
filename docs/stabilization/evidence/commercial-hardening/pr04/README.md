# Commercial hardening PR-04 evidence

## Scope

PR-04 fixes one mutable routine path, removes client execution from two
SECURITY DEFINER trigger functions, removes inherited PUBLIC execution from
the non-exposed `app_private` schema, and limits the configured custom access
token hook to `supabase_auth_admin`.

The source specifications are
`docs/stabilization/spec-commercial-hardening-migration-v1.0.md` Sections
9.1-9.4 / PR-04 and
`docs/stabilization/spec-commercial-function-execution-hardening-v1.0.md`.

## Before state and RED

- `COMM-FUNCTION-001`: RED reproduced for
  `update_reservation_notifications_updated_at()` and
  `validate_shift_requests_clinic_refs()`.
- `COMM-FUNCTION-002`: RED reproduced for
  `normalize_customer_phone(text)`.
- PR-00 catalog evidence:
  `../functions-local-before.csv`, `../function-callers-local-before.csv`, and
  `../function-dependencies-local-before.csv`.
- Hosted Advisor evidence: `../advisor-security-before.json`.

The local database used for read-only preflight was stale before PR-02/PR-03.
It reported RLS disabled on `master_categories`, `master_patient_types`,
`master_payment_methods`, `menu_categories`, `treatment_menu_records`, and
`treatments`. That database is not post-PR-03 validation evidence, and PR-04
does not auto-apply the unrelated RLS remediation.

## Reviewed artifacts

- `security-definer-matrix.csv`: every cataloged SECURITY DEFINER routine from
  the before inventory, the direct PR-04 invoker target, and the remote-only
  drift item.
- `extension-preflight.md`: local/hosted facts, dependency, and deferral
  decision for `btree_gist`.
- `docs/operations/COMMERCIAL_PR04_LEAKED_PASSWORD_PROTECTION.md`: authorized
  hosted Auth change and verification procedure.
- `clean-replay-local-after.md`: approved local clean replay and exact
  post-replay boundary counts.
- `hosted-db-after.md`: approved linked-project migration apply, exact remote
  ACL counts, and Security Advisor after-state.
- `hosted-auth-plan-gate.md`: Supabase paid-plan rejection, confirmed no-change
  outcome, user-approved skip, and reopen conditions.

## Expected catalog after replay

- `normalize_customer_phone(text)` has
  `search_path=public, auth, extensions`.
- Neither reviewed trigger function is executable by `anon` or
  `authenticated`.
- No `app_private` function has inherited PUBLIC EXECUTE.
- The exact 28-entry non-owner `app_private` EXECUTE matrix contains no
  missing or unexpected named-role grant.
- The exact four-entry non-owner `app_private` schema matrix contains only the
  reviewed `USAGE` grants.
- `app_private.custom_access_token_hook(jsonb)` is executable by
  `supabase_auth_admin`, not by `anon`, `authenticated`, or `service_role`.
- Future postgres-owned functions do not inherit PUBLIC/client EXECUTE.
- Both production trigger bindings remain unchanged.

## Verification status

- `npm run commercial:red:db`: PASS. Seven contracts are GREEN through PR-04;
  the three PR-05/PR-08 contracts remain intentionally RED.
- `supabase migration up --local`: PASS through
  `20260713004754_commercial_function_execution_hardening` after explicit
  approval. This was an incremental local apply, not a clean reset/replay.
- `supabase db reset --local --no-seed`: PASS after explicit approval. All 53
  migrations replayed from baseline through PR-04.
- `supabase test db --local`: PASS, 7 files / 133 tests after clean replay.
- `commercial-pr04-migration-contract.test.ts`: PASS, 9 tests.
- Security/session Jest: PASS, 23 suites / 224 tests.
- Pre-refactor full Jest with the local invite skip flag explicitly neutralized:
  PASS, 388 suites / 3008 tests / 2 skipped. The first run inherited
  `.env.test` `E2E_INVITE_MODE=skip` and failed the two delivery-mode invite
  assertions; the focused suite and full suite both passed with
  `E2E_INVITE_MODE=disabled`, matching CI where `.env.test` is not created.
- Post-refactor full Jest: `NOT PASS` because three pre-existing E2E harness
  suites ran without their required fixture/mocking mode after `--no-seed`.
  `cross-clinic-isolation.e2e.test.ts` treats the object returned by
  `validateTestEnvironment()` as a boolean and therefore does not honor its
  `shouldSkip` flag; `auth-login-flow.test.ts` and `happy-path.test.ts` also
  observed their existing redirect-mock mismatch. PR-04 tests passed in that
  run, and these unrelated E2E tests were not changed to force GREEN.
- Post-refactor broad Jest with E2E excluded and invite delivery enabled:
  388 suites / 3010 tests PASS, 2 skipped. The only failing suite was the
  intentionally RED PR-08 atomic-invite contract (`RED COMM-INVITE-003`),
  because the CLI path override also replaced Jest's configured RED-contract
  exclusion. `npm run commercial:red:db` separately confirms the current
  phase expects the invite contract to remain RED.
- Post-refactor CI-equivalent Jest (`--testPathIgnorePatterns e2e red-contracts`
  with `E2E_INVITE_MODE=disabled`): PASS, 388 suites / 3010 tests / 2 skipped.
- `npm run type-check`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS with pre-existing warnings.
- `npm run commercial:verify:migrations`: PASS, 50 frozen / 3 appended.
- Linked hosted database apply: PASS. `migration list` identified only
  `20260713004754`, `db push --dry-run` confirmed that single migration, and
  the subsequent push and post-apply `migration list` both succeeded.
- Hosted-after catalog: 12 `app_private` functions, exact 28-entry non-owner
  EXECUTE matrix, zero PUBLIC EXECUTE, and exact four-role non-owner schema
  `USAGE` matrix. The Security Advisor reports no PR-04 function-execution
  finding.
- Local-after catalog: zero exposed tables without RLS, zero unsafe postgres
  future-function defaults, zero PUBLIC execute entries across all 12
  `app_private` functions. The full 15-routine target/private after-state is in
  `function-boundary-local-after.csv`; clean replay counts are in
  `clean-replay-local-after.md`.
- Generated-type parity: `UNVERIFIED`. Repository pin is Supabase CLI
  `2.109.0`, while the installed CLI is `2.109.1`; the verifier correctly
  failed fast and neither the pin nor `src/types/supabase.ts` was changed.
- Extension relocation: `DEFERRED`; Advisor warning remains a residual risk.
- Hosted leaked-password protection: `SKIPPED_PLAN_GATED`. Supabase rejected
  the authorized Dashboard update because the feature requires Pro or above;
  no Auth configuration change was applied, and the user approved continuing
  PR-04 with this explicit residual risk.
- Auth E2E and hosted Auth-after verification: `NOT_RUN` because the setting
  remained disabled.

### Trigger direct-call test limitation

A pgTAP `throws_ok` attempt to call
`update_reservation_notifications_updated_at()` directly as `anon` terminated
the local PostgreSQL 17.6 backend with SIGSEGV. A separate connection launched
with `PGOPTIONS=-c role=anon` reproduced the trigger-function backend crash,
and a pgTAP role-switched denial probe against the JSONB-returning Auth hook
also terminated the backend. The database recovered automatically after each
probe and reported `pg_is_in_recovery() = false`. The unsafe direct probes were
removed. The final contract uses exact ACL/effective-privilege assertions for
all private functions and the Auth hook, exercises both routines through real
PostgreSQL trigger execution on test-owned temporary tables, and separately
verifies the production trigger bindings in catalog. Auth E2E remains a
hosted/staging release gate.
