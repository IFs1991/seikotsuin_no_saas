# Commercial hardening PR-06: report and operational tenant composite foreign keys

## Status

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-06
- Status: implementation and local verification complete; hosted rollout not performed
- Base: PR-05 merge commit `d6dd9dd7811c1504c055d8bcabcfb30064f36295`
- Forward migration:
  `supabase/migrations/20260714120318_commercial_report_operational_tenant_composite_fks.sql`
- Recovery guard:
  `supabase/rollbacks/20260714120318_commercial_report_operational_tenant_composite_fks_rollback.sql`

## Objective

Enforce the same-clinic relationship for daily reports, daily-report items,
item tags, reservation history, and reservation notification state in
PostgreSQL. The database must reject cross-clinic inserts, updates, and parent
`clinic_id` rehoming even when a service-role writer or an existing validation
trigger is bypassed.

This PR changes no RLS policy, grant, role, function body, application route,
or UI behavior. Existing validation triggers remain enabled because they also
enforce report-date, customer, care-episode, and coverage invariants that are
not represented by these foreign keys.

## Resolved catalog scope

The program candidate table uses the shorthand `coverage_id` and
`resource_id`. Those columns do not exist on `daily_report_items`. PR-00
catalog evidence, generated types, and runtime writers identify the actual
columns as `customer_insurance_coverage_id` and `staff_resource_id`. The tag
relation uses column `daily_report_item_id` while preserving the established
constraint name `daily_report_item_tags_item_id_fkey`.

| Child columns                                                   | Parent columns                                | Final constraint name                                    | Delete action                               |
| --------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `daily_report_items(daily_report_id, clinic_id)`                | `daily_reports(id, clinic_id)`                | `daily_report_items_daily_report_id_fkey`                | `CASCADE`                                   |
| `daily_report_items(reservation_id, clinic_id)`                 | `reservations(id, clinic_id)`                 | `daily_report_items_reservation_id_fkey`                 | `SET NULL (reservation_id)`                 |
| `daily_report_items(customer_id, clinic_id)`                    | `customers(id, clinic_id)`                    | `daily_report_items_customer_id_fkey`                    | `SET NULL (customer_id)`                    |
| `daily_report_items(care_episode_id, clinic_id)`                | `care_episodes(id, clinic_id)`                | `daily_report_items_care_episode_id_fkey`                | `SET NULL (care_episode_id)`                |
| `daily_report_items(customer_insurance_coverage_id, clinic_id)` | `customer_insurance_coverages(id, clinic_id)` | `daily_report_items_customer_insurance_coverage_id_fkey` | `SET NULL (customer_insurance_coverage_id)` |
| `daily_report_items(menu_id, clinic_id)`                        | `menus(id, clinic_id)`                        | `daily_report_items_menu_id_fkey`                        | `SET NULL (menu_id)`                        |
| `daily_report_items(menu_billing_profile_id, clinic_id)`        | `menu_billing_profiles(id, clinic_id)`        | `daily_report_items_menu_billing_profile_id_fkey`        | `SET NULL (menu_billing_profile_id)`        |
| `daily_report_items(staff_resource_id, clinic_id)`              | `resources(id, clinic_id)`                    | `daily_report_items_staff_resource_id_fkey`              | `SET NULL (staff_resource_id)`              |
| `daily_report_item_tags(daily_report_item_id, clinic_id)`       | `daily_report_items(id, clinic_id)`           | `daily_report_item_tags_item_id_fkey`                    | `CASCADE`                                   |
| `reservation_history(reservation_id, clinic_id)`                | `reservations(id, clinic_id)`                 | `reservation_history_reservation_id_fkey`                | `CASCADE`                                   |
| `reservation_notifications(reservation_id, clinic_id)`          | `reservations(id, clinic_id)`                 | `reservation_notifications_reservation_id_fkey`          | `CASCADE`                                   |

All eleven constraints remain `MATCH SIMPLE`, `ON UPDATE NO ACTION`, and
`NOT DEFERRABLE`. The seven optional relationships use PostgreSQL's
column-list `SET NULL` form so only the nullable foreign identifier is cleared;
`daily_report_items.clinic_id` remains non-null and unchanged.

## Parent tenant-key contract

PR-05 already provides exact validated `(id, clinic_id)` unique constraints on
`reservations`, `customers`, `menus`, and `resources`. PR-06 adds the same
contract to `daily_reports`, `care_episodes`,
`customer_insurance_coverages`, `menu_billing_profiles`, and
`daily_report_items`.

`daily_reports.clinic_id` is currently a nullable UUID even though runtime
writers always provide it. The migration must count null rows and abort if any
exist; it must never infer or backfill ownership. With a zero-null preflight it
sets the column `NOT NULL` before adding `daily_reports_id_clinic_unique`.

## Before-state evidence

The local PR-05 schema runs PostgreSQL 17.6 at migration
`20260714041848`. All eleven local child relations currently contain zero rows,
orphans, or cross-clinic mismatches. Local `daily_reports` contains zero rows
and zero null `clinic_id` values. All target tables are pilot-sized locally;
the largest target total relation size is `reservations` at 344,064 bytes.

Historical PR-00 hosted evidence recorded 12 daily-report-item links, one tag,
62 reservation-history links, and zero notification links with zero recorded
orphans or mismatches. It did not record the total current
`daily_reports.clinic_id IS NULL` count. Fresh hosted read-only preflight,
sizes, and lock observation are therefore mandatory before any separately
approved hosted rollout.

## RED evidence

- Aggregate `COMM-FK-001` rejects the eleven remaining single-column
  definitions.
- Dedicated `COMM-FK-004` rejects catalog drift for the exact eleven composite
  definitions, stable names, delete-set columns, and RI-trigger state.
- Dedicated `COMM-FK-005` proves a referenced daily-report parent can still be
  rehomed across clinics on the PR-05 base.
- `commercial-pr06-migration-contract.test.ts` fails until the paired PR-06
  migration and recovery guard exist.

On 2026-07-14, `npm run commercial:red:db` matched all current phase
expectations, including RED for `COMM-FK-001`, `COMM-FK-004`, and
`COMM-FK-005`. The focused Jest contract failed at the missing migration
suffix, which is the intended pre-implementation state.

## Implementation contract

### Preflight

- Require prerequisite migration `20260714041848` and the exact eleven current
  validated single-column FK definitions, including update/delete behavior,
  match type, deferrability, and absent delete-set column lists.
- Require the four existing parent tenant unique constraints and require the
  five future tenant unique constraints to be absent before DDL.
- Require ordinary, non-partitioned target tables and exact UUID column types.
  Require all clinic keys and mandatory identifiers to be non-null; require the
  seven optional foreign identifiers to remain nullable.
- Reject conflicting future constraint/index names and reject alternate-name
  or reversed-order structural single/composite FKs.
- Abort on parent nulls, duplicate `(id, clinic_id)` pairs, mandatory child
  nulls, orphans, or cross-clinic mismatches. Optional relationships only
  evaluate orphan/mismatch checks when their foreign identifier is non-null.
- Snapshot RLS flags, relation ACLs, policies, and all non-internal trigger
  bindings for a postflight no-drift comparison.

### DDL

- Set `daily_reports.clinic_id NOT NULL` only after the zero-null preflight.
- Add five exact parent tenant unique constraints.
- Add eleven full, non-partial B-tree indexes in child FK column order.
- Add temporary composite FKs as `NOT VALID`; use explicit one-column
  `ON DELETE SET NULL (<foreign-id>)` for the seven optional relations.
- Validate all eleven constraints before dropping any corresponding
  single-column FK, then rename each validated composite FK to its stable name.
- Preserve all existing singleton, clinic-first, unique, and partial indexes.
  Index retirement remains PR-11 scope and requires workload evidence.

### Postflight

- Require an exact bidirectional eleven-FK matrix with no surviving structural
  single-column/composite counterpart under another name.
- Require exactly four enabled internal RI triggers per FK (44 total).
- Resolve `pg_constraint.confdelsetcols` attribute numbers back to names and
  require exactly the intended foreign-ID column for each `SET NULL` FK; require
  null delete-set metadata for all four `CASCADE` FKs.
- Require the nine exact parent unique constraints and eleven exact child
  indexes to be valid and ready.
- Re-run all data checks and reject any RLS, ACL, policy, or user-trigger drift.

## Behavioral test contract

The rollback-only pgTAP test must isolate the database constraints from
application validation triggers and run mutation fixtures with service-role
authority. For all eleven relationships it proves same-clinic insert/update,
cross-clinic insert/update rejection with SQLSTATE `23503`, exact parent
rehoming rejection, and the required delete behavior. Seven nullable parent
deletes must retain the child and `clinic_id` while nulling only the foreign
identifier. Four cascade deletes must remove the intended child. Reservation
delete fixtures disable the unrelated `reservation_deleted_log` user trigger
inside the test transaction so it cannot mask the FK under test.

The completed test contains 81 assertions. A non-persistent verification
transaction applied the migration, ran all 81 assertions successfully, and
rolled the entire transaction back, leaving the local PR-05 schema unchanged.
After explicit approval, a clean persistent local reset replayed every
migration through PR-06 and the same pgTAP file passed as part of the complete
local database test suite.

## Lock and rollout contract

The migration uses one atomic transaction with bounded `lock_timeout` and
`statement_timeout`. Regular index creation, `SET NOT NULL`, and parent unique
constraints can block writes; `ADD FOREIGN KEY NOT VALID` locks remain held
through validation in the same transaction. This pilot path is acceptable
only after staging-equivalent timing and lock observation confirms the target
tables remain small. A timeout or material size increase is an abort, not a
reason to increase timeouts blindly.

The local reset and migration replay were performed only after explicit
approval. Every hosted operation still requires the explicit approvals in
`AGENTS.md`; no hosted query or apply was performed for this implementation.

## Rollback / forward-fix

The paired recovery SQL is validation-only. It must not make
`daily_reports.clinic_id` nullable, drop composite FKs, drop parent uniqueness,
drop supporting indexes, or restore the single-column-only tenant model. It
validates the exact FK/unique/index matrices, 44 enabled RI triggers, UUID and
nullability contracts, delete-set column lists, data integrity, and RLS-enabled
state under bounded transaction-local timeouts. On regression, disable the
affected write path, preserve the hardened database boundary, and ship a
reviewed forward-fix.

## Verification contract

- RED proof on the PR-05 base.
- Clean local replay after explicit approval.
- `commercial_report_operational_tenant_fks_test.sql` catalog and behavior
  coverage for all eleven relationships.
- Aggregate and focused commercial contract runner.
- Generated Supabase type regeneration and full-file parity using pinned CLI
  `2.109.0`.
- Focused report/reservation Jest, mobile report Playwright, full Jest, type
  checks, lint, build, migration-history integrity, and secret scan.
- At least two independent read-only post-implementation audits, covering
  migration safety/test adequacy and tenant-boundary behavior.

## DoD mapping

- DOD-01: local Supabase readiness before DB verification.
- DOD-02: clean replay and constraint identity stability.
- DOD-04: exact constraint/index catalog and lock evidence.
- DOD-08: fail-closed clinic relationship enforcement and RLS no-drift proof.
- DOD-10: production build.
- DOD-11: focused, security, and full Jest regression.
- DOD-12: regenerated Supabase type parity.

## Residual / excluded

- `daily_report_items.next_reservation_id` and
  `reservation_notifications.email_outbox_id` are outside the approved Section
  7.3 list. They require a separately reviewed scope decision and preflight;
  PR-06 does not silently expand to them.
- PR-11 index retirement and Advisor performance cleanup are excluded.
- Staging, hosted/production application, canary, disaster-recovery, and
  release-qualification gates require separate human approval.
