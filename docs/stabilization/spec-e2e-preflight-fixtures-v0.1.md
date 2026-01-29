# E2E Preflight and Fixtures Stability Spec v0.1

## Overview
- Purpose: Prevent E2E from starting before Supabase is ready and make fixture/seed/cleanup deterministic.
- DoD: DOD-01, DOD-03, DOD-05 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: Medium
- Risk: Test stability
- Current baseline: fixture roles already use `clinic_admin` and `E2E_SKIP_DB_CHECK` exists (validation only).

## Evidence (Current Behavior)
- scripts/e2e/fixtures.mjs: FIXTURE_USERS already uses `clinic_admin` for the manager role.
- scripts/e2e/validate-e2e-fixtures.mjs: validateE2EFixtures()/validateDatabaseState() runs DB queries immediately with no retry or wait; `E2E_SKIP_DB_CHECK=1` skips validation only.
- src/__tests__/e2e-playwright/global-setup.ts: globalSetup runs validateE2EFixtures()/seedE2EData() without readiness gating.
- scripts/e2e/seed-e2e-data.mjs: seedE2EData()/seedReservationData()/seedAnalyticsData()/seedSecurityData() touch many tables without table existence checks; some missing tables only warn (clinic_settings, staff, staff_shifts, staff_preferences, ai_comments).
- scripts/e2e/cleanup-e2e-data.mjs: cleanupE2EData() deletes across many tables without existence checks (reservation_history, daily_reports, staff_invites, onboarding_states, etc.), causing missing-table warnings.

## Required Tables

The following tables are **required** for fixture validation + seed/cleanup to pass without warnings (DOD-03, DOD-05). Preflight must fail-fast if any are missing:

| Table | Used by |
|-------|---------|
| clinics | validateDatabaseState(), upsertClinics(), cleanupE2EData() |
| profiles | validateDatabaseState(), upsertProfiles(), cleanupE2EData() |
| user_permissions | validateDatabaseState(), upsertUserPermissions(), cleanupE2EData() |
| staff | upsertStaff(), cleanupE2EData() |
| staff_invites | cleanupE2EData(), onboarding RLS tests |
| onboarding_states | cleanupE2EData(), onboarding RLS tests |
| customers | seedReservationData(), cleanupE2EData() |
| reservations | seedReservationData(), cleanupE2EData() |
| blocks | cleanupE2EData(), cross-clinic RLS tests |
| menus | seedReservationData(), cleanupE2EData() |
| resources | seedReservationData(), cleanupE2EData() |
| patients | seedAnalyticsData(), cleanupE2EData() |
| visits | seedAnalyticsData(), cleanupE2EData() |
| revenues | seedAnalyticsData(), cleanupE2EData() |
| user_sessions | seedSecurityData(), cleanupE2EData() |
| security_events | seedSecurityData(), cleanupE2EData() |
| audit_logs | seedSecurityData(), cleanupE2EData() |
| clinic_settings | seedE2EData() cleanup, admin-settings E2E |
| chat_sessions | cross-clinic isolation tests |

The following tables are **optional** (skip operations silently if missing to avoid warnings):

| Table | Purpose |
|-------|---------|
| staff_shifts | Shift optimization seed/cleanup |
| staff_preferences | Staff preference seed/cleanup |
| ai_comments | Analytics seed (schema drift fallback) |
| reservation_history | Cleanup only |
| daily_reports | Cleanup only |
| chat_messages | AI chat messages |

## Plan

### 1. Add Supabase readiness wait
- Add `waitForSupabaseReady()` before `validateDatabaseState()`, retrying a simple clinics select up to N times.
- Environment variables with defaults:
  - `E2E_DB_READY_TIMEOUT_MS=30000` (30 seconds max wait)
  - `E2E_DB_READY_RETRY_MS=1000` (1 second between retries)
- Implementation:
  ```javascript
  async function waitForSupabaseReady(supabase, timeoutMs = 30000, retryMs = 1000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const { error } = await supabase.from('clinics').select('id').limit(1);
        if (!error) return true;
      } catch (e) {
        // Connection not ready, continue retry
      }
      await new Promise(r => setTimeout(r, retryMs));
    }
    throw new Error(`Supabase not ready after ${timeoutMs}ms`);
  }
  ```

### 2. Add required/optional table checks
- Add `assertTablesExist()` before seed/cleanup. Fail fast if required tables are missing.
- For optional tables, skip operations when missing and avoid warnings.
- Respect existing `E2E_SKIP_DB_CHECK=1` by skipping readiness + table checks in validate/seed/cleanup (currently only validate honors it).
- Implementation:
  ```javascript
  async function assertTablesExist(supabase, requiredTables) {
    for (const table of requiredTables) {
      const { error } = await supabase.from(table).select('*').limit(0);
      if (error?.code === '42P01') { // relation does not exist
        throw new Error(`Required table '${table}' does not exist. Run migrations first.`);
      }
    }
  }

  async function tableExists(supabase, tableName) {
    const { error } = await supabase.from(tableName).select('*').limit(0);
    return !error || error.code !== '42P01';
  }
  ```

### 3. Add explicit preflight in global setup
- Run readiness check before `validateE2EFixtures()` and `seedE2EData()`.
- Skip preflight entirely when `E2E_SKIP_DB_CHECK=1`.
- No explicit connection close is required for the REST client; if realtime channels are added, call `removeAllChannels()` after preflight.
- Sequence:
  1. `waitForSupabaseReady()`
  2. `assertTablesExist(requiredTables)`
  3. `validateE2EFixtures()`
  4. `seedE2EData()`

### 4. Documentation
- Update docs/test-runbook.md to describe preflight and env vars (`E2E_DB_READY_TIMEOUT_MS`, `E2E_DB_READY_RETRY_MS`, `E2E_SKIP_DB_CHECK`).
- Add troubleshooting section for common preflight failures.

## Non-goals
- Changing fixture data values (IDs/roles).
- Migration changes.

## Acceptance Criteria (DoD)
- DOD-01: supabase start/status + node scripts/verify-supabase-connection.mjs completes without errors.
- DOD-03: supabase db reset --local completes with no missing-table warnings.
- DOD-05: npm run e2e:validate-fixtures && npm run e2e:seed && npm run e2e:cleanup && npm run e2e:seed completes without warnings.

## Rollback
- If readiness/table checks block valid flows, remove the calls and allow `E2E_SKIP_DB_CHECK=1` as a temporary bypass (ensure it is honored in validate/seed/cleanup).
- Rollback steps:
  1. Revert preflight changes in global-setup.ts
  2. Set `E2E_SKIP_DB_CHECK=1` in CI environment

## Verification
- Commands: npm run e2e:validate-fixtures, npm run e2e:seed, npm run e2e:cleanup
- Expected: exit 0 and no missing-table warnings.
- Logs should show: `[Preflight] Supabase ready after Xms`, `[Preflight] All required tables exist`

## Files to Modify
- scripts/e2e/validate-e2e-fixtures.mjs
- scripts/e2e/seed-e2e-data.mjs
- scripts/e2e/cleanup-e2e-data.mjs
- src/__tests__/e2e-playwright/global-setup.ts
- docs/test-runbook.md
