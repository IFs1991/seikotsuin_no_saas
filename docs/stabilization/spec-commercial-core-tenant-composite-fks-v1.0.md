# Commercial hardening PR-05: core tenant composite foreign keys

## Status

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-05
- Status: implemented; local verification PASS; hosted rollout not performed
- Base: PR-04 closeout commit `f65bfdea`
- Forward migration:
  `20260714041848_commercial_core_tenant_composite_fks.sql`
- Recovery guard:
  `20260714041848_commercial_core_tenant_composite_fks_rollback.sql`
  (validation-only; local execution PASS)

## Objective

Enforce the same-clinic relationship between the core reservation, customer,
menu, resource, care, insurance, and menu-billing records in PostgreSQL. The
database must reject cross-clinic inserts, updates, and parent `clinic_id`
rehoming even when an application or existing validation trigger is bypassed.

This PR changes no RLS policy, grant, role, function body, application route,
or UI behavior.

## Resolved catalog scope

The program specification lists `reservations.resource_id` as a candidate.
That column does not exist. PR-00 catalog evidence, generated types, the
current single-column foreign key, and runtime writers all identify
`reservations.staff_id` as the resource reference. PR-05 therefore uses the
catalog-derived relation below and does not add or rename an application
column.

| Child columns | Parent columns | Final constraint name | Delete action |
|---|---|---|---|
| `reservations(customer_id, clinic_id)` | `customers(id, clinic_id)` | `reservations_customer_id_fkey` | `RESTRICT` |
| `reservations(menu_id, clinic_id)` | `menus(id, clinic_id)` | `reservations_menu_id_fkey` | `RESTRICT` |
| `reservations(staff_id, clinic_id)` | `resources(id, clinic_id)` | `reservations_staff_id_fkey` | `RESTRICT` |
| `blocks(resource_id, clinic_id)` | `resources(id, clinic_id)` | `blocks_resource_id_fkey` | `CASCADE` |
| `care_episodes(customer_id, clinic_id)` | `customers(id, clinic_id)` | `care_episodes_customer_id_fkey` | `CASCADE` |
| `customer_insurance_coverages(customer_id, clinic_id)` | `customers(id, clinic_id)` | `customer_insurance_coverages_customer_id_fkey` | `CASCADE` |
| `menu_billing_profiles(menu_id, clinic_id)` | `menus(id, clinic_id)` | `menu_billing_profiles_menu_id_fkey` | `CASCADE` |

All seven constraints remain `MATCH SIMPLE`, `ON UPDATE NO ACTION`, and
`NOT DEFERRABLE`. Existing names are preserved because
`getReservationConstraintErrorMessage()` and generated PostgREST relationship
metadata use those names.

## Before-state evidence

PR-00 recorded zero orphan and zero cross-clinic mismatch rows for all seven
relations. The recorded hosted snapshot checked 21 reservation rows and one
menu-billing profile; the recorded local snapshot checked 12 reservation rows.
The fresh PR-04 local stack on 2026-07-14 is migration
`20260713004754` on PostgreSQL 17.6 and currently has zero rows in all seven
child relations. These snapshots are evidence only; the migration repeats the
null, orphan, mismatch, duplicate, and exact-catalog checks and aborts on any
drift.

Current target tables are pilot-sized locally (largest total relation size is
`reservations` at 294,912 bytes). Hosted rollout still requires fresh size,
lock, and timing evidence; the historical row counts are not deployment
approval.

## RED evidence

- `COMM-FK-003` requires the exact seven validated composite FK definitions.
- `COMM-FK-002` requires a referenced customer parent rehome to fail through
  `reservations_customer_id_fkey`.
- Both contracts fail against the PR-04 base. The aggregate `COMM-FK-001`
  intentionally remains RED after PR-05 because it also covers the eleven
  PR-06 operational/report relations.
- `commercial-pr05-migration-contract.test.ts` fails until the paired PR-05
  migration and recovery guard exist.

## Implementation contract

### Preflight

- Require the exact seven validated single-column FK definitions and their
  current update/delete behavior.
- Require the exact existing `customers_id_clinic_unique` contract.
- Require all expected tables to be ordinary, non-partitioned tables and all
  involved identifiers to be non-null UUID columns.
- Reject conflicting future constraint or index names.
- Reject alternate-name single or composite target FKs by unordered key-set,
  including reversed column order.
- Abort on any child null, orphan, cross-clinic mismatch, parent null, or
  duplicate `(id, clinic_id)` pair.
- Snapshot RLS flags, relation ACLs, policies, and non-internal trigger
  bindings for a postflight no-drift comparison.

### DDL

- Reuse `customers_id_clinic_unique`.
- Add `menus_id_clinic_unique` and `resources_id_clinic_unique`.
- Add seven full, non-partial B-tree indexes in FK column order.
- Add temporary composite FKs as `NOT VALID`, validate every constraint, drop
  the corresponding single-column FK, and rename the validated composite FK
  to the existing stable name.
- Keep existing singleton, clinic-first, and partial indexes. Index removal is
  deferred to PR-11 and requires workload evidence.

### Postflight

- Require an exact bidirectional seven-FK matrix with no surviving structural
  single-column counterpart.
- Require exactly four enabled internal RI triggers per FK (28 total).
- Require the three exact parent unique constraints and seven exact child
  indexes to be valid and ready.
- Re-run all data preflights.
- Reject any RLS, ACL, policy, or user-trigger drift.

## Lock and rollout contract

The migration uses one atomic transaction with bounded `lock_timeout` and
`statement_timeout`. Regular index creation and parent unique constraints can
block writes, and an `ADD FOREIGN KEY NOT VALID` lock remains held through
validation inside the same transaction. This atomic pilot path is acceptable
only after staging-equivalent timing and lock observation confirms the tables
remain small. A timeout or material hosted size increase is an abort, not a
reason to increase the timeout blindly; concurrent index preparation would
require a separate reviewed migration.

Local reset or migration application and every hosted operation require the
approvals in `AGENTS.md`. The implementation run used an explicitly approved
local-only clean reset; no hosted query or apply was performed.

## Rollback / forward-fix

The paired recovery SQL is validation-only. It must not drop composite FKs,
parent unique constraints, or supporting indexes, and must not restore the
single-column-only tenant model. It validates the exact FK/unique/index
matrices, 28 enabled RI triggers, required non-null UUID columns, data
integrity, and RLS-enabled state under bounded transaction-local timeouts. On
regression, disable the affected write path, preserve the hardened database
boundary, and ship a reviewed forward-fix.

## Verification contract

- RED contract proof on the PR-04 base.
- Clean local replay after explicit approval.
- `commercial_core_tenant_fks_test.sql` catalog and behavioral coverage.
- Aggregate/focused commercial contract runner.
- Generated Supabase type regeneration and full-file parity.
- Focused migration Jest, security Jest, full Jest, type checks, lint, build,
  migration-history integrity, and secret scan.
- At least two independent read-only post-implementation audits, including
  migration safety and tenant-boundary review.

Local verification on 2026-07-14 completed the clean replay, 173 pgTAP tests,
focused/aggregate commercial contracts, generated-type parity, focused and
full Jest, both TypeScript checks, CI lint, production build, migration-history
integrity, secret scan, recovery guard, and independent migration/tenant
audits. Exact commands and counts are recorded in the paired PR-05 evidence.

## DoD mapping

- DOD-01: local Supabase readiness before DB verification.
- DOD-02: clean replay and constraint identity stability.
- DOD-04: exact constraint/index catalog and lock evidence.
- DOD-08: fail-closed clinic relationship enforcement and RLS no-drift proof.
- DOD-10: production build.
- DOD-11: focused, security, and full Jest regression.
- DOD-12: regenerated Supabase type parity.

## Residual / excluded

- PR-06 report/operational composite FKs remain intentionally RED.
- PR-11 index retirement and Advisor performance cleanup are excluded.
- Staging, production application, canary, and 24h/72h monitoring are not part
  of this implementation branch and require separate human approval.
