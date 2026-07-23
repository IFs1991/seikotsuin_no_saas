# PR12 Phase 1 source project provisioning approval preparation v1.0

Status: **LOCAL PREPARATION COMPLETE ONLY / PHASE 1 NOT APPROVED / REMOTE NOT RUN / COMMERCIAL NO_GO**

Date: 2026-07-23 JST

## 1. Purpose and authority

This specification prepares only the approval boundary for creating the isolated PR12 source project. It does not approve or perform that creation.

The protected dated original specification remains the primitive audit baseline. Its verified SHA-256 is `fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5`. The current [commercial-hardening migration SSOT](spec-commercial-hardening-migration-v1.0.md), including later formal additions, remains the implementation authority. Their only textual difference at preparation time is the current SSOT's 16-line PR11 pilot-only performance exception; that exception is not inherited by PR12.

This document is subordinate to:

- [current commercial-hardening migration SSOT](spec-commercial-hardening-migration-v1.0.md);
- [PR12 implementation specification](spec-commercial-pr12-isolated-release-qualification-v1.0.md);
- [owner approval packet](pr12-staging-execution-owner-approval-packet-v0.2-20260719.md);
- [machine approval packet](evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml);
- [PR12 staging/DR runbook](../operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md);
- [Commercial Release Qualification](../releases/commercial-release-qualification-v1.0.md); and
- [change DoD](../quality/change-dod-v1.0.md).

## 2. Frozen facts

This preparation does not reinterpret any frozen result:

- migration head is `20260718011731`;
- PR11 dense 10,000 insert is `549.305 ms > 521.55125 ms`, `FAIL`;
- Phase A2 is `FAIL_STOP / ENVIRONMENT_INVALID`;
- candidate SQL execution and permanent DDL are both zero;
- D1b/D2 are `NOT_RUN`;
- committed steady-state index effect is not proven;
- `public.idx_blocks_resource_id` exists and retirement is not approved;
- the pilot waiver is not inherited;
- staging execution is not run;
- COMM is 0 PASS / 54 NOT_RUN; and
- commercial release remains `NO_GO`.

## 3. Exact Phase 1 action

The only future mutating action eligible for separate approval is:

| Field                               | Bound value                                       |
| ----------------------------------- | ------------------------------------------------- |
| Action ID                           | `PR12-ACTION-003`                                 |
| Provider                            | Supabase Management API                           |
| Method                              | exactly one `POST` attempt                        |
| Endpoint                            | `https://api.supabase.com/v1/projects`            |
| Mutation                            | create one new isolated source project            |
| Fixed name                          | `seikotsuin-pr12-isolated-qualification-20260719` |
| Organization                        | exact ID and slug: `NOT_CAPTURED`                 |
| Required existing organization plan | Pro; plan purchase/change is not included         |
| Region selection                    | `specific` / `ap-northeast-1` (Tokyo)             |
| Desired instance size               | `large`                                           |
| Database connection                 | forbidden                                         |
| Automatic POST retry                | forbidden                                         |
| Provider idempotency key            | no documented key; none is claimed                |

The secret-free approval projection is:

```json
{
  "db_pass": "RUNTIME_SECRET_NOT_IN_EVIDENCE",
  "desired_instance_size": "large",
  "name": "seikotsuin-pr12-isolated-qualification-20260719",
  "organization_slug": "NOT_CAPTURED",
  "region_selection": {
    "code": "ap-northeast-1",
    "type": "specific"
  }
}
```

The final approval binds the canonical SHA-256 of that exact projection. The wire request substitutes only the `db_pass` sentinel with the runtime password. Deprecated or ignored `organization_id`, `plan`, `region`, and `kps_enabled` fields are forbidden. Pro is an organization entitlement and is not a create-project POST field.

Supporting remote reads are part of the same action envelope but are not additional mutations:

1. `GET /v1/organizations/{approved-slug}` to confirm the exact organization identity and existing Pro plan;
2. `GET /v1/projects/available-regions?organization_slug=...&desired_instance_size=large` to confirm Tokyo availability;
3. every page of `GET /v1/organizations/{approved-slug}/projects?offset=...&limit=100&sort=name_asc` before POST to reject the fixed-name duplicate;
4. the same paginated read after POST for bounded readiness/identity observation; and
5. `GET /v1/projects/{created-ref}/billing/addons` to project `selected_addons[].variant.id === "ci_large"`.

No Dashboard session, database endpoint, project API, Auth endpoint, Data API, GraphQL endpoint, Storage endpoint, Realtime endpoint, CLI link, or migration endpoint belongs to Phase 1.

## 4. Current provider contract basis

The local contract was reviewed against current official primary material on 2026-07-23:

- [Management API OpenAPI](https://api.supabase.com/api/v1-json);
- [Management API reference](https://supabase.com/docs/reference/api/getting-started);
- [available regions](https://supabase.com/docs/guides/platform/regions);
- [compute and disk sizes](https://supabase.com/docs/guides/platform/compute-and-disk);
- [compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute);
- [pricing](https://supabase.com/pricing);
- [project deletion](https://supabase.com/docs/guides/platform/delete-project);
- [Data/GraphQL automatic-exposure breaking change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically);
- [pg_graphql default-disabled change](https://supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks); and
- [GraphQL introspection default-disabled change](https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default).

Provider schemas, pricing, and capacity can change. The owner approval must freeze the local contract/wrapper hashes and a fresh Dashboard quote. An unexpected provider field, type, status, content type, oversize body, identity, or tier is a fail-stop; raw bodies and headers are never persisted.

## 5. Initial platform posture boundary

The create-project POST has no Data API, GraphQL, Auth, or integration configuration fields. Therefore Phase 1:

- performs no configuration mutation after creation;
- treats all expected initial posture as owner expectation only, not an observed fact;
- makes no PASS claim for Data API, GraphQL, Auth, RLS, grants, or integrations; and
- requires a separate Phase 2 approval and read-only observation.

If the post-creation defaults differ from the expected posture, the action stops with the billable project preserved. Fixing the setting, linking, connecting, replaying, seeding, or deleting requires separate approval.

## 6. Offline approval guard

[The contract module](../../scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs) validates all of the following before credential value access, transport construction, or network contact:

- schema, Phase 1-only authorization, action ID, endpoint, and one-POST limit;
- exact Node 24 with no Node runtime flags, plus a fixed 300-second maximum provider/local `created_at` clock-skew tolerance;
- exact clean Git HEAD and base binding;
- governance packet, contract, wrapper, credential configuration, quote, and approval evidence SHA-256 values;
- canonical secret-free payload projection and SHA-256;
- canonical UTC owner-attestation timestamps, an unexpired window, and explicit action/head/payload/material bindings;
- exact target organization allow-binding;
- production organization ID/slug denylist and production project-ref denylist;
- current Pro entitlement expectation, the literal `seikotsuin-pr12-isolated-qualification-20260719` name, Tokyo, and Large;
- the frozen production ref `qnanuoqveidwvacvbhqp` in the denylist;
- canonical lowercase stable Phase 1 owner IDs and declared/enforced separation;
- the fixed `$0.1517` Large hourly input, `$10.9224` 72-hour compute maximum, `$50` ceiling, quote freshness, funding, and cleanup responsibility;
- distinct owner-controlled action-journal and evidence-parent path fingerprints; the wrapper also requires distinct resolved directory identities;
- owner-approved credential provider, fine-grained token authority, and two opaque secret-store reference handles whose non-network scheme/host/path are present and whose userinfo, query, fragment, control characters, and backslashes are absent; and
- absence of generic/cross-target Supabase or database credential names and unbound proxy, TLS, CA, Node debug, or Node option controls.

`NOT_CAPTURED`, `NOT_IMPLEMENTED`, `NOT_RUN`, `UNASSIGNED`, wrong hash/head, dirty worktree, expired approval, or a prior claim all stop locally.

## 7. Credential contract

[The Phase 1 credential template](evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration.template.json) is separate from the post-creation source credential contract. It requires only:

- `PR12_SUPABASE_ACCESS_TOKEN` as a Supabase fine-grained access token whose endpoint OAuth requirements are `projects:read`, `projects:write`, and `organizations:read`, and whose exact approved fine-grained permissions are `organization_admin_read`, `organization_projects_read`, `organization_projects_create`, and `infra_add_ons_read`; and
- `PR12_SOURCE_DB_PASSWORD`, generated and stored by the owner with a minimum length of 32 characters.

Both values are injected into one process from an owner-approved provider after the action claim. The credential owner must attest the exact token type and permissions before the provisioning approval is signed; the wrapper hash-binds that attestation but does not introspect the remote token. Opaque handles and handle fingerprints are approval data, never secret-value hashes. A handle must be an owner-approved non-network `scheme://host/path` reference with no userinfo, query, fragment, control character, or backslash; `http`, `https`, `file`, `data`, `javascript`, `ws`, and `wss` schemes are rejected. `.env`, CLI login state, generic or prefixed ambient Supabase/database values, cross-target fallback, unbound proxy/TLS/CA/debug/`NODE_OPTIONS` controls, argv, URL query, stdout, stderr, log, evidence, and commit persistence are forbidden. Explicit transport/debug denials include `NODE_DEBUG_NATIVE`, `NODE_USE_SYSTEM_CA`, `OPENSSL_CONF`, `OPENSSL_MODULES`, and `SSLKEYLOGFILE` in addition to the existing proxy, TLS, CA, and Node-option families.

The wrapper uses native HTTPS fetch and does not spawn a credential-inheriting Supabase child process. Its Git subprocess receives an explicit non-secret environment allowlist.

## 8. At-most-one POST and recovery

Supabase's documented create endpoint exposes no idempotency key. This preparation therefore does not claim provider-guaranteed exactly-once creation. It implements the strongest fail-closed local contract available:

1. validate offline approval;
2. create an exclusive action claim keyed by action ID, binding-material hash, and payload hash in the owner-bound stable journal directory;
3. read credentials only after the claim;
4. enumerate every project page, require bounded pagination arithmetic and unique refs across pages, and stop if the fixed name already exists;
5. re-read each approval input into one stable file snapshot, re-hash the same bytes that were parsed, and revalidate file identity, head, clean worktree, governance/implementation hashes, approval expiry, quote validity, ambient-credential absence, and payload immediately before POST;
6. durably flush and read back `POST_INTENT_DURABLE` before sending;
7. send at most one POST; and
8. never automatically retry after HTTP error, timeout, reset, malformed/changed response, or process interruption.

The stable journal blocks reuse even when POST was not sent. The durable intent records the completed preflight remote-contact count; recovery conservatively accounts for the possibly dispatched POST before adding reconciliation contacts. Once `POST_INTENT_DURABLE` exists, that action identity can never issue another POST. Every Management API contact rechecks the canonical approval expiry synchronously before `fetch`; the create POST additionally requires both approval and Dashboard quote validity to extend beyond the bound request timeout. Expiry after a POST prevents further readiness/reconciliation contact and becomes owner-decision evidence without a retry. A timeout or lost response is `UNKNOWN_REMOTE_OUTCOME`. The same run performs at most one fail-closed, read-only all-pages organization-project-list reconciliation while approval remains current and records zero, one, multiple, identity-mismatched, or reconciliation-failed state without another POST. After process interruption, the separate `--reconcile-dispatched-action PR12-ACTION-003` mode first completes a missing terminal record from the same-byte snapshot of an already sealed and verified bundle; otherwise, while the hash-bound approval remains current, it can perform only read-only all-pages reconciliation and seal recovery evidence. It has no POST path. A new POST is forbidden; any new creation attempt requires a new owner decision and newly bound action identity. The local claim cannot prevent a different external operator from creating a project concurrently, so the exact organization and operator remain owner-controlled residual risks.

## 9. Evidence contract

The Phase 1 runtime contract uses the explicitly versioned [binding v2](evidence/commercial-hardening/pr12/source-project-provisioning-binding-v2.template.json), [result v2](evidence/commercial-hardening/pr12/source-project-provisioning-result-v2.template.json), and [provider safe projection v2](evidence/commercial-hardening/pr12/source-project-provider-safe-projection-v2.template.json). The unversioned schema-v1 files remain legacy inputs to the existing full commercial-manifest verifier. Promotion from the sealed v2 bundle into that verifier is `NOT_IMPLEMENTED`; a Phase 1-local PASS never implies a COMM PASS. Raw provider bodies must not be retained or reconstructed to bridge the schemas. A separately reviewed, hash-bound v2 promotion verifier is required before any Phase 1 evidence may support commercial qualification.

The wrapper creates a new evidence directory and persists only:

- ordered action-state events;
- secret-free request and provider response projections;
- response-body SHA-256 digests, never bodies or headers;
- organization, region, page coverage, duplicate count, project ref, provider `created_at`, status, and nested Large variant observation;
- operator, approver, timestamps, retry count zero, quote/funding/expiry, project deadline, and cleanup boundary;
- explicit abort, duplicate, unknown-outcome, reconciled, and partial-failure states;
- a privacy/secret scan result; and
- a byte-count/SHA-256 manifest plus `manifest.sha256` sidecar.

Manifest classification is exact by path: action events and the privacy scan are `INTERNAL_NO_PII`; the provider projection and provisioning result are `INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS` because named stable owner/operator identifiers may be personal data. No classification permits patient data, secret values, raw provider bodies, or raw headers.

Before a file is written, the object is traversed as raw keys/string values and compared against every runtime secret value that was successfully read, then its canonical JSON is scanned for credential-bearing fields and patterns, including Supabase `sbp_` Management PATs. This prevents JSON escaping from hiding an exact secret match. A normal PASS, duplicate abort, or contacted/pre-intent execution must record both runtime values as scanned; read-only recovery records its one Management token; only a genuinely pre-contact abort may record zero or one available value. Provider response bodies are content-length checked, streamed with a one-MiB decoded-byte cap, schema-validated in memory against the documented nested region/add-on shapes, and discarded. Provider RFC3339 timestamps, including the documented no-millisecond form, are calendar-validated and normalized to canonical UTC before evidence. Unknown provider fields stop without persisting the body. Evidence is written once to a retained `.partial` directory, flushed, semantically verified, and atomically renamed to its final directory. Only then may the create-once terminal journal refer to the manifest SHA-256. A post-rename verification failure moves the unverified bundle back to its exact partial quarantine path before that path may be written to the terminal journal; if the retained path cannot be proven, no false locator terminal is written. Seal failure is owner-decision evidence and is never retried against the same directory. The read-only `verify-pr12-source-project-provisioning-evidence.mjs` verifier accepts only the exact six-file phase-local bundle, reads every file into one stable byte snapshot with fatal UTF-8 decoding, requires every JSON file to equal its canonical serialization plus one newline, scans both raw text and parsed values, and rejects duplicate-key or alternate-serialization evidence even when its manifest hashes are recomputed. It rechecks the complete file set and identities before return, verifies the manifest sidecar, exact schemas, outcome-specific runtime-producible state sequences, preflight-page remote-contact counts, action/provider/privacy chronology, reconciliation state/count/identity semantics, project/tier, quote/funding/expiry/cleanup, journal hashes, and cross-artifact identities/status, and fails on privacy or secret-bearing evidence.

## 10. Side effects, billing, and cleanup

If eventually approved and successful, the exact expected side effect is one new billable Supabase project in the approved non-production organization, with its project ref and compute lifecycle created in Tokyo at Large. Creation may also cause provider-internal billing, compute, storage, backup, and control-plane records normally associated with a project. No application schema, migration history, seed, Auth user, API call, backup/restore drill, or integration side effect is authorized.

Current public list-price inputs are:

- Large compute: `$0.1517` per project-hour;
- maximum source authorization window after creation: 72 hours;
- arithmetic maximum before credits/tax: `72 × $0.1517 = $10.9224`; and
- proposed overall ceiling: `$50`.

Those inputs are not an actual quote. Existing Pro status, plan incremental cost, organization compute-credit use, tax/other charges, the actual Dashboard quote, approved funding amount/source, and `fundedThrough` are all `NOT_CAPTURED`. The action remains blocked until the hash-bound quote is observed no later than approval, remains valid beyond the entire bound POST request timeout at dispatch, and the approved funding covers the quote and at least 72 hours beyond approval expiry.

The project deadline is exactly `min(provider created_at + 72h, fundedThrough)`. The deletion-approval request deadline must remain in the future, be no later than 72 hours from every validation immediately preceding execution, and precede `fundedThrough`; sealed PASS evidence also requires it to be no later than the actual project deadline. Paid projects cannot be treated as pausable. Automatic deletion is forbidden. Deletion is permanent and requires separate approval. The cleanup owner, deletion-approval requester/deadline, billing escalation owner, and funded-extension owner must be named before provisioning.

## 11. Required owner decisions

The following must remain unresolved rather than inferred:

- final PR head SHA and the final governance/contract/wrapper/config/evidence hashes;
- target organization ID and slug;
- production organization ID and slug denylist;
- confirmation of the existing Pro entitlement and fixed project name;
- actual Dashboard quote, line items, credit, tax/other charges, observed/valid timestamps;
- approved funding amount/source, ceiling, and `fundedThrough`;
- cleanup, deletion-request, billing escalation, funded-extension, and recovery owners;
- commercial approver, provisioning operator/Supabase platform owner, and evidence custodian;
- fine-grained Management token type/permissions, secret provider/configuration ID, and both opaque handles/fingerprints;
- stable journal and evidence-parent directory fingerprints;
- request timeout, readiness observation limit, polling interval, and acceptance of the fixed 300-second provider/local timestamp skew bound; and
- approval timestamp and expiry.

Later-phase owners may remain `UNASSIGNED`; they do not become Phase 1 authority.

## 12. Exact future command boundary

Only after all blockers are filled and a separate owner approval record matches the final hashes may the operator use:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs `
  --execute-authorized-action PR12-ACTION-003 `
  --binding <approved-binding.json> `
  --credential-config <approved-credential-config.json> `
  --approval-evidence <owner-approval.json> `
  --quote-evidence <dashboard-quote.json> `
  --journal-directory <owner-controlled-absolute-directory> `
  --evidence-parent <owner-controlled-absolute-directory>
```

The command is documented, not approved by this specification. It was not executed during preparation.

After a future run, the evidence custodian must execute the phase-local verifier against the new evidence directory without passing any secret value as an argument:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs `
  --evidence-directory <owner-controlled-evidence-directory>
```

## 13. DoD and release impact

This change addresses change DoD evidence/verification/rollback-safety expectations by adding a phase-local contract, focused negative tests, immutable state journal, safe evidence projection, owner decision list, and explicit no-delete recovery boundary. It changes no migration, rollback, generated type, seed, package file, RLS, ACL, trigger, schema, production state, or COMM result.

Passing local or CI checks means only that approval preparation is internally consistent. Phase 1 remains unauthorized until a separate explicit owner decision. Phase 2 and later, staging connection, migration replay, database access, backup/restore, cleanup/deletion, Ready, merge, production, index retirement, and commercial release remain unauthorized.
