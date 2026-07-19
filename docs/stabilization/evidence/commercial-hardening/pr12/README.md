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
- [Machine-readable execution binding template](staging-execution-binding.template.json)
- [Frozen PR11 performance contract](frozen-pr11-performance-contract.json)
- [Migration input contract](migration-input-contract.json)
- [Evidence JSON Schema](qualification-evidence-contract.schema.json)
- [Evidence manifest template](qualification-evidence-manifest.template.json)
- [Execution and DR runbook](../../../../operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md)

The merged `pr11-performance-entry-gate.yaml` is a historical PR101 entry snapshot and is not rewritten by PR12. The dated 2026-07-11 original specification was read from the protected root worktree at SHA-256 `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`; it is not copied into this branch.

## Evidence retention contract

Every execution uses a new, never-overwritten directory. The manifest must list every artifact with byte count and SHA-256, exact target commit, approval-packet hash, environment identity, tool versions, redacted commands, timestamps, row counts, logical/physical/schema/data hashes, status, owner/approver, expiry, residual risk, and privacy-scan result.

Raw output containing a secret, credentialed URL, JWT, real email/phone, patient identifier, or local user-home path remains quarantined and must not be committed. Sanitization creates a new artifact; it never edits historical PR11 or Phase A2 evidence.

The machine scanner covers configured detectable patterns, including international and common Japanese domestic phone forms; it does not prove the absence of clinical or patient data. A named human reviewer, review timestamp, PASS verdict, and hashed review evidence are independently required before an execution manifest can pass. Passing artifacts must explicitly classify as `PUBLIC_SANITIZED` or `INTERNAL_NO_PII`; a missing, unknown, or `LOCAL_QUARANTINE` classification fails closed.

The historical PR11 logical and normalized physical hashes are frozen facts. A new hosted system identifier or physical layout is not expected to equal the old machine. PR12 records them and uses environment-normalized schema/data comparisons plus source-to-restored parity; it never rewrites the historical values.

## Fail-closed boundary

`UNASSIGNED`, `NOT_CAPTURED`, and `NOT_RUN` are intentional blockers. They are not evidence. The approval packet and machine-readable binding must be completed, hash-pinned, unexpired, and explicitly approved before any isolated staging command is run. The verifier requires the binding target to equal its current Git HEAD and compares environment, matrix, performance/SLO, representative-data, command-ledger, DR, integration, credential-channel, owner, tool-version, and expiry inputs. The hash-bound Data API and GraphQL matrices include their enabled/version/schema/grant/default-privilege/introspection configuration, not only request rows. Credential policy is restricted to process-environment injection from an owner-approved server secret store into an ephemeral server subprocess; browser, command line, URL, client response, logs, source control, and evidence exposure are all forbidden. Node must be the verifier's actual Node 24 runtime, while Node, Supabase CLI `2.109.0`, and `psql` must each have an approved command ID with hash-verified version stdout and empty stderr. Approval must precede every manifest and command timestamp. A head, project, region, tier, data, workload, threshold, API setting, integration, credential channel, CLI, backup method, owner, contract hash, or expiry change invalidates approval.

Eight green GitHub jobs qualify the PR change only; they do not replace hosted Data API/GraphQL, performance, Advisor, backup/restore, billing, or COMM evidence. Ready transition, merge, staging execution, production connection, index retirement, and commercial release remain unauthorized.
