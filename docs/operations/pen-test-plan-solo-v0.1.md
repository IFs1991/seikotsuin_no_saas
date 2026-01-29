# Solo QA Pen Test Plan v0.1

## Goal

Validate shadow operation safety and readiness for MVP beta by confirming tenant boundary, authz, and session security behavior before production deployment.


## Scope

- Environment: staging or local only. No production testing.
- Focus: authz, tenant boundary, RLS behavior, session security, public endpoints, data exposure, and LLM prompt injection (if enabled).
- Out of scope: load or stress testing, destructive tests, and migrations.


## Preconditions

- Test users for each role (admin, clinic_admin, staff) across at least two clinics.
- Known seed data for tenant tables (customers, reservations, resources).
- Local testing requires Supabase running when validating DoD-08/09 or E2E evidence.
  - `supabase start` is required for DoD-08/09, E2E, and DoD evidence creation.
  - Commands that require approval before running:
    - `supabase db reset --local`
    - `supabase db push --local`
    - `supabase migration up`


## Rules of Engagement

- Do not test production.
- Do not run destructive commands without explicit approval.
- Keep automated scans to baseline or passive modes.
- Rate limit manual testing to avoid availability impact.


## Tools

- Browser DevTools for request/response inspection.
- curl or Postman for manual API calls.
- OWASP ZAP baseline scan (optional, staging only).
- Playwright for authz and tenant-boundary regression checks.


## Phases

### Phase 0: Planning and Setup

- Confirm scope and environment.
- Verify test accounts and clinic IDs.
- Record test start state in evidence log.

### Phase 1: Baseline Passive Checks

- Verify security headers and CSP behavior.
- Ensure no service role keys are exposed in client bundle.
- Record baseline scan outputs.

### Phase 2: Auth and Authz

- Validate login, logout, and token expiration flows.
- Attempt role and clinic boundary bypass on key API routes.
- Validate admin-only endpoints enforce role checks.

### Phase 3: Tenant Boundary and RLS

- Execute DoD-08 command and confirm tenant policy scope.
- Validate DoD-09 by searching for client direct access paths.
- Manually attempt cross-clinic access on API endpoints.

### Phase 4: Session Security

- Validate cookie security settings (Secure, SameSite).
- Confirm session invalidation on logout and role changes.
- Confirm audit/security events are logged for unauthorized access.

### Phase 5: Input Validation and LLM Safety

- Attempt injection payloads in core input fields.
- Verify server-side validation errors and sanitization.
- Attempt prompt injection against LLM chat/AI endpoints; verify no system prompt disclosure or cross-tenant data access.

### Phase 6: Evidence and Report

- Record results by test case.
- Summarize findings by severity with file path and function references.
- Decide go/no-go based on DOD coverage and critical findings.


## DoD Mapping

- DOD-08: RLS tenant boundary validation.
  - Reference: `docs/stabilization/DoD-v0.1.md` (DOD-08 command).
- DOD-09: Client access guard validation.
  - Reference: `docs/stabilization/DoD-v0.1.md` (DOD-09 rg command).
- DOD-05/06/07: Playwright stability where applicable.
- DOD-10: `npm run build`.
- DOD-12: `npm run supabase:types` (only if types change).


## Evidence Artifacts

- Primary checklist: `docs/operations/PENETRATION_TEST_CHECKLIST.md`.
- Test case log: `docs/operations/pen-test-evidence-YYYYMMDD.md` (create per run).
- Findings report: include file path and function name per issue.


## Exit Criteria

- No Critical or High findings.
- DOD-08 and DOD-09 verified.
- Evidence log completed with dates, environment, and outcomes.
