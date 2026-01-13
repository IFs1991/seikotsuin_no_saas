# AGENTS.md

## Scope
- Focus on stabilization for Supabase/Docker/Playwright/RLS.
- Prefer documentation and small, deterministic changes; avoid feature work.

## Work Rules
- 1 task = 1 PR. Keep PRs small and isolated.
- No destructive commands without explicit approval.
- Do not change migrations without a written spec and a rollback plan.
- When reporting findings, include repo file paths and the relevant setting or function name.

## Approval Required (examples)
- `supabase db reset`, `supabase db push`, `supabase migration up`
- Deleting Docker volumes or containers
- `git reset --hard`, `rm -rf`

## Standard Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Type check: `npm run type-check`
- Unit tests: `npm run test -- --ci --testPathIgnorePatterns=e2e`
- Playwright: `npm run test:e2e:pw`, `npm run test:e2e:pw:install`
- E2E data: `npm run e2e:validate-fixtures`, `npm run e2e:seed`, `npm run e2e:cleanup`
- Supabase local: `supabase start`, `supabase status`, `supabase db reset --local`, `supabase db push --local --dry-run`, `npm run supabase:types`
- Docker dev: `docker compose -f docker-compose.dev.yml up -d`, `docker compose ps`

## Evidence Standard
- Use exact file references (path + config name) for each claim.
- Tie stabilization tasks to DoD items in `docs/stabilization/DoD-v0.1.md`.
