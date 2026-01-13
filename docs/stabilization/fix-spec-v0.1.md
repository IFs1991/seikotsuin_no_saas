# Stabilization Fix Spec v0.1

Each task is sized for 1 PR and maps to DoD items in `docs/stabilization/DoD-v0.1.md`.

## Task T-01: Supabase readiness gate + E2E preflight
- Purpose: Prevent E2E from starting until Supabase is reachable and env vars are valid.
- Scope: `src/__tests__/e2e-playwright/global-setup.ts`, `scripts/e2e/validate-e2e-fixtures.mjs`, `scripts/verify-supabase-connection.mjs`, `docs/test-runbook.md`.
- Specific change:
  - Add explicit preflight in global setup (env check + connection probe).
  - Add retry/backoff around initial Supabase queries in fixture validation.
  - Emit actionable errors when credentials or connectivity are missing.
- Acceptance criteria: DOD-01, DOD-05.
- Rollback conditions: If preflight blocks valid flows or introduces new timeouts, revert preflight and retry logic.

## Task T-02: Seed/schema alignment and table existence checks
- Purpose: Make seed deterministic across local environments and remove noisy warnings.
- Scope: `scripts/e2e/seed-e2e-data.mjs`, `scripts/e2e/cleanup-e2e-data.mjs`, `docs/E2E共通フィクスチャ仕様書.md`.
- Specific change:
  - Add a required-table check before seed/cleanup (fail fast with clear message if missing).
  - Normalize seed payloads to the canonical schema (e.g., `ai_comments` array fields, `security_events.severity_level`).
  - Ensure seed/cleanup are safe to run multiple times in sequence.
- Acceptance criteria: DOD-03, DOD-05.
- Rollback conditions: If seed no longer matches E2E fixtures or breaks a dependent test suite, revert and document the deviation.

## Task T-03: Migration idempotency for triggers and schema drift
- Purpose: Eliminate duplicate trigger errors and make db reset/push repeatable.
- Scope: `supabase/migrations/20251011000100_005_beta_operations.sql`, `supabase/migrations/20251224000200_create_improvement_backlog.sql`, plus any new corrective migration.
- Specific change:
  - Make trigger creation idempotent (`DROP TRIGGER IF EXISTS` or conditional checks) for `update_improvement_backlog_updated_at`.
  - Add a corrective migration if existing environments are already inconsistent.
- Acceptance criteria: DOD-02, DOD-04.
- Rollback conditions: If migrations fail on clean reset or production shadow DB, revert the corrective migration and re-evaluate trigger strategy.

## Task T-04: Tenant boundary enforcement in reservation-related RLS
- Purpose: Ensure all reservation-domain tables are scoped by `clinic_id`.
- Scope: `supabase/migrations/20251104000200_reservation_system_rls.sql` (or a new migration that amends its policies).
- Specific change:
  - Add `clinic_id` checks (via `public.belongs_to_clinic` or equivalent) to SELECT/INSERT/UPDATE policies for reservation-domain tables.
  - Ensure anon/authenticated policies do not bypass tenant scope.
- Acceptance criteria: DOD-08.
- Rollback conditions: If legitimate access is blocked for valid roles after change, revert the policy update and add a targeted exception with justification.

## Task T-05: Unify role/clinic source-of-truth and role names
- Purpose: Remove drift between `profiles`, `user_permissions`, and role naming (`clinic_manager` vs `clinic_admin`), including clinic_id=null flows.
- Scope: `supabase/migrations/20251224000400_rename_ai_comments.sql`, `supabase/migrations/20251224001000_auth_helper_functions.sql`, `middleware.ts`, `src/lib/supabase/guards.ts`, `scripts/e2e/fixtures.mjs`.
- Specific change:
  - Choose one canonical source for role + clinic (e.g., `public.get_current_role()` / `public.get_current_clinic_id()`).
  - Update RLS policies to use the canonical helper functions consistently.
  - Align role constants in middleware/guards/fixtures to the same naming set.
  - Define expected behavior for users with `clinic_id=null` and keep tests consistent.
- Acceptance criteria: DOD-08, DOD-06.
- Rollback conditions: If role alignment breaks access for existing users, revert role renames and document a migration plan.

## Task T-06: Remove direct client access for tenant tables (blocks)
- Purpose: Ensure tenant tables are accessed through server-side guards or explicit clinic filters.
- Scope: `src/lib/services/block-service.ts` and its call sites.
- Specific change:
  - Route `blocks` operations through server APIs that call `ensureClinicAccess`.
  - If direct Supabase access remains, enforce `clinic_id` filters in every query.
- Acceptance criteria: DOD-09, DOD-08.
- Rollback conditions: If API coverage is incomplete or breaks existing UI flows, revert to previous access path and add a short-term guard note in docs.

## Task T-07: Standardize Playwright baseURL and port usage
- Purpose: Avoid port drift and baseURL mismatch during E2E runs.
- Scope: `playwright.config.ts`, `package.json`, `docker-compose.dev.yml`, `docs/Playwright_E2E手引書.md`, `docs/test-runbook.md`.
- Specific change:
  - Define a single source of truth for dev/E2E port (env + config).
  - Ensure `webServer.url` and `use.baseURL` always match.
  - Document the expected port and how to override it safely.
- Acceptance criteria: DOD-06.
- Rollback conditions: If the unified port breaks local dev or CI, revert and document the divergence explicitly.

## Task T-08: Windows EPERM mitigation runbook (Playwright + Jest)
- Purpose: Reduce `spawn EPERM` failures on Windows for Playwright and Jest.
- Scope: `docs/test-runbook.md`, `docs/Playwright_E2E手引書.md`, `jest.config.js` (if worker tweaks are needed).
- Specific change:
  - Add Windows-specific steps (admin shell, killing stray `node` processes, Defender exclusions, browser channel guidance).
  - Document when to use reduced workers or `--runInBand` for Jest.
- Acceptance criteria: DOD-07, DOD-11.
- Rollback conditions: If guidance is incorrect or conflicts with policy, revert the runbook update.

## Task T-09: Cleanup order or cascade for E2E data
- Purpose: Ensure cleanup is deterministic and does not fail on FK constraints.
- Scope: `scripts/e2e/cleanup-e2e-data.mjs`, relevant FK constraints in `supabase/migrations/**` if needed.
- Specific change:
  - Adjust deletion order for dependent tables and/or add `ON DELETE CASCADE` where safe.
  - Add a post-cleanup check that reports remaining rows for E2E clinic IDs.
- Acceptance criteria: DOD-05.
- Rollback conditions: If cleanup removes non-E2E data or violates data policy, revert and document the safe cleanup boundaries.

## Task T-10: Dev server startup determinism and Playwright timeouts
- Purpose: Prevent `.next` corruption/slow compile from breaking E2E startup.
- Scope: `playwright.config.ts`, `package.json`, `docs/test-runbook.md`, `docs/Playwright_E2E手引書.md`.
- Specific change:
  - Add a documented warm-up step (precompile critical pages) or a prebuild option.
  - Adjust Playwright `webServer.timeout` and worker defaults for cold starts.
  - Add guidance for clearing `.next` (approval-gated) when corruption is suspected.
- Acceptance criteria: DOD-06, DOD-10.
- Rollback conditions: If changes slow dev workflow or introduce false positives, revert and document the alternative path.

## Task T-11: Server-side sanitizer fix (DOMPurify)
- Purpose: Avoid API 500 caused by browser-only assets being loaded on the server.
- Scope: `package.json` and the actual sanitizer usage in `src/app/api/**` (identify import sites for `isomorphic-dompurify` or equivalent).
- Specific change:
  - Replace with a server-safe sanitizer or add a server-only implementation.
  - Add a minimal regression check for the affected API routes.
- Acceptance criteria: DOD-06.
- Rollback conditions: If sanitization regressions occur, revert and document a safe fallback strategy.

## Task T-12: Align system_settings vs clinic_settings
- Purpose: Remove schema/type drift after `system_settings` was merged into `clinic_settings`.
- Scope: `src/app/api/admin/master-data/*.ts`, `src/database/schemas/02_master_data.sql`, `src/database/seed_data/01_initial_data.sql`, `src/types/supabase.ts`, `supabase/migrations/**` (if needed).
- Specific change:
  - Standardize on a single table name and update API queries accordingly.
  - Update types and any TODOs referencing the old table name.
- Acceptance criteria: DOD-10.
- Rollback conditions: If compatibility with existing data is broken, revert and document a migration path.

## Task T-13: Supabase types generation hygiene
- Purpose: Prevent CLI logs from polluting `src/types/supabase.ts`.
- Scope: `package.json` (supabase:types), optional wrapper script in `scripts/`.
- Specific change:
  - Wrap `supabase gen types` so stdout is clean (redirect logs to stderr or filter non-TypeScript lines).
  - Add a verification step that ensures the file starts with `export type Json`.
- Acceptance criteria: DOD-12.
- Rollback conditions: If type generation becomes fragile, revert and document the safe manual workflow.

## Task T-14: Lint/format baseline cleanup
- Purpose: Remove lint/Prettier failures introduced by recent additions.
- Scope: Affected files reported in `docs/問題点2026年1月2日時点.md` (patients/reservations additions) and lint config.
- Specific change:
  - Run Prettier on the affected files and align with `.prettierrc`.
  - Avoid functional changes; formatting only.
- Acceptance criteria: DOD-10.
- Rollback conditions: If formatting causes unintended diffs, revert and reapply with narrower scope.

## Task T-15: Staff API endpoint stability for E2E
- Purpose: Eliminate `net::ERR_FAILED` and 400s on `/api/staff/*` during E2E.
- Scope: `src/app/api/staff/shifts/route.ts`, `src/app/api/staff/preferences/route.ts`, `src/app/api/staff/demand-forecast/route.ts`, `src/lib/supabase/guards.ts`, `middleware.ts`.
- Specific change:
  - Add explicit auth/clinic checks and consistent error responses.
  - Log validation failures with request context for diagnosis.
- Acceptance criteria: DOD-06.
- Rollback conditions: If API behavior changes for valid requests, revert and document the required request contract.

## Task T-16: Admin settings selector/label alignment for E2E
- Purpose: Remove selector drift between UI labels and E2E expectations.
- Scope: Admin settings UI components and `src/__tests__/e2e-playwright` specs.
- Specific change:
  - Standardize labels or add stable `aria-label` attributes for key fields and buttons.
  - Keep wording consistent across UI and tests.
- Acceptance criteria: DOD-06.
- Rollback conditions: If UI text changes regress product requirements, revert and update tests only.
