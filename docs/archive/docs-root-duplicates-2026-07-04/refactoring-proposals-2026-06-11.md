# Refactoring Proposals 2026-06-11

This document records stabilization follow-ups from `docs/stabilization/refactorinstructions.md` that were intentionally left as proposals or deferred work during the 2026-06-11 refactor pass.

## D-02: Baseline Failing Tests

### Current State

Full Jest still fails only on the known baseline failures:

- `src/__tests__/api/menu-templates-route.test.ts`: `POST /api/menu-templates/import` expects `201` but receives `500`.
- `src/__tests__/integration/api-staging-data.test.ts`: patient analysis expects `200` but receives `500`.
- The dashboard revenue-date failure described in the instructions did not reproduce on the latest runs, but remains a known baseline risk because it depends on fixture date alignment.

Read-only investigation indicates these are test fixture/mock drift rather than regressions from this refactor:

- `menu_template_billing_profiles` is now copied by the route, but the import test mock does not provide that table chain.
- Patient analysis now goes through `generatePatientAnalysis` and `patient_visit_summary.total_revenue`, while the integration mock still reflects the older RPC-centered expectation.
- Dashboard revenue aggregation is sensitive to JST "today" versus fixture dates.

### Proposal

Handle these in a separate stabilization PR focused only on test fixture correctness and route-contract assertions.

### Impact Scope

- `src/app/api/menu-templates/import/route.ts`
- `src/app/api/customers/analysis/route.ts`
- `src/app/api/dashboard/route.ts`
- Related API and integration tests.

### Migration Steps

1. Add one failing reproduction test per route with complete Supabase chain mocks.
2. Confirm whether current implementation or fixture expectation is the source of truth.
3. Update mocks only when the implementation matches the intended contract.
4. Run the full Jest suite and confirm zero baseline failures.

### Required Approval

Product or maintainer confirmation of the intended menu-template import and patient-analysis response contracts.

## D-04: `ApiResponse<T>` Type Unification

### Current State

`ApiResponse<T>`-like types remain structurally incompatible across `src/lib/api-helpers.ts`, `src/types/api.ts`, `src/types/admin.ts`, and `src/types/security.ts`. `src/types/index.ts` was removed because it was stale and effectively unused, but the broader re-export unification was skipped.

### Proposal

Create a dedicated type-only PR that first inventories every import and runtime response shape, then unifies only compatible aliases around `src/lib/api-helpers.ts`.

### Impact Scope

- API route return types.
- API client and hook response handling.
- Admin/security type modules.

### Migration Steps

1. Add compile-only tests for each exported response type.
2. Replace compatible duplicate aliases with re-exports from `src/lib/api-helpers.ts`.
3. Keep incompatible envelopes under distinct names until their runtime shapes are migrated.
4. Remove `any` defaults from response generics only after call sites compile without broad casts.

### Required Approval

Engineering approval that response envelope contracts may be renamed or migrated in multiple PRs.

## D-07: Reservation Domain Model

### Current State

`src/types/reservation.ts` remains an intentional camelCase domain model. It is used by production code and mapped to snake_case database rows through reservation service mappers.

### Proposal

Document the domain-model-plus-mapper approach as the current standard, or explicitly decide to move reservation code toward Supabase-generated row types.

### Impact Scope

- `src/types/reservation.ts`
- `src/lib/reservation-service.ts`
- Reservation API routes and UI forms.

### Migration Steps

1. Add a short architecture note explaining the current mapper boundary.
2. If generated DB types are preferred, migrate one read-only path first.
3. Add mapper round-trip tests before changing write paths.

### Required Approval

Product and engineering decision on whether camelCase domain types remain the public application model.

## D-08: Response Envelope Consistency

### Current State

Only `src/app/api/auth/profile/route.ts` was changed in this pass because its existing `{ success, data/error }` response shape could be pinned by tests and replaced with `createSuccessResponse` / `createErrorResponse` without changing JSON or status codes.

Many remaining raw `NextResponse.json` routes are not byte-equivalent with the helpers. Examples include `{ error: 'Unauthorized' }`, `{ metrics }`, `{ backlog }`, MFA endpoints returning `{ success: true }`, and external/public routes that are explicitly out of scope.

### Proposal

Continue D-08 route by route, but only when current JSON shape is fixed by tests before the helper replacement and remains exactly equivalent afterward.

### Impact Scope

- Internal authenticated API routes under `src/app/api/**`.
- Excludes `/api/public/*`, `/api/webhooks/*`, `/api/internal/*`, and `/api/health`.

### Migration Steps

1. List raw `NextResponse.json` routes and classify them as helper-equivalent or non-equivalent.
2. For equivalent routes, add response-shape tests first.
3. Replace one route per PR or commit.
4. For non-equivalent routes, decide whether to preserve legacy envelopes or intentionally migrate clients.

### Required Approval

Approval is required before intentionally changing any response JSON shape.

## D-09: Remaining `any` Hotspots

### Current State

Mechanically safe email notification `supabase: any` usages were replaced with generated Supabase types. Remaining hotspots need more design work:

- `src/lib/api-client.ts`: public API helper method arguments still use `any`.
- `src/api/gemini/ai-analysis-service.ts`: Gemini response and aggregate rows still use `any` casts.
- `src/app/api/ai-insights/route.ts`: Gemini response and aggregate rows still use `any` casts.
- `src/lib/schemas/auth.ts`: `zod-form-data` schema construction still relies on `any` casts.

### Proposal

Address each hotspot in separate PRs with dedicated type models and compatibility checks. Do not replace these with broad `unknown` casts unless runtime narrowing is added at the same boundary.

### Impact Scope

- Public API client call signatures.
- AI/Gemini response parsing.
- Auth form-data parsing.

### Migration Steps

1. Define request-body interfaces for `src/lib/api-client.ts` methods and verify existing call sites compile unchanged.
2. Add narrow Gemini response types or type guards before removing casts in AI modules.
3. Evaluate whether `zod-form-data` can be wrapped in local typed helpers before changing auth schemas.
4. Tighten ESLint `no-explicit-any` only after the above hotspots are reduced.

### Required Approval

Engineering approval for public API client request type names and AI response validation behavior.

## D-10: TypeScript Strictness And ESLint `any` Exemptions

### Current State

`tsconfig.json` still has `strict: false`, and ESLint still disables `no-explicit-any` in broad production directories. This conflicts with the repository guidance but cannot be fixed safely as part of cleanup.

### Proposal

Move toward strictness incrementally rather than enabling full strict mode at once.

### Impact Scope

- All TypeScript source files.
- ESLint configuration.
- CI type-check signal quality.

### Migration Steps

1. Add an ESLint warning-only mode for new `any` in one low-risk directory.
2. Enable `strictNullChecks` in a trial branch and record error classes.
3. Fix one directory at a time with focused PRs.
4. Enable full strict mode only after the high-volume errors are closed.

### Required Approval

Engineering approval for a multi-PR strictness migration plan.

## D-11: Large API Routes

### Current State

Several API routes remain very large and mix validation, authorization, business logic, persistence, and response assembly. The most security-sensitive examples are admin routes that combine service-role access with application-level scope checks.

### Proposal

Split routes incrementally with tests, starting from pure validation and pure transformation helpers before moving persistence into services.

### Impact Scope

- `src/app/api/daily-reports/items/route.ts`
- `src/app/api/reservations/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/staff/shifts/route.ts`

### Migration Steps

1. Add route-level contract tests for current response and authorization behavior.
2. Extract schemas and pure mappers first.
3. Extract service functions only after tests cover tenant and clinic boundaries.
4. Keep each route split as its own PR.

### Required Approval

Security-conscious engineering review before changing admin/users or admin/tenants control flow.

## D-12: Security Query Duplication

### Current State

Security event writes and session reads remain duplicated across session, MFA, security monitor, and multi-device modules. This overlaps with planned security work and was not changed.

### Proposal

Create a `SecurityEventService` and session query helper after the security/MFA remediation work lands.

### Impact Scope

- `src/lib/session-manager.ts`
- `src/lib/mfa/*`
- `src/lib/security-monitor.ts`
- `src/lib/multi-device-manager.ts`

### Migration Steps

1. Wait for SEC-04/MFA-related changes to settle.
2. Pin existing event payloads with tests.
3. Introduce a shared service behind existing call sites.
4. Remove duplicated query fragments after parity tests pass.

### Required Approval

Approval from the owner of the security remediation work.

## D-14: `createClient` Naming Collision

### Current State

Server and browser Supabase factories still share the `createClient` name. The current ESLint import restrictions reduce accidental misuse, so no rename was attempted.

### Proposal

Rename the browser factory to a more explicit name, such as `createBrowserSupabaseClient`, only if import restrictions prove insufficient.

### Impact Scope

- `src/lib/supabase/client.ts`
- Supabase barrel exports.
- Browser-side imports.

### Migration Steps

1. Add or confirm lint coverage that prevents direct wrong imports.
2. Introduce the explicit browser name as an additional export.
3. Migrate browser imports gradually.
4. Remove the ambiguous export after all call sites move.

### Required Approval

Engineering approval because this is a broad rename with limited immediate benefit.

## D-16: Supabase Test Mock Fragmentation

### Current State

Supabase mocks remain split across global in-memory mocks, `test-utils/supabaseMock.ts`, and per-test handwritten chains.

### Proposal

Prefer shared mock builders for new tests, but do not mass-convert existing tests.

### Impact Scope

- Jest setup files.
- API tests with Supabase chain mocks.
- Stabilization tests that assert tenant or clinic isolation.

### Migration Steps

1. Document the preferred mock builder for new API tests.
2. Extend `test-utils/supabaseMock.ts` only when a new route needs reusable behavior.
3. Convert old tests opportunistically when touching the same route.

### Required Approval

No broad approval needed for opportunistic conversions; approval required for a mass test-mock migration.

## D-17: TypeScript `baseUrl` Future Risk

### Current State

The repository currently uses TypeScript 5.9.3, so the TypeScript 6/7 `baseUrl` deprecation warning is not an active failure.

### Proposal

Handle path configuration during the future TypeScript upgrade rather than in this refactor.

### Impact Scope

- `tsconfig.json`
- Path alias resolution.
- Tooling that reads TypeScript config.

### Migration Steps

1. Test the repository with the target TypeScript version in an upgrade branch.
2. Choose between relative `paths` migration or an explicit deprecation-ignore setting.
3. Run type-check, lint, build, and Jest before merging.

### Required Approval

Approval from whoever owns the TypeScript/toolchain upgrade.

## Deferred Phase 2 Item: `src/api/database/supabase-client.ts`

### Current State

The instruction marked `src/api/database/supabase-client.ts` as unused, but current repository tests reference it through `src/__tests__/stabilization/F04-daily-reports-report-date.test.ts`. It was therefore not deleted in this pass.

### Proposal

Re-check production and test references after the F04 stabilization test is reviewed. Delete only if the test can be updated without weakening its safety check.

### Impact Scope

- `src/api/database/supabase-client.ts`
- `src/__tests__/stabilization/F04-daily-reports-report-date.test.ts`

### Migration Steps

1. Decide whether the F04 test should continue guarding this compatibility path.
2. If not, update the test to guard the active Supabase client path.
3. Re-run reference scans and type-check before deletion.

### Required Approval

Maintainer approval for changing the F04 stabilization test target.
