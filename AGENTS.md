# AGENTS.md

## Scope

- Focus on stabilization for Supabase, Docker, Playwright, RLS, and tenant isolation.
- Prefer documentation and small, deterministic changes.
- Avoid feature work unless explicitly requested.
- Keep changes minimal, reviewable, and easy to revert.

## Environment

- Development is done on Windows.
- Prefer PowerShell-compatible commands.
- Do not assume Unix, macOS, or Linux shell behavior unless explicitly stated.
- Avoid Unix-only commands such as `rm -rf`, `cp`, `mv`, `grep`, `sed`, `awk`, `chmod`, and `export VAR=value`.
- Use Windows / PowerShell equivalents when giving commands.

## Package Manager

- Respect the package manager already established by this repository.
- This repository uses npm.
- Do not switch package managers unless explicitly instructed.
- Do not introduce lockfiles for other package managers.
- Do not mix package managers.
- Do not regenerate dependency files unless the requested task requires dependency changes.

## Type Safety

- Strict TypeScript discipline is required.
- Do not introduce:
  - `any`
  - `as any`
  - `Array<any>`
  - `Record<string, any>`
  - `Promise<any>`
  - function parameters typed as `any`
  - return values typed as `any`
  - casts through `any`
- Do not use `any` as a temporary workaround.
- Do not use `// @ts-ignore`.
- Use `// @ts-expect-error` only for intentional negative tests, with a short explanation.
- Avoid unsafe broad casts such as `value as unknown as SomeType`.
- Avoid non-null assertions such as `value!` unless there is a clear invariant.
- If existing code already contains `any`, do not copy or expand that pattern.
- Replace existing `any` only when it is directly relevant to the requested change.
- Do not create broad unrelated refactors just to eliminate historical `any` usage.

When a type is unknown, prefer:

- precise interfaces or type aliases
- `unknown` with safe narrowing
- type guards
- discriminated unions
- generics with constraints
- Supabase-generated types
- runtime validation at API boundaries
- explicit null / undefined handling

Do not weaken types just to make TypeScript, ESLint, or tests pass.

## Work Rules

- 1 task = 1 PR.
- Keep PRs small and isolated.
- No destructive commands without explicit approval.
- Do not change migrations without a written spec and a rollback plan.
- Do not weaken RLS, authorization, tenant isolation, or clinic-scoped access to make tests pass.
- When reporting findings, include repo file paths and the relevant setting, function, policy, route, or test name.
- Prefer fail-closed behavior for authorization and tenant-scoped data access.

## Approval Required

Ask for explicit approval before running or proposing destructive or state-changing commands such as:

- `supabase db reset`
- `supabase db push`
- `supabase migration up`
- `supabase db reset --local`
- deleting Docker volumes or containers
- `git reset --hard`
- deleting files or directories recursively
- force-push operations
- destructive migration changes

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

## Supabase / RLS Rules

Treat the following as security-sensitive:

- `clinic_id`
- `tenant_id`
- `organization_id`
- `user_id`
- `staff_id`
- `role`
- permissions
- clinic scope
- tenant scope

When touching Supabase or database access:

- Prefer generated Supabase database types.
- Use typed Supabase clients where possible.
- Distinguish Row, Insert, Update, API request, API response, UI form, and domain model types when they differ.
- Do not replace precise database types with loose object types.
- Do not bypass RLS assumptions with client-side-only checks.
- Do not weaken authorization logic to make tests pass.
- Add or update tests when touching authorization, tenant boundaries, role logic, or clinic-scoped data.

Never treat tenant isolation as only a UI concern.

## Testing Priorities

Prioritize tests around:

- tenant isolation
- authorization
- role boundaries
- clinic-scoped access
- reservation visibility
- patient data access
- API request validation
- form validation
- Playwright regressions
- RLS behavior
- Supabase fixture consistency

Do not change tests merely to match a broken implementation.

If a test fails, determine whether the implementation, fixture, environment, or test expectation is wrong.

## Evidence Standard

- Use exact file references for each claim.
- Include path plus relevant config name, function name, policy name, route, or test name.
- Tie stabilization tasks to DoD items in `docs/stabilization/DoD-v0.1.md`.
- Do not claim verification was completed unless the command was actually run.
- If verification cannot be run, state what was not verified and why.

## Final Review Before Responding

Before finalizing any change, review the diff and confirm:

- No new `any` was introduced.
- No new `as any` was introduced.
- No unsafe type escape hatch was introduced without justification.
- No `@ts-ignore` was introduced.
- No unnecessary `@ts-expect-error` was introduced.
- No Unix-only command was assumed.
- npm was respected.
- No foreign lockfile was introduced.
- TypeScript strictness was preserved.
- RLS was not weakened.
- authorization was not weakened.
- tenant isolation was not weakened.
- migration changes, if any, have a written spec and rollback plan.
- changes are small, focused, and maintainable.