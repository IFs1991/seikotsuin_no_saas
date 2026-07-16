# Commercial mutating-route policy v1.0

## Scope

This specification implements PR-10 of
`docs/stabilization/spec-commercial-hardening-migration-v1.0.md`, especially
§12 and the PR-10 acceptance criteria. It covers every exported `POST`, `PUT`,
`PATCH`, and `DELETE` handler under `src/app/api`, plus every `GET` handler in
that tree whose resolved execution path contains a directly detected database
write, a canonical `AuditLogger` persistence call, or an approved side-effecting
processor call.

PR-10 is application and CI hardening only. It introduces no database
migration, changes no RLS policy, and does not apply configuration to linked,
staging, or production environments.

## Invariants

- Every live mutation handler has exactly one route-and-method policy entry.
- Every detected side-effecting `GET` has exactly one explicit policy entry and
  a reason for retaining mutation semantics on `GET`.
- An unregistered, stale, duplicate, or method-mismatched policy fails CI.
- `AUTH_SCOPED_BILLED` requires approved authentication, clinic-scope, and
  billing-gate evidence in the resolved execution path.
- `ADMIN_SCOPED` and `AUTH_SCOPED_UNBILLED` require a named owner and an explicit
  billing exception reason.
- `INTERNAL_SECRET`, `SIGNED_WEBHOOK`, and `PUBLIC_VALIDATED` require approved
  secret, signature, and schema-validation evidence respectively.
- Deprecated mutation exports are classified `HEALTH_OR_NO_MUTATION` only when
  the AST proves a fixed 405/410 response and finds no write or side-effect call.
- Evidence is accepted by exact imported-helper provenance and AST structure;
  locally spoofed function or method names do not satisfy a gate.
- Approved asynchronous guards must be awaited. Result-returning guards count
  only when the handler binds the result and terminates on the canonical denial
  state before a reachable write. A guard must be awaited directly; running it
  concurrently with the protected write through `Promise.all` does not count.
  Throwing auth and billing guards must fail closed before the write, and every
  reachable write path must be dominated by an applicable gate.
- `clinicScope: required` requires a scope gate that covers every reachable
  write path. `clinicScope: derived` permits explicit role-dependent scope
  derivation (for example, global HQ administration versus clinic-scoped
  administration) but still requires a value-bound, fail-closed scope proof.
- Canonical Zod `safeParse` evidence requires request-derived input, a
  terminating `success === false` path, and downstream use of parsed data
  without reusing the raw input. A canonical throwing `parse` call must fail
  closed. A local request parser counts only when every normal return is a
  canonical Zod parse of request-derived data and its result feeds the
  downstream write. Merely calling a parser or using a local lookalike does not
  count.
- Stripe idempotency evidence requires the canonical claim result to terminate
  the `duplicate`, `terminal_failure`, and `busy` paths before event processing.
- Clinic-scope assertions must be invoked on the same local binding returned by
  the approved `createScopedAdminContext` import. Billing-root derivation must
  pass that same context's `client` and `scopedClinicIds` to the approved
  resolver.
- Canonical resolver results must be rejected on missing or out-of-scope values;
  assigning, ignoring, or inverting a resolver result is not scope evidence.
- Canonical `AuditLogger` persistence is detected through direct calls, exact
  aliases, and object destructuring; locally named lookalikes do not count.

## Policy census

The v1 inventory contains 117 mutation handlers in 91 route files:

| Classification          | Mutation handlers |
| ----------------------- | ----------------: |
| `AUTH_SCOPED_BILLED`    |                52 |
| `ADMIN_SCOPED`          |                31 |
| `AUTH_SCOPED_UNBILLED`  |                14 |
| `HEALTH_OR_NO_MUTATION` |                10 |
| `INTERNAL_SECRET`       |                 6 |
| `PUBLIC_VALIDATED`      |                 2 |
| `SIGNED_WEBHOOK`        |                 2 |

Nine side-effecting `GET` handlers are registered separately: the conditional
AI-comment cache write is billed, three legacy processor routes require an
internal cron secret, and five authenticated read routes persist mandatory audit
records without turning the read itself into a billed business mutation.

## Billing and scope decisions

Business writes default to billed. PR-10 adds the shared scoped billing gate to
the previously uncovered AI comment, block, chat, roster assignment, staff
preference, shift-request-period, and shift-request mutation boundaries. The
AI-comment `GET` gate runs only on a cache miss before generation and persistence.
Existing chat sessions are bound to the authenticated target user and requested
clinic before either chat-message insert. Block billing failures preserve their
402/503 `AppError` status and are returned before any resource or block query.

Administrative billing, security, identity, entitlement, and recovery routes
remain explicitly unbilled because they must be usable to restore or control an
account during a billing lock. Public reservations preserve the existing product
decision and are registered as validated public mutations.

Calendar token issuance remains clinic-derived. Token revocation is classified
with clinic scope `not-applicable` because it is constrained by authenticated
creator ownership, reveals no token existence, only reduces access, and must
remain available after clinic access is removed.

The existing `processClinicScopedBody` helper remains the standard wrapper for
new billed clinic-scoped mutations. Existing `processApiRequest` handlers are
not mass-rewritten; migration remains incremental, while the policy verifier
accepts only the approved guard combinations.

The `GET` detector is intentionally an explicit registry of approved write
shapes, not a whole-program effect system. A new service, Storage/Auth mutation,
or outbound write introduced behind a `GET` must add an exact detector and a
negative policy fixture in the same change. The exhaustive PR-10 acceptance
guarantee remains the complete `POST` / `PUT` / `PATCH` / `DELETE` export set.

## Artifacts and CI

- `src/lib/security/mutating-route-policy.ts` is the typed policy source.
- `scripts/commercial-hardening/verify-mutating-routes.mjs` is the fail-closed
  verifier.
- `scripts/commercial-hardening/generate-mutating-route-inventory.mjs` emits an
  enforced schema-v2 manifest by default. Raw observed output is allowed only
  with `--observed-only --stdout` for fixture tests.
- `docs/stabilization/evidence/commercial-hardening/route-manifest.json` is the
  committed enforced inventory.
- CI runs the expanded commercial strict type check, expanded commercial lint,
  policy verification, and manifest drift check before build.

## Recovery

Recovery is an application forward-fix or a coordinated revert of the policy,
verifier, CI wiring, affected route gates, tests, and generated manifest. The
manifest must never be reverted independently from the policy or verifier.
There is no SQL rollback because PR-10 changes no database object or data.
