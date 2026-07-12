# Commercial hardening PR-02 evidence

## Scope

- Base: `cc046023b5a97af6a1ea911405072cb7ccf4deab` (`codex/commercial-hardening-pr01`).
- Branch: `codex/commercial-hardening-pr02`.
- Migration specification: `docs/stabilization/spec-commercial-hardening-migration-v1.0.md`, PR-02 and §§8, 13–14.
- Objective: stop legacy automatic client grants on future `postgres`-owned objects and replace existing `public` relation grants with a reviewed least-privilege matrix.
- Production/linked Supabase writes, remote migration apply, branch protection, PR-03 policy consolidation, and PR-04 routine-EXECUTE remediation are excluded.

## RED evidence and catalog baseline

The PR-00 `COMM-GRANT-001` contract was already recorded as RED. A read-only linked catalog audit on 2026-07-12 additionally found:

- 24 unsafe `postgres` default-ACL rows and 24 platform-owned `supabase_admin` default-ACL rows for client/PUBLIC exposure;
- 441 forbidden client relation privilege rows when PostgreSQL 17 `MAINTAIN` is read from `pg_class.relacl`;
- 466 direct `anon` relation grant rows;
- 48 shared-master write grant rows and 42 client grant rows on the reviewed internal tables;
- authenticated table-wide `profiles.UPDATE`, including effective writes to authority columns.

No remote state was changed during this audit.

## Reviewed privilege contract

The exact target for all 86 public tables, eight views, and one materialized view is [privilege-matrix.csv](./privilege-matrix.csv).

In that CSV, `no-reachable-client-call` means no reachable request-scoped `authenticated` database call. Some of those relations still have reviewed server-only `service_role` callers; `PRESERVE_EXISTING` records that PR-02 does not alter that server contract.

- `anon`: no direct relation or sequence privilege in `public`.
- `authenticated`: only the explicit `SELECT`/`INSERT`/`UPDATE`/`DELETE` operations in the matrix; no `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`, or grant option.
- `profiles`: table `SELECT` plus column-only `UPDATE` on `avatar_url`, `full_name`, `language_preference`, `last_login_at`, `phone_number`, `timezone`, and `updated_at`.
- Shared masters: authenticated `SELECT` only on `master_categories`, `master_patient_types`, `master_payment_methods`, and `menu_categories`.
- Legacy quarantine: no client relation privilege on `appointments`, `revenues`, `treatment_menu_records`, `treatments`, or `visits`.
- Internal/server-only relations: no client relation privilege; existing `service_role` access is preserved.

The four shared masters intentionally use permissive `TO authenticated FOR SELECT USING (true)` policies because they are global reference data rather than tenant rows. The grant, RLS enablement, and policy are applied as one unit so clean replay and the linked project have the same direct-read behavior.

## Implementation

- `20260712075529_commercial_privilege_baseline_hardening.sql`:
  - verifies required roles, the legacy heatmap signature, application object ownership, reviewed column ACLs, and absence of client role memberships;
  - removes global and `public`-schema client/PUBLIC defaults for future `postgres` tables, sequences, and routines;
  - resets existing PUBLIC/anon/authenticated table, view, materialized-view, sequence, and column ACLs;
  - recreates the four shared-master read policies deterministically;
  - grants only the reviewed authenticated matrix and seven profile update columns;
  - keeps the service-only legacy heatmap `SECURITY INVOKER` with its fixed `search_path`, and requires `revenues.clinic_id = visits.clinic_id` before aggregating a joined revenue row;
  - fails postflight on dangerous privileges, PUBLIC/anon exposure, grant options, profile authority writes, or unsafe application-owner defaults.
- `supabase_admin` is a bounded platform exception. Its 188 linked-project public routines are extension members, hosted `postgres` cannot assume that role, and it owns no non-extension public application object. The migration therefore leaves its defaults unchanged in every environment instead of producing local/hosted drift.
- The default function revoke is global as well as schema-scoped; PostgreSQL's built-in PUBLIC `EXECUTE` default cannot be removed by an `IN SCHEMA public` command alone.

## Application compatibility boundaries

- Generic admin POST/PUT writes use service credentials only for global `menu_categories`, after `processApiRequest` has enforced the `admin`-only HQ role and the table/write allowlists. Tenant-owned `menus` and `resources` keep the authenticated RLS client.
- Dashboard and mobile-home legacy heatmap execution creates a service client only after clinic-scope validation; canonical reads keep the authenticated RLS client. The migration first requires the existing function identity, then uses `CREATE OR REPLACE` to preserve its ACL identity while excluding a revenue whose clinic differs from the joined visit.
- Mobile-home manager/admin clinic cards reuse that same post-authorization service client only after principal and rollout resolution; the revenue RPC receives only the resolved clinic IDs, while clinic-name reads retain the authenticated RLS client.
- Clinic analysis reads legacy `revenues` with a service client only after `ensureClinicAccess(..., { requireClinicMatch: true })`, and retains the mandatory `clinic_id` predicate. `patients` and the staff-performance view remain on the authenticated client.
- Existing cross-clinic E2E contracts now require SQLSTATE `42501` for authenticated direct access to `visits` and `revenues`.

## Tests and verification

| Check                               | Result         | Evidence                                                                                                                                           |
| ----------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-02 focused Jest contracts        | PASS           | 10 suites / 66 tests after latest `main` integration, including migration, service-boundary, admin-routing, clinic-analysis, dashboard, and mobile |
| PR-01 regression contract           | PASS           | `npm run test:commercial:pr01`: 2 suites / 8 tests                                                                                                 |
| Route/source/table inventory checks | PASS           | `commercial:inventory:routes:check`, `commercial:inventory:source:check`, and `commercial:inventory:tables:check`                                  |
| Append-only migration history       | PASS           | 50 frozen migrations and one appended migration                                                                                                    |
| TypeScript                          | PASS           | `npm run type-check`                                                                                                                               |
| ESLint                              | PASS           | `npm run lint`                                                                                                                                     |
| Production build                    | PASS           | `npm run build`; Next.js compiled and generated 168 static pages, with non-blocking warnings outside PR-02 files                                   |
| Secret scan                         | PASS           | `npm run scan:secrets`                                                                                                                             |
| Independent read-only audits        | PASS_WITH_RISK | privilege/migration, application-boundary, and post-`main` integration auditors found no remaining code blocker; DB execution risk remains         |
| PostgreSQL pgTAP privilege contract | PASS           | `supabase test db supabase/tests/commercial_privileges_test.sql --linked`; 40/40 assertions passed                                                 |
| PR-02 phased DB contract runner     | NOT_RUN        | local Docker daemon is unavailable; runner expects 02 GREEN and the remaining PR-00 contracts RED                                                  |
| Full Jest rerun                     | NOT_RUN        | the PR-02-caused failure from an earlier full run was fixed and its focused suite passed; full suite was not rerun                                 |
| Playwright / PostgREST A-to-B smoke | NOT_RUN        | requires a healthy local Supabase/browser environment                                                                                              |
| Linked/production migration apply   | NOT_RUN        | explicitly out of scope without operator approval                                                                                                  |

Only actually executed checks may be promoted from `NOT_RUN`.

## Rollout

1. Use an isolated staging/local project and capture the pre-apply privilege/advisor snapshots.
2. Replay from zero, run all pgTAP tests, regenerate types, and require a complete type diff of zero.
3. Run focused route tests, full Jest/security tests, build, and authenticated/shared-master/legacy API smoke tests.
4. Compare post-apply privileges against `privilege-matrix.csv`; abort on any unclassified privilege, auth failure, or application flow failure.
5. A linked or production apply requires explicit operator approval, a maintenance window, and a current restore point.

## Rollback / forward-fix

The paired rollback SQL is intentionally security-preserving. It checks selected high-risk catalog invariants and performs no ACL mutation; restoring baseline `GRANT ALL`, default client grants, or the unsafe heatmap join is prohibited.

- Code compatibility: do not deploy pre-PR-02 code against the hardened ACLs; it expects direct legacy/shared-master writes.
- Data loss: none; PR-02 changes ACL/policy metadata and one security-preserving legacy heatmap definition, with no table-data mutation.
- Security impact: the hardened state remains in force.
- Lock risk: the forward migration takes catalog/table locks for GRANT/REVOKE/RLS policy DDL with a five-second lock timeout; the rollback guard performs catalog reads only.
- Recovery: disable the affected admin/analysis route if necessary, then ship a new least-privilege forward migration and matching code change.
- Operator approval: required for rollback execution, any staging/linked apply, or any forward-fix migration.

## DoD mapping

- DOD-02: append-only migration plus clean replay/pgTAP remain required.
- DOD-04: post-apply catalog/advisor diff remains required.
- DOD-08: shared-master RLS state and exact policy definitions are asserted.
- DOD-09: service-role creation order and clinic predicates are tested fail-closed.
- DOD-10/11: build, type-check, lint, and focused security/Jest suites are green; full Jest, DB, and Playwright gates remain required.
- DOD-12: this ACL and same-signature function-definition migration should generate no API type delta; regeneration parity remains required.

No secret, token, patient data, real email address, or phone number is stored in this evidence.
