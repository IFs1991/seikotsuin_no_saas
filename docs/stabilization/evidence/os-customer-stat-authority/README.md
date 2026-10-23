# OS-F1 (#147) local real-DB evidence

Spec: [`spec-os-customer-stat-authority-v0.1.md`](../../spec-os-customer-stat-authority-v0.1.md)

These files come from an isolated, disposable PostgreSQL 17.6 cluster with a minimal Supabase role/auth shim (the Supabase CLI stack could not be started in the authoring environment: ECR/GHCR are blocked by its network policy and Docker Hub was rate limited), plus one production-like run on the official `supabase/postgres:17.6.1.140` image with the real GoTrue migrations (`official-image.txt`). They are supporting evidence only. The canonical gate is the CI `Database Contract` job (pinned Supabase CLI, clean replay, `supabase test db`, race verifiers, generated-type diff).

All data is synthetic. Nothing here was read from or written to a shared, staging or production database.

## Commits and environment

| Tree                                                   | Commit                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| head (code verified here)                              | `544014c375e903f33575b3d8a67739c7af4b5b7c`                         |
| base `main`                                            | `91d18779ed94c5688c1daa15363e4a5b99da1ecf`                         |
| implementation before the independent review           | `2723f03c591f17611bfc30dc56f3df5b220f9d07`                         |
| `20261023064851_os_customer_stat_authority.sql` sha256 | `a8b95169167d0b3c12b5ecb86a147809eb82772f40572ef602ab1bbd4c64feec` |

`environment.txt`: PostgreSQL 17.6, pgTAP 1.3.2, pg_prove 3.36, Node v22.22.0, Supabase CLI 2.109.0. Every database was created empty and replayed from `supabase/migrations/` (plus `supabase/seed.sql`) for this run on 2026-10-23 between 12:22:23Z and 12:27:05Z; the official image run followed between 12:27:12Z and 12:27:53Z. `run.txt` has the timestamp and result of every step. The commit that adds these files after `544014c` changes this directory only.

## Files

| File                                                               | Content                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `environment.txt` / `run.txt`                                      | Versions and commits; every step with its timestamp and result                                                                                                           |
| `catalog-before.txt` / `catalog-after.txt`                         | Catalog snapshot of base `main` and of head, both replayed from zero                                                                                                     |
| `catalog-prodlike-before.txt` / `catalog-prodlike-after.txt`       | Production-like history (every migration except `20260906003219` and `20261023064851`) before and after applying `20261023064851` alone with its history row in one send |
| `prodlike.txt`                                                     | The same run: §9.1 gate (counts only), data fingerprints, history, the apply, the next write, pgTAP and its control, races, the §9.3 template, the §9.4 restore          |
| `pgtap-red-base.txt`                                               | Head pgTAP suite on base `main` (RED, verbose)                                                                                                                           |
| `races-red-base.txt` / `races-prev.txt` / `races-green-head-1.txt` | Race verifier on base `main` (RED), on `2723f03` (review counterexamples RED) and on head                                                                                |
| `mutations.txt`                                                    | Three mutations of the head migration and one of the tenant boundary, and the tests that catch them                                                                      |
| `reenable.txt`                                                     | §9.4 item 3: emergency stop and re-enable rebuild only the touched customers, including a transaction that began before the stop and wrote after it                      |
| `official-image.txt`                                               | Production-like single-file apply on the official image (non-superuser `postgres`, real GoTrue migrations)                                                               |

## Expected catalog difference (and the only one)

Comparing `catalog-before.txt` with `catalog-after.txt` (and the prod-like pair):

- `customers.total_visits` / `total_revenue` / `last_visit_date`: comments added (types and defaults unchanged).
- Triggers on `reservations`: `reservations_customer_visit_stats_insert` / `_update` / `_delete` (AFTER, FOR EACH STATEMENT, transition tables) added; `update_customer_stats_trigger` removed.
- Functions: `app_private.refresh_customer_visit_stats(uuid[])` and `app_private.sync_customer_visit_stats()` added (SECURITY DEFINER, `search_path=""`, owner `postgres`, EXECUTE only for the owner); `public.update_customer_stats()` removed (it was EXECUTE-able by `service_role`).
- `supabase_migrations.schema_migrations`: one row `20261023064851 os_customer_stat_authority`.
- Unchanged: RLS enablement, policies (definition md5), table grants, `patient_visit_summary` (definition md5, `security_invoker`), the other triggers on `reservations` / `customers`.

Before applying to a shared or production database, capture the same snapshot with read-only catalog queries and compare (spec §9.1, §9.2).

## Results

Format of `docs/quality/change-dod-v1.0.md`. `environment: local-isolated` means the isolated cluster above.

```yaml
- id: OS-F1-RED-PGTAP
  title: head pgTAP suite fails on base main for the counterexamples
  status: PASS
  environment: local-isolated
  commit: 91d18779ed94c5688c1daa15363e4a5b99da1ecf
  verified_at: '2026-10-23T12:22:58Z'
  evidence:
    - type: command
      reference: pg_prove --verbose supabase/tests/os_customer_stat_authority_test.sql (pgtap-red-base.txt)
  notes: '29/83 failed: A2 A3 A8 A9 A10 A11 A13 A14 A16 A18 A19 A20 A24 A25 A30 A31 A32 A34 B1-B5 T4 T6 T11 T15 T16 G1 (classification in spec §7.1)'
- id: OS-F1-RED-RACES
  title: race verifier fails on base main
  status: PASS
  environment: local-isolated
  commit: 91d18779ed94c5688c1daa15363e4a5b99da1ecf
  verified_at: '2026-10-23T12:24:08Z'
  evidence:
    - type: command
      reference: node scripts/customers/verify-customer-stat-races.mjs (races-red-base.txt)
  notes: '6/8 failed: R2 R3 R4 R6 R7 R8; R1 R5 (pure increments) pass on the old trigger'
- id: OS-F1-RED-REVIEW
  title: review counterexamples fail on the implementation before the review
  status: PASS
  environment: local-isolated
  commit: 2723f03c591f17611bfc30dc56f3df5b220f9d07
  verified_at: '2026-10-23T12:24:11Z'
  evidence:
    - type: command
      reference: races-prev.txt
  notes: 'R7 (40001 instead of 0A000) and R8 (REPEATABLE READ write accepted) fail; pgTAP 83/83 passes there'
- id: OS-F1-GREEN-PGTAP
  title: full pgTAP on head after clean replay + seed
  status: PASS
  environment: local-isolated
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:23:06Z'
  evidence:
    - type: command
      reference: pg_prove supabase/tests/*.sql (run.txt)
  notes: '23 files / 1026 tests; OS-F1 suite 83/83'
- id: OS-F1-GREEN-RACES
  title: real-DB two-connection races on head
  status: PASS
  environment: local-isolated
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:24:21Z'
  evidence:
    - type: command
      reference: node scripts/customers/verify-customer-stat-races.mjs, 3 runs (races-green-head-1.txt, run.txt)
  notes: '8/8 in each of 3 runs; daily report races (#146) 8/8'
- id: OS-F1-MUTATIONS
  title: tests catch the removal of each concurrency, minimal-write and tenant guard
  status: PASS
  environment: local-isolated
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:27:05Z'
  evidence:
    - type: command
      reference: mutations.txt
  notes: 'isolation check removed -> R7 R8; unchanged-value filter removed -> A33; lock-first removed -> R1-R5; RLS off on customers/reservations and the reference check dropped -> B10 T7 T8 T9 T12 T13 T17-T21 T23-T27 T29'
- id: OS-F1-TYPES
  title: generated types unchanged
  status: PASS
  environment: local-isolated (postgres-meta v0.96.6, the version the pinned CLI uses, with the repo post-processing)
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:24:29Z'
  evidence:
    - type: command
      reference: run.txt (types)
  notes: 'base and head output byte-identical to the committed src/types/supabase.ts'
- id: OS-F1-PRODLIKE-APPLY
  title: single-file apply on the production-like history
  status: PASS
  environment: local-isolated
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:26:53Z'
  evidence:
    - type: command
      reference: prodlike.txt, catalog-prodlike-before.txt, catalog-prodlike-after.txt
  notes: 'history 20260815104957,20261020170757 -> +20261023064851 in the same transaction; 20260906003219 objects absent; data fingerprints unchanged; gate identical before/after (G0 default_isolation read committed, non_rc_isolation_settings 0); next counted write rebuilt the stale cache of one customer; races 8/8; pgTAP fails only commercial_function_execution #6, which fails identically without this migration (control in prodlike.txt)'
- id: OS-F1-RUNBOOK
  title: rebuild template, restore, emergency stop and re-enable procedures
  status: PASS
  environment: local-isolated
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:26:10Z'
  evidence:
    - type: command
      reference: prodlike.txt (rebuild, restore), reenable.txt
  notes: '§9.3: 9 backups, G1 mismatched 0 after, backup table RLS on and owner-only ACL; §9.4 restore 9/9 (rolled back); §9.4 stop SQL returns the start of the transaction that began before the stop, and the re-enable from it selects 51,52,53,55,57 (from the stop time 53 is missed); touched customers match their completed set, the others keep their values'
- id: OS-F1-IMAGE-APPLY
  title: single-file apply on the official supabase/postgres image (non-superuser postgres, real GoTrue migrations)
  status: PASS
  environment: local-docker supabase/postgres:17.6.1.140 + supabase/gotrue:v2.192.0
  commit: 544014c375e903f33575b3d8a67739c7af4b5b7c
  verified_at: '2026-10-23T12:27:53Z'
  evidence:
    - type: command
      reference: official-image.txt
  notes: 'apply ok with owner privileges only; data fingerprints unchanged; history recorded in the same transaction; gate identical before/after; catalog difference identical to the isolated run; races 8/8, daily report races 8/8; pgTAP fails only commercial_function_execution #6 (as in the isolated control)'
- id: OS-F1-APP-E2E
  title: App E2E (local Supabase + Chromium)
  status: NOT_RUN
  environment: ci
  commit: '<PR head>'
  notes: 'Supabase CLI stack images could not be pulled locally; runs in CI App E2E'
- id: OS-F1-PROD-GATE
  title: production read-only gate (spec §9.1)
  status: NOT_RUN
  environment: production
  owner: UNASSIGNED
  notes: 'requires separate owner approval (spec §11)'
```
