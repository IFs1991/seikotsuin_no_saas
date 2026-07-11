# Commercial hardening PR-00 audit

## Outcome

PR-00 fixes the before-state as reproducible evidence and meaningful RED contracts. It intentionally contains no production migration, grant, policy, Auth setting, billing behavior, or application behavior change. The commercial release verdict remains **BLOCK**.

## Scope

Included:

- Full attached v1.0 specification, repository/nested agent rules, and six read-only Codex agent definitions.
- Remote/local DB catalog, advisor, migration, generated-type, table-classification, route, source-reference, relation, and staff-ID inventories.
- Required PR-00 RED contracts for generated-type drift, default privileges, function exposure/search path, route classification, tenant composite integrity, clinic-settings policy tautologies, and invite atomicity.
- Deterministic generators and drift-check commands.

Excluded:

- PR-01 through PR-12 remediation.
- Any production write, migration apply, `db reset`, Auth setting change, branch-protection change, staging action, or DR claim.

## Facts fixed by the audit

- Repository and remote contain the same 50 migration version IDs; the existing local stack has 48. Remote name metadata for 20260508000100 uniquely includes a trailing .sql, which is retained as known drift. The committed type file matches fresh local generation but not fresh remote generation.
- Remote has 86 `public` tables. Only 38 are spec candidates; 48 remain `BLOCK_UNCLASSIFIED`.
- Six shared/legacy tables have RLS disabled in local replay. Remote has RLS enabled but no policy for those tables. Neither state proves the intended Class C/E contract.
- Remote Security Advisor reports 17 findings; Performance Advisor reports 479.
- 117 mutating handlers were found (POST 74 / PUT 7 / PATCH 24 / DELETE 12); all remain unclassified. Four GET handlers are side-effect candidates.
- Literal source scan found server-side references to `master_patient_types`, `master_payment_methods`, and legacy `revenues`; no explicit `use client` module directly referenced the four shared-master candidates. Computed names and transitive client imports remain unknown.
- `user_permissions.staff_id` currently references `public.staff.id`, yet all 10 remote values also match auth users/profiles and runtime writes use the Auth user ID. This is a blocking semantic-owner conflict, not a value to guess.
- All 18 named tenant relations have zero current remote orphan/mismatch rows, but the required composite constraints and parent-rehome protection are absent.
- `clinic_settings` contains tautological policy predicates; broad grants/defaults and client-executable private/trigger functions remain visible in the catalog.
- An authenticated user can update sensitive columns on their own `profiles` row (`role`, `clinic_id`, `is_active`) and then use the tautological `clinic_settings` policies to read/update another tenant. `COMM-AUTH-001` behaviorally reproduces the complete chain in local DB and always rolls back.

## Design clarifications made in PR-00

- `HEALTH_OR_NO_MUTATION` is retained as an INV-08 classification because the invariant explicitly includes it even though another draft type list omitted it.
- LINE token checks, cron secrets, signed webhooks, and user authentication are distinct observed evidence; none is silently labeled public.
- Querying `.eq('clinic_id', ...)`, calling a generic `.parse()`, or using `.upsert()` is a weak hint, not proof of authorization scope, validation, or idempotency.
- Side-effecting GETs are inventory exceptions that require an owner decision; they are not added to the mutation-class union without a specification change.
- Catalog outputs contain observed facts only. Owner decisions remain in this report or later specs, never hard-coded into SQL results.

## BLOCK conditions for later PRs

- PR-01: migration replay/local/remote types and required CI checks must be green before PR-02 merges.
- PR-02/03: explicit/effective defaults, object grants, policy roles, and Class B/C/E contracts must be decided and negative-tested.
- PR-02/03 must also replace table-wide profile UPDATE with safe column-level/self-service boundaries; sensitive identity/authority fields remain server-only.
- PR-04: function signatures must come from catalog; client EXECUTE and mutable search paths must be fixed without breaking triggers.
- PR-05/06: no composite FK may be added until orphan/mismatch preflight is zero and nullable/ID semantics are decided. Parent rehome must fail in DB.
- PR-08: invite acceptance must become one transactional server-side operation with a behavioral rollback test.
- PR-10: all 117 handlers and four side-effect GETs require reviewed classifications; classification is not inferred from lexical hints.
- PR-12: no external commercial-readiness claim before staging and restore evidence exists.

## DoD-v0.1 mapping

The historical checklist is not treated as current proof:

| DoD | PR-00 evidence |
|---|---|
| DOD-01 local stack ready | PASS for read-only catalog/RED queries on the existing stack |
| DOD-02/03 migration reset + seed replay | NOT_RUN; reset was neither required nor authorized |
| DOD-04 schema drift visible/zero | BLOCK: local/remote migrations differ by 2 and remote types differ |
| DOD-08/09 tenant/RLS/server guard consistency | BLOCK: RLS/grant/policy RED findings and 117 unclassified mutations |
| DOD-10 build reproducibility | PASS on Node 24.18.0 with CI-equivalent non-secret placeholders; see `green-tests.md` |
| DOD-11 full Jest | FAIL locally: the exact non-E2E command exits 1 with no tests discovered in this nested worktree after Next.js infers the parent checkout; broader client/server results are recorded separately |
| DOD-12 type generation | PARTIAL: local matches, remote differs |

## Independent audit verdicts

| Auditor | PR-00 verdict | PR-00 blocking findings |
|---|---|---|
| DB schema explorer | PASS_WITH_RISK | 0 |
| RLS red team | PASS_WITH_RISK | 0 |
| Migration safety | PASS_WITH_RISK | 0 |
| API boundary | PASS_WITH_RISK | 0 |
| Test adequacy | PASS_WITH_RISK | 0 |
| Release audit | PASS_WITH_RISK | 0 |

The reports are retained under `docs/stabilization/evidence/commercial-hardening/subagent-audits/`. Their later-PR and baseline findings remain risks; the table is not a commercial-readiness approval.

## Required owner decisions

The eight decisions in specification §28 remain open: global-admin reach, inactive-clinic public booking, shared-master access architecture, legacy retention, maintenance window, unresolved legacy rows, leaked-password UX, and contractual RTO/RPO. Until decided, later work must use the narrowest fail-closed behavior and make no external guarantee.
