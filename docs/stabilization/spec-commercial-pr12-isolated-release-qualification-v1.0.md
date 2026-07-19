# PR12 Isolated Release Qualification Specification v1.0

## 1. Document status and decision

- Status: `PREPARATION / DRAFT PR ELIGIBLE AFTER LOCAL VERIFICATION`
- Risk: High — release governance, tenant security, hosted migration, backup/restore
- Base commit: `4475e1c641c2ff18f66021ee65cfecfceaa6b7ab`
- Target commit: `NOT_CAPTURED` until the immutable execution manifest evaluates `GIT_HEAD_AT_EVALUATION`
- Migration head: `20260718011731`
- Local preparation: authorized
- Draft PR creation: authorized after local verification and independent audits
- Isolated staging execution: **not authorized**
- Ready, merge, production, index retirement, and commercial release: **not authorized**
- Commercial decision: `NO_GO`

This PR converts the merged PR11 schema into a reviewable qualification plan. It does not claim that staging, backup, restore, billing, or commercial release has passed.

## 2. Authority and source precedence

Implementation decisions follow, in order:

1. [Change DoD v1.0](../quality/change-dod-v1.0.md)
2. [Commercial Release Qualification v1.0](../releases/commercial-release-qualification-v1.0.md)
3. [Current commercial-hardening implementation SSOT](spec-commercial-hardening-migration-v1.0.md)
4. [PR12 entry handoff](pr12-entry-readiness-handoff-v0.1-20260719.md)
5. This PR12 specification and its evidence contracts

The dated original `1-seikotsuin-commercial-hardening-migration-spec-v1.0-2026-07-11.md` was read in full from the protected root worktree. Its SHA-256 is `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`. It is an original audit/design input and is not copied, edited, staged, or committed here.

The current SSOT differs from that dated input by one later 16-line `Pilot-only performance exception`. That addition keeps a fixed failure as `FAIL`, limits its waiver to PR11 pilot merge eligibility, and explicitly denies inheritance to staging, production, and general commercial release. No other textual difference was found. The later addition is retained and never overwritten by the dated original.

The requested top-level `spec-commercial-pr11-blocks-resource-index-retirement-v1.0.md` is not present on `origin/main`. The immutable Phase A2 `-02/-03` input packages contain byte-identical copies with SHA-256 `17b08bf6b3857233c4dc0d5c8e2b6abd906f0044eb9a190bd39ba684ed5afb9f`. PR12 treats that as resolved source location, not as authority to retire the index.

## 3. Facts, inferences, and unverified state

### 3.1 Frozen facts

- PR11 merge commit: `aaf3837f6f8053b0379a2d4caea65880952ce027`
- Phase A2 evidence commit: `25a983e6f39a02855667f9e943523f7cb4aa40ee`
- Phase A2 governance commit: `0432785d68c98b9df32f9ab9f8e168b9206fcd92`
- PR101 merge/base commit: `4475e1c641c2ff18f66021ee65cfecfceaa6b7ab`
- PR11 official primary execution result: 8 of 9 PASS
- Dense 10,000 insert: `549.305 ms > 521.55125 ms`, therefore `FAIL`
- Phase A2: `FAIL_STOP / ENVIRONMENT_INVALID`
- Candidate SQL executions: `0`; permanent DDL: `0`
- D1b/D2: `NOT_RUN`; committed steady-state index effect: `NOT_PROVEN`
- `public.idx_blocks_resource_id`: present; retirement not approved
- Logical baseline: `c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78`
- Normalized physical baseline: `94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`
- Pilot performance waiver is not inherited by PR12.
- Phase A2 manual restoration observation is closure-only `PASS_WITH_RISK`, expires `2026-08-18T23:59:59+09:00`, and is not staging or release evidence.

### 3.2 Supported inference

The Phase A2 evidence proves that its PC/shared-Docker environment could not support a valid causal comparison. It does not prove that PC performance was the only cause of the prior dense failure.

A hosted system can legitimately have a different system identifier and physical layout. PR12 preserves the historical hashes but compares an environment-normalized schema/data digest and source-to-restored parity for the new environment. It does not rewrite historical PR11 or Phase A2 records.

### 3.3 Unverified and blocking

Project ref/name, region, tier, database version, representative data, hosted workload/SLO, Data API settings, GraphQL state, exact staging commands, backup/restore method, RTO/RPO approval, integrations, expected side effects, time, cost, and human owners are `NOT_CAPTURED` or `UNASSIGNED`. Every hosted gate remains `NOT_RUN`.

## 4. Scope

PR12 preparation provides:

- a complete 54-item COMM inventory;
- a hash-pinned PR11 performance contract;
- an exact 61-migration/60-rollback input-set contract;
- isolated-staging entry and approval contracts;
- a qualification evidence JSON Schema and manifest template;
- a privacy/secret scanner for PR12 evidence;
- a non-mutating preparation validator plus a fail-closed execution-manifest and artifact-hash verifier;
- a staging, canary, recovery, and DR runbook;
- a RED-to-GREEN focused Jest contract;
- independent security, migration/evidence, and release-governance review;
- Draft PR and required-CI evidence at one head SHA.

## 5. Non-goals and prohibited changes

This PR does not:

- create, link, inspect, or mutate an isolated staging project;
- apply local or hosted migrations or seed data;
- create a backup or restore a database;
- connect to production or perform a release;
- add/edit a migration or rollback;
- change RLS, GRANT, ACL, helper, trigger, composite FK, or billing behavior;
- drop `public.idx_blocks_resource_id` or select a new performance candidate;
- alter canonical probes, fixtures, actors, JWTs, GUCs, thresholds, sample order, or aggregation;
- add dependencies, change npm, or update the lockfile;
- obtain, print, or commit a service-role/secret key or hosted JWT signing secret;
- enable real external sends, charges, bulk import/sync, or unattended batches.

## 6. Approval boundary

The user instruction authorizes repository/Git/GitHub reads, `git fetch`, a clean worktree, local artifacts, static validation, Node 24 checks, read-only audits, focused commits, push, and a Draft PR. It does not authorize staging execution.

[The approval packet](evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml) and its [machine-readable execution binding](evidence/commercial-hardening/pr12/staging-execution-binding.template.json) must be complete, hash-pinned, unexpired, and explicitly approved before the first staging connection. The execution verifier parses the approved JSON binding and matches it to the current Git HEAD, manifest, project/region/tier/version, exact Node 24, Supabase CLI `2.109.0`, and `psql` versions, matrix and contract hashes, command ledger, DR/integration/credential contracts, owners, and expiry; hash membership alone is insufficient. Node is checked against the verifier's executing runtime, and all three tool versions require approved command IDs plus hash-verified stdout and empty stderr. The exact tenant/Auth/JWT/role matrices and the Data API/GraphQL matrices—including enabled state, version, schemas, grants/default privileges, and introspection—are approval inputs, not values chosen during execution. The credential contract permits only process-environment injection from an approved server secret store into an ephemeral server subprocess, with browser/CLI/URL/client-response/log/source-control/evidence exposure denied. Approval time must precede the overall execution and every command, and execution must finish before expiry. Any change to head SHA, matrix hash, project, region, tier, data, workload, threshold, Data API/GraphQL setting, integration, backup/restore measurement definition, secret channel, owner, tool version, or expiry invalidates approval.

The committed record uses deferred binding because a commit cannot contain its own final SHA without changing it:

```yaml
assessed_commit: NOT_CAPTURED
commit_binding:
  selector: GIT_HEAD_AT_EVALUATION
  state: NOT_CAPTURED
  required_before_any_pass: true
```

The execution collector must record `git rev-parse HEAD` before any sample. A head change forces reapproval and rerun.

## 7. Gate mapping

All 54 COMM items are blocking and start `NOT_RUN` in [current-gate-status.yaml](../releases/current-gate-status.yaml).

| Family        | Count | PR12 qualification evidence                                                                                                                                   |
| ------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMM-DB`     |     8 | append-only input hash, clean replay, local/remote history, generated types, schema drift, representative seed/data, pgTAP, linked staging                    |
| `COMM-TENANT` |     9 | RLS, relation/default/column/sequence ACL, function EXECUTE/search_path, composite FK, re-home, A/B CRUD, internal denial, shared master, legacy isolation    |
| `COMM-AUTH`   |     8 | DB authority, fail-closed errors, stale JWT, inactive profile, manager revocation/owner-defined expiry, atomic/concurrent invite, no partial write            |
| `COMM-API`    |     9 | mutation/GET inventory, clinic/billing/public/internal/webhook/rate-limit boundary, unclassified-route CI failure plus direct Data API/GraphQL role matrix    |
| `COMM-BILL`   |     9 | Stripe test-mode Checkout/Portal/webhook/order/expiry/failure/sync/quantity/emergency/cross-org denial                                                        |
| `COMM-OPS`    |    11 | isolated staging, migration/Advisor rehearsal, backup, restore/isolation, RTO/RPO, GitHub rules, canary/apply, smoke, 24h/72h, incident/forward-fix, sign-off |

Cross-cutting preparation gates are `PR12-PERF-ENTRY-001`, `PR12-HOSTED-SLO-001`, `PR12-STAGING-APPROVAL-001`, and `CHANGE-PR12-PREP-001`. They do not invent a replacement COMM family.

Eight required GitHub jobs qualify the PR change, not the hosted release: `Quality Checks`, `Build`, `Supabase Types Contract`, `Database Contract`, `Fixture Preflight (Static)`, `Full Jest Regression`, `Security Tests`, and `App E2E (Local Supabase + Chromium)`.

## 8. Migration, types, and representative-data contract

[migration-input-contract.json](evidence/commercial-hardening/pr12/migration-input-contract.json) pins:

- all 61 migration filenames and contents through `20260718011731` by canonical aggregate SHA-256;
- all 60 rollback filenames and contents and one-to-one parity for every non-baseline migration;
- the three PR11 migration/rollback pairs individually;
- generated types, seed, local config, `package.json`, and `package-lock.json`.

The historical PR01 migration baseline freezes 50 files and intentionally permits later append-only additions. PR12 does not rewrite it. The new contract closes the current-head content-hash gap without changing historical semantics.

`supabase/seed.sql` is a one-clinic local login seed and uses time-dependent values. It is not representative hosted data. A separate synthetic/anonymized dataset, row-count target, source hash, actor set, volume, and expiry must be approved before staging.

## 9. Frozen PR11 performance contract

[frozen-pr11-performance-contract.json](evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json) is authoritative for PR12 performance inputs. It hash-pins the official result/manifest, runner, probes, and pgTAP.

The contract contains all 9 primary execution gates, 6 primary WAL gates, and 2+2 auxiliary RLS-write gates. It fixes exactly three samples, median aggregation, `<=`, paired order `before, after, after, before, before, after`, and post-apply sample selection. No rebaseline, failed-sample removal, reorder, actor/fixture/JWT change, new `ANALYZE`, new planner forcing, or GUC change is allowed.

Created-by acceptance must naturally use `blocks_created_by_idx`. Both RLS reads must naturally use the target index path, return 250 rows, and contain no `Sort`, target `Bitmap Heap Scan`, or target `Seq Scan`. The hash-pinned performance probe contains a later historical `enable_seqscan=off` diagnostic for other paths; it is not a natural-plan acceptance substitute and may not be expanded.

Hosted p95/p99/throughput/5xx/timeout and CPU/pool/lock/WAL/duration SLOs are additive. They cannot replace a fixed PR11 failure. They and their workload/concurrency/order must be owner-approved and frozen before the first hosted sample.

## 10. Security and tenant qualification

Staging runs real DB and HTTP boundaries, not mocks alone.

- Tenant A/B negative read/insert/update/delete for every representative relation and major role
- Cross-clinic, missing/null resource, parent re-home, resource/clinic cascade
- RLS policy result and ACL denial as separate cases
- Relation, column, sequence, schema USAGE, and function EXECUTE matrices
- Helper owner, language, volatility, security invoker/definer, fixed search path, comments, and ACL
- Trigger and composite FK identity and behavior
- DB-authoritative role/clinic scope; no authorization from `user_metadata`
- Inactive profile, revoked or owner-defined expired manager assignment, missing authority
- stale, empty, malformed, expired, anon, authenticated, and service-role tokens
- service-role/secret use only in a server-side subprocess after scope/authorization; never browser, bundle, response, log, evidence, command line, or URL

Existing local-only runners retain their loopback guards. A hosted adapter must be a separate fail-closed entry point and must not acquire the hosted JWT signing secret to fabricate user tokens; user JWTs come from real Auth sign-in/refresh.

## 11. Data API and GraphQL platform contract

The platform can change independently of repository SQL. PR12 therefore records dashboard/config state and DB privileges separately.

Official Supabase sources reviewed on 2026-07-19:

- [Tables are no longer automatically exposed to Data and GraphQL APIs](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): explicit GRANT and RLS are separate layers.
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api): enabled state, exposed schemas, `postgres`/`supabase_admin` defaults, object grants, RLS, and function EXECUTE all matter.
- [pg_graphql is no longer enabled automatically](https://supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks).
- [pg_graphql 1.6.0 introspection default](https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default): introspection state is version- and schema-dependent.
- [GraphQL security](https://supabase.com/docs/guides/graphql/security): table/column visibility follows PostgreSQL privileges and row visibility follows RLS.
- [API key handling](https://supabase.com/docs/guides/getting-started/api-keys): secret/service-role keys bypass RLS and are backend-only.
- [RLS and JWT metadata](https://supabase.com/docs/guides/database/postgres/row-level-security): user-editable metadata is not authorization authority and JWTs can be stale.

For Data API, capture enabled state, exposed schemas, automatic exposure setting, `postgres` and `supabase_admin` default privileges, schema USAGE, relation/column/sequence/function privileges, and direct anon/authenticated/service-role allow and deny behavior. A 42501 ACL denial and an RLS zero-row result are different expected outcomes.

For GraphQL, first record installed version, enabled state, exposed schemas, and introspection. If enabled, run direct-role CRUD, tenant, field visibility, and introspection cases. If intentionally disabled, capture installed/enabled state and endpoint rejection. Lack of testing is never `NOT_APPLICABLE`.

## 12. Qualification collector design

The collector has three distinct modes:

1. `freeze`: validate approval fields, exact head, project allowlist, source hashes, thresholds, and command list; write no remote state.
2. `preflight`: capture read-only identity/settings/tool output into a new directory; still write no DB state.
3. `execute`: available only after a matching owner-approved packet hash and explicit execution flag; production identity is always rejected.

Every mode uses environment-only credentials, redacts commands before persistence, never overwrites an evidence directory, and records stdout/stderr separately with SHA-256. The current PR includes only the offline preparation validator, evidence scanner, and semantic execution-manifest/artifact-hash verifier. The verifier accepts `NOT_RUN`/`FAIL` without inferring qualification and rejects top-level `PASS_WITH_RISK`; `PASS` requires an approved JSON binding for the current Git HEAD, concrete environment/owners, all 54 COMM gates, exact role×CRUD and Auth matrices, all frozen 9/6/2+2 performance samples plus plan/semantic results, additive hosted SLO, backup/post-restore, machine and human privacy evidence, and measured RTO/RPO within frozen thresholds. The official Windows CLI `2.109.0` asset was downloaded outside the repository, matched release SHA-256 `d2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b`, and its planned subcommand help was inspected. A hosted execution adapter remains blocked until the exact environment, data, backup/restore method, commands, side effects, and owners are approved.

Execution order is fixed by [the entry contract](evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml): identity, clean replay, parity, types/drift, security/API/Auth, fixed PR11 gates, additive SLO, Advisor diff, backup, restore, post-restore checks, RTO/RPO, side effects, hashes/privacy, and sign-off.

## 13. Evidence contract and retention

The [JSON Schema](evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json) requires:

- exact commit, base, migration head, and approval-packet hash;
- project/ref/region/tier/version/system identity;
- Data API default privileges, schema USAGE/object ACL, direct-role results, and independent ACL/RLS verdicts;
- GraphQL installed/enabled/schema/introspection state, direct-role outcomes, tenant/field visibility, or evidence-backed disabled-endpoint rejection;
- the exact hash-pinned tenant/Auth/JWT/role/CRUD matrix and service-role boundary;
- all 9 primary execution, 6 primary WAL, 2+2 auxiliary results with exactly three samples, calculated medians, fixed limits, natural-plan and semantic results;
- the separately approved hosted workload/order/concurrency/duration/SLO contract and observations; hosted results remain additive;
- exact approved Node 24, Supabase CLI `2.109.0`, and `psql` versions with hash-bound version-command output, a semantically restricted credential-channel contract, and timestamps constrained to the approval window;
- redacted commands, exit codes, stdout/stderr paths and hashes;
- artifact byte counts and SHA-256;
- row counts and logical/physical/schema/data hashes;
- gate results, owners/approver, expiry, and residual risk;
- external-side-effect, backup, restore, and post-restore schema/data/tenant/Auth/API results;
- RTO/RPO threshold, start/end event, durable-watermark, clock/source definition, and measured result;
- machine privacy scan plus named human review status and hashed evidence.

Each run creates a new immutable directory. Raw sensitive artifacts stay local-only; sanitized artifacts are new files. The scanner reports only rule/path/line, never the matched value, and does not replace clinical-data review. `scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs --manifest <path>` verifies artifact bytes/SHA-256, the scanner command/output artifact, current-HEAD approval binding, expected/observed security outcomes, exact frozen performance results, additive hosted SLO, and fail-closed semantic completeness. Evidence that lacks a listed file, hash, environment/commit binding, complete COMM/security/performance/restore evidence, or machine and human privacy PASS cannot support `PASS`.

## 14. Backup, restore, RTO, and RPO

The master SSOT lists 8 hours RTO and 24 hours RPO as internal targets to measure, not owner-approved commercial promises. The approval packet records `28,800` and `86,400` seconds only as references; binding thresholds remain `NOT_CAPTURED`.

The owner must select backup method, scope, retention, restore point, target project, source watermark, Storage/Auth/config coverage, RTO start/end events and clock/source, plus the durable watermark and observation event used for RPO. The drill records those definitions and raw timestamps before computing source/target missing-data interval, schema/data/hash parity, critical row counts, Auth, tenant isolation, API boundaries, external-side-effect ledger, measured RTO/RPO, failures, cleanup/retention, and follow-up owner/date.

PR11 rollback SQL is validation-only and is not a backup restore or destructive rollback. Recovery defaults to abort, preserve evidence, disable affected flows if needed, and propose a separately approved append-only forward-fix.

## 15. Canary, monitoring, and incident response

Canary and production planning remain design-only in this PR. Before any later production approval, define deployment order, feature flags, traffic cohort, duration, observation owner, abort thresholds, and communication owner.

Immediate smoke covers health, admin/clinic_admin/staff/manager, patient read, reservation mutation, public booking, invite, billing lock, tenant-B tampering, outbox/cron, and audit/log events. The 24h/72h review covers authorization denials, 4xx/5xx, locks/latency, duplicate notification, failed invite, billing denial, RLS errors, and support incidents.

An incident freezes release progression, preserves immutable evidence, removes secrets from exposure without copying them into tickets, assigns an incident owner, and chooses only owner-approved forward-fix or recovery actions.

## 16. Abort criteria

Stop immediately, do not change a threshold or discard a sample, and do not move to another candidate on:

- cross-tenant access or authorization regression;
- RLS/ACL/helper/trigger/FK drift;
- migration replay/history, schema, type, or seed drift;
- any fixed PR11 or frozen hosted-SLO failure;
- Data API/GraphQL configuration mismatch;
- service-role/secret/JWT exposure;
- lock timeout or service error spike;
- critical Advisor finding;
- restore integrity or post-restore tenant failure;
- RTO/RPO failure;
- external-side-effect duplication;
- evidence hash or privacy failure;
- any operation requiring approval not present in the packet.

## 17. Definition of Done for this preparation PR

Draft readiness requires:

- focused contract RED observed before implementation and GREEN afterward;
- offline validator, evidence scan, migration/history/rollback/type/seed/package pins PASS;
- strict TypeScript, commercial type-check, lint, Prettier, Jest, security tests, build, links, and `git diff --check` actually run;
- no migration, rollback, generated type, package, or lockfile drift;
- three independent read-only audits with no must-fix finding;
- intentional files staged individually, Conventional Commits, push, and Draft PR;
- all eight required CI jobs observed on one head SHA.

Even after those steps, all staging-bound COMM gates remain `NOT_RUN`; the PR remains Draft, commercial remains `NO_GO`, and execution waits for explicit owner approval of the completed packet.
