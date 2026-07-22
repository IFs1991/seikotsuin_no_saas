# PR12 isolated release qualification evidence

Status: **PREPARATION ONLY / STAGING NOT RUN / COMMERCIAL NO_GO**.

This directory defines the immutable inputs and evidence shape for PR12. It does not contain a staging connection, migration apply, backup, restore, RTO/RPO result, or release approval.

## Authority and records

- [Current implementation SSOT](../../../spec-commercial-hardening-migration-v1.0.md)
- [PR12 implementation specification](../../../spec-commercial-pr12-isolated-release-qualification-v1.0.md)
- [Release qualification SSOT](../../../../releases/commercial-release-qualification-v1.0.md)
- [PR12 preparation gate](pr12-preparation-gate.yaml)
- [Isolated staging entry contract](isolated-staging-entry-contract.yaml)
- [Staging approval packet](staging-execution-approval-packet.yaml)
- [Human owner approval packet](../../../pr12-staging-execution-owner-approval-packet-v0.2-20260719.md)
- [Source-project provisioning binding template](source-project-provisioning-binding.template.json)
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
- [Evidence JSON Schema](qualification-evidence-contract.schema.json)
- [Evidence manifest template](qualification-evidence-manifest.template.json)
- [Execution and DR runbook](../../../../operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md)

The merged `pr11-performance-entry-gate.yaml` is a historical PR101 entry snapshot and is not rewritten by PR12. The dated 2026-07-11 original specification was read from the protected root worktree at SHA-256 `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`; it is not copied into this branch.

## Evidence retention contract

Every execution uses a new, never-overwritten directory. The manifest must list every artifact with byte count and SHA-256, exact target commit, approval-packet hash, environment identity, tool versions, redacted commands, timestamps, row counts, frozen historical logical/normalized-physical facts, hosted environment physical-structure/schema/data hashes, status, owner/approver, expiry, residual risk, and privacy-scan result.

Raw output containing a secret, credentialed URL, JWT, real email/phone, patient identifier, or local user-home path remains quarantined and must not be committed. Sanitization creates a new artifact; it never edits historical PR11 or Phase A2 evidence.

Final qualification invokes `scan-pr12-evidence.mjs --manifest <manifest.json>` as `PR12-CMD-020`, the final manifest command. Its versioned JSON result must cover exactly every manifest artifact except the scanner command's own unique stdout/stderr streams and must reconcile each path, byte count, SHA-256, and classification; empty/subset coverage, reused streams, hash drift, or nonempty scanner stderr fails closed. The scanner covers configured detectable patterns, including international and common Japanese domestic phone forms, but does not prove the absence of clinical or patient data. Before that terminal scan, after every other command has ended, the named human reviewer writes a hash-bound conditional sign-off for the exact artifact set; `COMM-OPS-011` remains `NOT_RUN`. The final verifier then runs outside the manifest, without output redirection or evidence creation, and derives `COMM-OPS-011` only in memory after the scan passes and no artifact changes. Passing artifacts must explicitly classify as `PUBLIC_SANITIZED` or `INTERNAL_NO_PII`; a missing, unknown, or `LOCAL_QUARANTINE` classification fails closed.

The historical PR11 logical and normalized physical hashes are frozen facts. A new hosted system identifier or physical layout is not expected to equal the old machine. PR12 records them and uses environment-normalized schema/data comparisons plus source-to-restored parity; it never rewrites the historical values.

## Fail-closed boundary

`UNASSIGNED`, `NOT_CAPTURED`, `NOT_IMPLEMENTED`, and `NOT_RUN` are intentional blockers, not evidence. Six separate bindings/stops govern: source provisioning; source identity and read-only Data API/Auth/GraphQL bootstrap; narrow replay/catalog capture; full source qualification/backup capture; selected-backup restore creation; and restore validation. `PR12-CMD-004A` is the only Stage 2 remote command and captures the source system identifier plus raw platform configuration before a mandatory stop. Stage 3 and later must match that captured identifier. Replay/catalog authority ends after `PR12-CMD-007A` and `PR12-CMD-008A` and cannot authorize representative seed. Stage 4 runs the final watermark mutation `PR12-CMD-017`, then the final family-specific source side-effect inventory `PR12-CMD-016A`, then backup inventory `PR12-CMD-017A`, with no intervening mutation. Stage 5 may collect only provider/Dashboard evidence and must stop before any restore database connection; Stage 6 begins with `PR12-CMD-018` and closes at `PR12-CMD-019F`. Conditional review and `PR12-CMD-020` follow Stage 6; the final verifier is out-of-manifest and produces no evidence.

The verifier hard-rejects the known production ref, requires source != restore, separately hash-binds source and restore credential-provider configurations, and enforces source/restore ref, URL, host, key-fingerprint, and password-handle separation. PostgreSQL system identifiers are captured as `SAME` or `DIFFERENT` observations but do not substitute for target identity. Restore creation derives provider `created_at`, ACTIVE/healthy readiness, quote total, pre-action absence, and region/compute/disk/SSL/network parity from raw provider artifacts; an unavailable provider-operation identifier remains explicit null rather than fabricated. Source and restore also require distinct DR-scope artifacts: empty typed Management API bucket/function responses, a no-replica Dashboard export, pinned full-schema hash-only Auth/Realtime/Storage projections, the six-query database catalog, exact Realtime publication set, and the applicable credential fingerprint binding. Arbitrary synchronized catalog strings, missing query provenance, raw config/credential persistence, or artifact reuse fail closed. External side-effect results cover every required family and must exactly match the disabled/test-only integration contract with zero real, pending, duplicate, or production-identity observations. RTO/RPO PASS requires provider/source-DB/restore-DB/operator UTC provenance, an owner-approved numeric skew no greater than 300 seconds, a pre-confirmation RPO observation lead no greater than five seconds, and a separately measured operator monotonic interval. The verifier enforces these conditions, but the runtime collectors remain `NOT_IMPLEMENTED`, so execution and RTO/RPO qualification remain blocked. All 54 COMM claims, security target derivation, migration/history/types/data parity, canonical and hosted performance, raw restore-family evidence, privacy chronology, phase/remote/mutation scope, and named-owner separation remain fail-closed as specified by the linked contracts.

The v0.2 proposal concretely recommends a new Pro / Tokyo `ap-northeast-1` / Large source project and same-region restored project, synthetic-only fixtures, 50-user hosted SLO, physical backup restore-to-new-project, and an all-disabled/test-only integration boundary. It remains non-executable: no safe existing staging ref was found, and the target/credential/seed guard, PR11/SLO/data/schema/security/API/GraphQL/billing/Advisor/backup/restore/side-effect/COMM-claim collectors, named owners, secret store, tool evidence, quote/cleanup funding, maximum clock skew, RTO/RPO authority decision, and final phase bindings are unresolved.

Eight green GitHub jobs qualify the PR change only; they do not replace hosted Data API/GraphQL, performance, Advisor, backup/restore, billing, or COMM evidence. Ready transition, merge, staging execution, production connection, index retirement, and commercial release remain unauthorized.
