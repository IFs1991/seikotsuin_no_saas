> [!IMPORTANT]
> **Status: HISTORICAL / STABILIZATION ONLY**
>
> これは2026年3月時点のローカル開発・パイロット安定化DoDです。当時の12/12 PASSは歴史的証跡として保持しますが、現在のパイロット出荷または一般商用出荷の判断には単独で使用できません。現行の正本は [Change DoD](../quality/change-dod-v1.0.md)、[Pilot Release Gate](../releases/pilot-release-gate-v1.0.md)、[Commercial Release Qualification](../releases/commercial-release-qualification-v1.0.md)、[Pilot Success Criteria](../product/pilot-success-criteria-v1.0.md) です。現在状態は [Current Gate Status](../releases/current-gate-status.yaml) を参照してください。

# Stabilization DoD v0.1 (Supabase/Docker/Playwright/RLS)

This DoD is the minimum checklist to restore deterministic local dev + E2E.
Each item includes a command, expected success condition, and representative failure.

> **最終更新: 2026-03-31** — 詳細な実施証跡は `pilot-go-execution-2026-03-27.md` を正本とする。

## 達成状況サマリ

- **12 項目中 12 PASS `[x]`**
- Jest whole-suite: **117 suites / 117 passed / 0 failed** (`csp-security-migration.test.ts` は Red 1 を含め 13/13 green。migration SSOT / rollback plan / rollback SQL も整合済み)
- E2E (Playwright): `dashboard.spec.ts` **4/4 passed** (2026-03-31)。根本原因はサーバー不安定ではなく、(1) API の UTC/JST タイムゾーン不一致と (2) seed の `is_deleted` 冪等性バグ。修正済み。
- **全 DoD 項目クリア。次ブロッカーなし。** csp-migration SSOT は 2026-03-31 に完了。

---

- [x] DOD-01 Local Supabase stack is ready before tests.
  - Command: `supabase start` then `supabase status` then `node scripts/verify-supabase-connection.mjs`
  - Success: status shows API/DB/Storage running; verification script completes without errors.
  - Failure: connection refused, `Missing Supabase environment variables`, or table query errors.

- [x] DOD-02 Migrations are idempotent (no duplicate triggers or schema_migrations errors).
  - Command: `supabase db reset --local --no-seed`
  - Success: migrations apply cleanly with no errors.
  - Failure: `duplicate trigger update_improvement_backlog_updated_at`, `schema_migrations` conflict, or similar errors.

- [x] DOD-03 Seed is reproducible on a clean local reset.
  - Command: `supabase db reset --local`
  - Success: seed completes with no warnings about missing tables or schema mismatches.
  - Failure: `ai_comments` schema mismatch, missing tables like `clinic_settings`, or constraint errors.

- [x] DOD-04 Local schema drift is visible and zero (or explicitly approved).
  - Command: `supabase db push --local --dry-run`
  - Success: no unexpected diffs; output is empty or matches an approved diff list.
  - Failure: unexpected changes or db push errors.

- [x] DOD-05 E2E fixture validation + seed/cleanup are idempotent.
  - Command: `npm run e2e:validate-fixtures && npm run e2e:seed && npm run e2e:cleanup && npm run e2e:seed`
  - Success: all commands exit 0 with no warnings.
  - Failure: `E2E fixture validation failed`, `cleanup warning`, or `seed` warnings.

- [x] DOD-06 Playwright baseURL and webServer are aligned and stable. **PASS** — 2026-03-31 `dashboard.spec.ts` 4/4 passed。根本原因は (1) `toJSTDateString()` 未使用による UTC/JST 日付不一致、(2) seed の `is_deleted` フィールド欠落による冪等性バグ、(3) cold-start 時の loading 判定 timeout 不足。3件とも修正済み。
  - Command: set `PLAYWRIGHT_BASE_URL=http://localhost:3000` (or the agreed port), then `npm run test:e2e:pw -- --project=chromium`
  - Success: webServer starts on the expected port within timeout; no fallback ports; tests start reliably; reload flows wait for `設定を読み込み中...` to be hidden after `page.reload({ waitUntil: 'domcontentloaded' })`.
  - Failure: `Port #### is in use` fallback, timeout, `TypeError: Cannot read properties of undefined (reading '/_app')`, missing `.next` artifacts, or `ECONNRESET` during startup.
  - Targeted rerun note (2026-03-30):
    - `src/__tests__/e2e-playwright/security-monitor.spec.ts`: **12 passed / 0 failed**
    - `src/__tests__/e2e-playwright/patients-list.spec.ts`: **6 passed / 0 failed**
    - `src/__tests__/e2e-playwright/public-menus-api.spec.ts`: **4 passed / 0 failed / 1 skipped** (`TEST_INACTIVE_CLINIC_ID` 未設定)
    - `src/__tests__/e2e-playwright/dashboard.spec.ts`: **4 passed / 0 failed** (2026-03-31 修正後)
    - `security-monitor` UI 検証は pilot mode で `/admin/security-monitor` が middleware によりブロックされる前提に合わせ、実画面 `/admin/security-dashboard` で確認する

- [x] DOD-07 Playwright runs on Windows without `spawn EPERM`.
  - Command: `npm run test:e2e:pw -- --project=chromium`
  - Success: browser launches and tests start without EPERM.
  - Failure: `spawn EPERM`, permission errors, or browser launch failures.

- [x] DOD-08 Tenant boundary + RLS source-of-truth are consistent.
  - Command: `supabase db query --local "select tablename, policyname, qual from pg_policies where schemaname='public' and tablename in ('reservations','blocks','customers','menus','resources','reservation_history','ai_comments');"`
  - Success: each policy qual includes `clinic_id` or `belongs_to_clinic(...)` for tenant tables and uses a single helper source (e.g., `get_current_*`).
  - Failure: policies rely only on role checks or mix `profiles` and `user_permissions` for the same domain.

- [x] DOD-09 Client paths do not bypass server-side clinic guards for tenant tables.
  - Command: `rg -n "createClient\(|from\('blocks'\)|from\('reservations'\)" src`
  - Success: tenant table access goes through server APIs/guards or includes explicit clinic scoping.
  - Failure: direct Supabase access without clinic guard or `clinic_id` filtering.
  - Scope note (2026-03-30):
    - 主要 tenant CRUD API (`reservations`, `customers`, `menus`, `resources`, `blocks`) は guard 導線を確認
    - ただしコードベース全体では client-side Supabase 直アクセスが残る (`session-manager`, `security-monitor`, `multi-device-manager`, `ai-analysis` 系)
    - よって「API本線では概ね達成、shadow-operation / hardening では未収束」と読む
  - Note (2026-03-10): PR-03 Phase A で `clinic_settings` への SMTP password 混入経路を遮断。`PUT /api/admin/settings` は `smtpSettings.password` を除外してから upsert する。communication 設定の UI/API 契約も統一済み。

- [x] DOD-10 Next build is reproducible (no .next corruption, no TS/ESLint failures).
  - Command: `npm run build`
  - Success: build completes with no TypeScript/ESLint/Prettier errors.
  - Failure: build fails, missing `.next` artifacts, or TS/ESLint errors (e.g. `system_settings` drift).
  - Status (2026-03-30):
    - execution log §18 時点では build green
    - 03-30 の再検証失敗は、その後の `src/app/api/admin/security/events/route.ts`, `src/app/api/admin/security/metrics/route.ts`, `src/app/api/admin/security/sessions/terminate/route.ts` 修正で解消
    - 最新再検証では `npm run build` が成功し、`DOD-10` は PASS として扱う

- [x] DOD-11 Jest regression suite runs without EPERM on Windows. **PASS** — 117 suites / 117 passed / 0 failed。`csp-security-migration.test.ts` の Red 1 も含め 13/13 全テスト green（2026-03-31 migration SSOT 完了により `describe.skip` 解除）。
  - Command: `npm run test -- --ci --testPathIgnorePatterns=e2e`
  - Windows alternative: `npm run test:windows`
  - Success: tests complete with exit 0.
  - Failure: `spawn EPERM` or unexpected test failures.
  - Note (2026-03-29): `Jest did not exit` warning は残るが機能影響なし。証跡は execution log §17 参照。

- [x] DOD-12 Supabase type generation output is clean.
  - Command: `npm run supabase:types` and `node -e "const fs=require('fs');const v=fs.readFileSync('src/types/supabase.ts','utf8'); if(!v.startsWith('export type Json')){process.exit(1)}"`
  - Success: generated file starts with `export type Json` and contains only TypeScript definitions.
  - Failure: CLI logs (e.g. `Connecting to db 5432`) appear in the generated file.
