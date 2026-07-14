# Commercial hardening PR-05 evidence

## Scope

PR-05 adds only the seven core tenant composite foreign keys defined in
`spec-commercial-core-tenant-composite-fks-v1.0.md`. The catalog-derived
resource column is `reservations.staff_id`; the program document's candidate
`resource_id` label is stale.

## Base and before state

- Branch base: PR-04 closeout `f65bfdea`.
- Local database before migration: PostgreSQL 17.6, latest migration
  `20260713004754`.
- Fresh local counts on 2026-07-14: all seven child relations had 0 rows,
  nulls, orphans, and cross-clinic mismatches.
- PR-00 recorded hosted evidence: reservation relations 21 rows, menu billing
  relation 1 row, all other core relations 0; all orphan and mismatch counts
  were 0.
- No fresh hosted query or hosted mutation was performed for PR-05.

Local relation-size snapshot before migration:

| Table | Heap bytes | Total bytes |
|---|---:|---:|
| `blocks` | 0 | 73,728 |
| `care_episodes` | 0 | 32,768 |
| `customer_insurance_coverages` | 0 | 24,576 |
| `customers` | 8,192 | 237,568 |
| `menu_billing_profiles` | 0 | 24,576 |
| `menus` | 8,192 | 188,416 |
| `reservations` | 8,192 | 294,912 |
| `resources` | 8,192 | 147,456 |

## RED proof

Before the migration, `npm run commercial:red:db` produced the expected PR-05
phase failure:

- `04_required_composite_fks.sql`: aggregate `COMM-FK-001` matched RED.
- `04a_core_composite_fks.sql`: `COMM-FK-003` rejected all seven old
  single-column definitions.
- `05_parent_rehome_fixture.sql`: `COMM-FK-002` proved the customer parent
  rehome was still allowed.

The aggregate contract remains RED through PR-05 because eleven PR-06
relations are intentionally out of scope.

## Implementation evidence

- Forward migration:
  `supabase/migrations/20260714041848_commercial_core_tenant_composite_fks.sql`.
- Validation-only recovery guard:
  `supabase/rollbacks/20260714041848_commercial_core_tenant_composite_fks_rollback.sql`.
- The migration reuses `customers_id_clinic_unique`, adds the exact menu and
  resource parent unique constraints, and adds seven ordered, full child
  indexes.
- Seven `NOT VALID` composite FKs are validated before the old single-column
  constraints are dropped. The validated constraints are then renamed to the
  seven stable application/PostgREST names.
- Preflight and postflight reject catalog, data, RLS, ACL, policy, user-trigger,
  alternate-name FK, key-order, RI-trigger, and supporting-index drift.
- `src/types/supabase.ts` was regenerated with pinned Supabase CLI `2.109.0`.
  All target relationship entries now use `(foreign_id, clinic_id)` and
  `(id, clinic_id)` pairs while retaining stable FK names.
- No RLS policy, grant, role, function body, route, UI, dependency, or lockfile
  was changed.

## Verification evidence

All results below are from 2026-07-14 and the final source contents.

| Verification | Result |
|---|---|
| Pinned CLI | PASS — `supabase:cli:verify`, version `2.109.0` |
| Clean replay | PASS — `db reset --local --no-seed` through migration `20260714041848` after explicit approval |
| pgTAP | PASS — 8 files / 173 tests, including 40 PR-05 catalog and behavior tests |
| Commercial RED/GREEN runner | PASS — all 11 phase expectations matched; PR-05 `COMM-FK-003` and `COMM-FK-002` are GREEN |
| Recovery guard | PASS — transaction-local timeouts + validation-only DO via local container `psql`; no DDL/data change |
| Generated type parity | PASS — local schema matches the committed file; only permitted local/remote PostgREST metadata differs (`null` vs `14.5`) |
| PR-02 through PR-05 migration contracts | PASS — 4 suites / 53 tests |
| `test:pr05:focused` | PASS — 9 suites / 135 tests |
| Security/session Jest | PASS — 24 suites / 234 tests |
| CI-equivalent full Jest | PASS — 389 suites / 3,018 passed / 2 skipped (`E2E` and intentional RED-contract paths excluded) |
| TypeScript | PASS — `type-check` and `type-check:commercial` |
| CI lint | PASS — 0 errors / 131 existing out-of-scope warnings, below the configured 183-warning ceiling |
| Production build | PASS — Next.js production build completed; existing out-of-scope lint warnings were reported |
| Migration history | PASS — 50 frozen / 4 appended |
| Secret scan | PASS |
| Independent migration-safety audit | PASS after all findings were remediated and re-audited |
| Independent tenant-boundary red-team | PASS after all findings were remediated and re-audited |

The final focused contract also checks unordered duplicate key sets and all 28
internal RI triggers. The recovery guard independently checks the exact
FK/unique/index matrices, non-null UUID columns, null/orphan/mismatch counts,
RI-trigger state, and RLS-enabled state.

## Hosted / production

Not run. This branch does not authorize staging or production application.
Fresh hosted row counts, relation sizes, lock timing, staged migration timing,
canary observation, and hosted generated-type parity remain release gates.
