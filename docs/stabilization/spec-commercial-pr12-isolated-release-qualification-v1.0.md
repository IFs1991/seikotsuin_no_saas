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

## 2. Scoped authority and source contract

PR12 uses field-scoped authority rather than a single precedence list:

- **Purpose, ordered 14 steps, and five Acceptance items:** `docs/stabilization/spec-commercial-hardening-migration-v1.0.md`, specifically the normalized PR12 section with SHA-256 `71fe7972430268396ca405a388e2cdf87b937962f735dfae6af48b2cb1d66b94`.
- **Gate and evidence-state semantics:** `docs/quality/change-dod-v1.0.md`.
- **The 54 COMM gate definitions:** `docs/releases/commercial-release-qualification-v1.0.md`.
- **PR12-specific binding, command, and evidence shape:** this specification and its evidence contracts.
- **Historical entry context only:** [PR12 entry handoff](pr12-entry-readiness-handoff-v0.1-20260719.md).

A subordinate source may tighten but must not remove, reorder, waive, replace, or substitute a canonical PR12 step or Acceptance item. Any mismatch is `BLOCK / NO_GO`: stop before remote contact, preserve the mismatch evidence, and require an owner-reviewed correction. A subordinate status or locally implemented collector never converts canonical execution from `NOT_RUN`, inherits authority from a prerequisite, or authorizes production.

The dated original `1-seikotsuin-commercial-hardening-migration-spec-v1.0-2026-07-11.md` was read in full from the protected root worktree. Its SHA-256 is `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`. It is an immutable provenance/audit input and is not copied, edited, staged, or committed here. Its PR12 section is byte-equivalent after line-ending normalization to the tracked implementation SSOT section identified above.

The current SSOT differs from that dated input only by one later 16-line `Pilot-only performance exception`. That addition keeps a fixed failure as `FAIL`, limits its waiver to PR11 pilot merge eligibility, and explicitly denies inheritance to staging, production, and general commercial release. It remains in the tracked SSOT and is not part of the normalized PR12 section.

The requested top-level `spec-commercial-pr11-blocks-resource-index-retirement-v1.0.md` is not present on `origin/main`. The immutable Phase A2 `-02/-03` input packages contain byte-identical copies with SHA-256 `17b08bf6b3857233c4dc0d5c8e2b6abd906f0044eb9a190bd39ba684ed5afb9f`. PR12 treats that as resolved source location, not as authority to retire the index.

### 2.1 Canonical PR12 traceability matrix

This is the sole PR12 step/Acceptance traceability matrix. Implementation status records offline readiness only; execution and approval remain separate fail-closed dimensions.

<!-- PR12-TRACEABILITY-MATRIX:START -->

| Step | Canonical step                            | Implementation status                              | Execution status | Approval status  | Evidence and next mandatory action                                                                                                         |
| ---- | ----------------------------------------- | -------------------------------------------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 01   | staging clone/isolated project            | `PREREQUISITE_PASS_ONLY`                           | `NOT_RUN`        | `NOT_AUTHORIZED` | `PR12-ACTION-002` is sealed prerequisite evidence only; populate, re-hash, and separately approve the current `PR12-ACTION-003` v5 packet. |
| 02   | full migration replay                     | `IMPLEMENTED_OFFLINE_VERIFIED`                     | `NOT_RUN`        | `NOT_AUTHORIZED` | Capture and approve CMD004A identity/configuration, then separately bind Stage 3 CMD003 through CMD008A.                                   |
| 03   | anonymized/representative data validation | `IMPLEMENTED_OFFLINE_VERIFIED`                     | `NOT_RUN`        | `NOT_AUTHORIZED` | Freeze fixture epoch/provider inputs and obtain a separate Stage 4 approval.                                                               |
| 04   | types parity                              | `IMPLEMENTED_OFFLINE_VERIFIED`                     | `NOT_RUN`        | `NOT_AUTHORIZED` | Run CMD010 only from its future approved binding and compare temporary output without modifying tracked types.                             |
| 05   | advisor scan                              | `IMPLEMENTED_OFFLINE_VERIFIED`                     | `NOT_RUN`        | `NOT_AUTHORIZED` | Capture CMD006 before evidence and CMD016 after evidence only in their fixed approved order.                                               |
| 06   | all role smoke                            | `READINESS_COMPONENT_IMPLEMENTED_OFFLINE_VERIFIED` | `NOT_RUN`        | `NOT_AUTHORIZED` | Approve the fresh catalog/classification and execute only as a bounded component of CMD013; this does not claim CMD013 PASS.               |
| 07   | canary deploy                             | `NOT_IMPLEMENTED`                                  | `NOT_RUN`        | `NOT_AUTHORIZED` | Implement and separately approve COMM-OPS-007 in a later cycle.                                                                            |
| 08   | backup/restore drill                      | `NOT_IMPLEMENTED`                                  | `NOT_RUN`        | `NOT_AUTHORIZED` | Implement CMD017 onward and obtain a distinct restore approval.                                                                            |
| 09   | measured RTO/RPO                          | `NOT_IMPLEMENTED`                                  | `NOT_RUN`        | `NOT_AUTHORIZED` | Implement the four-clock collector and capture the owner RTO/RPO authority decision.                                                       |
| 10   | production change plan                    | `DESIGN_ONLY`                                      | `NOT_RUN`        | `NOT_AUTHORIZED` | Bind the production packet, incident owner, and rollback/forward-fix decision path.                                                        |
| 11   | operator approval                         | `NOT_CAPTURED`                                     | `NOT_RUN`        | `NOT_AUTHORIZED` | Capture the canonical production packet with independent role separation in a later phase.                                                 |
| 12   | production apply                          | `NOT_IMPLEMENTED`                                  | `NOT_RUN`        | `NOT_AUTHORIZED` | Require a separate independent production approval; no current artifact grants production contact or apply authority.                      |
| 13   | post-deploy verification                  | `DESIGN_ONLY`                                      | `NOT_RUN`        | `NOT_AUTHORIZED` | Execute only after an independently approved production apply.                                                                             |
| 14   | 24h/72h monitoring review                 | `DESIGN_ONLY`                                      | `NOT_RUN`        | `NOT_AUTHORIZED` | Assign the monitoring owner and complete both observation windows after production.                                                        |

| Canonical Acceptance item             | Required canonical step evidence |
| ------------------------------------- | -------------------------------- |
| restore evidence                      | Steps 08 and 09                  |
| tenant isolation after restore        | Steps 06 and 08                  |
| no duplicate external side effects    | Steps 06 and 08                  |
| incident rollback/forward-fix runbook | Step 10                          |
| production sign-off                   | Steps 11 through 14              |

<!-- PR12-TRACEABILITY-MATRIX:END -->

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

The v0.2 owner proposal selects a new Pro / Tokyo `ap-northeast-1` / Large source project, same-region restore project, hash-pinned synthetic fixture, 50-user hosted SLO, physical-backup restore-to-new-project drill, 8h/24h thresholds, test-only/disabled integrations, and a phase-complete blocked ledger. On 2026-07-26 the separately approved `PR12-ACTION-002` completed PASS at head `6edd6733756dd73e458cf705675895a5666c76e6`, capturing Organization ID/slug `kbnsntifrawhimhfjrug` and plan `PRO` with one GET attempt, zero retry, and zero production contact. Action-003 local enablement now verifies that sealed manifest and terminal journal, removes the duplicate Organization GET, and enforces canonical `fundedThrough = scheduledExecutionAt + exactly 73 hours`. The tracked classification baseline still covers 86 `public` rows, including 48 `UNKNOWN` rows, plus two required Auth targets; none is owner-approved. The executable mother set must come from a fresh post-replay `pg_catalog` capture of every `public` relkind `r`/`p` relation plus `auth.identities` and `auth.users`; representative fixture rows are a coverage subset only. The new project ref, populated Action-002 external path fingerprints, exact hosted settings, production-tier parity, capacity acceptance, catalog/classification approval, target/credential/seed guard, qualification collectors/matrices, PostgreSQL client, Action-003 two-role credential configuration/database-password envelope and final hashes/approval, Phase 2+ secret providers and budgets, exact scheduled/funded-through timestamps, funded cleanup, RTO/RPO authority decision, later-phase owners, and final phase bindings remain `NOT_CAPTURED`, `NOT_IMPLEMENTED`, or `UNASSIGNED`. `PR12-ACTION-003`, project creation, production contact, and Phase 2+ remain unapproved and every hosted gate remains `NOT_RUN`.

## 4. Scope

PR12 preparation provides:

- a complete 54-item COMM inventory;
- a hash-pinned PR11 performance contract;
- an exact 61-migration/60-rollback input-set contract;
- a fresh-catalog-derived security target inventory contract, a complete tracked proposal baseline, and a separate classification proposal that fail closed on missing, extra, duplicate, draft, or unclassified relations;
- isolated-staging entry and approval contracts;
- an owner-readable environment/data/SLO/DR/integration/cost proposal and proposed command ledger;
- a qualification evidence JSON Schema and manifest template;
- a Phase 1-only source-project provisioning v5 approval-preparation contract plus a completed `PR12-ACTION-002` read-only Organization identity-capture prerequisite, one-shot wrappers/collectors, create-once action journals, safe provider projections, terminal-to-manifest linkage verification, duplicate-Organization-GET denial, exact scheduled+73-hour validation, and negative contract suites; Action-003 remains locally blocked and gains no remote authority;
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

[The machine approval packet](evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml) and [human v0.2 packet](pr12-staging-execution-owner-approval-packet-v0.2-20260719.md) require the completed Organization identity-capture prerequisite followed by six sequential stages: (1) [source provisioning v5](evidence/commercial-hardening/pr12/source-project-provisioning-binding-v5.template.json); (2) [source identity and read-only Data API/Auth/GraphQL bootstrap](evidence/commercial-hardening/pr12/source-identity-bootstrap-binding.template.json) with a separately hash-bound [result](evidence/commercial-hardening/pr12/source-identity-bootstrap-result.template.json); (3) narrow [source replay/catalog capture](evidence/commercial-hardening/pr12/source-replay-catalog-capture-binding.template.json) with a separately hash-bound [result](evidence/commercial-hardening/pr12/source-replay-catalog-capture-result.template.json); (4) [full source qualification and backup capture](evidence/commercial-hardening/pr12/staging-execution-binding.template.json); (5) [selected-backup restore-project creation](evidence/commercial-hardening/pr12/restore-project-creation-binding.template.json); and (6) [supplemental restore validation](evidence/commercial-hardening/pr12/restore-execution-supplemental-binding.template.json). The Action-002 prerequisite completed PASS once and remains a mandatory stop, not inherited authority. Action-003 v5 locally reverifies its sealed manifest/terminal and directory fingerprints, uses its projection as the sole Organization identity/plan source, rejects the duplicate Organization GET route, and binds exact scheduled+73-hour funding. Each later binding remains hash-pinned, unexpired, separately approved, and followed by a mandatory stop. These local preparations do not authorize `PR12-ACTION-003`, authenticated provider contact, project creation, or Phase 2+. `PR12-CMD-004A` remains the only Stage 2 remote command: before it, the guard uses provider-created ref/URL/direct host and the production denylist without pretending the database system identifier is pre-known; it captures that identifier plus read-only platform configuration, then stops. Stage 3 and later require the captured identifier. Replay/catalog stops before representative seed. Stage 4 never authorizes restore creation. Stage 5 captures provider/Dashboard evidence, provider `created_at`, ACTIVE/healthy readiness, raw mirrored-state comparison, and quote without connecting to the restore database. Stage 6 begins only after supplemental approval with `PR12-CMD-018` as the first restore database connection. Stage 6 closes at `PR12-CMD-019F`; conditional human review, terminal `PR12-CMD-020`, and the out-of-manifest offline verifier are a post-stage tail and grant no additional remote authority. Reviewed proposal hashes never occupy executable bindings. The verifier hard-rejects direct production contact, requires source/restore and credential-target separation, enforces the phase-specific owner-control policy and exact phase/remote/mutation scopes, and rejects cleanup/project deletion, ambient credentials, source evidence reuse, and any changed bound input.

[The Phase 1 approval-preparation specification](spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md) records the completed `PR12-ACTION-002` prerequisite, then narrows Stage 1 to one `PR12-ACTION-003` create-project POST attempt plus enumerated read-only Management API preflight/readiness observations. Action-002 completed under its own approval and sealed only the safe projection/hashes; it has no retry, recovery GET, project route, production contact, or database-password access. Stage-1 v5 now requires its external evidence directory and terminal path, recomputes the terminal-to-manifest and raw-path-free directory fingerprints locally, and rejects any repeated Organization entitlement GET before contact. It separately checks the exact shared target/production Organization identity, production-project direct-contact denial, quote/funding/cleanup, canonical `scheduledExecutionAt` and exact `fundedThrough = +73h`, sole-operator role consolidation/risk attestations, secret-provider handles, canonical secret-free payload, and create-once journal before its own credential access or network contact. Supabase documents no create-project idempotency key; therefore that contract claims at-most-one POST attempt, never blind retry, and an owner stop after ambiguous outcome. Action-003 remains `NOT_RUN`, unapproved, and non-executable until every populated v5 input and separate final approval exists.

The committed record uses deferred binding because a commit cannot contain its own final SHA without changing it:

```yaml
assessed_commit: NOT_CAPTURED
commit_binding:
  selector: GIT_HEAD_AT_EVALUATION
  state: NOT_CAPTURED
  required_before_any_pass: true
```

The execution collector must record `git rev-parse HEAD` before any sample. A head change forces reapproval and rerun. The source and restore security matrices must bind the same finalized target-inventory artifact. Matrix authors may not select their own targets: the verifier derives the mother set from a fresh post-replay `pg_catalog` capture of every `public` relkind `r`/`p` relation plus the fixed `auth.identities` and `auth.users` targets, then selects Class A matrix targets only from a separate owner-approved classification artifact. The 86-row tracked draft is a proposal baseline and representative fixture relations are a coverage subset, never mother-set authority.

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

[The immutable COMM evidence map](evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json) fixes all 54 gate IDs, family result types, and closed claim IDs. Generic gate result self-attestation is forbidden. The typed claim registry and several claim collectors remain `NOT_IMPLEMENTED`, so the execution verifier intentionally cannot accept a top-level PASS and all 54 COMM gates remain `NOT_RUN`.

Eight required GitHub jobs qualify the PR change, not the hosted release: `Quality Checks`, `Build`, `Supabase Types Contract`, `Database Contract`, `Fixture Preflight (Static)`, `Full Jest Regression`, `Security Tests`, and `App E2E (Local Supabase + Chromium)`.

## 8. Migration, types, and representative-data contract

[migration-input-contract.json](evidence/commercial-hardening/pr12/migration-input-contract.json) pins:

- all 61 migration filenames and contents through `20260718011731` by canonical aggregate SHA-256;
- all 60 rollback filenames and contents and one-to-one parity for every non-baseline migration;
- the three PR11 migration/rollback pairs individually;
- generated types, seed, local config, `package.json`, and `package-lock.json`.

The historical PR01 migration baseline freezes 50 files and intentionally permits later append-only additions. PR12 does not rewrite it. The new contract closes the current-head content-hash gap without changing historical semantics.

`supabase/seed.sql` is a one-clinic local login seed and uses time-dependent values. It is not representative hosted data and must not be executed by PR12. The PR12-only strict fixture contract now freezes a plan SHA for 83 explicit rows plus 12 trigger-derived history rows, four clinics, seven actors, all five application roles, and one active manager assignment. This is offline readiness only: the fixture epoch, credential provider, populated Stage 4 binding, execution expiry, and first runtime source-snapshot SHA remain blocking inputs.

## 9. Frozen PR11 performance contract

[frozen-pr11-performance-contract.json](evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json) is authoritative for PR12 performance inputs. It hash-pins the official result/manifest, runner, probes, and pgTAP.

The contract contains all 9 primary execution gates, 6 primary WAL gates, and 2+2 auxiliary RLS-write gates. It fixes exactly three samples, median aggregation, `<=`, paired order `before, after, after, before, before, after`, and post-apply sample selection. No rebaseline, failed-sample removal, reorder, actor/fixture/JWT change, new `ANALYZE`, new planner forcing, or GUC change is allowed.

Created-by acceptance must naturally use `blocks_created_by_idx`. Both RLS reads must naturally use the target index path, return 250 rows, and contain no `Sort`, target `Bitmap Heap Scan`, or target `Seq Scan`. The hash-pinned performance probe contains a later historical `enable_seqscan=off` diagnostic for other paths; it is not a natural-plan acceptance substitute and may not be expanded.

Hosted p95/p99/throughput/5xx/timeout and CPU/pool/lock/WAL/duration SLOs are additive. They cannot replace a fixed PR11 failure. They and their workload/concurrency/order must be owner-approved and frozen before the first hosted sample.

## 10. Security and tenant qualification

Staging runs real DB and HTTP boundaries, not mocks alone.

- Tenant A/B negative read/insert/update/delete for every Class A target derived from the frozen target inventory and every major application role. Shrinking both a matrix and its own contract cannot reduce this set.
- Non-Class-A inventory entries remain blocking until their required coverage family is bound: Class B direct-client denial/service-role-only, Class C authenticated read-only, Auth/JWT, or Class E quarantine. `UNKNOWN`, `DRAFT_SPEC_CANDIDATE`, missing, extra, or duplicate entries abort execution.
- Cross-clinic authorization remains in the Auth/tenant matrix. Missing/null resource, parent resource re-home, and resource/clinic cascade are direct-Postgres, transaction-scoped relational-integrity probes and never count as RLS or ACL proof.
- Missing/null resource must emit SQLSTATE `23503` and the frozen `resources.id not found` diagnostic while the attempted block remains absent and sentinels remain hash-identical.
- Parent re-home must update `public.resources`, be rejected by `blocks_resource_id_fkey`, and preserve the resource clinic plus referencing block and other-tenant sentinels.
- Resource and clinic cascade are positive in-transaction postconditions: the parent command directly affects one row, the required child relations transition from present to absent, and unrelated/other-tenant sentinel hashes remain unchanged. Every relational probe must then observe `ROLLBACK` with `COMMAND_OK`, record rollback-completion and post-check timestamps, and prove each post-rollback existence/SHA-256 equals its before state. A `DENY`, zero-mutation cascade, failed rollback, or post-rollback mismatch cannot satisfy the gate.
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

For Data API, capture enabled state, actual exposed schemas, automatic exposure setting, and a fresh catalog of schemas, relkind `r`/`p`/`v`/`m`/`f` relations, columns, sequences, identity-argument functions, and `postgres`/`supabase_admin` default privileges. PostgreSQL 17 object-type privilege universes are fixed by the approved contract; the catalog may not self-shrink `applicablePrivileges`. The ACL matrix is the exact catalog object × applicable privilege × `anon`/`authenticated`/`service_role` product, with direct, `PUBLIC`, inherited, and effective grants independently observed. Source and restore catalogs are distinct artifacts with exact parity. Direct REST allow/deny behavior is separate, and a 42501 ACL denial and an RLS zero-row result are different expected outcomes. The direct-role contract contains exactly ten catalog-bound cases: anon/authenticated relation and column deny coverage, authenticated bidirectional tenant filtering, authenticated relation/column allow controls, service-role REST allow, and the pure `public.normalize_customer_phone(text)` service-role RPC allow. Every case binds the catalog object and ACL tuple plus HTTP method/path and request/expected-response/observed-response SHA-256.

Every row-filtered tenant denial also carries a different target-tenant actor proving that the same operation succeeds with a refreshed Hosted Auth JWT. Reads preserve the row hash; insert/update/delete prove exactly one mutation and direct affected row inside a transaction that ends with `ROLLBACK / COMMAND_OK`, followed by the operation-specific restored state. The positive result has its own one-to-one command-window-bound raw observation and cannot reuse the denial observation.

The application service-role boundary remains a server-only security gate, but non-exposure is not a generic security-matrix PASS. Source and restore each require a distinct typed report emitted only by the late non-mutating side-effect command (`PR12-CMD-016A` / `PR12-CMD-019A`) after every covered service-role REST/RPC/GraphQL observation. Each of the three covered cases binds its raw observation ID, raw artifact path/SHA-256, producing command, observation timestamp, and target-specific credential fingerprint. The late command re-injects only the applicable target-prefixed raw value in memory, scans it without persistence across four non-empty hash-bound inventories—browser build, client responses, application logs, and command streams/evidence—requires the command/evidence inventory to contain every covered raw API artifact, persists only hashes/counts, and scrubs the credential. Exact-match and pattern-finding counts must both be zero.

For GraphQL, first record installed version, enabled state, exposed schemas, and introspection. If enabled, run direct-role CRUD, tenant, field visibility, and introspection cases. If intentionally disabled, capture installed/enabled state and endpoint rejection. Lack of testing is never `NOT_APPLICABLE`.

## 12. Qualification collector design

The collector design has three distinct modes:

1. `freeze`: validate approval fields, exact head, project allowlist, source hashes, thresholds, and command list; write no remote state.
2. `preflight`: capture read-only identity/settings/tool output into a new directory; still write no DB state.
3. `execute`: available only after a matching owner-approved packet hash and explicit execution flag; production identity is always rejected.

Every mode uses environment-only credentials, redacts commands before persistence, never overwrites an evidence directory, and records stdout/stderr separately with SHA-256. The current PR includes offline preparation/verification, the evidence scanner, the semantic final verifier, proposal contracts, a stage-complete non-executable ledger, and offline-verified readiness modules for the Stage 3 runtime guard/external replay inputs, replay/catalog validation, hosted types parity, Advisor normalization/diff, representative fixture, and the `PR12-CMD-013` all-role smoke component. None has executed against a provider or database, and none authorizes a remote command or COMM PASS. The verifier accepts `NOT_RUN`/`FAIL` without inferring qualification and rejects top-level `PASS_WITH_RISK`; a future `PASS` requires all six approved stages, concrete source/restore identities and separated owners, all 54 COMM gates derived from the immutable map and a closed typed-claim registry, exact target×role×direction×CRUD/Auth/Data API ACL/GraphQL/billing matrices, all frozen 9/6/2+2 performance samples plus plan/semantic results, three hosted SLO samples plus a recomputed pooled result, parsed migration/types/row/hash source-and-restore integrity results, parsed physical-backup metadata, side-effect evidence, and conditional-human/terminal-machine privacy evidence. Row-filtered tenant and Data API negatives must bind an exactly-one-row selector precondition, expected owner tenant, same-tenant positive control, and an identical post-deny row hash; zero rows against an empty fixture cannot pass. The verifier now fail-closes on provider/source-DB/restore-DB/operator UTC provenance, an owner-approved numeric skew, a maximum five-second pre-confirmation RPO observation lead, and a separately captured operator monotonic RTO interval. The runtime multi-clock collector remains `NOT_IMPLEMENTED`, so the preparation packet still cannot authorize or qualify RTO/RPO. The official Windows CLI `2.109.0` archive matched release SHA-256 `d2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b`; the pinned executable tuple is `supabase.exe` SHA-256 `903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118`, adjacent `supabase-go.exe` SHA-256 `59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0`, and `psql.exe` 17.9 SHA-256 `6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531`. Final evidence must re-observe their exact paths, versions, and hashes. The CA bundle path/hash, direct reachability, runtime approvals/credentials, fresh catalog classification, closed COMM claim registry, multi-clock collector, and PR11/SLO/full security/API/billing/backup/restore collectors remain blockers.

Execution order is fixed by [the entry contract](evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml) and the immutable ledger. Stage 3 is exactly `003 → 004 → 005 → 006 → 007 → 007A → 008A`, then stop. Stage 4 is exactly `008B → 008 → 009 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 016A → 017A`, then stop. Thus fixed PR11 and additive hosted SLO run before security/Auth/tenant, Data API/GraphQL, and billing qualification; `017B` is a separate restore-creation approval stop and is not inherited Stage 4 authority. Restore, post-restore checks, external-side-effect proof, measured RTO/RPO, conditional owner sign-off, terminal hashes/privacy scan, and final-verifier-derived `COMM-OPS-011` follow only under their separate approvals.

## 13. Evidence contract and retention

The [JSON Schema](evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json) requires:

- exact commit, base, migration head, and approval-packet hash;
- project/ref/region/tier/version/system identity;
- Data API default privileges plus exact schema/relation/column/sequence/function/default-privilege ACL inventory, direct-role results, and independent ACL/RLS verdicts;
- GraphQL installed/enabled/schema/introspection state, direct-role outcomes, tenant/field visibility, or evidence-backed disabled-endpoint rejection;
- the exact hash-pinned tenant/Auth/JWT/target/role/direction/CRUD matrix and service-role boundary;
- all 9 primary execution, 6 primary WAL, 2+2 auxiliary results with exactly three samples, calculated medians, fixed limits, natural-plan and semantic results;
- the separately approved hosted workload/order/concurrency/duration/SLO contract and observations; hosted results remain additive;
- exact approved Node 24, Supabase CLI `2.109.0`, and `psql` versions with hash-bound version-command output, a semantically restricted credential-channel contract, and timestamps constrained to the approval window;
- redacted commands, exit codes, stdout/stderr paths and hashes;
- artifact byte counts and SHA-256;
- row counts, schema/data hashes, frozen historical logical/normalized-physical facts, and a separately recomputed hosted environment physical-structure hash;
- gate results, owners/approver, expiry, and residual risk;
- external-side-effect, backup, restore, and post-restore schema/data/tenant/Auth/API results;
- RTO/RPO threshold, start/end event, durable-watermark, provider/source-DB/restore-DB/operator clocks, owner-approved maximum skew, and measured result;
- machine privacy scan plus named human review status and hashed evidence.

Each run creates a new immutable directory. Raw sensitive provider responses are never retained; provider-native evidence is allowlisted and secret-stripped in memory before serialization. Sanitized artifacts are new files. The scanner reports only rule/path/line, never the matched value, and does not replace clinical-data review. The bound human reviewer first inspects the exact non-scanner artifact set and writes one hash-bound conditional sign-off: the other 53 gates may be PASS, but `COMM-OPS-011` remains `NOT_RUN` with result status `CONDITIONAL_PENDING_TERMINAL_SCAN_AND_FINAL_VERIFIER`. Before terminal `PR12-CMD-020`, its empty stdout/stderr files are pre-created and listed. `scripts/commercial-hardening/scan-pr12-evidence.mjs --manifest <manifest.json>` then requires a manifest-closed directory containing exactly the selected manifest plus every listed artifact and nothing else; only the scanner's own two stream contents are excluded during self-generation. Empty/subset coverage, an unmanifested file, reused streams, byte/hash drift, or nonempty scanner stderr fails closed. `scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs --manifest <path>` validates the final stream hashes and rechecks exact directory closure plus dedicated command stdout/time windows, current-HEAD approval binding, typed expected/observed HTTP/SQL/row/mutation/ACL/RLS/endpoint outcomes, exact frozen performance samples and plan/semantic facts, raw-latency-derived hosted SLO, and fail-closed semantic completeness. The machine scan is the terminal evidence-producing phase, its timestamp equals command end, and only final verification may follow it. No final-PASS artifact is written after scanning; the verifier derives `COMM-OPS-011` in memory only when the terminal scan, other 53 gates, conditional sign-off, and no-post-scan-mutation checks all pass. Evidence that lacks a listed file, hash, environment/commit binding, complete COMM/security/performance/restore evidence, or the conditional human plus terminal machine privacy chain cannot support `PASS`.

## 14. Backup, restore, RTO, and RPO

The commercial-hardening SSOT lists 8 hours RTO and 24 hours RPO as internal targets, while `docs/repitte_requirements.md` states 30 minutes and 15 minutes. The v0.2 proposal offers `28,800` and `86,400` seconds only as this drill's thresholds. A PASS does not prove the stricter product target; the authority difference requires an explicit owner decision before commercial release.

The proposal selects a Pro daily physical backup and Supabase Restore to a New Project, a fixed synthetic reservation watermark, same-region/Large restore target, zero Storage objects, a 36-hour eligible-backup wait, explicit RTO/RPO events, and separate cleanup approval. Restore-to-new-project is Beta and database-centered; Auth settings/API keys, Storage settings/object bodies, Edge Functions, Realtime settings, read replicas, and custom-role password dependencies require command-bound excluded/manual-scope evidence. The source and restore artifacts bind typed Management API list observations, a Dashboard read-replica capture, the pinned full-schema hash-only platform projections, the exact six-query database catalog, and the applicable non-secret credential fingerprints. Any required target reconfiguration is a separate mutation that must stop for an exact supplemental ledger and approval. `PR12-CMD-017` writes the final source watermark; only after it and all source API/GraphQL calls complete does `PR12-CMD-016A` capture the final family-specific side-effect inventory and late service-role non-exposure report, and no later source mutation may occur before `PR12-CMD-017A` captures a fresh backup inventory. The first completed physical backup with provider `inserted_at` at or after the post-watermark baseline is only temporally eligible; watermark containment is `PROVEN_ONLY_AFTER_RESTORE`. The `PR12-ACTION-017` creation collector binds the provider-operation identifier when exposed, or an explicit null/unavailable state when not exposed; selected backup; raw Dashboard and Management API observations; provider `created_at`; ACTIVE/healthy readiness; raw source/restore region/compute/disk/SSL/network comparison; quote line-item recomputation; source/operator UTC anchors; and an operator monotonic start. It may not connect to the restore database. After separate supplemental approval, `PR12-CMD-018` is the first restore database connection and captures restore `clock_timestamp()` with the restore ref/system identifier/direct host. PostgreSQL system identifiers are observational and may be the same or different; cross-target identity is instead fixed by ref/URL/host/credential bindings. After `PR12-CMD-019D` and `PR12-CMD-019G`, `PR12-CMD-019A` performs the corresponding late restore-target non-exposure scan and side-effect proof. The final non-mutating command records the monotonic end/elapsed interval, hash-binds all fresh restore-scoped results after side-effect verification, and closes service RTO. The verifier enforces multi-clock provenance, numeric skew, and pre-confirmation RPO timing, but the runtime collector remains `NOT_IMPLEMENTED`; therefore RTO/RPO remain blocked until that collector is implemented, tested, audited, approved, and hash-pinned.

Target-specific anon/service-role key presence is derived only from the separately hash-bound `PR12-TARGET-CREDENTIAL-PRESENCE-V1` result in each credential-provider configuration. It must prove non-empty target-prefixed runtime inputs produced the recorded fingerprints, reject the empty-string fingerprint, and persist no value. A DR-local key-presence boolean is not evidence.

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
- at least two independent read-only audits with no must-fix finding;
- intentional files staged individually, Conventional Commits, push, and Draft PR;
- all eight required CI jobs observed on one head SHA.

Even after those steps, all staging-bound COMM gates remain `NOT_RUN`; the PR remains Draft, commercial remains `NO_GO`, and execution waits for explicit owner approval of the completed packet.
