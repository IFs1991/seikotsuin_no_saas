# Commercial hardening PR-01 evidence

## Scope

- Base: `83baf36b7a93bc8068eeaf9be74daec24dc021d6` (`main` after PR-00 merge)
- Branch: `codex/commercial-hardening-pr01`
- Objective: align the 50-migration schema contract, generated types, and stop-the-line CI.
- Production Supabase writes, migrations, RLS/GRANT remediation, and branch-protection changes are excluded.

## RED evidence

- Focused PR-01 contract test before implementation: 3/3 failed because `.supabase-cli-version`, the three generated composite-FK relationships, and `Database Contract` were absent.
- Remote generated types before regeneration: `COMM-TYPES-001`; committed `7dbf841c...` differed from remote `a9966e89...`.
- The nested-worktree default Jest command found no tests because Next.js selected the parent checkout as workspace root. The same focused test was therefore also run with the existing worktree-safe commercial Jest config; this environment issue was not counted as the contract RED.

## Implementation evidence

- `.supabase-cli-version` pins CLI `2.109.0`; the local verifier passed.
- `src/types/supabase.ts` was regenerated from project `qnanuoqveidwvacvbhqp` using the pinned CLI.
- The generated type delta contains the three expected composite foreign keys plus remote PostgREST runtime metadata.
- `Database Contract` now performs start, zero-state reset, pgTAP, regeneration, and full-file type diff before `App E2E` may run.
- `migration-history-baseline.sha256` freezes the filename and content hash of all 50 applied migrations. The verifier rejects deletion, rename, modification, duplicate versions, and insertion into frozen history while allowing later append-only versions.
- `commercial:verify:types:local` is the normal local schema contract and excludes only the PostgREST runtime metadata preamble. The original `commercial:red:types:local` evidence command remains strict and unchanged.
- The old `Supabase Types Contract` remains only as a transition check so an existing required context cannot become permanently pending.

## Database verification actually run

- A new ignored local project (`seikotsuin_commercial_pr01_replay3`) used separate `5463x` ports and did not reset or stop the developer's existing `5433x` stack.
- DB-only first start replayed all migrations and seed successfully; catalog history reported `migration_count = 50` and latest version `20260707000200`.
- `supabase test db --local`: 4 files, 53 tests, all successful.
- Remote generated types match the committed file exactly (`a9966e89...`).
- Clean local schema matches the committed schema after explicitly excluding only `__InternalSupabase` runtime metadata. DB-only typegen reports no PostgREST version, while the target remote reports `14.5`; the committed remote metadata is preserved during local regeneration.
- The focused PR-01 test now verifies the 50-entry baseline, append-only success, applied-migration content drift failure, CI history-gate ordering, and App E2E dependency.
- A full local stack also completed all migrations and seed, but Realtime/Storage health checks exceeded this machine's resource envelope. That attempt is not reported as a successful full-stack start.

## Not yet verified before the follow-up PR run

- The CI-ephemeral `supabase db reset --local` result and GitHub `Database Contract` check.
- Full Jest, Security Tests, Build, and App E2E for this branch.
- GitHub branch protection. Applying it requires explicit human approval after the new check has appeared once.
- A follow-up local build compiled successfully but could not complete page-data collection without environment variables; the retry stopped on local disk exhaustion (`ENOSPC`). GitHub `Build` remains the authoritative pending result.
- A follow-up destructive reset was not run because `supabase db reset --local` requires separate explicit approval. The already-replayed isolated DB still passed all 53 pgTAP tests and the normalized local type contract.

## Residual risk

- No RLS, grant, function, composite-FK migration, auth, invite, billing, or route-classification defect from PR-00 is remediated in PR-01.
- The clean replay still reports six exposed `public` tables with RLS disabled: `master_categories`, `master_patient_types`, `master_payment_methods`, `menu_categories`, `treatment_menu_records`, and `treatments`. Enabling RLS without reviewed policies could block required access, so this remains for the later grant/RLS PRs and was not auto-fixed.
- No Supabase `db push` or remote migration apply was run; PR-01 adds no migration.

No secret, token, patient data, real email address, or phone number is stored in this evidence.
