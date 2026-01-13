# E2E Preflight and Fixtures Stability Spec v0.1

## Overview
- Purpose: Prevent E2E from starting before Supabase is ready and make fixture/seed/cleanup deterministic.
- DoD: DOD-01, DOD-03, DOD-05 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: Medium
- Risk: Test stability

## Evidence (Current Behavior)
- scripts/e2e/validate-e2e-fixtures.mjs: validateE2EFixtures()/validateDatabaseState() runs DB queries immediately with no retry or wait.
- src/__tests__/e2e-playwright/global-setup.ts: globalSetup runs validateE2EFixtures()/seedE2EData() without readiness gating.
- scripts/e2e/seed-e2e-data.mjs: seedE2EData() touches clinic_settings/staff_shifts/staff_preferences without table existence checks.
- scripts/e2e/cleanup-e2e-data.mjs: cleanupE2EData() deletes across many tables without existence checks, causing missing-table warnings.

## Required Tables

The following tables are **required** for E2E tests to pass. Preflight must fail-fast if any are missing:

| Table | Purpose |
|-------|---------|
| clinics | Tenant root |
| profiles | User profile data |
| user_permissions | Authorization source |
| customers | Patient data |
| reservations | Appointment data |
| blocks | Block/unavailability data |
| menus | Service menu data |
| resources | Resource management |

The following tables are **optional** (skip operations silently if missing):

| Table | Purpose |
|-------|---------|
| clinic_settings | Admin settings (may not exist on fresh DB) |
| staff_shifts | Shift optimization feature |
| staff_preferences | Staff preference feature |
| chat_sessions | AI chat feature |
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
- Close Supabase connection after preflight completes to avoid connection pool exhaustion.
- Sequence:
  1. `waitForSupabaseReady()`
  2. `assertTablesExist(requiredTables)`
  3. `validateE2EFixtures()`
  4. `seedE2EData()`

### 4. Documentation
- Update docs/test-runbook.md to describe preflight and env vars.
- Add troubleshooting section for common preflight failures.

## Non-goals
- Changing fixture data values (IDs/roles).
- Migration changes.

## Acceptance Criteria (DoD)
- DOD-01: supabase start/status + node scripts/verify-supabase-connection.mjs completes without errors.
- DOD-03: supabase db reset --local completes with no missing-table warnings.
- DOD-05: npm run e2e:validate-fixtures && npm run e2e:seed && npm run e2e:cleanup && npm run e2e:seed completes without warnings.

## Rollback
- If readiness/table checks block valid flows, remove the calls and allow `E2E_SKIP_DB_CHECK=1` as a temporary bypass.
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
