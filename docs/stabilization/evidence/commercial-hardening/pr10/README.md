# Commercial hardening PR-10 evidence

## Scope

- Base: PR-09 head `ceda90022fb851f4c5b3044548fe262f4b0b4b62`.
- Branch: `codex/commercial-hardening-pr10`.
- Canonical program specification:
  `docs/stabilization/spec-commercial-hardening-migration-v1.0.md` §12 and
  `PR-10: Mutating route manifest and billing/scope default-deny`.
- Implementation specification:
  `docs/stabilization/spec-commercial-mutating-route-policy-v1.0.md`.
- Stabilization DoD context: `docs/stabilization/DoD-v0.1.md` and its linked
  current release-gate documents.
- Objective: make every mutation boundary explicit and fail CI when a new or
  changed route lacks the required auth, clinic scope, billing, public
  validation, internal secret, webhook signature, rate-limit, or idempotency
  evidence.
- This is a code-only PR. It adds no dependency or database migration and does
  not apply changes to local, linked, staging, or production Supabase projects.

User-owned pre-existing dirty and untracked files were preserved and are outside
PR-10 scope.

## RED evidence

Before the policy/verifier implementation, the repository route inventory was
run through the new fail-closed acceptance command:

```powershell
npm run commercial:red:routes
```

Result: expected RED, `COMM-ROUTE-001`; all **117 mutating handlers were
unclassified**.

The focused PR-10 contract test was then added and run before the verifier
existed:

```powershell
npm run test -- --runTestsByPath src/__tests__/security/commercial-pr10-mutating-route-policy.test.ts
```

Result: expected RED, **1 failed suite and 10 failed tests**. The failures covered
the absent verifier and the missing fail-closed diagnostic contracts.

No database or external service was touched by RED verification.

## Policy census and security decisions

- The enforced manifest covers **117** `POST` / `PUT` / `PATCH` / `DELETE`
  handlers in 91 route files, with zero unknown handlers.
- Mutation classes: 52 billed, 31 admin-scoped, 14 authenticated unbilled, 6
  internal-secret, 2 public-validated, 2 signed-webhook, and 10 fixed
  health/no-mutation handlers.
- Nine state-changing `GET` boundaries are registered separately: one billed
  AI-comments cache-miss path, three secret-authenticated internal processor
  paths, and five authenticated read routes that persist canonical audit logs.
- Exact policy/live route sets must match. Duplicate, stale, method-mismatched,
  or unregistered side-effecting routes fail closed.
- Evidence is derived from TypeScript AST structure and exact import/symbol
  provenance. Lexical mentions and a shadowed scoped-admin receiver do not
  satisfy the verifier.
- Async guards must be awaited. Result-returning guards must bind their result
  and terminate on denial before a reachable write. Billing checks run after
  authenticated clinic scope is established and before the protected write; a
  conditional gate cannot authorize an unprotected write path, and concurrent
  guard/write execution does not count as awaiting the gate.
- Required clinic scope covers every reachable write. Derived clinic scope keeps
  role-dependent HQ/clinic behavior but still requires value-bound, fail-closed
  proof.
- Canonical Zod input must be request-derived and parsed output must feed
  downstream processing without raw-input reuse. Fixed no-mutation routes must
  consist solely of one unconditional 405/410 response, clinic-scope resolver
  results must be used with the correct denial polarity, and Stripe claim
  results must terminate every non-claimed state before event processing.
- Public mutation validation and rate limiting, internal bearer-secret checks,
  webhook signatures, explicit exceptions, and idempotency requirements each
  have independent failure codes and negative fixtures.
- The generated manifest is schema version 2 with `policyStatus: ENFORCED`.
  Raw observation output is available only through the explicit
  `--observed-only --stdout` diagnostic mode and cannot replace the enforced
  evidence file.

## Independent audit remediation

The independent read-only audit rounds prevented acceptance until every
blocking finding was remediated. The findings included helper calls counted
without await/result or write-order proof, imported object-method writes hidden
behind another source file, zero reachable-write paths retaining gate evidence,
nested unsafe Zod schemas, mutated Stripe claim aliases, an incomplete
side-effecting `GET` audit census, and an invalid `AuditLogger` spread-copy
provenance. Route-level reviews also found stale saved chat scope and zero-row
update/delete success paths. The implementation was not accepted while any of
those findings remained.

Remediation added exact imported-symbol and cross-file binding, unconditional
fail-closed handling for ordinary zero-write mutation paths, pre-write and
conditional-path dominance checks, recursive Zod provenance/result handling,
direct fixed-response proof, complete Stripe claim-state alias handling, all
nine persisted `AuditLogger` methods, and runtime-valid canonical
alias/destructuring detection. The final suite contains 125 policy/verifier
contracts, including adversarial fixtures. Route hardening also revalidates
saved admin-chat scope, verifies session termination and tenant rollback
actually affect a row, checks both envelope and normalized settings clinic
scope, and reasserts billing organization-root scope before database or Stripe
processing.

## GREEN evidence

The final route verifier reported **117 mutating handlers classified** and **9
side-effecting GET handlers classified**. The generated route and source
reference inventories are current.

The final `test:commercial:pr10` run passed **2 suites / 129 tests**: 125
policy/verifier contracts (including adversarial fixtures) and 4 generated
inventory contracts.

The final non-E2E Jest run used `E2E_INVITE_MODE=disabled` to prevent the local
`.env.test` E2E mode from changing unit-test expectations. The CI full-regression
job now fixes the same non-E2E mode explicitly. The final rerun passed **399/399
suites**, with **3,375 tests passing and 2 intentionally skipped** (3,377 total).

The production build completed with exit code 0 and generated all 169 static
pages. Existing public UI design-token and React test `act(...)` warnings remain
warnings and are outside PR-10 scope.

## Verification status

This table is updated only after commands actually complete.

| Check                        | Status  | Evidence                                                            |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| Baseline route RED           | PASS    | `COMM-ROUTE-001`; 117 handlers unclassified before implementation   |
| Focused contract RED         | PASS    | 1 failed suite / 10 failed tests before verifier implementation     |
| Route policy verifier        | PASS    | 117 mutations + 9 side-effecting GETs; 0 unknown                    |
| Route manifest drift         | PASS    | generated schema-v2 enforced manifest is current                    |
| Source inventory drift       | PASS    | generated source-reference inventory is current                     |
| Focused PR-10 Jest           | PASS    | 2 suites; 129 passed                                                |
| Full Jest                    | PASS    | 399 suites; 3,375 passed, 2 skipped, 3,377 total                    |
| TypeScript                   | PASS    | `type-check` and `type-check:commercial`                            |
| ESLint                       | PASS    | full and commercial boundary gates                                  |
| Production build             | PASS    | Next.js 15.5.19; exit 0; 169 static pages                           |
| Migration history            | PASS    | 50 frozen + 8 append-only migrations                                |
| Legacy quarantine            | PASS    | runtime quarantine inventory is current and read-only               |
| Mobile production assets     | PASS    | generated assets are current                                        |
| Secret scan                  | PASS    | repository secret scanner                                           |
| Independent read-only audits | PASS    | two post-fix audits; no blocking findings                           |
| Database apply/reset         | NOT_RUN | no migration in PR-10; no database operation required or authorized |

## Known block and residual risk

- The program-level `user_permissions.staff_id` semantic-ownership blocker from
  PR-09 remains unresolved. A green PR-10 does not override PR-12 staging
  qualification or the commercial release gate.
- AST enforcement recognizes approved boundary helpers and call shapes. A new
  wrapper or equivalent security mechanism must be added deliberately to the
  detector and policy tests before it can satisfy CI.
- Side-effecting `GET` detection is an explicit registry for direct database
  writes, canonical `AuditLogger` calls, and approved processors. A new hidden
  write mechanism must add an exact detector and a negative fixture in the same
  change; PR-10's exhaustive export guarantee remains the complete
  `POST`/`PUT`/`PATCH`/`DELETE` set.
- Idempotency is verified structurally at the registered boundary; end-to-end
  concurrency behavior remains the responsibility of the route-specific tests
  and database constraints.
- Local evidence cannot establish production configuration or production data
  safety.

## Recovery

PR-10 has no database rollback. Recovery is a reviewed code revert or forward
fix while retaining fail-closed CI enforcement. Do not restore a raw
`UNKNOWN`-permitting manifest or bypass the policy verifier.
