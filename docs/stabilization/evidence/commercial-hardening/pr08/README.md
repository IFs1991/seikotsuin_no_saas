# Commercial hardening PR-08 evidence

## Scope

- Base: `0be64df0` (PR-07 branch head).
- Branch: `codex/commercial-hardening-pr08`.
- Specification:
  `docs/stabilization/spec-commercial-atomic-staff-invite-v1.0.md`.
- Objective: make profile, permission, invite claim, and success audit one
  transaction; serialize claims by unique token; expose execution only to
  `service_role`; retire every legacy acceptance write path.
- Linked/staging/production migration apply is out of scope without explicit
  operator approval.

User-owned untracked files present before branch creation were preserved and
are outside PR-08 scope.

## RED evidence

The static migration contract was added before the implementation and run with:

```powershell
npm run test -- --runTestsByPath src/__tests__/security/commercial-pr08-migration-contract.test.ts --forceExit
```

Result: expected RED. One suite failed because the expected single
`_commercial_atomic_staff_invite.sql` migration did not yet exist.

The existing local DB RED command was attempted, but Docker Desktop was not
running. Every query process failed to connect, so this is `NOT_RUN` for the
purpose of DB RED evidence. It is not represented as a successful RED proof.

The PATH CLI was `2.109.1`, while `.supabase-cli-version` pins `2.109.0`. The
official Windows `2.109.0` release archive was downloaded outside the repository
to `C:\tmp`, its SHA-256 was verified against the release checksum, and that
binary created the migration file. No package or lockfile changed.

## Security and data-integrity decisions

### Token uniqueness

The baseline had a non-unique token index. PR-08 blocks duplicate token groups
without selecting or repairing any row, then adds
`staff_invites_token_key UNIQUE(token)`. The older index remains for PR-11.

### Exact function ACL

The migration first revokes the known Supabase application roles, then
enumerates the function ACL and revokes every explicit non-owner grantee,
including unexpected custom roles. It re-grants only `service_role` on the
atomic RPC. The legacy non-atomic RPC retains no non-owner executor. Migration
postflight, pgTAP, the recovery guard, and the commercial DB contract all
verify this exact, non-delegable ACL.

### Unresolved staff identity

`user_permissions.staff_id` has:

```yaml
semantic_owner: unknown
current_fk: public.staff.id
decision: BLOCK
```

PR-08 does not change that FK and does not invent a staff row. An Auth user
without a matching staff row must receive a generic fail-closed application
error, with profile, permission, invite, and audit state all unchanged. This
remains a blocking commercial-release defect and cannot be waived as
`PASS_WITH_RISK`.

## Verification status

Results are updated only after commands actually complete.

| Check                           | Status  | Evidence                                                                                                                      |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Focused static RED              | PASS    | migration-absent failure reproduced before implementation                                                                     |
| DB RED before migration         | NOT_RUN | Docker Desktop was stopped                                                                                                    |
| Pinned CLI checksum/version     | PASS    | official 2.109.0 Windows binary; SHA-256 `903D7B4BA079239CECBD86E1847FEF6B24F939D213D36345F34E4CD8BB137118`; reported 2.109.0 |
| PR-08 local migration apply     | PASS    | approved `supabase migration up --local` completed                                                                            |
| Clean replay without seed       | PASS    | approved `supabase db reset --local --no-seed --yes` completed after the final migration fix                                  |
| Clean replay with seed          | PASS    | approved `supabase db reset --local --yes` applied every migration through PR-08 and `supabase/seed.sql`                      |
| Recovery guard                  | PASS    | rollback SQL executed inside its validation-only transaction and ended with `ROLLBACK`                                        |
| pgTAP after seed replay         | PASS    | 11 files, 319 tests, including 38 PR-08 assertions                                                                            |
| REST execution boundary         | PASS    | real PostgREST calls denied `anon`/`authenticated`; `service_role` reached the RPC                                            |
| Two-caller race verifier        | PASS    | deterministic same-user, different-user, and expiry-during-lock scenarios passed three consecutive final runs                 |
| Commercial DB contracts         | PASS    | all 14 contracts GREEN, including `07_atomic_staff_invite.sql`                                                                |
| Application atomicity contract  | PASS    | `GREEN COMM-INVITE-003`                                                                                                       |
| Migration history               | PASS    | 50 frozen migrations unchanged and 7 approved append-only migrations present                                                  |
| Generated type parity           | PASS    | committed `src/types/supabase.ts` matches the rebuilt local schema                                                            |
| Focused Jest                    | PASS    | 4 suites, 49 tests                                                                                                            |
| TypeScript                      | PASS    | `type-check` and `type-check:commercial`                                                                                      |
| ESLint                          | PASS    | 0 errors; 131 pre-existing warnings, none in PR-08 files                                                                      |
| Full Jest                       | PASS    | 393 suites; 3070 passed, 2 skipped, 0 failed with the DoD's non-E2E mode explicitly selected                                  |
| Exploratory legacy Jest E2E     | FAIL    | two pre-existing login-flow mock suites failed outside DoD-11; neither exercises a PR-08 acceptance path                      |
| Hosted/Playwright App E2E       | NOT_RUN | no hosted target was in scope                                                                                                 |
| Production build                | PASS    | Next.js production build and all 168 static pages completed                                                                   |
| Secret scan                     | PASS    | `npm run scan:secrets` exited 0                                                                                               |
| Independent read-only audits    | PASS    | DB/security and app/auth auditors reported no remaining P0-P3 findings after fixes                                            |
| Linked/staging/production apply | NOT_RUN | out of scope; operator approval required                                                                                      |

## Harness recovery and diagnostics

Only the final successful runs above count as PASS.

- The first clean runtime invocation exposed invalid qualification of SQL syntax
  constructs (`coalesce`/`nullif`). The function was corrected, and both final
  clean replays applied PR-08 from scratch.
- Two early pgTAP revisions directly invoked a revoked function after `SET ROLE`
  and triggered signal 11 in the local PostgreSQL image. Those attempts are not
  counted as evidence. The final suite checks exact catalog ACLs and successful
  service execution, while the real PostgREST harness verifies runtime denial
  for `anon` and `authenticated`.
- The original concurrency harness used a two-second `PgSleep` observation
  window. A cold run after seed replay exposed that flake. The final harness
  refreshes `pg_stat_activity` snapshots and uses `pg_blocking_pids()` to prove
  the second caller is actually waiting on the first caller's transaction. It
  then passed three consecutive runs.
- An unpinned verifier invocation found PATH CLI 2.109.1 and stopped as designed.
  Every counted DB result used the pinned, checksum-verified 2.109.0 binary.
- The first full Jest invocation inherited `E2E_INVITE_MODE=skip` from the local
  `.env.test`, which contradicts two existing non-E2E invite assertions. That
  run is not counted. With the repository-supported non-E2E mode explicitly set
  to `disabled`, all 393 suites passed.
- A separate exploratory invocation that did not apply the DoD-11 E2E exclusion
  reproduced existing failures in `auth-login-flow.test.ts` and
  `happy-path.test.ts`: both mock suites expected a login redirect but received
  the generic login error. They also failed when isolated, do not exercise a
  PR-08 invite-acceptance path, and are not counted as a PR-08 PASS. Real hosted
  App E2E was not run.

## Independent read-only audits

Two independent final audits completed after implementation:

- DB/security audit: PASS after tightening arbitrary-role ACL scrub,
  non-delegable `service_role` grant, exact token-column and overload checks,
  absent-email behavior, deterministic REST timeout, and recovery guard checks.
- App/auth/type/test audit: PASS after correcting one stale test title; no
  remaining P0-P3 finding.

Both auditors re-read the resulting files and reported no unresolved P0-P3
finding. Neither audit changed files or database state.

## Recovery

The paired rollback is a validation-only guard. It pins the exact overload,
function identity, applied `prosrc` SHA-256, non-delegable ACL, unresolved staff
FK, staff upsert UNIQUE, and token UNIQUE. It neither removes the atomic RPC or
constraints nor restores any legacy function privilege. Operational recovery
is invite-route disablement plus a reviewed forward fix; rolling application
code back to the direct multi-write path is prohibited.

## Residual risk

- `user_permissions.staff_id` identity semantics are still blocked and prevent
  a general claim that newly invited Auth users can complete acceptance.
- A rolling deployment must drain old instances or disable invite acceptance,
  because the old code uses direct service-role table writes rather than the
  legacy RPC.
- No hosted or production behavior is verified by local evidence.
- The two legacy Jest login-flow E2E mock suites remain red outside the DoD-11
  non-E2E gate; PR-08 did not modify their login path.
