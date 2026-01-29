# Shadow Operation Readiness Spec v0.1

## Overview

- Purpose: Remove client-side tenant table access paths and align shadow operation flows with server guards before production deployment.
- DoD: DOD-08, DOD-09, DOD-10, DOD-12 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: High
- Risk: Security data leakage or cross-tenant access in production.
- Status: Draft


## Scope

### In scope

- Move tenant table access off the browser and behind server-side clinic guards.
- Make session/security event writes server-only.
- Define a cleanup plan for the deprecated shadow-operation API.

### Out of scope

- New features or UX changes.
- Migration changes (no migrations without spec + rollback plan).
- RLS policy changes (separate spec if needed).


## Findings (Current Risks)

- [DOD-09] Client direct access to tenant tables without server guard or clinic scope.
  - `src/api/gemini/ai-analysis-service.ts`: `fetchAnalysisData`, `buildInsightInput` query `revenues`, `patients`, `staff_performance`, `daily_revenue_summary`, `staff_performance_summary`, `patient_visit_summary`.
  - `src/components/dashboard/ai-analysis.tsx`: calls `fetchAnalysisData` in a client component.
- [DOD-08/DOD-09] Client writes to security/session tables.
  - `src/lib/session-manager.ts`: `createSession`, `validateSession`, `logSecurityEvent`.
  - `src/lib/security-monitor.ts`: `logSecurityEvent`, `getSecurityAlerts`, `getSecurityStatistics`.
  - `src/lib/multi-device-manager.ts`: `getUserDevices`, `trustDevice`, `blockDevice`, `executeDeviceAction`.
- [Shadow operation exit criteria] Deprecated API remains exposed.
  - `src/app/api/patients/route.ts`: `GET`, `POST` comment indicates removal after shadow operation stabilizes.


## Proposed Changes

### Phase 1: AI analysis data path

- Add a server route for analysis data (example: `src/app/api/ai/analysis/route.ts`) that uses `ensureClinicAccess`.
- Move DB reads out of `src/api/gemini/ai-analysis-service.ts` into the server route.
- Update `src/components/dashboard/ai-analysis.tsx` to call the API and pass `clinic_id` from the authenticated profile.

### Phase 2: Session and security events

- Create server routes for session/security actions (example namespace: `src/app/api/security/*`).
- Move DB reads/writes in `src/lib/session-manager.ts` to server-only code; provide a client wrapper that calls the API.
- Update `src/lib/security-monitor.ts` and `src/lib/multi-device-manager.ts` to call server APIs instead of `supabase-browser` directly.

### Phase 3: Deprecated shadow endpoint

- Decide whether to remove or gate `src/app/api/patients/route.ts` in production.
- Update documentation to specify the removal criteria and timeline.


## Verification Plan (DoD)

- DOD-09: `rg -n "createClient\\(|from\\('blocks'\\)|from\\('reservations'\\)" src` shows no client direct access for tenant tables.
- DOD-08: `supabase db query --local "...pg_policies..."` confirms tenant boundary policy alignment.
- DOD-10: `npm run build` succeeds.
- DOD-12: `npm run supabase:types` produces a clean `src/types/supabase.ts` (only if types are updated).
- Full DoD run after implementation to produce an evidence report.


## Rollback Plan

- Revert code changes per PR.
- No migration changes in this spec.


## Open Questions

- Should AI analysis read paths use service role (`createAdminClient`) or user auth with RLS + clinic guard?
- Where should `clinic_id` be sourced for AI analysis (server session vs explicit request param)?
- Do we need a single consolidated admin API for session/security events or multiple routes?
