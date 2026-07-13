# Commercial hardening PR-04: function execution hardening

## Status

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-04
- Status: implementation complete; hosted operations pending approval
- Base: PR-03 commit `260f4cee`
- Forward migration: `20260713004754_commercial_function_execution_hardening.sql`
- Recovery guard: `20260713004754_commercial_function_execution_hardening_rollback.sql`

## Objective

Close the reviewed function/RPC privilege boundaries while preserving the
existing RLS helper, trigger, generated-column, and Supabase Auth hook flows.
This change is deliberately revoke-only at the privilege boundary and does not
weaken RLS, clinic scope, or tenant isolation.

## Facts observed before change

1. `public.normalize_customer_phone(text)` is `SECURITY INVOKER` and immutable,
   but has no function-level `search_path`. It is used by the stored generated
   column `public.customers.normalized_phone`.
2. `public.update_reservation_notifications_updated_at()` and
   `public.validate_shift_requests_clinic_refs()` are `SECURITY DEFINER`
   trigger functions with fixed paths, but are directly executable by `PUBLIC`,
   `anon`, and `authenticated`.
3. `app_private` is not an exposed Data API schema, but eleven private routines
   inherit `PUBLIC EXECUTE`. The RLS helpers also have deliberate explicit role
   grants that must remain intact.
4. The configured Auth hook is
   `app_private.custom_access_token_hook(jsonb)`. Its runtime principal is
   `supabase_auth_admin`; `anon`, `authenticated`, and `service_role` do not
   need direct execution.
5. PR-02 already removed the unsafe future-function defaults for the `postgres`
   owner. PR-04 treats that state as an ordering precondition and reasserts the
   revoke-only default.
6. Local-before catalog evidence shows `btree_gist` in `public` with
   `extrelocatable=true`. Hosted-before evidence proves the public schema
   warning but does not prove relocatability or dependency behavior.
7. Hosted leaked-password protection was reported disabled. That setting is an
   operator-owned Auth configuration change, not a database migration.

## RED evidence

- `COMM-FUNCTION-001` reproduced direct client EXECUTE on both reviewed trigger
  functions.
- `COMM-FUNCTION-002` reproduced the mutable `normalize_customer_phone`
  function path.
- `commercial-pr04-migration-contract.test.ts` failed before implementation
  because no PR-04 migration existed.

The local stack used for the RED run had not replayed PR-02/PR-03, so unrelated
earlier-phase contracts also failed. Those failures are environment drift, not
PR-04 GREEN evidence.

## Implementation contract

### Forward migration

- Require the exact catalog-derived function signatures and trigger bindings.
- Refuse out-of-order application when the PR-02 default-function revoke is
  absent.
- Declare the reviewed `app_private` EXECUTE/schema privilege contract once in
  transaction-local tables and compare the catalog in both directions.
- Require the exact before-state, including only the reviewed PUBLIC and
  Auth-hook `service_role` grants that this migration removes; reject any
  other hosted drift before changing ACLs.
- Set `public.normalize_customer_phone(text)` to
  `search_path = public, auth, extensions`.
- Revoke `PUBLIC`, `anon`, and `authenticated` EXECUTE from the two reviewed
  trigger functions.
- Revoke inherited `PUBLIC EXECUTE` from every current `app_private` function
  while preserving schema `USAGE` and explicit RLS helper grants.
- Limit the configured Auth hook to `supabase_auth_admin`.
- Reassert revoke-only default function privileges for `postgres` globally and
  in `public` / `app_private`.
- Require the exact 28-entry after EXECUTE matrix and four-entry schema matrix,
  rejecting missing and unexpected grants.
- Verify every invariant and both trigger bindings in a postflight guard.

### Explicitly excluded

- No blanket revoke on all `public` functions; that schema contains
  extension-owned routines and reviewed service-only RPCs.
- No RLS or table privilege changes.
- No function body or tenant-scope semantic changes.
- No `btree_gist` move in this migration. The move requires hosted catalog,
  dependency, lock, and staging validation in a separate reviewed migration.
- No hosted Auth setting mutation without explicit human approval.
- No generated Supabase type edit is expected because routine identities and
  return types do not change.

## SQL verification

`supabase/tests/commercial_function_execution_test.sql` must prove:

- exact fixed `search_path`;
- exact catalog/effective-privilege denial for direct client execution of both
  trigger functions;
- exact 12-function `app_private` EXECUTE and schema-privilege matrices,
  rejecting both missing and unexpected grants;
- zero inherited `PUBLIC EXECUTE` in `app_private`;
- Auth-hook and explicit RLS-helper continuity;
- future-function default closure;
- generated phone normalization for an authenticated writer;
- notification and shift trigger execution after direct EXECUTE revocation;
- cross-clinic shift rejection remains fail-closed;
- `btree_gist` and the reservations exclusion constraint remain present.

The trigger functions return PostgreSQL's `trigger` pseudo-type and are not a
supported direct SQL call surface. On the local PostgreSQL 17.6 stack, both a
pgTAP `throws_ok` probe and a separate `anon` connection terminated the backend
with SIGSEGV rather than returning an assertion. A pgTAP role-switched denial
probe against the JSONB-returning Auth hook hit the same backend failure. PR-04
therefore verifies the exact routine ACLs/effective privileges in catalog,
exercises both routines through real PostgreSQL trigger execution on
test-owned temporary tables, and separately verifies the production trigger
bindings in catalog. Auth login/reset/invite E2E remains an explicit
hosted/staging release gate.

## Migration rollout

1. Confirm PR-01 through PR-03 required checks are green.
2. Capture local and hosted routine/default-ACL/extension catalogs.
3. Clean-replay migrations locally after explicit approval.
4. Run pgTAP, focused Jest, security Jest, full Jest, type checks, lint, build,
   generated-type parity, and Auth E2E.
5. Apply to an isolated staging-equivalent environment and capture locks,
   duration, Advisor diff, Auth login/reset/invite behavior, and trigger flows.
6. Obtain a separate production approval packet before any DB or Auth change.

Abort on a missing signature, trigger binding drift, unsafe default privilege,
client EXECUTE regression, Auth hook failure, generated-column failure, trigger
failure, cross-clinic acceptance, or a new critical Advisor finding.

## Rollback / forward-fix

The paired rollback is intentionally validation-only. It never restores client
execution, resets the fixed path, moves or drops an extension, or changes Auth
configuration. If a runtime regression is found, disable the affected route or
hook, preserve the hardened boundary, and ship a reviewed forward-fix.

## Operations

Hosted leaked-password protection remains `NOT_APPLIED` until an authorized
operator follows
`docs/operations/COMMERCIAL_PR04_LEAKED_PASSWORD_PROTECTION.md`. Before/after
configuration evidence and login/reset/invite E2E are mandatory. No password,
token, patient data, or secret may be stored as evidence.

## DoD mapping

- DOD-01: local Supabase readiness before SQL/Auth tests.
- DOD-02: clean migration replay and trigger identity stability.
- DOD-04: routine/default ACL/extension/Advisor drift evidence.
- DOD-08: RLS helper execution continuity and fail-closed clinic validation.
- DOD-10: production build.
- DOD-11: focused, security, and full Jest regression.
- DOD-12: generated Supabase type parity.
- Program DoD: RED proof, SQL tests, direct RPC denial, function EXECUTE
  matrix, Auth E2E, independent audits, staging, and human approval.

## Residual risk / unverified

- Clean local replay and all GREEN SQL evidence: `PASS` after explicit local
  reset approval.
- Hosted function/default-ACL after state: `UNVERIFIED`.
- Hosted `btree_gist.extrelocatable` and dependency behavior: `UNVERIFIED`.
- Extension relocation: `DEFERRED` to a separate reviewed migration.
- Hosted leaked-password protection: `NOT_APPLIED`, approval required.
- Auth login/reset/invite E2E and Advisor-after snapshot: `UNVERIFIED`.
- Staging, production migration, canary, and 24h/72h review: `UNVERIFIED`.
