# Test Runbook

## Purpose

PR-05 verification bundle のローカル再現手順を 1 回で追えるようにする。
対象は Supabase local, fixture seed/cleanup, Playwright 前提, focused Jest, build, type generation である。

## Preconditions

- Docker Desktop が起動していること
- `supabase status` が応答すること
- `.env.local` または `.env.test` に以下が設定されていること
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`
- `playwright.config.ts` は `PLAYWRIGHT_BASE_URL` または `NEXT_PUBLIC_APP_URL` を使い、未指定時は `http://127.0.0.1:3000` を使う

## Recommended Order

1. Supabase local の起動確認

```powershell
supabase status
```

2. fixture validate / seed / cleanup の再現性確認

```powershell
npm run e2e:validate-fixtures
npm run e2e:seed
npm run e2e:cleanup
npm run e2e:seed
```

3. focused Jest の実行

```powershell
npm run test -- --runInBand --runTestsByPath `
  "src/__tests__/api/admin-settings.test.ts" `
  "src/__tests__/api/admin-tenants-access.test.ts" `
  "src/__tests__/api/multi-store-kpi.test.ts" `
  "src/__tests__/auth/middleware-auth.test.ts" `
  "src/__tests__/components/admin-settings.test.tsx" `
  "src/__tests__/components/admin-settings-navigation.test.tsx" `
  "src/__tests__/components/navigation/admin-navigation.test.tsx" `
  "src/__tests__/lib/api-helpers-auth.test.ts" `
  "src/__tests__/lib/reservation-service.test.ts"
```

4. RLS / tenant guard の確認

ローカル DB への読み取り専用クエリとコード検索を行う。

```powershell
supabase db query --local "select tablename, policyname, qual from pg_policies where schemaname='public' and tablename in ('reservations','blocks','customers','menus','resources','reservation_history','ai_comments') order by tablename, policyname;"

rg -n "createClient\(|from\('blocks'\)|from\('reservations'\)" src
```

5. type generation と build

```powershell
npm run supabase:types
npm run type-check
npm run build
```

## Playwright

通常実行:

```powershell
npm run test:e2e:pw -- --project=chromium
```

### Known Windows blocker

- Windows 環境によっては `browserType.launch: spawn EPERM` で Playwright が起動しない
- 本件は `npm run test:e2e:pw -- --project=chromium` だけでなく、最小再現の `chromium.launch()` でも再現する
- `chrome.exe --version` や `chrome-headless-shell.exe --version` が直接実行できても、Playwright launch 経路だけ失敗するケースがある

切り分け用最小再現:

```powershell
node -e "const { chromium } = require('@playwright/test'); chromium.launch().catch(err => { console.error(err); process.exit(1); })"
```

## Current PR-05 Scope

- `admin-settings`
- `admin-tenants`
- `auth-context`
- `reservations`
- `multi-store` / HQ-clinic guard
- `supabase:types`, `type-check`, `build`

## Notes

- `npm run supabase:types` は生成後に `src/types/supabase.ts` を Prettier 整形する
- `npm run test -- --ci --testPathIgnorePatterns=e2e` は repo 全体では重いため、PR-05 では focused suite を優先する
- Playwright が `spawn EPERM` の場合、DoD report には環境ブロッカーとして分離して記録する
