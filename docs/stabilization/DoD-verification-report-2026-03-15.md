# DoD Verification Report (PR-05 Bundle, 2026-03-15)

## Meta

| Item | Value |
|------|-------|
| Execution Date | 2026-03-15T00:58:10+09:00 |
| Commit SHA | `31754565c6107a14796ad3c58f1e187adefe8b72` |
| Branch | `main` |
| Platform | Windows |
| Supabase CLI | v2.75.0 |

## Summary

- DOD-05: PASS
- DOD-06: BLOCKED
- DOD-07: FAIL
- DOD-08: PASS
- DOD-09: PASS
- DOD-10: PASS
- DOD-11: PARTIAL PASS
- DOD-12: PASS

PR-05 は「新規実装」ではなく repo-wide 再検証として実施した。
build / type-check / type generation / focused Jest / fixture seed-cleanup は再現できた。
Playwright は Windows 上で `spawn EPERM` が再現し、環境ブロッカーとして残っている。

## Results

### DOD-05 E2E fixture validation + seed/cleanup are idempotent

| Command | Result | Notes |
|---------|--------|-------|
| `npm run e2e:validate-fixtures` | PASS | `Supabase ready after 623ms` |
| `npm run e2e:seed` | PASS | `E2E seed data ready.` |
| `npm run e2e:cleanup` | PASS | `E2E data cleanup completed.` |
| `npm run e2e:seed` | PASS | cleanup 後の再 seed も成功 |

### DOD-06 Playwright baseURL and webServer are aligned and stable

| Command | Result | Notes |
|---------|--------|-------|
| `npx playwright test --project=chromium` | BLOCKED | テスト開始前に `spawn EPERM` |
| `chromium.launch()` minimal reproduction | BLOCKED | `browserType.launch: spawn EPERM` |

baseURL / env 読み込みの前に browser launch で停止するため、webServer 安定性までは到達していない。

### DOD-07 Playwright runs on Windows without spawn EPERM

| Command | Result | Notes |
|---------|--------|-------|
| `npx playwright test --project=chromium` | FAIL | `spawn EPERM` |
| `chromium.launch({ headless: false })` | FAIL | headless false でも `spawn EPERM` |

補足:

- `chrome-headless-shell.exe --version` は直接実行可能
- `chrome.exe --version` も直接実行可能
- したがって実行ファイル破損ではなく、Playwright launch 経路固有の Windows 環境問題と判断した

### DOD-08 Tenant boundary + RLS source-of-truth are consistent

| Command | Result | Notes |
|---------|--------|-------|
| `psql ... pg_policies ...` | PASS | `reservations`, `blocks`, `customers`, `menus`, `resources`, `reservation_history`, `ai_comments` の policy qual が `can_access_clinic(clinic_id)` または同等ガードを利用 |

補足:

- `supabase db query --local` は CLI `v2.75.0` では未対応のため `psql` で代替
- source-of-truth は `can_access_clinic(...)` / `get_current_role()` 系に寄っており、旧 `profiles` / `user_permissions` 混在の兆候は当該 tenant tables では未検出

### DOD-09 Client paths do not bypass server-side clinic guards

| Command | Result | Notes |
|---------|--------|-------|
| `rg -n "createClient\\(|from\\('blocks'\\)|from\\('reservations'\\)" src` | PASS | hit の大半は `src/app/api/**`, `src/lib/services/**`, `src/__tests__/**` で、browser component から tenant table へ直接アクセスする経路は今回対象では未検出 |

関連修正:

- [src/app/api/admin/tenants/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/tenants/route.ts)
  - `resolveScopedClinicIds`
  - `allowedRoles: Array.from(HQ_ROLES)`
- [src/app/api/admin/tenants/[clinic_id]/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/tenants/[clinic_id]/route.ts)
  - `canAccessClinicScope`

### DOD-10 Next build is reproducible

| Command | Result | Notes |
|---------|--------|-------|
| `npm run build` | PASS | build 完了。ESLint warnings は残るが fatal error なし |

補足:

- `npm run supabase:types` 後に `src/types/supabase.ts` が未整形になり build を壊していたため、生成スクリプトで Prettier を実行するよう修正した
- 変更箇所: [scripts/generate-supabase-types.mjs](/C:/Users/seekf/Desktop/seikotsuin_management_saas/scripts/generate-supabase-types.mjs)

### DOD-11 Jest regression suite runs without EPERM on Windows

| Command | Result | Notes |
|---------|--------|-------|
| focused PR-05 suite | PARTIAL PASS | 9 suites / 94 tests pass |

実行コマンド:

```bash
npm test -- --runInBand --runTestsByPath \
  src/__tests__/api/admin-settings.test.ts \
  src/__tests__/api/admin-tenants-access.test.ts \
  src/__tests__/api/multi-store-kpi.test.ts \
  src/__tests__/auth/middleware-auth.test.ts \
  src/__tests__/components/admin-settings.test.tsx \
  src/__tests__/components/admin-settings-navigation.test.tsx \
  src/__tests__/components/navigation/admin-navigation.test.tsx \
  src/__tests__/lib/api-helpers-auth.test.ts \
  src/__tests__/lib/reservation-service.test.ts
```

全量 `npm run test -- --ci --testPathIgnorePatterns=e2e` は repo 全体のコストが高く、PR-05 では focused verification に留めた。

### DOD-12 Supabase type generation output is clean

| Command | Result | Notes |
|---------|--------|-------|
| `npm run supabase:types` | PASS | `export type Json =` で始まる clean output |
| header validation | PASS | `src/types/supabase.ts` 先頭行が正しい |
| `npm run build` after `supabase:types` | PASS | 生成後も build が崩れない |

## Findings

### F-01 [HIGH] Playwright browser launch fails with `spawn EPERM` on Windows

- Scope: DOD-06, DOD-07
- Symptom: `npx playwright test --project=chromium` が browser launch 前後で即失敗
- Repro: `chromium.launch()` / `chromium.launch({ headless: false })`
- Status: OPEN

### F-02 [MEDIUM] `supabase db query --local` is unavailable on current CLI version

- Scope: DOD-08 runbook command
- Symptom: `unknown flag: --local`
- Workaround: `psql` で local database に直接問い合わせる
- Status: DOCUMENTED

### F-03 [MEDIUM] `supabase:types` previously left `src/types/supabase.ts` unformatted

- Scope: DOD-10, DOD-12
- Symptom: `npm run supabase:types` の後に `npm run build` が Prettier error で失敗
- Fix: 生成スクリプトで Prettier を実行
- Status: RESOLVED

## Changed Files Relevant To Verification

- [scripts/generate-supabase-types.mjs](/C:/Users/seekf/Desktop/seikotsuin_management_saas/scripts/generate-supabase-types.mjs)
- [src/app/api/admin/tenants/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/tenants/route.ts)
- [src/app/api/admin/tenants/[clinic_id]/route.ts](/C:/Users/seekf/Desktop/seikotsuin_management_saas/src/app/api/admin/tenants/[clinic_id]/route.ts)
- [docs/test-runbook.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/test-runbook.md)
- [docs/stabilization/DoD-verification-report-2026-03-15.md](/C:/Users/seekf/Desktop/seikotsuin_management_saas/docs/stabilization/DoD-verification-report-2026-03-15.md)

## Next Actions

1. Windows の `spawn EPERM` を別タスクで切り分ける
2. 必要なら DOD-11 の全量 Jest を別 PR/別証跡で取得する
3. `supabase db query` を使える CLI へ更新するか、runbook の `psql` 代替を標準化する
