# Supabase + Vercel Deployment Checklist v0.1

This is a practical checklist for local -> staging -> production. Use it to track evidence for MVP beta readiness.


## 0. Preconditions

- All stabilization specs that affect RLS/guards are merged.
- `docs/stabilization/DoD-v0.1.md` scope is understood.
- All required env vars are defined for each environment.
- Test users exist for at least two clinics and multiple roles.


## 1. Local Validation (Pre-Deploy)

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run build`
- [ ] `npm run test -- --ci --testPathIgnorePatterns=e2e`
- [ ] `npm run test:e2e:pw -- --project=chromium` (optional if E2E is required now)

Supabase (local) for DoD evidence:
- [ ] `supabase start`
- [ ] `supabase status`
- [ ] `node scripts/verify-supabase-connection.mjs`
- [ ] `supabase db reset --local --no-seed` (approval required)
- [ ] `supabase db reset --local` (approval required)
- [ ] `supabase db push --local --dry-run` (approval required)
- [ ] DOD-08 query from `docs/stabilization/DoD-v0.1.md`
- [ ] DOD-09 rg check from `docs/stabilization/DoD-v0.1.md`

Notes:
- `supabase db reset --local`, `supabase db push --local`, and `supabase migration up` require explicit approval before running.


## 2. Staging Deploy (Supabase)

- [ ] Create a staging Supabase project.
- [ ] Configure staging env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY` (if used)
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
