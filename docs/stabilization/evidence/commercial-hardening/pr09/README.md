# Commercial hardening PR-09 evidence

## Scope

- Base: PR-08 head `12b9f35385b9ef1e11feb8516f552fc41c36e486`.
- Branch: `codex/commercial-hardening-pr09`.
- Canonical program specification:
  `docs/stabilization/spec-commercial-hardening-migration-v1.0.md` §10.
- Implementation specification:
  `docs/stabilization/spec-commercial-auth-authority-v1.0.md`.
- Objective: make active DB profile + `user_permissions` authoritative,
  constrain JWT scope to an intersection, and fail closed across RLS, Auth hook,
  server auth context, login, API, and protected UI boundaries.
- Linked/staging/production migration apply and hosted Auth hook configuration are
  out of scope without explicit operator approval.

User-owned pre-existing dirty and untracked files were preserved and are outside
PR-09 scope.

## RED evidence

The focused application contract was run before implementation with the ten
PR-09 suites. Result: expected RED, **10 failed suites; 59 passed and 27 failed
tests**. The failures reproduced JWT role/clinic restoration, permission/profile
error collapse, fail-open scope handling, profile bootstrap, and inactive-account
guard gaps.

The transaction-only pgTAP test was run against the pre-PR09 local database with
the pinned Supabase CLI 2.109.0:

```powershell
& 'C:\tmp\supabase-cli-v2.109.0-pr08\bin\supabase.exe' test db --local 'supabase/tests/commercial_auth_authority_test.sql'
```

Result: expected RED, **14 of 18 assertions failed**. The failures proved stale
JWT role/clinic authority, JWT alias behavior, scope expansion/malformed claims,
permission/profile fail-open behavior, and stale Auth hook claims.

No production or linked database was touched by RED verification.

## Security decisions

- Permission/profile lookup preserves `found | missing | error`.
- Missing authority denies; backend authority errors are logged and exposed as a
  generic 503 rather than being reclassified as missing.
- The authenticated subject is bound before constructing the service-role client.
- DB role and primary clinic are never restored from JWT metadata.
- JWT clinic scope is absent=DB scope, valid=intersection, malformed/empty=deny.
- Manager scope is active DB assignments only; revoked assignments take effect
  immediately.
- Custom Access Token Hook validates `event.user_id = claims.sub`, clears stale
  authority first, and repopulates claims only from active DB rows.
- The paired rollback is validation-only; recovery is a reviewed forward-fix.

## GREEN evidence

The user approved a destructive reset of the **local** Supabase database. A
clean `supabase db reset --local --yes` replayed the migration chain through
`20260715083609_commercial_auth_authority_fail_closed.sql`. No linked, staging,
or production database was reset or migrated.

The final local database run completed all 13 pgTAP files with **385 tests
passing**. The PR-09 rollback guard passed in its exact target state, then
proved that it rejects expression drift, an extra permissive policy, a column
`UPDATE` grant, and unsafe function drift before passing again in the restored
target state.

The local GoTrue integration passed sign-in and refresh behavior, canonical DB
claim issuance, stale-token RLS denial, inactive/missing/revoked-manager claim
clearing, PostgREST denial, and fail-closed behavior when the Auth hook cannot
read its authority tables. The integration and generated-type checks used the
repository-pinned Supabase CLI 2.109.0.

The final non-E2E Jest run passed **396/396 suites** and **3,209 tests**; 2 tests
were intentionally skipped (3,211 total). The production build completed with
exit code 0 and generated all 169 static pages. Existing unrelated ESLint/design
token warnings emitted by the build remain warnings and did not fail the gate.

## Verification status

This table is updated only after commands actually complete.

| Check                                | Status  | Evidence                                                                     |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------- |
| Focused application RED              | PASS    | 10 failed suites; 59 passed / 27 failed tests before implementation          |
| Local DB RED                         | PASS    | 14/18 pgTAP assertions failed before migration                               |
| Static migration contract            | PASS    | PR-09 Jest contract included in the final full run                           |
| PR-09 local migration apply          | PASS    | user-approved clean local reset; migration `20260715083609` applied          |
| PR-09 pgTAP                          | PASS    | included in the final 13-file / 385-test local run                           |
| Relevant commercial pgTAP regression | PASS    | all 13 pgTAP files and 385 assertions passed                                 |
| Rollback guard                       | PASS    | exact state plus four automated negative branches passed                     |
| Local GoTrue integration             | PASS    | sign-in, refresh, claim clearing, RLS/PostgREST, and fail-closed hook checks |
| Focused Jest GREEN                   | PASS    | 3 suites / 41 tests passed                                                   |
| Full Jest GREEN                      | PASS    | 396 suites; 3,209 passed, 2 skipped, 3,211 total                             |
| TypeScript                           | PASS    | `type-check`, `type-check:commercial`                                        |
| ESLint                               | PASS    | full and commercial gates                                                    |
| Migration history                    | PASS    | 50 frozen migrations and 8 append-only migrations verified                   |
| Route/source inventory               | PASS    | generated route/reference inventories are current                            |
| Legacy quarantine                    | PASS    | repository quarantine verifier                                               |
| Generated type parity                | PASS    | local schema matched; allowed PostgREST metadata drift `null` versus `14.5`  |
| Production build                     | PASS    | Next.js 15.5.19; exit 0; 169 static pages generated                          |
| Secret scan                          | PASS    | repository secret scanner                                                    |
| Independent read-only audits         | PASS    | app/auth and DB/RLS auditors found no remaining Critical/High/Medium blocker |
| Linked/staging/production apply      | NOT_RUN | out of scope; operator approval required                                     |

## Known block and residual risk

- `user_permissions.staff_id` has unresolved semantic ownership and currently
  references `public.staff.id`. PR-09 preserves the existing Auth ID = staff ID
  assumption and does not claim that this commercial-release blocker is solved.
- Auth hook behavior is tested locally by direct function invocation; hosted Auth
  configuration still requires an approved staging rollout.
- The JWT clinic-scope array has no production token-size budget evidence yet.
  Scope cardinality and Auth/JWT size must be observed during staged rollout.
- Direct PostgREST superset attempts fail closed under RLS, but a production
  security-event observability path for those denials is not established here.
- Local evidence cannot establish production configuration or production data
  safety.

Commercial release status remains **BLOCK** until the semantic owner and
migration decision for `user_permissions.staff_id` is resolved. PR-09 is locally
green but does not override that program-level gate.

## Recovery

The rollback guard validates the PR-09 authority contract and exits through
`ROLLBACK`. It does not restore JWT-first helpers, direct profile metadata
authority, or permissive client fallbacks. Operational recovery is route/session
containment followed by a reviewed forward-fix.
