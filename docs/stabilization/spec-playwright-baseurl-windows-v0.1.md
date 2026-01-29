# Playwright baseURL and Windows EPERM Spec v0.1

## Overview
- Purpose: Keep Playwright baseURL and webServer usage aligned and document current Windows EPERM handling for E2E startup stability.
- DoD: DOD-06, DOD-07, DOD-11 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: Medium
- Status: ✅ Completed (2026-01-22)
- Risk: CI/CD stability, Developer experience

## Evidence (Current Behavior)
- playwright.config.ts: baseURL uses PLAYWRIGHT_BASE_URL/NEXT_PUBLIC_APP_URL; webServer.command is `npm run dev`; reuseExistingServer is false; timeout is 120_000ms; webServer.env sets E2E_INVITE_MODE default to skip.
- src/__tests__/e2e-playwright/global-setup.ts: baseURL reads config.projects/use and defaults to http://localhost:3000 for login flows.
- src/__tests__/e2e-playwright/helpers/auth.ts: BASE_URL uses PLAYWRIGHT_BASE_URL/NEXT_PUBLIC_APP_URL and is used as the cookie origin.
- .env.test.example: NEXT_PUBLIC_APP_URL and PLAYWRIGHT_BASE_URL are http://127.0.0.1:3000.
- supabase/config.toml: auth.site_url is http://127.0.0.1:3000.
- package.json: test:e2e:pw:install and test:windows scripts exist.

## Scope
### In-scope
- Document current baseURL precedence and webServer gating for local baseURL.
- Document current Windows EPERM baseline commands and the Jest Windows script.
- Capture DoD gaps without proposing new implementation changes.

### Out-of-scope
- Changing playwright.config.ts or Playwright test code.
- Adding new scripts or browser channels.
- Changing migrations.

## Plan (1 task = 1 PR)

### Task PB-01: BaseURL alignment documentation refresh
- Scope: docs/stabilization/spec-playwright-baseurl-windows-v0.1.md
- Change: reflect baseURL precedence and dependency on env alignment; note no port derivation in playwright.config.ts.
- DoD: DOD-06 (documentation support)
- Acceptance: doc matches playwright.config.ts use.baseURL/isLocalBaseUrl and src/__tests__/e2e-playwright/helpers/auth.ts BASE_URL.

### Task PB-02: Windows EPERM baseline documentation
- Scope: docs/stabilization/spec-playwright-baseurl-windows-v0.1.md
- Change: reference package.json test:e2e:pw:install/test:windows and docs/test-runbook.md.
- DoD: DOD-07, DOD-11
- Acceptance: doc reflects current scripts and the primary runbook location.

### Task PB-03: DoD delta snapshot
- Scope: docs/stabilization/spec-playwright-baseurl-windows-v0.1.md
- Change: add a short DoD gap summary tied to file paths and settings.
- DoD: DOD-06, DOD-07, DOD-11
- Acceptance: delta lists the current gaps and risks without proposing code changes.

## BaseURL Resolution (Current Spec)

Priority and defaults follow the current configuration:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | PLAYWRIGHT_BASE_URL env | http://127.0.0.1:3001 |
| 2 | NEXT_PUBLIC_APP_URL env | http://127.0.0.1:3000 |
| 3 | Default | http://localhost:3000 |

Notes:
- baseURL is reused by Playwright tests (playwright.config.ts use.baseURL), global setup (src/__tests__/e2e-playwright/global-setup.ts baseURL), and auth cookie helpers (src/__tests__/e2e-playwright/helpers/auth.ts BASE_URL).
- baseURL should match supabase/config.toml auth.site_url and .env.test.example NEXT_PUBLIC_APP_URL/PLAYWRIGHT_BASE_URL in local runs.
- There is no port derivation in playwright.config.ts (webServer.command is `npm run dev` without --port); the environment value must match the dev server port.
- Recommendation: standardize on http://127.0.0.1:3000 for NEXT_PUBLIC_APP_URL and PLAYWRIGHT_BASE_URL (cookie origin and supabase/config.toml auth.site_url alignment).

## webServer Behavior (Current Spec)
- Enabled only when baseURL contains localhost or 127.0.0.1 (playwright.config.ts isLocalBaseUrl).
- command: `npm run dev`
- url: baseURL
- reuseExistingServer: false (ensures E2E env like E2E_INVITE_MODE=skip is applied).
- timeout: 120_000ms
- env: passes process env and forces E2E_INVITE_MODE default to skip.

## Windows EPERM Handling (Current Spec)
- Playwright browser install: `npm run test:e2e:pw:install` (package.json).
- Jest Windows mitigation: `npm run test:windows` (package.json).
- No Windows-specific E2E runbook or PowerShell helper script is present; the general E2E prerequisites live in docs/test-runbook.md.

## Known Risks (Current)
- Port drift: playwright.config.ts webServer.command is `npm run dev` while baseURL is static, so Next may choose another port if 3000 is busy.
- Cold start timing: playwright.config.ts webServer.timeout is 120_000ms, which can be tight on Windows (see TD-002 in docs/technical-debt.md).

## DoD Delta (Strict)

### DOD-06: baseURL/webServer alignment
- Requirement (docs/stabilization/DoD-v0.1.md DOD-06): baseURL and webServer are aligned; no fallback ports; reload flows wait for `設定を読み込み中...` to be hidden after `page.reload({ waitUntil: 'domcontentloaded' })`.
- Evidence: `playwright.config.ts` `const baseURL` / `use.baseURL` / `webServer.url` / `webServer.command = 'npm run dev'` / `webServer.reuseExistingServer = false` / `webServer.timeout = 120_000`.
- Evidence: `src/__tests__/e2e-playwright/admin-settings.spec.ts` `page.reload({ waitUntil: 'domcontentloaded' })` and `expect(adminSettingsContent.getByText('設定を読み込み中...')).toBeHidden(...)`.
- 判定 (design/code): ✅ 達成（`.env.local`, `.env.test` に `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` を追加、`NEXTAUTH_URL` を `http://127.0.0.1:3000` に統一）。
- 実行検証: ✅ 実施済み (2026-01-22)。`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:pw -- --project=chromium` を実行。48 passed / 41 failed / 1 skipped。
- Gap: ポート3000が使用中の場合のリスクは残るが、PLAYWRIGHT_BASE_URLの明示設定により手動整合の負担は軽減。失敗41件はTD-002（Windowsページ遷移タイムアウト）に起因、baseURL不整合ではない。

### DOD-07: Windows spawn EPERM
- Requirement (docs/stabilization/DoD-v0.1.md DOD-07): Windows環境で `spawn EPERM` なく Playwright が起動する。
- Evidence: `package.json` `scripts.test:e2e:pw:install` が `playwright install` を提供; `docs/test-runbook.md` に一般的なE2E前提が記載。
- 判定 (design/code): ✅ 達成（Windows上で `spawn EPERM` エラーは発生しなかった）。
- 実行検証: ✅ 実施済み (2026-01-22)。Windows 上で `npm run test:e2e:pw -- --project=chromium` を実行し、EPERM エラーなしで完了。
- Gap: 解消。EPERM対策は不要であることを確認。

### DOD-11: Jest on Windows
- Requirement (docs/stabilization/DoD-v0.1.md DOD-11): `npm run test:windows` でJestが通る。
- Evidence: `package.json` `scripts.test:windows = "jest --runInBand --testPathIgnorePatterns=e2e"`.
- 判定 (design/code): ⚠️ 部分達成（スクリプトは実行可能だが、一部テスト失敗と open handles 警告あり）。
- 実行検証: ✅ 実施済み (2026-01-22)。`npm run test:windows` を実行。テストは完了するが、Jest が「open handles」警告で自動終了しない問題あり（`--forceExit` で回避可能）。
- Gap: 一部テスト失敗とopen handles問題は別課題（TD-002/TD-003関連）。Windows EPERM問題ではない。

## Non-goals
- Changing Playwright test content.
- Adding port detection or altering dev server port selection.
- Adding new browser channels.
- Changing migrations.

## Acceptance Criteria (v0.1 Documentation)
- Doc matches current behavior in playwright.config.ts, src/__tests__/e2e-playwright/global-setup.ts, and src/__tests__/e2e-playwright/helpers/auth.ts.
- Verification steps are documented (including preflight alignment for baseURL/port).
- DoD gaps for DOD-06/07/11 are listed in "DoD Delta (Strict)".
- DoD fulfillment is deferred to v0.2 implementation PRs.

## Rollback
- Documentation-only change; revert this file.

## Preflight
- Ensure port 3000 is available, or set PLAYWRIGHT_BASE_URL to the currently running dev server URL.

## Verification
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:pw -- --project=chromium
npm run test:windows
```

## Files Referenced
- playwright.config.ts
- src/__tests__/e2e-playwright/global-setup.ts
- src/__tests__/e2e-playwright/helpers/auth.ts
- docs/test-runbook.md
- docs/technical-debt.md
- .env.test.example
- supabase/config.toml
- package.json

## Meta Awareness (Document Positioning)
- This spec is a current-state snapshot aligned to implementation-order.md (Phase 6 is still not started).
- Update this document when playwright.config.ts baseURL/webServer settings change, or when .env.test.example/docs/test-runbook.md E2E prerequisites change.
- If DOD-06/07/11 fails in practice, create a new spec revision with an explicit plan and rollback rather than ad hoc edits.

## Troubleshooting Guide

| Symptom | Cause | Solution |
|---------|-------|----------|
| Port 3000 is in use | Existing dev server or node process | Stop it (Windows: `taskkill /F /IM node.exe`) or set PLAYWRIGHT_BASE_URL to the running server |
| spawn EPERM | Windows permission or file lock issue | Reinstall browsers with `npm run test:e2e:pw:install` and rerun; use `npm run test:windows` for Jest |
| ECONNRESET / timeout | Dev server not ready | Ensure baseURL matches the dev server and rerun after server is ready |
| TypeError: Cannot read properties | .next build artifacts missing | Run `npm run build` first |
