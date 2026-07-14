# Commercial hardening PR-06 evidence

## Scope

PR-06 hardens only the eleven report and operational tenant relationships in
Section 7.3 of the commercial migration program. The catalog-derived daily
report item columns are `customer_insurance_coverage_id` and
`staff_resource_id`; the stale candidate aliases are not used.

## Base and before state

- Branch base: PR-05 merge commit
  `d6dd9dd7811c1504c055d8bcabcfb30064f36295`.
- Local database before migration: PostgreSQL 17.6, latest migration
  `20260714041848`.
- All eleven local child relations: zero rows, null-contract violations,
  orphans, and cross-clinic mismatches.
- Local `daily_reports`: zero rows and zero null `clinic_id` values; the column
  is currently nullable in the catalog.
- No hosted read or write was performed for this branch.

## RED proof

On 2026-07-14, before the PR-06 migration:

| Verification                                              | Result                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run commercial:red:db` on the untouched PR-05 schema | PASS — all 11 original phase expectations matched; aggregate `COMM-FK-001` was RED |
| PR-06 dedicated catalog contract                          | PASS — `COMM-FK-004` matched RED                                                   |
| PR-06 daily-report parent rehome fixture                  | PASS — `COMM-FK-005` matched RED                                                   |
| Focused `commercial-pr06-migration-contract.test.ts`      | Expected RED — failed because no PR-06 migration existed                           |

The DB runner was then extended to 13 phase contracts so the two dedicated
PR-06 contracts were explicitly RED before implementation. The aggregate and
two focused entries advance to GREEN expectation only in the completed source.

## Implementation evidence

- Forward migration:
  `supabase/migrations/20260714120318_commercial_report_operational_tenant_composite_fks.sql`.
- Validation-only recovery guard:
  `supabase/rollbacks/20260714120318_commercial_report_operational_tenant_composite_fks_rollback.sql`.
- Behavioral pgTAP:
  `supabase/tests/commercial_report_operational_tenant_fks_test.sql` with 81
  assertions covering the exact catalog, same-clinic insert/update,
  cross-clinic rejection, nullable relationships, parent rehome rejection, and
  delete semantics for all eleven relationships. The 33 cross-clinic and
  rehome assertions require SQLSTATE `23503` plus the exact PostgreSQL error
  message containing the intended constraint name.
- The migration was created by the locally installed Supabase CLI `2.109.1`.
  The repository-pinned `2.109.0` was subsequently found in the existing npm
  cache and its exact binary passed `.supabase-cli-version` verification. No
  dependency file or lockfile changed.

## Verification evidence

On 2026-07-14:

| Verification                                                                                             | Result                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Forward migration executed against local PostgreSQL 17.6 inside a rollback-only verification stream      | PASS — all preflight, DDL, validation, and postflight checks completed                                                                                 |
| Migration plus `commercial_report_operational_tenant_fks_test.sql` in the same rollback-only transaction | PASS — `1..81`, all 81 assertions `ok`, including exact rejecting constraint names                                                                     |
| Transaction close and post-check                                                                         | PASS — final `ROLLBACK`; the temporary verification stream left the PR-05 schema unchanged                                                             |
| Explicitly approved `supabase db reset --local --no-seed --yes`                                          | PASS — clean persistent replay applied every migration through `20260714120318` to the local stack only                                                |
| Persistent catalog post-check                                                                            | PASS — migration head `20260714120318`, `daily_reports.clinic_id` is non-nullable, and all 11 target composite FKs are validated                       |
| `supabase test db` with pinned CLI `2.109.0`                                                             | PASS — 9 files, 254 assertions                                                                                                                         |
| `npm run commercial:red:db` against the completed schema                                                 | PASS — all 13 phase expectations matched; `COMM-FK-001`, `COMM-FK-004`, and `COMM-FK-005` are GREEN, while the later invite phase remains expected RED |
| Pinned generated-type regeneration and full-file parity                                                  | PASS — exact CLI `2.109.0`; schema matches and the committed PostgREST runtime metadata `14.5` was preserved                                           |
| Focused static migration contract Jest                                                                   | PASS — 1 suite, 9 tests                                                                                                                                |
| Focused report/reservation/notification Jest                                                             | PASS — 18 suites, 125 tests                                                                                                                            |
| Focused mobile daily-report Playwright                                                                   | PASS — 1 test; local fixture validation, seed, mutation, and cleanup all completed                                                                     |
| CI-equivalent non-E2E Jest                                                                               | PASS — 390 suites; 3,027 passed and 2 skipped tests                                                                                                    |
| `npm run type-check`                                                                                     | PASS                                                                                                                                                   |
| `npm run lint`                                                                                           | PASS                                                                                                                                                   |
| `npm run commercial:verify:migrations`                                                                   | PASS — append-only history, 50 frozen and 5 appended                                                                                                   |
| `npm run scan:secrets`                                                                                   | PASS                                                                                                                                                   |
| Prettier check for changed TypeScript/JavaScript/Markdown                                                | PASS                                                                                                                                                   |
| `npm run build` with non-secret local placeholder values for the four required build-time variables      | PASS — generated types included; existing non-blocking warnings only                                                                                   |

For the non-persistent DB run, PowerShell read the unchanged migration into
memory and replaced only its terminal `commit;` in the piped verification
stream. The source file retained its real `commit;`. The same `psql` connection
then executed the migration, a transaction-local pgTAP extension, and the test
file; the test file's final `ROLLBACK` reverted the entire stream.

The broad all-glob Jest invocation reported 391 passing, 3 failing, and 3
skipped suites; 3,036 passing, 4 failing, and 21 skipped tests. The two
`cross-clinic-isolation.e2e.test.ts` failures run unintentionally because that
file treats the object returned by `validateTestEnvironment()` as a boolean;
the shared Jest Supabase mock then returns no database error instead of the
expected real `42501`. The two auth happy-path failures reproduce in isolated
reruns and are unrelated to the PR-06 database objects. The same
`cross-clinic` harness defect is already recorded in PR-04 evidence. PR-06
does not weaken the security assertion or mix an unrelated baseline test-harness
fix into this change.

An exploratory Playwright invocation across the full mobile smoke, legacy
happy path, and reservation UI files passed 6 of 12 tests. Its six failures
were login/navigation or seeded-row presentation assertions outside the PR-06
database-object scope. The PR-06-relevant daily-report mutation passed in that
run and then passed again as a standalone 1-test gate; global teardown cleaned
the local E2E fixtures after both runs.

The repository's CI-equivalent command was
`npm run test -- --ci --testPathIgnorePatterns e2e red-contracts`; it completed
with all 390 selected suites passing.

## Independent read-only audits

Two post-implementation auditors independently inspected the final migration,
recovery guard, RED contracts, pgTAP, generated types, static contracts, spec,
and evidence without editing files or mutating the database:

- Database schema and migration-safety audit: PASS, no blocking findings. It
  confirmed the generated-type and persistent-replay blockers from its earlier
  review are resolved.
- Tenant-boundary red-team audit: PASS, no findings. It confirmed fail-closed
  preflight/postflight behavior, all 33 exact cross-clinic or parent-rehome
  rejections, delete semantics, and RLS/ACL/policy/user-trigger no-drift.

Both audits leave hosted freshness, table-size, and lock-timing checks for the
separately approved rollout gate.

## Hosted / production

Not queried or applied. Fresh hosted read-only preflight and explicit human
approval are mandatory before any rollout.
