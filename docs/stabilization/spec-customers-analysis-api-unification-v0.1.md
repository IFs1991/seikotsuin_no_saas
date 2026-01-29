# Customers Analysis API Unification Spec v0.1

## Goal
Unify patient analysis access under `/api/customers/analysis` while keeping the existing CRUD paths for customers unchanged. This aligns analysis access with the customer domain and reduces endpoint fragmentation for MVP shadow operation.

## Scope
- Add a new analysis endpoint under `/api/customers/analysis`.
- Switch the patient analysis UI to call the new endpoint.
- Keep `/api/patients` as a temporary compatibility route (deprecated) to avoid a sudden break.
- No database migrations.

## Non-Goals
- No change to table schema or RLS policies.
- No change to analytics data shape or calculations.
- No changes to reservations or staff/revenue/dashboard endpoints.

## Current State (Reference)
- Patient analysis UI: `src/app/patients/page.tsx` -> `src/hooks/usePatientAnalysis.ts` -> `/api/patients` -> `src/app/api/patients/route.ts`.
- Customer CRUD: `src/app/api/customers/route.ts` serves list/detail/create/update.

## Proposed API
### New Endpoint
`GET /api/customers/analysis?clinic_id=...`

### Response
Same response schema as current `/api/patients` (see `src/app/api/patients/route.ts`).

### Auth/Guard Requirements
- Must enforce clinic boundary using server-side guard (current behavior is `ensureClinicAccess`).
- Must log access via `AuditLogger.logDataAccess` as in the current `/api/patients` implementation.

## Implementation Plan (Code Changes)
1) **Add new route**
   - New file: `src/app/api/customers/analysis/route.ts`.
   - Copy logic from `src/app/api/patients/route.ts`.
   - Keep `ensureClinicAccess` and `AuditLogger.logDataAccess`.

2) **Client API switch**
   - Update `src/lib/api-client.ts` to add:
     - `api.customers.getAnalysis = apiClient.get('/api/customers/analysis', { clinic_id })`.
   - Update `src/hooks/usePatientAnalysis.ts` to use `api.customers.getAnalysis`.

3) **Compatibility**
   - Keep `src/app/api/patients/route.ts` during the transition.
   - Option A: re-export handler from the new module.
   - Option B: keep current logic, but add a deprecation comment and plan removal.

## Rollout Notes
- Deploy with both endpoints alive.
- Confirm `/patients` page uses the new endpoint.
- After shadow operation stabilizes, remove `/api/patients` in a separate PR.

## DoD Mapping (Stabilization)
- DOD-08 (RLS tenant boundary): ensure guard still enforces `clinic_id` in `src/app/api/customers/analysis/route.ts`.
- DOD-09 (client paths do not bypass guards): confirm `src/hooks/usePatientAnalysis.ts` calls `/api/customers/analysis` only.
- DOD-10 (Next build reproducible): no TS/ESLint errors after updating `src/lib/api-client.ts` and `src/hooks/usePatientAnalysis.ts`.

## Risks
- If `/api/patients` is removed too early, existing clients may break. Keep it until after MVP shadow usage validates the new path.
- Response schema drift between old and new endpoints if changes are made in only one file.

## Acceptance Criteria
- `GET /api/customers/analysis?clinic_id=...` returns the same payload as `/api/patients`.
- `/patients` page uses `/api/customers/analysis` (no `/api/patients` calls from UI).
- `/api/patients` continues to function (deprecated) during transition.

