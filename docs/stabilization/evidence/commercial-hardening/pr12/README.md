# PR12 isolated release qualification evidence

Status: **PREPARATION ONLY / STAGING NOT RUN / COMMERCIAL NO_GO**.

This directory defines the immutable inputs and evidence shape for PR12. It does not contain a staging connection, migration apply, backup, restore, RTO/RPO result, or release approval.

## Authority and records

- [Current implementation SSOT](../../../spec-commercial-hardening-migration-v1.0.md)
- [PR12 implementation specification](../../../spec-commercial-pr12-isolated-release-qualification-v1.0.md)
- [Phase 1 source provisioning approval-preparation specification](../../../spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md)
- [Release qualification SSOT](../../../../releases/commercial-release-qualification-v1.0.md)
- [PR12 preparation gate](pr12-preparation-gate.yaml)
- [Isolated staging entry contract](isolated-staging-entry-contract.yaml)
- [Staging approval packet](staging-execution-approval-packet.yaml)
- [Human owner approval packet](../../../pr12-staging-execution-owner-approval-packet-v0.2-20260719.md)

### Current PR12-ACTION-003 tuple

- [Phase 1 source-project provisioning binding v5 template](source-project-provisioning-binding-v5.template.json)
- [Source-project provisioning Windows DPAPI credential configuration v2 template](source-project-provisioning-credential-configuration-v2.template.json)
- [Source-project provisioning sole-operator/same-Organization owner approval v4 template](source-project-provisioning-owner-approval-v4.template.json)
- [Source-project official pricing evidence v2 template](source-project-official-pricing-evidence-v2.template.json)
- [Phase 1 source-project provisioning result v5 template](source-project-provisioning-result-v5.template.json)
- [Phase 1 source-project provider safe projection v4 template](source-project-provider-safe-projection-v4.template.json)

These are the only current Action-003 schema files. Superseded Phase 1-local templates are recoverable from Git history and are not retained as selectable files.

- [Source-project DPAPI bootstrap approval template](source-project-dpapi-bootstrap-approval-v1.template.json)
- [Source-project external Windows DPAPI envelope template](source-project-windows-dpapi-envelope-v1.template.json)
- [Source-project provisioning action journal template](source-project-provisioning-action-journal.template.json)

### Legacy commercial-manifest v1 compatibility only

- [Legacy commercial-manifest source-project provisioning binding v1 template](source-project-provisioning-binding.template.json)
- [Legacy commercial-manifest source-project provisioning result v1 template](source-project-provisioning-result.template.json)
- [Legacy commercial-manifest source-project provider export v1 template](source-project-provider-export.template.json)

The full commercial-manifest verifier accepts only this compatibility trio. Promotion of a Phase 1-local source provisioning schema v2 through v5 is `NOT_IMPLEMENTED` and must fail closed with `SOURCE_PROVISIONING_V2_PROMOTION_NOT_IMPLEMENTED`; these legacy files are not the Action-003 runtime tuple.

- [Source-project provisioning evidence manifest template](source-project-provisioning-evidence-manifest.template.json)
- [Source-project provisioning privacy scan template](source-project-provisioning-privacy-scan.template.json)
- Phase 1 runtime evidence verifier: `scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs`
- [Source Organization identity-capture binding v1 template](source-organization-identity-capture-binding-v1.template.json)
- [Source Organization identity-capture owner approval v1 template](source-organization-identity-capture-owner-approval-v1.template.json)
- [Source Organization identity-capture action journal template](source-organization-identity-capture-action-journal.template.json)
- [Source Organization identity-capture result v1 template](source-organization-identity-capture-result-v1.template.json)
- [Source Organization identity provider-safe projection v1 template](source-organization-identity-provider-safe-projection-v1.template.json)
- [Source Organization identity-capture evidence manifest v1 template](source-organization-identity-capture-evidence-manifest-v1.template.json)
- [Source Organization identity-capture privacy scan v1 template](source-organization-identity-capture-privacy-scan-v1.template.json)
- Organization identity-capture contract/wrapper/verifier: `scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs`, `scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs`, and `scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs`

Phase 1 manifest classification is path-specific. `action-events.json` and `privacy-scan.json` are `INTERNAL_NO_PII`; `provider-export.safe.json` and `provisioning-result.json` are `INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS` because they contain named stable operator/approver/owner identifiers. Neither classification permits patient data, credentials, raw provider bodies, or raw HTTP headers.

- [Source identity/configuration bootstrap binding template](source-identity-bootstrap-binding.template.json)
- [Source identity/configuration bootstrap result template](source-identity-bootstrap-result.template.json)
- [Source platform configuration provider-native evidence template](source-platform-configuration-raw-evidence.template.json)
- [Source Data API Dashboard settings accessibility-capture template](source-data-api-dashboard-settings-capture.template.json)
- [Source replay/catalog-capture binding template](source-replay-catalog-capture-binding.template.json)
- [Source replay/catalog-capture result template](source-replay-catalog-capture-result.template.json)
- [Machine-readable source execution binding template](staging-execution-binding.template.json)
- [Selected-backup restore-project creation binding template](restore-project-creation-binding.template.json)
- [Supplemental restore validation binding template](restore-execution-supplemental-binding.template.json)
- [Source credential-provider configuration template](source-credential-provider-configuration.template.json)
- [Restore credential-provider configuration template](restore-credential-provider-configuration.template.json)
- [Restore provider export template](restore-project-provider-export.template.json)
- [Source external-side-effect inventory template](source-external-side-effect-inventory-result.template.json)
- [Post-restore side-effect result template](post-restore-side-effect-result.template.json)
- [External-side-effect raw evidence template](external-side-effect-raw-evidence.template.json)
- [External-side-effect collector descriptor contract V2](external-side-effect-collector-descriptors-v2.json)
- [Backup watermark operation template](backup-watermark-operation.template.json)
- [Raw provider backup inventory template](backup-inventory-raw-evidence.template.json)
- [DR platform full-schema/query projection contract](dr-platform-config-projection-contract-v1.json)
- [DR excluded/manual-scope source-or-restore template](dr-excluded-manual-scope-raw-evidence.template.json)
- [DR excluded/manual-scope comparison template](dr-excluded-manual-scope-comparison.template.json)
- [Proposed representative-data contract](representative-data-contract.proposed.json)
- [Proposed security target inventory](security-target-inventory.proposed.json)
- [Proposed security target classification](security-target-classification.proposed.json)
- [Proposed Data API ACL inventory](data-api-acl-inventory.proposed.json)
- [Proposed hosted-SLO contract](hosted-slo-contract.proposed.json)
- [Proposed DR contract](dr-contract.proposed.json)
- [Proposed integration and credential contract](integration-credential-contract.proposed.json)
- [Proposed command ledger](staging-command-ledger.proposed.json)
- [Immutable COMM gate evidence map](comm-gate-evidence-map-v1.json)
- [Frozen PR11 performance contract](frozen-pr11-performance-contract.json)
- [Migration input contract](migration-input-contract.json)
- [Stage command runtime guard](../../../../../scripts/commercial-hardening/pr12-stage-command-runtime.mjs)
- [Source identity/configuration readiness contract](../../../../../scripts/commercial-hardening/pr12-source-identity-configuration-contract.mjs)
- [Replay/catalog contract](../../../../../scripts/commercial-hardening/pr12-source-replay-catalog-contract.mjs)
- [Clean-replay precondition SQL](../../../../../scripts/commercial-hardening/sql/pr12-source-clean-replay-precondition.sql)
- [Post-replay catalog capture SQL](../../../../../scripts/commercial-hardening/sql/pr12-post-replay-catalog-capture.sql)
- [Migration-history parity SQL](../../../../../scripts/commercial-hardening/sql/pr12-migration-history-parity.sql)
- [Hosted-types parity contract](../../../../../scripts/commercial-hardening/pr12-hosted-types-parity.mjs)
- [Advisor diff contract](../../../../../scripts/commercial-hardening/pr12-advisor-diff.mjs)
- [Representative-fixture contract](../../../../../scripts/commercial-hardening/pr12-representative-fixture-contract.mjs)
- [Representative-fixture adapter](../../../../../scripts/commercial-hardening/pr12-representative-fixture-adapter.mjs)
- [All-role smoke contract](../../../../../scripts/commercial-hardening/pr12-all-role-smoke-contract.mjs)
- [All-role smoke adapter](../../../../../scripts/commercial-hardening/pr12-all-role-smoke-adapter.mjs)
- [Local readiness aggregator](../../../../../scripts/commercial-hardening/pr12-local-readiness-contract.mjs)
- [Evidence JSON Schema](qualification-evidence-contract.schema.json)
- [Evidence manifest template](qualification-evidence-manifest.template.json)
- [Execution and DR runbook](../../../../operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md)

The merged `pr11-performance-entry-gate.yaml` is a historical PR101 entry snapshot and is not rewritten by PR12. The dated 2026-07-11 original specification was read from the protected root worktree at SHA-256 `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`; it is not copied into this branch.

## Evidence retention contract

Every execution uses a new, never-overwritten directory. The manifest must list every artifact with byte count and SHA-256, exact target commit, approval-packet hash, environment identity, tool versions, redacted commands, timestamps, row counts, frozen historical logical/normalized-physical facts, hosted environment physical-structure/schema/data hashes, status, owner/approver, expiry, residual risk, and privacy-scan result.

Raw output containing a secret, credentialed URL, JWT, real email/phone, patient identifier, or local user-home path remains quarantined and must not be committed. Sanitization creates a new artifact; it never edits historical PR11 or Phase A2 evidence.

Phase 1 provisioning evidence uses its narrower phase-local manifest and must pass `verify-pr12-source-project-provisioning-evidence.mjs`. That verifier requires the exact six-file set, rejects links and extra files, recomputes every byte count and SHA-256 plus the manifest sidecar, reconciles action/result/provider status and binding hashes, and requires the secret/privacy scan. It accepts no Phase 2 or full-qualification claim.

The separate `PR12-ACTION-002` Organization identity-capture evidence uses an exact six-file closed bundle and passed `verify-pr12-source-organization-identity-capture-evidence.mjs` for its separately approved one-GET execution at head `6edd6733756dd73e458cf705675895a5666c76e6`. It recorded Organization ID/slug `kbnsntifrawhimhfjrug`, plan `PRO`, one contact/attempt, zero retry, and zero production contact. Action-003 v5 now verifies the sealed manifest and terminal journal plus raw-path-free evidence/journal fingerprints before credential retrieval or remote contact, and treats that projection as the sole Organization identity/plan source. The Action-003 Organization entitlement GET has been removed. This historical PASS does not authorize Action-003, project creation, production contact, credential decryption, or Phase 2+.

Final qualification invokes `scan-pr12-evidence.mjs --manifest <manifest.json>` as `PR12-CMD-020`, the final manifest command. Its versioned JSON result must cover exactly every manifest artifact except the scanner command's own unique stdout/stderr streams and must reconcile each path, byte count, SHA-256, and classification; empty/subset coverage, reused streams, hash drift, or nonempty scanner stderr fails closed. The scanner covers configured detectable patterns, including international and common Japanese domestic phone forms, but does not prove the absence of clinical or patient data. Before that terminal scan, after every other command has ended, the named human reviewer writes a hash-bound conditional sign-off for the exact artifact set; `COMM-OPS-011` remains `NOT_RUN`. The final verifier then runs outside the manifest, without output redirection or evidence creation, and derives `COMM-OPS-011` only in memory after the scan passes and no artifact changes. Passing artifacts must explicitly classify as `PUBLIC_SANITIZED` or `INTERNAL_NO_PII`; a missing, unknown, or `LOCAL_QUARANTINE` classification fails closed.

The historical PR11 logical and normalized physical hashes are frozen facts. A new hosted system identifier or physical layout is not expected to equal the old machine. PR12 records them and uses environment-normalized schema/data comparisons plus source-to-restored parity; it never rewrites the historical values.

## Fail-closed boundary

`UNASSIGNED`, `NOT_CAPTURED`, `NOT_IMPLEMENTED`, and `NOT_RUN` are intentional blockers, not evidence. Six separate bindings/stops govern: source provisioning; source identity and read-only Data API/Auth/GraphQL bootstrap; narrow replay/catalog capture; full source qualification/backup capture; selected-backup restore creation; and restore validation. `PR12-CMD-004A` is the only Stage 2 remote command and captures the source system identifier plus raw platform configuration before a mandatory stop. Stage 3 and later must match that captured identifier. Replay/catalog authority ends after `PR12-CMD-007A` and `PR12-CMD-008A` and cannot authorize representative seed. Stage 4 runs the final watermark mutation `PR12-CMD-017`, then the final family-specific source side-effect inventory `PR12-CMD-016A`, then backup inventory `PR12-CMD-017A`, with no intervening mutation. Stage 5 may collect only provider/Dashboard evidence and must stop before any restore database connection; Stage 6 begins with `PR12-CMD-018` and closes at `PR12-CMD-019F`. Conditional review and `PR12-CMD-020` follow Stage 6; the final verifier is out-of-manifest and produces no evidence.

The verifier hard-rejects the known production ref, requires source != restore, separately hash-binds source and restore credential-provider configurations, and enforces source/restore ref, URL, host, key-fingerprint, and password-handle separation. PostgreSQL system identifiers are captured as `SAME` or `DIFFERENT` observations but do not substitute for target identity. Restore creation derives provider `created_at`, ACTIVE/healthy readiness, quote total, pre-action absence, and region/compute/disk/SSL/network parity from raw provider artifacts; an unavailable provider-operation identifier remains explicit null rather than fabricated. Source and restore also require distinct DR-scope artifacts: empty typed Management API bucket/function responses, a no-replica Dashboard export, pinned full-schema hash-only Auth/Realtime/Storage projections, the six-query database catalog, exact Realtime publication set, and the applicable credential fingerprint binding. Arbitrary synchronized catalog strings, missing query provenance, raw config/credential persistence, or artifact reuse fail closed. External side-effect results cover every required family and must exactly match the disabled/test-only integration contract with zero real, pending, duplicate, or production-identity observations. RTO/RPO PASS requires provider/source-DB/restore-DB/operator UTC provenance, an owner-approved numeric skew no greater than 300 seconds, a pre-confirmation RPO observation lead no greater than five seconds, and a separately measured operator monotonic interval. The Stage 3 runtime/replay inputs, types parity, Advisor diff, representative fixture, and all-role smoke subset are implemented and offline-verified, but their remote execution remains `NOT_RUN / NOT_AUTHORIZED`. The runtime multi-clock and remaining qualification collectors remain `NOT_IMPLEMENTED`, so execution and RTO/RPO qualification remain blocked. All 54 COMM claims, security target derivation, migration/history/types/data parity, canonical and hosted performance, raw restore-family evidence, privacy chronology, phase/remote/mutation scope, and named-owner separation remain fail-closed as specified by the linked contracts.

The v0.2 proposal concretely recommends a new Pro / Tokyo `ap-northeast-1` / Large source project and same-region restored project, synthetic-only fixtures, 50-user hosted SLO, physical backup restore-to-new-project, and an all-disabled/test-only integration boundary. It remains non-executable: no isolated project identity exists, and the CA bundle path/hash, direct connectivity, fixture epoch, approved credential provider, fresh catalog classification, PR11/SLO/full security/API/GraphQL/billing/backup/restore/side-effect/COMM-claim collectors, Phase 2+ owners/providers/budgets, populated Action-002 path fingerprints, Action-003 fresh pricing/two-role DPAPI configuration/expiry, exact scheduled/funded-through timestamps, tool path fingerprints, cleanup funding, maximum clock skew, RTO/RPO authority decision, and final phase bindings are unresolved.

Phase 1 now has a v5 provisioning contract plus the dedicated v1 `PR12-ACTION-002` Organization identity-capture contract, one-shot wrappers/collectors, exclusive action journals, official-list-price evidence contract, claim-bound Windows DPAPI channel, safe provider projections, phase-local evidence manifests, and focused negative tests. Action-002 completed PASS using the Management-token envelope only; it did not read the database-password role and made zero production contact. Action-003 local enablement verifies that sealed evidence/terminal journal, removes the duplicate Organization GET, and enforces canonical `fundedThrough = scheduledExecutionAt + exactly 73 hours`. It does not make Action-003 executable: final head/hashes, populated path fingerprints, fresh official-source bytes/hashes, known extra charges, canonical scheduled/funded-through timestamps, cleanup/recovery values, the complete two-role Action-003 DPAPI configuration/database-password envelope, stable disjoint repository-external journal/evidence-directory identities, timeouts, and final two-step self-approval plus same-Organization and same-user DPAPI residual-risk acceptance remain `NOT_CAPTURED` or `UNASSIGNED`.

The wrappers reject historical and generic secret environment variables before claim. The Action-002 wrapper pins the shared provisioning-contract dependency, requires its lexical/real repository root to equal Git's canonical top-level, and confines journal/evidence trees outside the repository. Its separately approved run retrieved only the Management token after durable claim and never opened the database-password role. Action-003 v5 additionally requires the external Action-002 evidence directory and terminal path, recomputes their immutable fingerprints/hashes locally, and refuses the historical Organization GET route. Action-003 execute would retrieve token and password only after its own durable claim; recovery retrieves token only. Every Action-003 remote contact remains expiry-guarded, with no POST retry, automatic reseal, or cleanup. This enablement cycle performed no credential read/decrypt, Management API contact, project creation, production contact, or Phase 2+ action.

The current Phase 1 tuple is exactly binding v5, credential configuration v2, owner approval v4, official pricing evidence v2, result v5, and provider-safe projection v4. Superseded versioned templates were removed from the working tree and remain recoverable from Git history. The unversioned binding/result/provider-export schema-v1 trio is retained only for full-manifest compatibility and is not reinterpreted as the current Phase 1 tuple. Until a separate promotion adapter exists, the full commercial evidence verifier explicitly rejects Phase 1-local schema versions v2, v3, v4, and v5. Raw provider body persistence remains forbidden, and a Phase 1-local PASS cannot satisfy or imply any COMM gate.

Eight green GitHub jobs qualify the PR change only; they do not replace hosted Data API/GraphQL, performance, Advisor, backup/restore, billing, or COMM evidence. Ready transition, merge, staging execution, production connection, index retirement, and commercial release remain unauthorized.
