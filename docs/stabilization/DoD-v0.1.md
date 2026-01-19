# Stabilization DoD v0.1 (Supabase/Docker/Playwright/RLS)

This DoD is the minimum checklist to restore deterministic local dev + E2E.
Each item includes a command, expected success condition, and representative failure.

- [ ] DOD-01 Local Supabase stack is ready before tests.
  - Command: `supabase start` then `supabase status` then `node scripts/verify-supabase-connection.mjs`
  - Success: status shows API/DB/Storage running; verification script completes without errors.
  - Failure: connection refused, `Missing Supabase environment variables`, or table query errors.

- [ ] DOD-02 Migrations are idempotent (no duplicate triggers or schema_migrations errors).
  - Command: `supabase db reset --local --no-seed`
  - Success: migrations apply cleanly with no errors.
  - Failure: `duplicate trigger update_improvement_backlog_updated_at`, `schema_migrations` conflict, or similar errors.

- [ ] DOD-03 Seed is reproducible on a clean local reset.
  - Command: `supabase db reset --local`
  - Success: seed completes with no warnings about missing tables or schema mismatches.
  - Failure: `ai_comments` schema mismatch, missing tables like `clinic_settings`, or constraint errors.

- [ ] DOD-04 Local schema drift is visible and zero (or explicitly approved).
  - Command: `supabase db push --local --dry-run`
  - Success: no unexpected diffs; output is empty or matches an approved diff list.
  - Failure: unexpected changes or db push errors.

- [ ] DOD-05 E2E fixture validation + seed/cleanup are idempotent.
  - Command: `npm run e2e:validate-fixtures && npm run e2e:seed && npm run e2e:cleanup && npm run e2e:seed`
  - Success: all commands exit 0 with no warnings.
  - Failure: `E2E fixture validation failed`, `cleanup warning`, or `seed` warnings.

- [ ] DOD-06 Playwright baseURL and webServer are aligned and stable.
  - Command: set `PLAYWRIGHT_BASE_URL=http://localhost:3000` (or the agreed port), then `npm run test:e2e:pw -- --project=chromium`
  - Success: webServer starts on the expected port within timeout; no fallback ports; tests start reliably; reload flows wait for `設定を読み込み中...` to be hidden after `page.reload({ waitUntil: 'domcontentloaded' })`.
  - Failure: `Port #### is in use` fallback, timeout, `TypeError: Cannot read properties of undefined (reading '/_app')`, missing `.next` artifacts, or `ECONNRESET` during startup.

- [ ] DOD-07 Playwright runs on Windows without `spawn EPERM`.
  - Command: `npm run test:e2e:pw -- --project=chromium`
  - Success: browser launches and tests start without EPERM.
  - Failure: `spawn EPERM`, permission errors, or browser launch failures.

- [ ] DOD-08 Tenant boundary + RLS source-of-truth are consistent.
  - Command: `supabase db query --local "select tablename, policyname, qual from pg_policies where schemaname='public' and tablename in ('reservations','blocks','customers','menus','resources','reservation_history','ai_comments');"`
  - Success: each policy qual includes `clinic_id` or `belongs_to_clinic(...)` for tenant tables and uses a single helper source (e.g., `get_current_*`).
  - Failure: policies rely only on role checks or mix `profiles` and `user_permissions` for the same domain.

- [ ] DOD-09 Client paths do not bypass server-side clinic guards for tenant tables.
  - Command: `rg -n "createClient\(|from\('blocks'\)|from\('reservations'\)" src`
  - Success: tenant table access goes through server APIs/guards or includes explicit clinic scoping.
  - Failure: direct Supabase access without clinic guard or `clinic_id` filtering.

- [ ] DOD-10 Next build is reproducible (no .next corruption, no TS/ESLint failures).
  - Command: `npm run build`
  - Success: build completes with no TypeScript/ESLint/Prettier errors.
  - Failure: build fails, missing `.next` artifacts, or TS/ESLint errors (e.g. `system_settings` drift).

- [ ] DOD-11 Jest regression suite runs without EPERM on Windows.
  - Command: `npm run test -- --ci --testPathIgnorePatterns=e2e`
  - Windows alternative: `npm run test:windows`
  - Success: tests complete with exit 0.
  - Failure: `spawn EPERM` or unexpected test failures.

- [ ] DOD-12 Supabase type generation output is clean.
  - Command: `npm run supabase:types` and `node -e "const fs=require('fs');const v=fs.readFileSync('src/types/supabase.ts','utf8'); if(!v.startsWith('export type Json')){process.exit(1)}"`
  - Success: generated file starts with `export type Json` and contains only TypeScript definitions.
  - Failure: CLI logs (e.g. `Connecting to db 5432`) appear in the generated file.
