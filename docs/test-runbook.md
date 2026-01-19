# Test Runbook

## Prerequisites
- Node.js >= 18.18 and npm >= 10
- Env vars for Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (E2E seed/cleanup)
- Local Supabase or an E2E project configured in `.env.test` or `.env.local`.

## Unit / Integration (Jest)
```bash
npm run test
```

Windows (EPERM workaround):
```bash
npm run test:windows
npm run test:windows:md
```

Optional:
```bash
npm run test:coverage
npm run type-check
npm run lint
```

## E2E (Playwright)
Install browsers once:
```bash
npm run test:e2e:pw:install
```

Run E2E:
```bash
npm run test:e2e:pw
```

Target a specific spec:
```bash
npx playwright test admin-settings
```

UI mode:
```bash
npm run test:e2e:pw:ui
```

## E2E Data Utilities
Global setup will run fixture validation + seed automatically, but you can run them manually:
```bash
npm run e2e:validate-fixtures
npm run e2e:seed
npm run e2e:cleanup
```

## Troubleshooting
- 401/403 in E2E: check `storageState` and test user credentials.
- Empty screens: verify seed ran successfully.
- Timeouts: add `page.waitForResponse` after save actions.
