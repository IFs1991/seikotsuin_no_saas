# Commercial hardening PR-00 evidence

## Verdict

- PR-00 inventory and RED-contract deliverable: implemented; final branch verification is recorded in `green-tests.md`.
- Commercial release: **BLOCK**. This PR intentionally changes no production schema and leaves the discovered security/data-integrity contracts RED for later PRs.
- Base: `c12f7c13b0dca2c05e4ac7ced53b3bf9e665592e` (`origin/main` at branch creation).
- Branch: `codex/commercial-hardening-pr00`.

## Provenance

- Canonical `*-before.csv`, `migrations-remote.txt`, and both advisor JSON files describe Supabase project `qnanuoqveidwvacvbhqp`. SQL catalog rows were obtained through the read-only Supabase SQL API because the isolated worktree does not contain mutable CLI link state.
- `*-local-before.csv` and `migrations-local.txt` describe the already-running local Supabase stack and are reproducible with `npm run commercial:inventory:db` / `npm run commercial:inventory:db:check`.
- `route-manifest.json`, `table-classification-draft.csv`, and `source-reference-inventory.json` are deterministic repository inventories. Their `:check` scripts detect drift.
- `types-local.sha256` and `types-remote.sha256` hash freshly generated, Prettier-normalized type output. `types-committed.sha256` hashes `src/types/supabase.ts`; that source file was not overwritten.

## Before-state summary

- Migrations: repository 50 and remote 50 version IDs match; the existing local stack has 48. Remote name metadata for version 20260508000100 uniquely retains a .sql suffix while the repository basename does not; raw histories preserve that known mismatch.
- Generated types: committed/local `7dbf841c...` match; remote `a9966e89...` differs.
- Tables: 86 remote `public` tables. The draft classifies 38 only as spec candidates and blocks 48 as `UNKNOWN`.
- Routes: 143 route files scanned; 117 mutation handlers in 91 files; all 117 remain deliberately `UNKNOWN` and reproduce `COMM-ROUTE-001`.
- Side-effecting GET candidates: `/api/ai-comments` plus three internal cron routes. Cron-secret evidence is recorded separately from user authentication.
- Source references: 605 runtime JS/TS files scanned, 69 of 86 catalog tables have literal `.from()` references, and 10 literal RPC names were observed. Dynamic names/import graphs remain unknown.
- Security Advisor: 17 findings. Performance Advisor: 479 findings.
- Local replay exposes six tables with RLS disabled. Remote has RLS enabled on those tables but no policies, demonstrating environment drift rather than a safe shared state.

## Artifact contract

- `tables-*.csv`: table/RLS/effective write-any snapshot.
- `privilege-*.csv`: effective object ACLs, effective global default ACLs, and schema default additions. Stable function identities use `regprocedure`, not OID-derived `specific_name`.
- `policies-*.csv`, `functions-*.csv`, `constraints-*.csv`, `indexes-*.csv`: catalog snapshots. Function callers are cross-referenced through `source-reference-inventory.json`; dynamic callers remain unknown.
- `function-dependencies-*.csv` and `function-callers-*.csv`: trigger/policy/view/function/constraint/default dependencies plus literal source RPC callers, mapped to stable `regprocedure` signatures. Dynamic/transitive callers remain explicit unknowns.
- `relation-preflight-*.csv`: orphan/mismatch counts for the 18 named tenant relations.
- `staff-id-semantics-*.csv`: observed ID matches and catalog-derived FK targets. Owner decisions are intentionally not embedded in SQL output.
- `staff-id-semantics-decisions.yaml`: §7.4 semantic owner, reader/writer symbols, match rates, and fail-closed decisions, including the absent legacy `staff.user_id` column.
- `red-tests.md`: required pre-fix failures and exact markers.
- `green-tests.md`: checks actually run; missing checks are marked `NOT_RUN` or `FAIL`.
- `subagent-audits/`: independent read-only review results.
- `staging/` and `restore-drill/`: explicit `NOT_RUN` placeholders for PR-12, not fabricated evidence.

No `*-after` artifact is present because PR-00 performs no production migration or security fix. It would be misleading to duplicate the before state as an after state.

## Safety

The evidence directory contains no secret, token, patient record, real email address, or real phone number. The parent-rehome SQL contract uses fixed synthetic UUIDs and data inside a statement that always raises; the post-run zero-row check confirms rollback.
