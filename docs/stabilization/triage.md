# Stabilization Triage v0.1

## Execution Flow (Observed)

Documented flow:
- `docs/test-runbook.md`: `npm run test:e2e:pw` (Playwright), with `npm run e2e:validate-fixtures`, `npm run e2e:seed`, `npm run e2e:cleanup`.
- `docs/Playwright_E2E手引書.md`: baseURL `http://localhost:3000`, global setup/teardown for seed/cleanup.

Actual scripts/config:
- `playwright.config.ts`: loads `.env.test/.env.local/.env`, baseURL default `http://localhost:3000`, `webServer.command = npm run dev`, `reuseExistingServer` for local, `globalSetup`/`globalTeardown`.
- `src/__tests__/e2e-playwright/global-setup.ts`: runs `validateE2EFixtures()` then `seedE2EData()`.
- `package.json`: `npm run dev`, `npm run test:e2e:pw`, `npm run e2e:seed`, `npm run e2e:cleanup`.
- `supabase/config.toml`: local API/DB ports (54331/54332) and seed enabled.

## Triage Matrix

| Symptom | Cause class (priority) | Evidence (repo path) | Recommended task |
| --- | --- | --- | --- |
| E2E globalSetup stops when Supabase is not ready; E2E cannot start. | CC-01 Supabase readiness gate missing (P0) | `src/__tests__/e2e-playwright/global-setup.ts`, `scripts/e2e/validate-e2e-fixtures.mjs`, `docs/問題点2026年1月2日時点.md` (task#20) | T-01 |
| `admin.json` storage state missing, `ENOENT` during E2E. | CC-01 Supabase readiness / auth preflight gaps (P0) | `src/__tests__/e2e-playwright/global-setup.ts`, `src/__tests__/e2e-playwright/helpers/auth.ts`, `docs/問題点2026年1月2日時点.md` (task#64, #68) | T-01 |
| Seed fails or warns due to `ai_comments` schema mismatch, missing `clinic_settings`, `staff_shifts`, `staff_preferences`, or `security_events` constraints. | CC-02 Seed/schema drift (P0) | `scripts/e2e/seed-e2e-data.mjs`, `docs/問題点2026年1月2日時点.md` (task#21, #22, #40, #41, #50) | T-02 |
| `supabase db push --local` or migrations stop on duplicate trigger/schema_migrations conflicts. | CC-03 Migration idempotency gaps (P0) | `supabase/migrations/20251011000100_005_beta_operations.sql`, `supabase/migrations/20251224000200_create_improvement_backlog.sql`, `docs/問題点2026年1月2日時点.md` (task#33, #65, #87, #94) | T-03 |
| Reservation/blocks RLS policies do not enforce `clinic_id` tenant boundaries. | CC-04 Tenant scoping missing in RLS (P0) | `supabase/migrations/20251104000200_reservation_system_rls.sql`, `docs/問題点2026年1月2日時点.md` (task#6) | T-04 |
| Role/clinic source-of-truth is mixed and role names drift (`clinic_manager` vs `clinic_admin`); clinic_id=null flows unstable. | CC-05 Role + source-of-truth drift (P1) | `supabase/migrations/20251224000400_rename_ai_comments.sql`, `supabase/migrations/20251224001000_auth_helper_functions.sql`, `middleware.ts`, `src/lib/supabase/guards.ts`, `scripts/e2e/fixtures.mjs`, `docs/問題点2026年1月2日時点.md` (task#7, #8, #51, #52) | T-05 |
| Direct Supabase access for blocks can bypass server clinic guards. | CC-06 Client direct DB access (P1) | `src/lib/services/block-service.ts`, `docs/問題点2026年1月2日時点.md` (task#9, #15) | T-06 |
| Playwright baseURL/port drift (`Port 3000 is in use`) causes mismatched server and timeouts. | CC-07 baseURL/port drift + reuseExistingServer assumptions (P1) | `playwright.config.ts`, `package.json`, `docker-compose.dev.yml`, `docs/問題点2026年1月2日時点.md` (task#23, #43, #44, #88, #102) | T-07 |
| Dev server startup is unstable (missing `.next` artifacts, `/_app` TypeError, slow compile, `ECONNRESET`) so Playwright times out. | CC-08 Dev server readiness/compile load (P1) | `playwright.config.ts`, `package.json`, `docs/問題点2026年1月2日時点.md` (task#60, #99, #101, #103) | T-10 |
| Playwright/Jest `spawn EPERM` on Windows. | CC-09 OS permission/process hygiene (P1) | `playwright.config.ts`, `package.json`, `docs/問題点2026年1月2日時点.md` (task#1, #31, #39, #67) | T-08 |
| E2E cleanup fails due to FK constraints; data residue breaks reruns. | CC-10 Cleanup order/constraints (P2) | `scripts/e2e/cleanup-e2e-data.mjs`, `docs/問題点2026年1月2日時点.md` (task#66) | T-09 |
| Server-side sanitization triggers `.next/browser/default-stylesheet.css` errors and API 500. | CC-11 Server-only dependency mismatch (P1) | `package.json` (isomorphic-dompurify), `docs/問題点2026年1月2日時点.md` (task#75, #100) | T-11 |
| Staff API endpoints return `net::ERR_FAILED` or 400 during E2E. | CC-12 API stability/auth mismatch (P1) | `src/app/api/staff/shifts/route.ts`, `src/app/api/staff/preferences/route.ts`, `src/app/api/staff/demand-forecast/route.ts`, `docs/問題点2026年1月2日時点.md` (task#73, #74) | T-15 |
| `system_settings` vs `clinic_settings` drift causes TS errors and API inconsistency. | CC-13 Schema/type drift (P2) | `src/app/api/admin/master-data/route.ts`, `src/database/schemas/02_master_data.sql`, `docs/問題点2026年1月2日時点.md` (task#86, #90) | T-12 |
| Supabase type generation output is contaminated by CLI logs. | CC-14 Tooling output contamination (P2) | `package.json` (supabase:types), `docs/問題点2026年1月2日時点.md` (task#83) | T-13 |
| Lint/format drift blocks CI. | CC-15 Formatting/CI hygiene (P2) | `package.json` (lint), `docs/問題点2026年1月2日時点.md` (task#82) | T-14 |
| Admin settings selectors/labels drift vs E2E expectations. | CC-16 Test/UX contract drift (P2) | `docs/問題点2026年1月2日時点.md` (task#53, #54) | T-16 |
