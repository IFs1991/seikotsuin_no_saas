# PR-00 checks actually run

## PASS

- `npm run commercial:inventory:routes:check`
- `npm run commercial:inventory:tables:check`
- `npm run commercial:inventory:source:check`
- `npm run commercial:inventory:staff-ids:check`
- `npm run commercial:inventory:function-callers:check`
- `npm run commercial:inventory:db:check` twice consecutively (existing local Supabase; all structural catalog files reproduced with CLI telemetry disabled)
- Focused server Jest with an explicit worktree-safe `testMatch`: `mutating-route-inventory.test.ts`, 4/4 tests passed.
- `node --check` for every new commercial-hardening JavaScript module and the dedicated Jest config.
- `npm run commercial:red:db` wrapper: 9/9 expected SQL markers reproduced.
- `npm run commercial:red:invite` wrapper: exact partial-commit state marker reproduced.
- Fresh non-writing local type generation: matches `src/types/supabase.ts`.
- Parent-rehome fixed UUID cleanup query: zero residual fixture rows.
- `npm ci`: lockfile-resolved install completed; `package-lock.json` stayed unchanged. npm reported four pre-existing moderate audit findings.
- Node 24.18.0: `npm run lint`, `npm run type-check`, `npm run type-check:commercial`, and `npm run scan:secrets`.
- Node 24.18.0: `npm run build` passed with the same non-secret placeholder environment used by `.github/workflows/ci.yml`. The first no-env attempt compiled but correctly failed page-data collection because required variables were absent.
- Node 24.18.0 client Jest project: 83 suites passed; 505 tests passed and 1 skipped.
- Normal server Jest discovery excludes the intentional RED contract independently of the worktree path: 306 test paths discovered and 0 paths under `src/__tests__/red-contracts/`.
- Six independent audit YAML files parse successfully and conform to specification §18.2 enums, SHA scope, concrete evidence references, and PASS/FAIL/NOT_RUN test results.

## FAIL / UNRESOLVED

- Broader Node 24.18.0 server Jest project (pre-existing failures, unchanged by PR-00): 300 suites passed, 3 skipped, and 2 failed; 2,364 tests passed, 20 skipped, and 2 failed.
- The two failures are `src/__tests__/e2e/auth-login-flow.test.ts` and `src/__tests__/e2e/happy-path.test.ts`. Both were reproduced individually: each expects the login action to reject with a redirect, while the current unchanged action returns a system-error result object.
- PR-00 changes neither those tests nor the login action. These broader-suite failures are not part of DOD-11's documented non-E2E command; they remain a separate baseline regression and were not hidden by changing expectations.
- The exact Node 24.18.0 DOD-11/CI command, npm run test -- --ci --testPathIgnorePatterns=e2e, was run and exited 1 with No tests found in this nested worktree after Next.js inferred the parent checkout as its workspace root. This is a truthful local FAIL, not a test PASS; GitHub's normal root-checkout behavior remains unverified until CI runs on a pull request.

## EXPECTED FAIL / BLOCK

- Remote generated-type parity: `COMM-TYPES-001`.
- Mutation classification target contract: `COMM-ROUTE-001` for all 117 handlers.
- Security/data-integrity/invite DB contracts remain RED by PR-00 design; see `red-tests.md`.

## NOT RUN YET

- Migration replay/reset, because `supabase db reset` is destructive and was not authorized for this PR-00 audit.
- Supabase DB test suite.
- Playwright.
- Staging apply, canary, production deploy, rollback exercise, and restore drill.

This file is updated after the final verification pass; no unrun check may be promoted to PASS.
