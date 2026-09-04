# PR12 Isolated Staging and DR Runbook v1.0

## Status

- Run state: `NOT_RUN`
- Staging authorization: `false`
- Production authorization: `false`
- Target commit: `GIT_HEAD_AT_APPROVAL / NOT_CAPTURED`
- Proposed project: `seikotsuin-pr12-isolated-qualification-20260719`, Pro, Tokyo `ap-northeast-1`, Large
- Source/restore project refs: `NOT_CAPTURED`
- Exact command ledger: `PROPOSED_NOT_EXECUTABLE`
- Commercial release: `NO_GO`

This runbook is executable only after [the approval packet](../stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml) is complete, SHA-256 pinned, and explicitly approved. Until then, only the local/offline checks in section 2 are allowed.

## 1. Roles and separation of duties

| Role                                    | Current owner                                                                                           | Required responsibility                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Phase 1 sole operator/approver          | candidate contract ID `owner:futoshi-iwasawa`; final Action-003 role binding/attestation `NOT_CAPTURED` | provisioning/platform/cleanup/evidence custody and final risk decision  |
| Phase 2+ release approver and operators | `UNASSIGNED`                                                                                            | approve exact head, project, data, thresholds, commands, cost, and risk |
| Migration operator                      | `UNASSIGNED`                                                                                            | clean replay, parity, lock/duration capture                             |
| Security reviewer                       | `UNASSIGNED`                                                                                            | tenant/Auth/Data API/GraphQL/service-role evidence                      |
| Restore owner                           | `UNASSIGNED`                                                                                            | backup source, restore target, integrity, RTO/RPO                       |
| Monitoring owner                        | `UNASSIGNED`                                                                                            | canary, abort signals, 24h/72h review                                   |
| Incident owner                          | `UNASSIGNED`                                                                                            | abort, containment, communication, forward-fix decision                 |

Phase 1 alone uses the explicitly recorded `PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1`; it truthfully claims no independent human separation and requires hash binding, a cooling/reconfirmation interval, and explicit final residual-risk acceptance. The exception does not extend to Phase 2+, cleanup/deletion approval, production, Ready, merge, or commercial release. Production credentials and patient data are prohibited.

## 2. Allowed offline preflight

Run from the clean PR12 worktree in PowerShell. These commands do not connect to staging or apply a database change:

```powershell
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor 4475e1c641c2ff18f66021ee65cfecfceaa6b7ab HEAD
fnm exec --using=24 node --version
fnm exec --using=24 npm.cmd ci
fnm exec --using=24 node scripts/commercial-hardening/verify-pr12-preparation.mjs
fnm exec --using=24 node scripts/commercial-hardening/scan-pr12-evidence.mjs
fnm exec --using=24 node scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs --manifest docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json
fnm exec --using=24 npm.cmd test -- --runInBand --runTestsByPath src/__tests__/security/commercial-pr12-qualification-preparation-contract.test.ts
git diff --check
```

The repository requires Supabase CLI `2.109.0`. The PATH CLI observed during preparation was `2.109.1`, so it is not accepted as execution evidence. The official Windows `2.109.0` archive was verified outside the repository at SHA-256 `d2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b`; the selected `supabase.exe` is fixed at SHA-256 `903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118`, its adjacent `supabase-go.exe` at `59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0`, and `psql.exe` 17.9 at `6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531`. Only the approved `migration`, `db push`, `db advisors`, and `gen types` command shapes are eligible; `link` and `--linked` are forbidden. Final evidence must re-observe the exact paths, versions, and hashes. Do not upgrade the repository pin.

## 3. Approval preflight — hard stop

The [v0.2 human approval packet](../stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md) proposes the environment, data, SLO, DR method, integration boundary, time, and cost. Authorization has six hash-pinned stages: [source provisioning v6](../stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding-v6.template.json); [source identity/read-only platform bootstrap](../stabilization/evidence/commercial-hardening/pr12/source-identity-bootstrap-binding.template.json) with a separate [result](../stabilization/evidence/commercial-hardening/pr12/source-identity-bootstrap-result.template.json); narrow [source replay/catalog capture](../stabilization/evidence/commercial-hardening/pr12/source-replay-catalog-capture-binding.template.json) with a separate [result](../stabilization/evidence/commercial-hardening/pr12/source-replay-catalog-capture-result.template.json); [full source qualification and backup capture](../stabilization/evidence/commercial-hardening/pr12/staging-execution-binding.template.json); [selected-backup restore-project creation/provider observation](../stabilization/evidence/commercial-hardening/pr12/restore-project-creation-binding.template.json); then [supplemental restore validation](../stabilization/evidence/commercial-hardening/pr12/restore-execution-supplemental-binding.template.json). Each later stage requires its own hash, approver, evidence, and expiry, with a mandatory stop between stages. For Action-003 mechanics, the 2026-07-31 Phase 1 preparation-spec revision supersedes older two-stage/fixed-time language: one human receipt approves the exact plan, while the projection and execution binding are local system derivations.

- Draft head SHA, approval-packet SHA-256, and an `APPROVED` machine-readable binding that the verifier matches to the current Git HEAD
- project ref/name, region, tier, database/PostgREST/extension versions
- synthetic/anonymized source, volume, row counts, hashes, expiry
- fixed PR11 contract hash, exact 9/6/2+2 result shape, plus separately frozen hosted workload/concurrency/order/duration/SLO
- CPU, pool, lock, WAL, migration-duration abort thresholds
- exact hash-pinned tenant/Auth/JWT/role/target/direction/CRUD, Data API ACL-inventory, and GraphQL matrices, including independent ACL/RLS expected outcomes
- source-only Stripe test mode, restore Stripe disabled/no-credential override, Upstash decision, and every external integration disposition
- backup/restore method, source watermark, target, RTO/RPO thresholds, start/end events, durable-watermark definition, four independent clock sources, and numeric maximum clock skew
- immutable 54-gate COMM claim-map hash plus implemented, closed typed-claim registry; generic self-attestation is forbidden
- hash-pinned environment-only credential channel/storage/retrieval/logging contract and redaction behavior
- exact commands, expected side effects, estimated time/cost
- machine privacy scan plus named human review method/evidence
- staging, migration, restore, security, privacy, monitoring, incident, and approval owners
- approval expiry and every revalidation trigger

If a field required by the stage being entered remains `UNASSIGNED`, `NOT_CAPTURED`, or `NOT_RUN`, stop. Stage 1 has the shared Organization identity/Pro plan and implemented Action-002-to-Action-003 linkage; the local contract fixes known additional charges at zero and request/readiness/poll timeouts at 30,000 ms / 900 s / 15 s. It remains blocked by populated repository-external evidence/terminal fingerprints, final head/artifact hashes, reusable official-pricing bytes/hashes, explicit owner acknowledgment of unknown charges, the relative 60-minute authority TTL, `$50` / named payment source / scheduled+73-hour policy, cleanup/recovery decisions, distinct Action-003 journal/evidence identities, complete two-role DPAPI configuration/database-password envelope, one exact-plan self-approval plus same-Organization blast-radius acceptance, and a matching system-derived execution binding. Stage 2 additionally needs the provider-created source identity, source-only post-creation credential configuration, read-only platform collector, and exact tool evidence. Stage 3 needs guarded replay/catalog tooling. Stage 4 needs the fresh-catalog classification, exact matrices/collectors, closed typed COMM registry, clocks, and full execution approval. Stages 5 and 6 have separate selected-backup/provider-evidence/restore-credential blockers.

### 3.0 Organization identity capture prerequisite — completed PASS, no rerun

`PR12-ACTION-002` captured the shared Organization identity once under a separate explicit approval. It completed PASS at head `6edd6733756dd73e458cf705675895a5666c76e6`, recording ID/slug `kbnsntifrawhimhfjrug`, plan `PRO`, one GET attempt, zero retry, and zero production contact. Its consumed durable claim/intent means it must not be rerun.

The sealed result is fixed by request SHA `95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e`, binding-material SHA `56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c`, manifest SHA `66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582`, and terminal SHA `3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e`. It retrieved only the Management token after durable claim and never opened the database-password role.

The exact six-file bundle persists only the safe Organization projection, hashes, timestamps, Node runtime facts, zero production counters, one-attempt/no-retry counters, and secret scan. Raw provider bodies, headers, token, production identifiers, and database password are absent. The terminal journal references the sealed manifest and preserves the mandatory stop.

The historical one-shot command shape was:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs `
  --execute-authorized-action PR12-ACTION-002 `
  --binding <approved-binding-v1.json> `
  --credential-config <approved-dpapi-credential-config-v2.json> `
  --approval-evidence <approved-identity-capture-owner-approval-v1.json> `
  --journal-directory <owner-controlled-absolute-directory> `
  --evidence-parent <owner-controlled-absolute-directory>
```

This command completed once and is not repeatable authority. The sealed directory is verified locally with:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs `
  --evidence-directory <owner-controlled-evidence-directory>
```

The verified Organization ID does not authorize provisioning by itself. Action-003 v6 now hash-binds the sealed evidence and terminal journal, independently verifies their bytes/fingerprints, removes the duplicate Organization entitlement GET, and enforces exact `fundedThrough = scheduledExecutionAt + 73 hours`. Stop until the populated exact plan receives its one owner approval and matching system-derived execution binding.

### 3.1 Phase 1-only wrapper — v6 enablement implemented, not approved or run

The [Phase 1 preparation specification](../stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md) and [binding v6 template](../stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding-v6.template.json) define one `PR12-ACTION-003` create-project POST attempt. Before its own credential retrieval or network contact, the wrapper verifies the bound Action-002 identity contract/verifier hashes, sealed evidence directory, terminal journal, exact Organization projection, chronology/counters, and raw-path-free directory snapshots. It verifies the one owner-supplied v2 authority receipt, the system-derived authorization projection and execution binding, the exact three-file candidate directory, and their stable file/resolved-path identities and owner-plus-SYSTEM ACLs before every dispatch. It rejects the Action-003 Organization GET route. It also checks head/hashes/expiry, production deny identity, fixed source name/region/tier, official pricing/funding/cleanup, exact canonical scheduled+73-hour arithmetic, sole-operator controls, disjoint storage trees, and create-once journal. Organization-wide duplicate enumeration still recognizes only the production ref in memory and persists no production metadata. The ceiling is not a provider-enforced cap and is not a Phase 2+ or restore budget.

The v2 credential configuration binds Windows DPAPI CurrentUser, exact PowerShell/broker/bootstrap hashes, owner SID/machine, provider-root lexical/resolved fingerprints and device/inode identity, strict ACL/no-reparse policy, and two fixed role envelopes. ACL capture/protection invokes the fixed tracked helper with `pwsh -File` and one opaque `-LiteralPath` argument; owner-controlled paths are never appended to `pwsh -Command` text. The Action-002 Management-token envelope/use does not complete Action-003's two-role configuration or database-password envelope. The next bootstrap approval is fixed to the exact one-role set `["DATABASE_PASSWORD"]`; it does not reauthorize, read, decrypt, or overwrite the existing Management envelope, and the unchanged bootstrap script preserves that envelope's recorded bootstrap provenance. This enablement cycle performed no credential retrieval, decryption, or bootstrap. A future approved Action-003 execute requests token plus password only after its own durable claim; recovery requests token only.

Supabase documents no create-project idempotency key. The wrapper therefore validates all resolved storage boundaries before claim, writes a durable local claim and then a durable `POST_INTENT_DURABLE` record containing the pre-POST remote-contact count, lists every organization-project page before POST, sends at most one POST, and never blindly retries. DPAPI broker failure already consumes the claim. The intent record permanently consumes `PR12-ACTION-003`, including when the final synchronous guard stops before POST; that zero-POST case is `PRECHECK_ABORTED`, not an unknown remote outcome. Immediately before POST, without an intervening await, the wrapper re-reads the claim/intent and revalidates path identity, approval expiry, official-pricing freshness beyond the request timeout, and DPAPI resource identity. Before creating the intent it also re-reads stable approval/source snapshots and revalidates hashes/identities, HEAD/base, clean worktree, governance/implementation hashes, expiry margin, ambient-credential absence, and payload. Every GET and POST checks approval expiry immediately before `fetch`; expiry after POST prevents another remote contact and produces owner-decision evidence. A timeout or lost/changed response becomes `UNKNOWN_REMOTE_OUTCOME`; while approval remains current, the same run attempts one read-only all-pages project-list reconciliation, persists its safe result or failure code, and requires a new owner decision. Any new POST remains forbidden. Raw headers/bodies are discarded after in-memory allowlist validation; only safe projections and response-body SHA-256 values enter evidence.

Evidence is written once to a deterministic `.partial-<pid>` directory, each artifact is flushed and reread, and the exact six-file bundle is parsed and hashed from stable identical byte snapshots, then rechecked before atomic rename and before any success terminal. Fatal UTF-8 decoding, raw-text secret scanning, canonical JSON bytes, wrapper-reachable state sequences, reduced preflight page/contact/protected-production-ref counts, zero direct-production-contact counters, broker mode/count, truthful sole-operator metadata, Action-002 linkage, scheduled+73-hour arithmetic, and chronology are required. Automatic reseal is forbidden. After interruption, `--reconcile-dispatched-action PR12-ACTION-003` has no POST path. Phase 1 binding/result schema v6 and authorization/provider schema v1/v4 remain phase-local; promotion of schema v2 or later to the legacy commercial manifest is `NOT_IMPLEMENTED`, and a local PASS implies no COMM PASS.

The future command, after a separate exact hash-bound approval, is:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs `
  --execute-authorized-action PR12-ACTION-003 `
  --binding <candidate-binding-v6.json> `
  --credential-config <candidate-credential-config-v2.json> `
  --approval-evidence <authorization-projection-candidate-v1.json> `
  --single-action-approval-receipt <single-action-approval-receipt-v2.json> `
  --derived-execution-binding <derived-execution-binding-v1.json> `
  --owner-private-approval-root <owner-private-approval-root> `
  --pricing-evidence <official-pricing-evidence.json> `
  --organization-identity-evidence-directory <sealed-action-002-evidence-directory> `
  --organization-identity-terminal <action-002-terminal-journal.json> `
  --journal-directory <owner-controlled-absolute-directory> `
  --evidence-parent <owner-controlled-absolute-directory>
```

This command was not executed. It authorizes no database connection, link, configuration change, replay, seed, backup/restore, cleanup/deletion, or Phase 2+ action.

After any future Phase 1 run, verify its exact phase-local six-file evidence directory read-only:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs `
  --evidence-directory <owner-controlled-evidence-directory>
```

This verifier recomputes every artifact size/hash and the manifest sidecar, rejects extra files or links, reconciles action/provider/result identity and status, and requires the privacy/secret scan. It performs no remote contact.

## 4. Exact staging command freeze

Status: `PROPOSED_NOT_EXECUTABLE`.

The reviewed proposal is [staging-command-ledger.proposed.json](../stabilization/evidence/commercial-hardening/pr12/staging-command-ledger.proposed.json). It enumerates every approval/tool/identity/migration/data/type/performance/security/API/billing/Advisor/side-effect/backup/restore/privacy phase. The Phase 1 action names its implemented wrapper but remains `authorizedNow: false` with owner inputs unresolved. The Stage 3 runtime guard, external replay-input materializer, replay/catalog validators, hosted-types comparator, Advisor normalizer/diff, strict representative-fixture contract, and the `PR12-CMD-013` all-role smoke component are implemented and offline-verified only. Their remote execution remains `NOT_RUN / NOT_AUTHORIZED`; all other Phase 2+ executors remain `NOT_IMPLEMENTED`.

The full ledger cannot yet become executable. Phase 1 has a fail-closed local binding guard/wrapper/collector with the target Organization, production deny identity, canonical sole-operator candidate ID, and cost policy fixed. It still requires populated Action-002 external evidence/journal path fingerprints, the final Action-003 role binding/attestation for that candidate ID, fresh official-pricing captures, exact `scheduledExecutionAt`/`fundedThrough`, two-role DPAPI configuration and real credential envelopes, cleanup deadlines, stable journal/evidence locations, final hashes, risk attestations, and a bounded approval window. Stage 2 must still capture the actual project/database identity and platform configuration. Stage 3/4 still require populated hash-bound approvals, the CA bundle path/hash, proven direct connectivity, a fixture epoch and approved credential provider, fresh catalog classification, and runtime evidence paths. Canonical PR11 and hosted SLO runners, the complete security/Auth/tenant/Data API/GraphQL/COMM-BILL matrices, closed COMM claim registry, backup/watermark, post-restore, side-effect, and full-qualification privacy collectors remain unimplemented. Do not replace these blockers with ad-hoc Management API, Dashboard, psql, Supabase CLI, or load commands.

The final owner-approved ledger must contain:

- ID and purpose
- exact executable and arguments with secrets represented only by environment-variable names
- working directory and exact target project allowlist
- whether it is read-only or mutating
- boolean `remoteContact` and `mutating` plus the exact verifier-allowlisted `mutationScope` for that phase; unknown phases/scopes abort
- expected schema/data/WAL/backup/external side effects
- timeout, abort signal, recovery step, stdout/stderr artifact paths
- CLI `2.109.0` `--help` evidence for every used subcommand
- the exact `supabase.exe`, adjacent `supabase-go.exe`, `psql.exe`, and CA-bundle paths plus independently observed SHA-256 values

The guarded runner rejects the known production-associated ref before credential use or network contact. For Stage 2 it compares HEAD/expiry plus the provider-created ref, URL, direct host and user; `PR12-CMD-004A` captures the system identifier because it is not pre-known. Stage 3 and every later source command must match that captured identifier. Stage 5 never connects to the restore database. Stage 6 compares the provider-known restore ref/URL/direct host and the separate restore credential configuration before `PR12-CMD-018`; that first read-only command captures the restore system identifier, which all later restore commands must match. The runner enforces source != restore, disables dotenv and ambient fallback, constructs each child environment from an explicit allowlist, closes stdin, uses `shell: false`, dispatches at most once with wrapper retry zero, and treats timeout or an ambiguous child outcome as `UNKNOWN_REMOTE_OUTCOME`. Cleanup/project deletion is excluded and needs a later separate approval/ledger.

Stage 3 never runs `supabase link` and never accepts `--linked`. It creates a new repository-external work directory containing only the hash-verified `supabase/config.toml`, the 61 ordered migrations, and the fixed collector SQL assets. It does not copy dotenv files, `supabase/seed.sql`, `supabase/tests`, or repository `.temp` state. Database commands use the exact password-free direct URL `postgresql://postgres@db.<approved-ref>.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=<approved-ca-path>` and inject the database password only as `PGPASSWORD` into the isolated child. Direct-host failure is a stop; pooler, IPv4 add-on, TLS weakening, and fallback connection modes are forbidden.

The source and restore credential-provider configurations must each record the fixed `PR12-TARGET-CREDENTIAL-PRESENCE-V1` outcome derived from the non-empty target-prefixed runtime values used for the anon/service-role fingerprints. The verifier rejects the empty-string fingerprint, persists no credential value, and does not accept an independent DR key-presence self-claim.

## 5. Freeze phase

Before the first sample:

1. Record `git rev-parse HEAD`; require it to equal the approved SHA.
2. Hash the approval packet, finalized security target inventory, separate owner-approved target classification, all three security/API matrices (including the six-kind Data API ACL inventory and Data API/GraphQL runtime configuration), immutable COMM claim map, credential-channel contract, performance contract, migration input contract, all probes, runner/adapter, and data package.
3. Verify all 61 migration and 60 rollback aggregate hashes and parity.
4. Freeze hosted workload, concurrency, sample order, p95/p99/throughput/5xx/timeout, CPU/pool/lock/WAL/duration, RTO/RPO thresholds, and maximum accepted provider/database/operator clock skew.
5. Capture `node --version`, `supabase --version`, and `psql --version` through their approved command IDs, hash stdout/stderr, require empty stderr, and verify Node 24 plus `supabase.exe` `2.109.0` SHA-256 `903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118`, its adjacent `supabase-go.exe` SHA-256 `59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0`, and `psql.exe` `17.9` SHA-256 `6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531`. PATH-resolved Supabase CLI `2.109.1` is not an allowed substitute. Confirm process-environment-only credential injection from the approved server secret store into an ephemeral server subprocess; forbid values in browser, CLI/URL, client response, logs, source control, and evidence. Record approval before any command timestamp and reject execution outside the approval window.
6. Create a new evidence directory. Refuse an existing/non-empty directory.
7. In Stage 3, `PR12-CMD-007A` captures the fresh post-replay `pg_catalog` mother set, fixed Auth targets, complete Data API ACL object catalog, and API/GraphQL settings. Stop and sign the Stage 3 result. Before Stage 4, reconcile those exact hashes with the separately owner-approved classification. The tracked draft and representative fixture rows cannot create or shrink the runtime mother set. Stop on a missing, extra, duplicate, `UNKNOWN`, draft, blocked, or unapproved relation.
8. Run privacy preflight. Stop on any secret, credentialed URL, real identity, patient data, or user-home path. Machine scanning is necessary but not sufficient; record a named human privacy review and hashed review evidence. Before terminal `PR12-CMD-020`, pre-create its empty stdout/stderr files and list them in the manifest. Final qualification scanning must use `scan-pr12-evidence.mjs --manifest <manifest.json>` and require a manifest-closed evidence directory containing exactly the selected manifest plus every listed artifact and nothing else. The scanner excludes only its own two stream contents while generating them; the final verifier validates their final hashes. Empty/subset coverage or any unmanifested file fails closed.

No value may be recalculated after observing a sample.

### Authoritative command order

The JSON ledger is authoritative. The following slices are exact; omission, duplication, or reordering aborts before the affected command:

| Boundary                       | Exact ordered IDs                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline freeze                 | `PR12-CMD-000 → PR12-CMD-000A → PR12-CMD-001 → PR12-CMD-002`                                                                                                                                                     |
| Stage 2                        | `PR12-CMD-004A`, then stop                                                                                                                                                                                       |
| Stage 3                        | `PR12-CMD-003 → PR12-CMD-004 → PR12-CMD-005 → PR12-CMD-006 → PR12-CMD-007 → PR12-CMD-007A → PR12-CMD-008A`, then stop                                                                                            |
| Stage 4                        | `PR12-CMD-008B → PR12-CMD-008 → PR12-CMD-009 → PR12-CMD-010 → PR12-CMD-011 → PR12-CMD-012 → PR12-CMD-013 → PR12-CMD-014 → PR12-CMD-015 → PR12-CMD-016 → PR12-CMD-017 → PR12-CMD-016A → PR12-CMD-017A`, then stop |
| Restore-creation approval stop | `PR12-CMD-017B`; it is not part of Stage 4 authority                                                                                                                                                             |
| Stage 5                        | `PR12-ACTION-017`, then stop before any restore database connection                                                                                                                                              |
| Stage 6                        | `PR12-CMD-018 → PR12-CMD-019 → PR12-CMD-019S → PR12-CMD-019D → PR12-CMD-019G → PR12-CMD-019A → PR12-CMD-019F`, then stop                                                                                         |
| Terminal evidence              | `PR12-CMD-020`; only the out-of-manifest final verifier may follow                                                                                                                                               |

## 6. Stage 2 read-only identity and platform bootstrap

`PR12-CMD-004A` captures only:

- project ref/name, organization boundary, region, tier
- Postgres/PostgREST/Supabase CLI/psql/Node versions and system identifier
- Data API Dashboard-configured state from a separately manifest-bound accessibility capture, PostgREST schemas, independent service health, fixed service-role OpenAPI smoke, and exactly 48 V2 default-ACL rows
- `pg_graphql` available/installed version, endpoint-enabled state, PostgREST-cross-bound configured schemas, role visibility, and fixed-query introspection result as independent facts
- Auth anonymous/login-provider posture plus the exact `PR12-AUTH-SAFE-PROJECTION-V2` SMTP/SMS/OAuth/hook presence field set and independently derived external-delivery posture

Then stop. Migration history, catalog ACL/RLS, Advisor, operational capacity, backup capability, and integration state belong to Stages 3 or 4.

## 7. Clean migration replay and data preparation

Stage 3 permits exactly seven ordered commands after its separate replay/catalog approval and the completed Stage 2 bootstrap:

1. `PR12-CMD-003`: locally materialize only the approved external runtime metadata and hash-bound replay inputs; perform no remote contact.
2. `PR12-CMD-004`: use direct PostgreSQL read-only collection to prove the clean-target precondition and capture initial migration/catalog identity.
3. `PR12-CMD-005`: run the exact immutable replay dry-run over the password-free direct URL.
4. `PR12-CMD-006`: capture and normalize the pre-replay security and performance Advisor baseline over the same direct identity.
5. `PR12-CMD-007`: perform the owner-approved clean full replay through `20260718011731` while capturing start/end, exit, lock, duration, and stdout/stderr hashes.
6. `PR12-CMD-007A`: capture the fresh catalog/settings envelope.
7. `PR12-CMD-008A`: prove exact final migration-history parity, sign the Stage 3 result, and stop.

Only after the owner approves the final Stage 4 source binding and `PR12-CMD-008B` validates it:

8. `PR12-CMD-008` loads only the separately approved PR12 strict fixture plan: 83 explicit rows across 18 relations, including four clinics, seven Auth/profile/staff/permission actors, one active manager assignment, and the existing 43 business rows. Raw `supabase/seed.sql` and the existing E2E seed entrypoint are forbidden.
9. `PR12-CMD-009` verifies the exact 83 explicit rows plus 12 trigger-derived `public.reservation_history` rows, for 95 rows across 19 relations. It hashes primary-key-ordered canonical JSON without persisting raw rows. The preapproved fixture-plan SHA is fixed before execution; the complete source snapshot SHA is captured for the first time here and becomes restore-parity authority.
10. `PR12-CMD-010` uses the dedicated Management-token child to generate hosted Supabase types into a repository-external temporary output, without writing `src/types/supabase.ts`, then compares normalized bytes/hashes. The machine result must enumerate all 61 ordered migrations, frozen migration/rollback set hashes, generated-type hash, exact explicit and derived row maps, the official historical logical and normalized-physical facts, the hosted environment physical-structure hash, and source schema/data hashes; the verifier parses these artifacts rather than accepting a generic evidence link.
11. Continue only in the authoritative Stage 4 order: canonical PR11 `011`, hosted SLO `012`, security/Auth/tenant `013`, Data API/GraphQL `014`, billing/integrations `015`, Advisor diff `016`, watermark `017`, side-effect inventory `016A`, and backup inventory `017A`; then stop.

Stop on replay, history, type, seed, row-count, or schema drift. Do not edit an applied migration.

## 8. Database security qualification

Run pgTAP/catalog/behavior contracts for:

- RLS enabled and exact policy role/command/predicate behavior
- relation/default/column/sequence/schema privileges
- function EXECUTE, owner, fixed search path, invoker/definer, volatility, comments
- helper fail-closed behavior and trigger identity
- composite FK and cross-clinic behavior
- internal-table client denial, shared-master read-only, legacy quarantine

Then run tenant A/B read/insert/update/delete negatives for every Class A target derived from the approved inventory and every major application role. Class B, C, Auth, and E inventory entries must be routed to their separately fixed coverage families; no relation may silently disappear. Record ACL-denied, RLS-zero-row, and business-validation denials as distinct expected outcomes with SQLSTATE/message/row counts.

The locally implemented all-role smoke component is only a readiness subset inside `PR12-CMD-013`, not a new command or a COMM PASS result. It fixes eight role classes, seven real hosted actors, real sign-in/refresh/profile operations, 14 `public.staff` REST reads (Tenant A five-role own/other pairs, Tenant B staff own/other pair, and no-clinic A/B denials), 16 browser-route cases, and a local service-role browser/client non-exposure check. It uses a zero-retry in-memory adapter and persists no JWT, password, browser storage state, or response body. Full CRUD, actual service-role calls, and GraphQL remain in `PR12-CMD-014`.

Run the five relational-integrity probes separately through direct PostgreSQL as `postgres`, inside a fixed synthetic transaction that ends in `ROLLBACK`. They do not prove ACL or RLS:

- `missing_resource` and `null_resource`: `INSERT public.blocks`, SQLSTATE `23503`, exact `resources.id not found` diagnostic, attempted block absent before/after, and existing/other-tenant sentinel hashes unchanged;
- `parent_rehome`: `UPDATE public.resources`, SQLSTATE `23503`, exact `blocks_resource_id_fkey` diagnostic, target resource clinic and referencing block hashes unchanged, and other-tenant sentinel unchanged;
- `resource_delete_cascade`: the parent delete directly affects one resource row; target resource and dependent block transition present-to-absent; unrelated resource/block and other-tenant sentinels remain hash-identical;
- `clinic_delete_cascade`: the parent delete directly affects one clinic row; target clinic/resource/block transition present-to-absent; other-tenant sentinel remains hash-identical.

Before approval, freeze every relational assertion to one synthetic primary-key selector, a canonical parameterized snapshot-query SHA-256, `FULL_ROW_TO_JSONB`, `POSTGRES_JSONB_TEXT_UTF8_V1`, SHA-256, and `maximumRows: 1`. Each case must emit before/in-transaction-after/post-rollback row counts, existence, hashes, and timestamps plus raw PostgreSQL diagnostics. Existence is derived from row count, and chronology is command start <= before <= after <= `ROLLBACK` < post-rollback <= post-check <= command end. The expected and observed transaction end must be `ROLLBACK` with `COMMAND_OK`; every post-rollback existence/hash must equal its before state. The selector/query collector and committed fixture selector set are currently `NOT_IMPLEMENTED` / `NOT_CAPTURED`, so relational PASS is impossible. A denied cascade, a zero-direct-row cascade, a child still present in the in-transaction state, missing sentinel, failed rollback, selector/query mismatch, or post-rollback mismatch is `FAIL_STOP`.

## 9. Auth and JWT qualification

Use real hosted Auth sign-in and refresh. Do not obtain a hosted JWT signing secret or fabricate hosted user tokens.

Cases include DB-authoritative role/scope, missing authority, permissions query-error/row-missing, profile query-error/row-missing, inactive profile, revoked or owner-defined expired manager assignment, stale JWT, empty bearer, malformed/expired JWT, anon, authenticated, and service-role. Each hosted case that needs a real session uses a dedicated synthetic actor bound to purpose/JWT case/clinic/application role; empty and malformed bearer cases do not create a hosted session. Query-error cases require an owner-reviewed safe induction method that exercises the production lookup path, exact method/config hash, target and companion lookup observations, correlation/timestamps, `protectedOperationExecuted:false`, zero persistent mutation, HTTP 503, and ACL/RLS `NOT_APPLICABLE`. Row-missing actors must be pre-provisioned with complementary profile/permission state and return HTTP 403 without mutating state during the probe. That induction method and collector are currently `NOT_CAPTURED` / `NOT_IMPLEMENTED`, so `COMM-AUTH-002` cannot PASS.

A stale JWT must be a still-active real hosted token whose safe claim fingerprint predates a hash-bound authoritative DB state change; evidence must enforce issued < authority change < request < expiry minus the owner-approved skew margin. The expired-JWT case must use a dedicated naturally expired hosted token and prove expiry plus skew. Auth session acquisition windows, safe claim (`sub`/`aud`/`role`/`session_id`/`iss`/`iat`/`exp`) reconciliation, stale-authority snapshots, clock/skew validation, and source/restore session disjointness remain `NOT_IMPLEMENTED`. `user_metadata` is never authorization authority.

Service-role/secret requests run only in a server-side subprocess after scope checks. The application security matrix proves the server-only allow/deny boundary. Non-exposure is separately proved only after all covered calls: `PR12-CMD-016A` for source and `PR12-CMD-019A` for restore re-inject only the applicable target-prefixed credential in memory, scan the actual browser assets, client responses, application logs, command records, and evidence, persist only hashes/counts, then scrub it. Each REST/RPC/GraphQL case must bind its raw observation, producing command/time, artifact hash, and credential fingerprint; the command/evidence inventory must include every covered raw artifact.

## 10. Data API and GraphQL qualification

For REST, first capture the Data API enable control from a separately hash-bound read-only Dashboard accessibility artifact. Do not infer it from health or endpoint reachability. Capture PostgREST schemas through the sanitized Management API projection, REST health separately, and the fixed `service_role` `GET /rest/v1/` OpenAPI shape with exact request/body hashes. The V2 default-ACL probe must return exactly 48 ordered rows: `postgres`/`supabase_admin` × global-or-hard-wired/`public`-additional × table/sequence/function × `PUBLIC`/`anon`/`authenticated`/`service_role`. It records provider/catalog fact only and never infers the Dashboard toggle; `service_role`-only grants do not imply public automatic exposure. Then capture a fresh catalog from the actual exposed schemas: schemas; relations with relkind `r`/`p`/`v`/`m`/`f`; sequences; columns; and functions with identity arguments. Freeze the exact applicable privilege product for each catalog object across `anon`, `authenticated`, and `service_role`, including direct, `PUBLIC`, inherited, and recomputed effective grants. Missing, extra, duplicate, reordered, or unsorted tuples fail. Separately freeze exactly ten direct-role cases: anon/authenticated relation and column deny, authenticated A→B/B→A RLS filtering, authenticated relation/column same-tenant allow, service-role REST allow, and service-role `POST /rest/v1/rpc/normalize_customer_phone` allow. Every case binds the catalog object ID/kind/identity, matching ACL case and SELECT/EXECUTE result, HTTP method/path, and request/expected-response/observed-response SHA-256. REST allow/deny cannot substitute for the catalog ACL product, and ACL/RLS verdicts remain independent. Source and restore must capture distinct catalogs with exact object parity; source evidence reuse is forbidden.

For GraphQL:

- capture installed version, enabled state, exposed schemas, and introspection;
- if enabled, run anon/authenticated/service-role operation, tenant, field visibility, and introspection cases;
- if disabled, capture the state and endpoint rejection;
- use byte-frozen endpoint/introspection query text and derive acceptance from the sanitized response body; 5xx always aborts;
- never label it `NOT_APPLICABLE` merely because it was not tested.

Stop on any unexpected object/field, status, row, tenant, or introspection result.

## 11. Canonical PR11 performance and hosted SLO

Verify every source hash in `frozen-pr11-performance-contract.json`. Preserve actor, fixture, JWT, GUC, probe, three-sample median, `<=`, and paired order.

Run all 9 primary execution, 6 WAL, 2 auxiliary execution, 2 auxiliary WAL, natural-plan, semantic, SQLSTATE/message, trigger/FK call-count, and 52-case pgTAP gates. Record every exact three-sample set, calculated median, frozen limit, unit, and hashed evidence; the execution verifier rejects missing/extra IDs, recalculated limits, median mismatch, or failure. Created-by and RLS target plans must be natural. The existing post-gate diagnostic forcing is not acceptance evidence and cannot be expanded.

Then run the separately frozen [hosted SLO proposal](../stabilization/evidence/commercial-hardening/pr12/hosted-slo-contract.proposed.json): a 300-second unscored warm-up followed by read-heavy, mixed CRUD, and read-heavy-repeat 600-second samples at concurrency 50. The manifest carries three distinct sample results plus one pooled result. The verifier recomputes throughput, 5xx, and timeout rates from attempted/completed/failed counters, verifies pooled counters and WAL equal the three sample sums, and checks CPU/pool breach windows, lock wait, migration duration, and every sample/pooled percentile. Each sample and the pooled result must meet p95 `<=2,000 ms`, p99 `<=3,000 ms`, throughput `>=20 rps`, 5xx `0%`, and timeout `0%`. Hosted success cannot replace a fixed PR11 failure; either failure aborts. This step remains blocked until its collector and request matrix are implemented and hash-pinned.

No source collector may emit an unbound PASS summary. `PR12-CMD-004A`, `PR12-CMD-007A`, `PR12-CMD-008A`, `PR12-CMD-009`, `PR12-CMD-010`, `PR12-CMD-011`, and `PR12-CMD-012` each emit exact stdout bound to the applicable approved stage, source ref/system identifier/database host/commit; `capturedAt` equals command end and every raw observation lies within the command window. `PR12-CMD-008B` is the non-network barrier between the Stage 3 result and representative seed. The canonical result contains exactly 32 ordered observations; hosted results bind raw populations and counters; migration duration derives from the replay operation.

## 12. Advisor diff and pre-restore integrity

Capture security/performance Advisor results before and after replay/qualification. Normalize each finding to a stable key, sort and deduplicate, then emit added/removed/unchanged sets bound to the same target and approval. A duplicate/unknown finding shape, binding mismatch, or newly added `ERROR` finding aborts. Every accepted non-error exception still needs owner, reason, expiry, and mitigation; suppressing a warning is not remediation.

Capture row counts, schema/data hashes, tenant matrices, and side-effect ledger immediately before backup. `PR12-SIDE-EFFECT-COLLECTOR-V2` must bind the tracked descriptor artifact SHA, literal per-family request/query SHA, exact step status/row count/raw-state hash, and complete pagination or relation-absence facts. The verifier derives mode/configuration/counts from those facts; raw approval/configuration copies are forbidden. Source Stripe may be test-sandboxed; restore Stripe is disabled with no credential. Upstash must be owner-decided before a positive gate. Verify every real/pending/duplicate count is zero.

## 13. Backup and restore drill

Use only the owner-approved [DR proposal](../stabilization/evidence/commercial-hardening/pr12/dr-contract.proposed.json): Supabase Pro daily physical backup followed by **Restore to a New Project** into the fixed same-region Large restore-project proposal. PITR is disabled, there is no automatic logical fallback, and PR11 validation-only rollback SQL is not a restore.

1. Record source identity, backup start/end, restore point, source watermark, owner-approved RTO start/end events and clock/source, plus the RPO durable-watermark and observation definitions.
2. Under Stage 4 approval, run exactly one `PR12-CMD-017` command against the fixed synthetic reservation and require `affectedRows: 1`. Immediately after that final approved source mutation and after the service-role calls in `PR12-CMD-014`, run the non-mutating `PR12-CMD-016A` family-specific side-effect inventory and late non-exposure scan; require zero real/pending/duplicate/production-identity observations and zero credential findings. No later source mutation is permitted before backup. Run exactly one non-mutating `PR12-CMD-017A` collector against the fresh provider inventory and select the first completed physical backup whose provider `inserted_at` is at or after the post-watermark baseline. Bind the raw provider inventory, provider observation UTC, source ref, fresh source mirrored-settings snapshot, and normalized metadata SHA-256. Do not call `inserted_at` a provider start/completion interval, and do not claim watermark containment until the restore proves it. Restore creation remains unauthorized.
3. Stop. Complete and approve `restore-project-creation-binding.template.json`, binding the selected backup metadata ID/hash, exact watermark, fixed restore request, actual quote, cleanup owner, expiry, and numeric maximum clock skew. `fundedThrough` must cover at least 24 hours after that approval expiry, so the latest permitted creation time still has the full restore window. Only then may exactly one `PR12-ACTION-017` Restore-to-New-Project Dashboard action occur.
4. Stop immediately after provider creation/readiness observation. Capture the new ref, organization, name, region, tier, database version, provider `created_at`, ACTIVE/healthy readiness timestamp, project URL, direct database host/user, quote, and raw source/restore region/compute/disk/SSL/network comparison. Do not connect to the restore database or claim its system identifier/clock. Require source != restore and reject the production denylist.
5. Obtain a separate approved supplemental restore binding before any restore-project database connection or validation. It must enumerate the only synthetic qualification mutation command IDs; general mutation stays false.
6. Do not issue a second restore or an unledgered target reconfiguration. The Restore-to-New-Project action is the restore. Before closing source and restore qualification, `PR12-CMD-016A` and `PR12-CMD-019A` must each hash-bind the full DR excluded/manual-scope inventory: empty Storage buckets and Edge Functions from typed Management API GET observations; no read replicas from a typed Dashboard export; the pinned full-schema Auth/Realtime/Storage projections; the six-query database catalog contract; exact Realtime publication set; and the applicable target credential-provider configuration containing only non-secret anon/service-role fingerprints. Raw config values, authorization headers, and credential values must not enter evidence. If any target-specific Auth/API/Storage/Realtime/extension/custom-role-password write is required, stop and obtain a separate exact mutation ledger and approval before changing the target.
7. The restore-creation collector emits hash-bound `RESTORE_PROJECT_CREATION_OPERATION` JSON containing `PR12-ACTION-017`; provider-operation identifier availability and value (null when not exposed); provider export; selected backup; created provider identity; provider `created_at`; ACTIVE/healthy readiness; raw mirror and quote evidence; source/operator UTC anchors; RPO observation no more than five seconds before confirmation; and operator monotonic start. It must not connect to the restore database. After supplemental approval, `PR12-CMD-018` is the first restore database command and captures restore `clock_timestamp()` plus ref/system identifier/host. Each validation family then emits distinct restore-bound stdout and fresh raw observations. `PR12-CMD-019F` is the non-mutating finalization command: it hash-binds all dedicated results, records operator UTC plus monotonic end/elapsed interval, and closes Stage 6 service RTO. The verifier enforces provider/source-DB/restore-DB/operator UTC provenance, owner-approved skew, the five-second RPO lead, monotonic arithmetic, provider raw completeness, quote sum, credential-target separation, and family-specific side-effect state. Runtime collectors remain `NOT_IMPLEMENTED`, so RTO/RPO still cannot PASS.
8. Verify migration head and ordered history, generated types, schema/data hashes, frozen historical logical/normalized-physical facts, hosted environment physical-structure hash, and the exact approved explicit-plus-derived relation key/value map on both source and restore. The hosted environmental hash is recomputed from fixed per-relation queries/digests and must have source-to-restore parity; it is not required to equal the historical normalized-physical fact. Extra relations are drift, even if manifest and collector agree with each other.
9. Repeat Auth, tenant A/B CRUD negatives, all five direct-Postgres relational-integrity probes, Data API direct-role checks, GraphQL enabled/disabled checks, and the service-role server-only boundary against the same hash-bound target inventory used on source. Every tenant denial must have a separate target-tenant counterpart actor prove the same CRUD operation succeeds under a refreshed Hosted Auth JWT; writes affect exactly one row and are rolled back with before/after/post-rollback state hashes. After `PR12-CMD-019D` and `PR12-CMD-019G`, `PR12-CMD-019A` must emit the distinct restore non-exposure report. Source and restore reports cover non-empty browser-build, client-response, application-log, and command/evidence inventories; each of the three service-role cases binds the actual raw observation/artifact/producing command/time/fingerprint, and the command/evidence inventory contains all covered raw artifacts. The exact raw credential is compared only in memory, only its target-specific fingerprint is retained, and exact-match/pattern-finding counts must both be zero. Security, Data API, and GraphQL each require a new hash-bound structured restore result tied to the restore ref and a supplemental-approved validation command; generic `PASS` cannot replace them and restore may not select a smaller target set.
10. Create/update a reservation only through a supplemental-approved synthetic qualification mutation command and verify no duplicate external event. Complete this external-side-effect gate before the non-mutating operation that closes service RTO.
11. Record gaps, failures, follow-up owner/date, evidence retention, and target cleanup decision.
12. Stage 6 ends at `PR12-CMD-019F`. Only then may the bound Clinical Data Privacy Reviewer and Commercial Release Owner write the hash-bound **conditional** sign-off. `COMM-OPS-011` remains `NOT_RUN`. Run terminal `PR12-CMD-020` so its scan covers the exact manifest set; it is not remote Stage 6 authority and no manifest/evidence command follows it. Run `verify-pr12-evidence-manifest.mjs` only out of manifest with no redirected output or evidence artifact. It derives `COMM-OPS-011` in memory. Any coverage/hash/privacy/chronology/verifier failure aborts.

The proposal binds RTO 8h and RPO 24h only if the owner approves the final packet. This does not prove the separate 30m/15m target in `docs/repitte_requirements.md`; the authority difference blocks commercial release until explicitly resolved. Restore-to-new-project is database-centered: Storage object bodies, Edge Functions, Auth settings/API keys, Realtime settings, extensions, and custom database-role passwords require zero-scope evidence or explicit reconfiguration and verification. Physical backup bytes are not treated as downloadable/hashable; hash the raw provider inventory and normalized selected-backup metadata. A backup becomes temporally eligible from provider `inserted_at`, but fixed-watermark containment is proven only after restore. If no eligible backup appears within 36 hours, stop rather than switching methods.

## 14. Canary and production-plan rehearsal

This section remains `NOT_RUN` and design-only until later approval. No production canary is authorized by PR12. Before `COMM-OPS-007..010` can PASS, a separate production packet must replace each field below with a hash-bound value before any traffic:

- cohort selector / clinic list: `UNASSIGNED`; traffic percentage: `UNASSIGNED`; observation window: `UNASSIGNED`;
- code/DB deploy order and feature flags: `NOT_CAPTURED`; rollback-safe flag owner: `UNASSIGNED`;
- monitoring source/query IDs for 4xx, 5xx, timeouts, DB CPU, pool headroom, locks, WAL, latency, Auth denial, RLS/ACL denial, duplicate events, billing sandbox, and collector health: `NOT_CAPTURED`; collector: `NOT_IMPLEMENTED`;
- paging route, Site Reliability Owner, Incident Commander, acknowledgement deadline, mitigation deadline, and communication template: `UNASSIGNED`;
- smoke request matrix, 24h review, and 72h review artifacts: `NOT_CAPTURED`;
- abort action: stop new traffic/disable the affected flag, preserve evidence, do not reverse a migration destructively, and invoke the Incident Commander;
- forward-fix: a new reviewed commit and, for schema changes, RED evidence plus an append-only migration/spec/rollback-forward-fix set under separate approval. Threshold changes or sample replacement are never remediation.

The rehearsal collector and owner-approved plan are `NOT_IMPLEMENTED` / `NOT_CAPTURED`; generic monitoring screenshots or a staging PASS cannot satisfy these gates.

Do not connect to production during PR12 preparation or staging qualification. A staging PASS does not authorize production.

## 15. Abort and evidence preservation

On any abort criterion:

1. stop before the next mutating step or sample;
2. do not change thresholds, order, actors, fixtures, GUCs, or exclude samples;
3. preserve stdout/stderr and partial manifest in a new immutable directory;
4. revoke/rotate only through the incident owner if secret exposure is suspected; never paste the value into evidence;
5. capture locks/errors/Advisor/row/hash state read-only where safe;
6. disable affected synthetic external flows if already enabled;
7. report `FAIL_STOP` with owner and next decision;
8. propose remediation only as a separate owner-approved append-only forward-fix.

Do not drop `public.idx_blocks_resource_id`, advance to another candidate, run destructive rollback, delete the project, or clean evidence without separate approval.

## 16. Recovery and forward-fix

Recovery is fail-closed:

- application/API issue: disable the affected feature/worker and preserve tenant controls;
- migration issue: stop, preserve state, and design an append-only forward-fix with RED evidence and rollback/forward recovery;
- performance issue: keep existing schema/indexes, stop, and investigate without rebaseline;
- restore issue: keep the source untouched, quarantine the restore target, and document the gap;
- external duplication: disable the sandbox consumer and reconcile by idempotency key;
- authorization issue: stop all progression and treat as critical.

No recovery may weaken RLS, GRANT, clinic scope, Auth authority, billing, trigger, FK, or service-secret boundaries.

## 17. Monitoring and sign-off

Immediate staging observation records 4xx/5xx/timeouts, unexpected failures, DB CPU/pool/locks/WAL/latency, Auth failures, RLS/ACL denials, duplicate events, billing sandbox state, and evidence collector health. Every metric needs the hash-bound source/query ID and timestamp series from the hosted SLO contract; the current monitoring collector is `NOT_IMPLEMENTED`.

A later production plan must include immediate smoke plus 24h/72h review. Release sign-off requires all 54 blocking COMM gates to be valid for the exact commit/environment; `COMM-OPS-011` is valid only through the terminal privacy-scan/final-verifier derivation above, never through an unscanned post-scan PASS artifact. `PASS_WITH_RISK` cannot waive tenant isolation, authorization, data loss, restore, or billing integrity.

## 18. Current stop point

After local verification, audits, push, Draft PR, and eight same-head CI jobs, stop and present the v0.2 packet. The proposal is concrete but intentionally non-executable. All six stages—provisioning, bootstrap, replay/catalog, source qualification/backup, restore creation/provider observation, and restore validation—remain prohibited until stage-local blockers are resolved and the owner explicitly approves the applicable hash-pinned binding.
