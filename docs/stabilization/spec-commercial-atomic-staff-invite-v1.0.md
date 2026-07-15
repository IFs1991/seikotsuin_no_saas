# Commercial hardening PR-08 — Atomic staff invite acceptance

## 1. Status and authority

- Program SSOT:
  `docs/stabilization/1-seikotsuin-commercial-hardening-migration-spec-v1.0-2026-07-11.md`
- Program slice: PR-08 / Section 11
- Base: `0be64df0` (PR-07 branch head)
- Branch: `codex/commercial-hardening-pr08`
- Risk: High — auth, authorization, tenant assignment, migration
- UI mode: not applicable; no visual or copy change is in scope
- Linked/staging/production apply: prohibited without explicit operator approval

This document is the migration specification required by `AGENTS.md`. It
narrows PR-08 only and does not authorize the unresolved staff identity change,
PR-09 auth-authority work, or any hosted database mutation.

## 2. Objective

Replace the service-side sequence of independent profile, permission, and
invite writes with one PostgreSQL transaction. Exactly one invite row is locked
by token, all identity and authorization inputs are revalidated inside the
database, and every write including the success audit either commits together
or rolls back together.

## 3. Scope and non-goals

In scope:

1. Add `public.accept_staff_invite_atomic(uuid, uuid, text)`.
2. Grant its `EXECUTE` privilege only to `service_role`.
3. Remove all application-role execution of legacy
   `public.accept_invite(uuid)`.
4. Add `staff_invites_token_key UNIQUE (token)` after a duplicate preflight.
5. Route all three server-action acceptance flows through the atomic RPC.
6. Require a fresh server-side `auth.getUser()` result before every call.
7. Add real-DB rollback, privilege, idempotency, failure, and concurrency tests.

Non-goals:

- changing role or clinic assignment semantics outside the invite row;
- changing `user_permissions.staff_id` or any existing FK;
- inventing or backfilling a `public.staff` identity;
- repairing duplicate tokens; any duplicate blocks migration apply;
- changing Auth confirmation policy or PR-09 permission authority;
- applying the migration to a linked, staging, or production project;
- restoring a non-atomic path as a rollback.

## 4. Pre-existing blocking identity decision

The PR-00 artifact
`docs/stabilization/evidence/commercial-hardening/staff-id-semantics-decisions.yaml`
records the following unresolved boundary:

```yaml
column: user_permissions.staff_id
semantic_owner: unknown
current_fk: public.staff.id
decision: BLOCK
```

Runtime invite code supplies an Auth user UUID, while the current FK points to
`public.staff(id)`. Matching IDs observed in existing data do not establish the
semantic owner. PR-08 therefore neither changes the FK nor creates a staff row.
If the invited Auth user lacks an existing same-ID staff row, permission insert
fails with the existing FK and the complete RPC rolls back. This is the required
fail-closed behavior, but it remains a blocking product/release defect. A
separate owner-approved specification must resolve the identity model before
the staff invite flow can be commercially qualified.

This item is not waivable as `PASS_WITH_RISK`; affected rollout evidence remains
`FAIL` or `NOT_RUN` until the semantic decision is implemented and verified.

## 5. Token serialization invariant

`staff_invites.token` was `NOT NULL` but only had a non-unique index. A token
lookup could therefore lock multiple rows and select an arbitrary invite.

The migration takes an `ACCESS EXCLUSIVE` lock, counts duplicate token groups,
and aborts if any exist. It then adds:

```sql
constraint staff_invites_token_key unique (token)
```

No duplicate is deleted, merged, regenerated, or assigned to an arbitrary
clinic. The older non-unique index is retained; index cleanup belongs to PR-11.

## 6. RPC contract

Signature:

```text
public.accept_staff_invite_atomic(
  p_token uuid,
  p_user_id uuid,
  p_account_email text
) returns jsonb
```

Successful first claim:

```json
{
  "success": true,
  "clinic_id": "uuid",
  "role": "manager|therapist|staff",
  "idempotent": false
}
```

Successful same-user retry has the same shape with `idempotent: true` and makes
no additional write or audit event.

Stable business error codes:

| Code                            | Meaning                                      |
| ------------------------------- | -------------------------------------------- |
| `INVITE_NOT_FOUND`              | token or required identity input is absent   |
| `INVITE_EXPIRED`                | the unclaimed invite expired                 |
| `INVITE_INVALID_ROLE`           | invite role is not manager/therapist/staff   |
| `INVITE_EMAIL_MISMATCH`         | supplied account email does not match invite |
| `INVITE_ACCOUNT_NOT_FOUND`      | Auth user ID does not exist                  |
| `INVITE_ACCOUNT_EMAIL_MISMATCH` | Auth row email differs from supplied email   |
| `INVITE_ALREADY_ACCEPTED`       | another Auth user claimed the invite         |
| `INVITE_STATE_INVALID`          | accepted columns are internally inconsistent |

If expiry is crossed after profile/permission work begins, SQLSTATE `PVI02`
with message `INVITE_EXPIRED` is raised. Raising rather than returning forces
PostgreSQL to roll back prior writes. Unexpected FK, unique, trigger, or audit
errors are not caught; they also roll back the RPC and are mapped to a generic
application error without exposing database details.

## 7. Transaction and concurrency semantics

The function performs the following sequence:

1. lock the unique invite token row with `FOR UPDATE`;
2. return no-write idempotent success for the same accepted user;
3. reject a different accepted user or invalid accepted state;
4. evaluate expiry using `clock_timestamp()` after lock acquisition;
5. allow only `manager`, `therapist`, or `staff` from the invite row;
6. normalize invite/account email with `lower(btrim(...))` and compare;
7. verify `auth.users(id, email)` matches both supplied values;
8. upsert `profiles` using invite-derived `clinic_id` and `role`;
9. upsert `user_permissions` using the same invite-derived values;
10. evaluate expiry again immediately before claim and raise on expiry;
11. claim the locked invite for `p_user_id`;
12. insert one non-PII `security_events` success record;
13. return the result.

The token row lock serializes concurrent calls. Same-user calls produce one
first success plus one idempotent success. Different users produce exactly one
success; the loser receives `INVITE_ALREADY_ACCEPTED` without a profile,
permission, or audit mutation.

## 8. Security boundary

- Function owner: `postgres`.
- Execution: `SECURITY DEFINER`, `VOLATILE`.
- Search path: exact `pg_catalog`; every relation is schema-qualified.
- `PUBLIC`, `anon`, and `authenticated`: no `EXECUTE`.
- `service_role`: the only application role with `EXECUTE`.
- Migration ACL scrub: revoke every explicit non-owner grantee discovered via
  `aclexplode()`, including unexpected custom roles, then re-grant only
  `service_role` on the atomic RPC without grant option.
- Inputs do not include `role` or `clinic_id`.
- Application callers pass only ID/email returned by a fresh
  `auth.getUser()` call.
- Legacy `accept_invite(uuid)` remains in migration history but has no
  application-role `EXECUTE`, including `service_role`.

RLS does not secure a database function; the exact function ACL is the
authorization boundary. The application never passes raw form email as a
trusted fallback.

## 9. Application cutover and rolling-deploy safety

The old application path uses service-role table writes directly, not the
legacy RPC. Database ACL changes alone therefore cannot stop an already-running
old instance. Deployment must temporarily disable invite acceptance or drain
old instances before enabling the migrated route. A static migration contract
and normal Jest tests prohibit direct acceptance mutations from returning to
`src/app/(public)/invite/actions.ts`.

Signup with no Auth session does not call the RPC. It returns the existing
confirmation-email recovery message. Signup/login with a session re-fetch the
user through `auth.getUser()` and pass only that result to the RPC.

## 10. Migration and recovery

Forward migration:

`supabase/migrations/20260715043358_commercial_atomic_staff_invite.sql`

Security-preserving recovery guard:

`supabase/rollbacks/20260715043358_commercial_atomic_staff_invite_rollback.sql`

The recovery file is validation-only. It pins the atomic function overload,
identity, body SHA-256, exact non-delegable ACL, unresolved staff FK, staff
upsert uniqueness, and token uniqueness. It does not drop the atomic function
or constraints and never restores client/service execution of the legacy
function. If a defect is found, disable invite acceptance and ship a reviewed
forward fix. Reverting application code to direct multi-write acceptance is
prohibited.

## 11. Test plan

Static and application tests verify:

- exact signature, owner, volatility, search path, single overload, and ACL;
- token duplicate preflight and UNIQUE constraint;
- invite-only role/clinic derivation and Auth ID/email validation;
- the absence of direct application mutation and raw-email fallback;
- stable error mapping and malformed-response fail-closed behavior;
- session/no-session signup and login sequencing;
- generated Supabase RPC types and RED phase promotion.

pgTAP verifies catalog state plus first success, normalized email, all business
failures, same-user retry, different-user rejection, one audit event, and
transaction rollback on profile/permission/audit/FK failures. The missing
same-ID staff case is an explicit negative test and must leave all acceptance
state unchanged.

`scripts/commercial-hardening/verify-atomic-staff-invite.mjs` first exercises the
real PostgREST boundary: `anon` and `authenticated` are denied, while
`service_role` reaches the RPC. Each race then uses two independent local `psql`
caller sessions plus an observer session. The holder refreshes the PostgreSQL
statistics snapshot and waits until `pg_blocking_pids()` proves that the second
caller is blocked by the holder before it commits. The expiry scenario also
crosses `expires_at` only after that lock wait is observed. This avoids a fixed
sleep/readiness window. The verifier is part of the Database Contract CI job; a
single-session pgTAP result is not accepted as concurrency evidence.

## 12. RED evidence

Before implementation, the focused static contract failed because no PR-08
migration existed:

```powershell
npm run test -- --runTestsByPath src/__tests__/security/commercial-pr08-migration-contract.test.ts --forceExit
```

Observed: one suite failed at `findSingleFile`, expected one
`_commercial_atomic_staff_invite.sql`, received zero. The local DB RED runner
could not execute because Docker Desktop was not running; that item remains
`NOT_RUN`, not PASS.

## 13. Verification and DoD mapping

The current Change DoD is `docs/quality/change-dod-v1.0.md`. PR-08 is High risk
and requires real-DB negative tests, clean replay, generated-type parity,
focused/full regression, build, and independent review.

Historical stabilization mappings reused as concrete local checks:

| DoD       | PR-08 evidence                                                 |
| --------- | -------------------------------------------------------------- |
| DOD-01    | local Supabase status and connection verifier                  |
| DOD-02/03 | clean migration replay without/with seed                       |
| DOD-04    | append-only history, token/function catalog, zero drift        |
| DOD-08    | service-only RPC, legacy denial, invite-derived scope/role     |
| DOD-09    | fresh `auth.getUser()` identity and no direct multi-write path |
| DOD-10    | type-check, lint, production build                             |
| DOD-11    | focused/security/full Jest on Windows                          |
| DOD-12    | generated local schema type parity                             |

Production, linked apply, staff identity qualification, and commercial release
remain out of scope and unverified.
