# Supabase + Vercel Deployment Checklist v0.1

This is a practical checklist for local -> staging -> production. Use it to track evidence for MVP beta readiness.


## 0. Preconditions

- All stabilization specs that affect RLS/guards are merged.
- `docs/stabilization/DoD-v0.1.md` scope is understood.
- All required env vars are defined for each environment.
- Test users exist for at least two clinics and multiple roles.


## 1. Local Validation (Pre-Deploy)

### Required (must match CI required gates)

CI required check display names — all must be green before deploy:

- `Quality Checks`
- `Build`
- `Database Contract`
- `Fixture Preflight (Static)`
- `Full Jest Regression`
- `Security Tests`
- `App E2E (Local Supabase + Chromium)`

`Supabase Types Contract` is a transition-only header corruption check. Keep it
required until `Database Contract` has run successfully at least once, then
remove it from branch protection; it is not a substitute for full type drift.

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run scan:secrets`
- [ ] `npm run build`
- [ ] Validate the pinned CLI and full generated type contract:
  ```powershell
  npm run supabase:cli:verify
  npm run supabase:types
  git diff --exit-code -- src/types/supabase.ts
  ```
- [ ] `$env:E2E_SKIP_DB_CHECK = '1'; npm run e2e:validate-fixtures`
- [ ] `npm run test:pr05:focused`

### Optional / Known Blockers

- [ ] `npm run e2e:validate-fixtures` (with DB) — requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `npm run test:e2e:pw -- --project=chromium` — CIのApp E2Eと同じ主要smokeを実行する場合は、ローカルfixtureと環境変数を先に準備する。

Supabase (local) for DoD evidence:
- [ ] `supabase start`
- [ ] `supabase status`
- [ ] `node scripts/verify-supabase-connection.mjs`
- [ ] `supabase db reset --local --no-seed` (approval required)
- [ ] `supabase db reset --local` (approval required)
- [ ] `supabase db push --local --dry-run` (approval required)
- [ ] Preflight NULL check before `20260218000500` migration (all 0):
  - `customers`, `menus`, `resources`, `reservations`, `blocks`, `reservation_history`
- [ ] DOD-08 query from `docs/stabilization/DoD-v0.1.md`
- [ ] DOD-09 rg check from `docs/stabilization/DoD-v0.1.md`

Notes:
- `supabase db reset --local`, `supabase db push --local`, and `supabase migration up` require explicit approval before running.

### Branch protection transition (human approval required)

1. PR上で新しい `Database Contract` が一度実行されるまで待つ。
2. `main` の Settings → Branches / Rulesets で、上記display nameをrequired status checksへ追加する。
3. `Require branches to be up to date`, review必須、stale approval破棄、conversation resolution、force-push禁止を有効にする。
4. 赤い `Database Contract` または `App E2E` があるPRでmerge操作が無効になることを確認する。
5. 新ゲートの動作確認後に限り、旧 `Supabase Types Contract` をrequiredから外す。
6. 設定画面のスクリーンショットまたは次のread-only API出力を `docs/stabilization/evidence/commercial-hardening/pr01/` に保存する（tokenや個人情報は保存しない）。

```powershell
gh api repos/IFs1991/seikotsuin_no_saas/branches/main/protection
```

`Migration Safety Audit` と `Codex Detached Review` はcheck providerを実装してからrequired化する。存在しないcontextをrequiredにするとPRが永久pendingになる。


## 2. Staging Deploy (Supabase)

- [ ] Create a staging Supabase project.
- [ ] Configure staging env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `GEMINI_API_KEY` (if used)
- [ ] Set MFA encryption key for DB:
  - `ALTER DATABASE postgres SET "app.settings.mfa_encryption_key" = '<random>';`
- [ ] Apply migrations to staging (approval required).
- [ ] Confirm RLS policies and tenant boundary:
  - Run DOD-08 query against staging DB.
  - Verify policy helper consistency (single source of truth).
- [ ] Seed staging data and verify expected fixtures (if required).


## 3. Staging Deploy (Vercel)

- [ ] Create a Vercel project for staging.
- [ ] Set env vars in Vercel (staging).
- [ ] Deploy and verify:
  - [ ] `/api/health` returns ok.
  - [ ] Login works for each role.
  - [ ] Cross-clinic access is blocked.
  - [ ] Public endpoints validate clinic/menu.
- [ ] Run Playwright against staging (if required).
- [ ] Record evidence in `docs/operations/pen-test-evidence-YYYYMMDD.md`.


## 4. Production Deploy (Supabase)

- [ ] Create a production Supabase project.
- [ ] Configure production env vars (same keys as staging).
- [ ] Set MFA encryption key for DB:
  - `ALTER DATABASE postgres SET "app.settings.mfa_encryption_key" = '<random>';`
- [ ] Apply migrations to production (approval required).
- [ ] Validate RLS policies and tenant boundary (DOD-08 query).
- [ ] Confirm backups and retention settings.


## 5. Production Deploy (Vercel)

- [ ] Create/Promote Vercel production deployment.
- [ ] Set production env vars.
- [ ] Verify critical endpoints and role flows.
- [ ] Start monitoring and alerting per `docs/operations/RUNBOOK.md`.


## 6. Go/No-Go Checklist

- [ ] No Critical/High findings from pen test checklist.
- [ ] DOD-08 and DOD-09 are verified with evidence.
- [ ] Build and tests succeed.
- [ ] Staging sign-off complete.


## Evidence Links

- `docs/stabilization/DoD-v0.1.md`
- `docs/operations/PENETRATION_TEST_CHECKLIST.md`
- `docs/operations/pen-test-test-items-v0.1.md`
