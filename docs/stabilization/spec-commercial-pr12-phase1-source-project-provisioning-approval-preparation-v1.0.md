# PR12 Phase 1 source project provisioning approval preparation v1.0

Status: **ACTION-002 PASS / ACTION-003 LOCAL ENABLEMENT IMPLEMENTED / ACTION-003 NOT APPROVED OR RUN / STAGING NOT RUN / COMMERCIAL NO_GO**

Date: 2026-07-23 JST

Revision: 2026-07-24 JST — owner-authorized local preparation for the sole-operator exception, official-pricing-evidence substitution, Windows DPAPI credential channel, and a USD 50 / 72-hour owner-governance ceiling. This revision is not approval of `PR12-ACTION-003`.

Revision: 2026-07-25 JST — owner-authorized local preparation for a same-Organization exception fixed to target slug `kbnsntifrawhimhfjrug` and production ref `qnanuoqveidwvacvbhqp`. Only production-ref recognition during mandatory organization-wide duplicate enumeration is permitted; production-project-specific Management API, data-plane, database, and credential contact remains forbidden. This revision is not approval of `PR12-ACTION-003`.

Revision: 2026-07-25 JST — owner-authorized local implementation of the dedicated, read-only `PR12-ACTION-002` Organization identity capture contract. The implementation permits only one future `GET https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug`, uses DPAPI token-only retrieval, and has no redirect, retry, query, project route, production contact, database-password, recovery-GET, or project-creation path. This revision does not authorize that GET, credential bootstrap execution, or `PR12-ACTION-003`.

Revision: 2026-07-26 JST — the separately approved `PR12-ACTION-002` completed `PASS` at head `6edd6733756dd73e458cf705675895a5666c76e6` with one GET attempt, zero retry, and zero production contact, capturing Organization ID/slug `kbnsntifrawhimhfjrug` and plan `PRO`. Action-003 local enablement now verifies the sealed manifest and terminal journal, removes the duplicate Organization entitlement GET, and enforces exact canonical `fundedThrough = scheduledExecutionAt + 73 hours`. This revision does not authorize `PR12-ACTION-003`, credential retrieval/decryption, project creation, production contact, cleanup/deletion, or Phase 2+.

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
| Organization                        | exact ID and slug: `kbnsntifrawhimhfjrug`         |
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
  "organization_slug": "kbnsntifrawhimhfjrug",
  "region_selection": {
    "code": "ap-northeast-1",
    "type": "specific"
  }
}
```

The final approval binds the canonical SHA-256 of that exact projection. The wire request substitutes only the `db_pass` sentinel with the runtime password. Deprecated or ignored `organization_id`, `plan`, `region`, and `kps_enabled` fields are forbidden. Pro is an organization entitlement and is not a create-project POST field.

Supporting remote reads are part of the same action envelope but are not additional mutations:

1. `GET /v1/projects/available-regions?organization_slug=...&desired_instance_size=large` to confirm Tokyo availability;
2. every page of `GET /v1/organizations/{approved-slug}/projects?offset=...&limit=100&sort=name_asc` before POST to reject the fixed-name duplicate;
3. the same paginated read after POST for bounded readiness/identity observation; and
4. `GET /v1/projects/{created-ref}/billing/addons` to project `selected_addons[].variant.id === "ci_large"`.

The Organization identity and Pro-plan source is exclusively the hash-bound, locally reverified `PR12-ACTION-002` sealed evidence and terminal journal. Action-003 does not repeat `GET /v1/organizations/{approved-slug}`; the outbound allowlist rejects that route for Action-003.

No Dashboard session, database endpoint, project API, Auth endpoint, Data API, GraphQL endpoint, Storage endpoint, Realtime endpoint, CLI link, or migration endpoint belongs to Phase 1.

### 3.1 Dedicated Organization identity capture prerequisite

`PR12-ACTION-002` is reserved for a narrower, non-mutating prerequisite to the provisioning decision:

| Field                    | Bound value                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Action ID                | `PR12-ACTION-002`                                                                      |
| Method                   | exactly one `GET` attempt                                                              |
| Endpoint                 | `https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug`                       |
| Query / body / redirect  | forbidden                                                                              |
| Automatic retry/recovery | forbidden                                                                              |
| Credential retrieval     | Management API token only through owner-approved Windows DPAPI; DB password denied     |
| Expected identity        | name `IFs1991's Org`, slug `kbnsntifrawhimhfjrug`, plan `pro`                          |
| Production contact       | zero; project enumeration and every project-specific path are forbidden                |
| Side effect              | one provider access-log/read observation plus local claim/journal/evidence files       |
| Current state            | separately approved execution completed `PASS`; one GET, zero retry/production contact |

The binding fixes the final Git SHA, governance hash, six direct implementation/dependency hashes (including the shared provisioning contract), credential-configuration hash, exact request-projection hash, directory identities, sole-operator principal, cooling-off reconfirmation, and a maximum 30-minute approval window. The wrapper requires its lexical and resolved location to equal the canonical Git top-level, keeps journal/evidence trees outside that repository, and accepts only Node 24 with empty `process.execArgv`, checked before claim and again immediately before fetch. It requires an exclusive `CLAIMED_GET_NOT_SENT` record before token retrieval and a flushed/read-back `GET_INTENT_DURABLE` record before the one fetch. Either record consumes the action identity; there is no retry or remote reconciliation mode. An expired approval, changed input, dirty head, ambient credential or transport override, duplicate claim, DPAPI resource drift, unexpected response field/type/identity/plan, non-JSON or oversized body, duplicate JSON member, raw or parsed production identifier, or evidence-secret hit stops fail-closed. The outbound guard compares the raw URL byte-for-byte with the fixed endpoint before parsing, so normalized aliases such as explicit port, userinfo, or host-case variations are rejected.

Only these provider response fields are accepted in memory: `id`, `name`, `plan`, `opt_in_tags`, and `allowed_release_channels`. A bounded strict parser rejects duplicate members at every JSON object depth and scans decoded raw text for the production ref/origin before `JSON.parse`; parsed-value production denial remains a second check. Evidence retains only `{ organizationId, organizationName, organizationSlug, plan }` plus the raw response-body SHA-256, status, timestamps, counters, runtime Node version/zero exec-argument count, and production-zero assertions. Raw response bodies, headers, the bearer token, the production ref/origin, and the database password are never evidence.

The six-file sealed evidence set is `action-events.json`, `organization-identity-capture-result.json`, `privacy-scan.json`, `provider-export.safe.json`, `manifest.json`, and `manifest.sha256`. The completed PASS binds head `6edd6733756dd73e458cf705675895a5666c76e6`, request SHA `95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e`, binding-material SHA `56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c`, manifest SHA `66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582`, and terminal SHA `3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e`. Action-003 v5 independently verifies the terminal-to-manifest linkage, sealed bytes, chronology, exact Organization projection, one-attempt/zero-retry counts, zero production contact, and raw-path-free directory snapshots before its own credential retrieval or remote contact.

`PR12-ACTION-003` is not retrospectively approved by the completed prerequisite. Its v5 local enablement consumes Action-002 as the sole Organization identity/plan source, removes the duplicate entitlement GET, and implements exact canonical `fundedThrough = scheduledExecutionAt + 73 hours` validation across binding, owner approval, result, and evidence verification. Action-003 remains non-approvable until repository-external evidence/journal inputs and fingerprints, exact schedule/funding timestamps, all other final hashes/credential/cleanup inputs, and a new explicit Action-003 approval are populated.

## 4. Current provider contract basis

The local contract was reviewed against current official primary material on 2026-07-23 and the official changelog was rechecked on 2026-07-24 without authentication:

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

Provider schemas, pricing, and capacity can change. The pre-create Dashboard UI does not expose a Large quote in the observed flow; it offers Micro/Small/Medium and states that larger sizes are available after creation. The owner therefore authorized replacing the impossible pre-create Large Dashboard quote with fresh, hash-bound byte captures of the three official public pricing sources above. This evidence is explicitly a list-price basis, not an organization-specific quote and not a provider-enforced spend cap. Every source capture must be no more than one hour old at approval, remains locally fresh for 24 hours, and must outlive the approval window and POST timeout. An unexpected provider field, type, status, content type, oversize body, identity, tier, known charge above the remaining authorization headroom, or stale/changed official source is a fail-stop; raw provider bodies and headers are never persisted.

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
- exact clean Git HEAD and base binding, plus proof that the executing wrapper, contract, credential-channel, and evidence-verifier files are the canonical paths inside that same Git worktree rather than a copied sibling implementation tree;
- governance packet, contract, wrapper, Windows DPAPI credential configuration, official pricing evidence, and approval evidence SHA-256 values;
- canonical secret-free payload projection and SHA-256;
- canonical UTC owner-attestation timestamps, an unexpired window, and explicit action/head/payload/material bindings;
- exact shared target/production organization allow-binding, including target name `IFs1991's Org`, slug `kbnsntifrawhimhfjrug`, and one still-unresolved organization ID that must be identical on both sides;
- the fixed production name `seikotsuin-management`, ref `qnanuoqveidwvacvbhqp`, origin `https://qnanuoqveidwvacvbhqp.supabase.co`, and explicit same-Organization exception;
- a central outbound-request guard that allows only the exact HTTPS Management API host, method, path, and query shapes needed for Tokyo/Large availability, all-page organization duplicate enumeration, one create POST, and the accepted newly-created ref's compute add-on observation; the Organization entitlement route is explicitly absent and rejected;
- rejection before remote contact of the production ref in a path/query (including encoded forms), the production origin/host, every unlisted route, extra/duplicate query, wrong method, redirect, port, userinfo, or unbound project-specific ref;
- current Pro entitlement expectation, the literal `seikotsuin-pr12-isolated-qualification-20260719` name, Tokyo, and Large;
- the frozen production ref `qnanuoqveidwvacvbhqp` in the denylist;
- the canonical lowercase stable sole-operator principal ID, the display name `FUTOSHI IWASAWA`, transparent same-person role consolidation, no independent-human-review claim, explicit self-approval risk acceptance, a minimum five-minute approval/reconfirmation cooling-off period, and a maximum 30-minute approval window;
- integer-scaled official pricing arithmetic: `1517 × 72 = 109224` USD×10^-4 (`$10.9224`), zero credit reliance, `$39.0776` unallocated headroom, exactly `$50.0000` approved funding, acknowledgment that the ceiling is not provider-enforced, and cleanup responsibility;
- distinct owner-controlled action-journal and evidence-parent lexical fingerprints and resolved directory identities, with no equality or ancestor/descendant overlap;
- a hash-bound Windows DPAPI CurrentUser provider whose lexical root fingerprint, resolved-root fingerprint, filesystem device/inode identity, exact PowerShell/broker/bootstrap/envelope hashes, owner SID and machine fingerprints, strict owner-plus-SYSTEM ACL policy, and two fixed opaque handles all match; every provider-root, journal, and evidence path component must be a normal directory rather than a junction, symlink, or other reparse point, and the resolved provider tree must be disjoint from the repository, Windows temporary trees, journal tree, and evidence tree; and
- absence of generic/cross-target Supabase or database credential names and unbound proxy, TLS, CA, Node debug, or Node option controls.

`NOT_CAPTURED`, `NOT_IMPLEMENTED`, `NOT_RUN`, `UNASSIGNED`, wrong hash/head, dirty worktree, an executing implementation path or file-identity mismatch, expired approval, or a prior claim all stop locally.

The [Action-003 operational preflight](../../scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs) and [approval packet builder](../../scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs) are local-only. The preflight stable-reads a canonical owner-private descriptor and [initial approval receipt v1](evidence/commercial-hardening/pr12/source-project-provisioning-initial-approval-receipt-v1.template.json), derives `approvedAt`, the initial receipt SHA-256, and all eight risk/boundary acceptances—including explicit unknown-charge acknowledgment—from that receipt rather than independent descriptor fields, remeasures the clean repository HEAD and implementation hashes, verifies the sealed Action-002 terminal linkage, external directory identities and protected owner-plus-SYSTEM ACLs, both encrypted DPAPI envelope resources without decrypting them, and all three raw official-pricing artifacts, then revalidates those same snapshots and ACLs before create-new output. ACL capture and protection pass every owner-controlled path as one opaque `-LiteralPath` value to the fixed tracked PowerShell helper through `pwsh -File`; no external path is appended to `pwsh -Command` text. The initial receipt authorizes only local packet preparation; database-password bootstrap, project creation, production contact, cleanup/deletion, and Phase 2+ remain false. The builder derives `scheduledExecutionAt = approvedAt + 15 minutes`, `fundedThrough = scheduledExecutionAt + 73 hours`, the deletion-request deadline at `scheduledExecutionAt + 70 hours`, and `expiresAt = approvedAt + 30 minutes`; it fixes the request timeout at 30,000 ms, readiness maximum at 900 seconds, and readiness poll interval at 15 seconds. It computes the payload, binding-material, credential-configuration, pricing, owner-approval, and final-binding hashes in dependency order, then creates exactly the v5 binding, v2 credential configuration, and v4 owner approval candidate as canonical JSON in a new owner-private directory. Those three records remain `PENDING_FINAL_APPROVAL`, bind the initial approval receipt SHA-256, and explicitly keep `sourceProjectProvisioningAuthorized: false`; they cannot pass the executable validator by themselves. A separate [final approval receipt v1](evidence/commercial-hardening/pr12/source-project-provisioning-final-approval-receipt-v1.template.json) must be captured after the candidate hashes exist, at least five minutes after the initial approval and no later than the scheduled time. It binds the exact candidate binding, binding material, payload, credential configuration, pricing evidence, owner approval, initial receipt, risks, expiry, and production/Phase-2/cleanup deny values. Neither component decrypts credentials or implements transport. The writer uses create-new, flush, stable canonical readback, exact file-set and post-ACL verification, rejects repository and temporary output trees, never overwrites an existing directory or file, and keeps its raw-path-bearing credential artifact outside Git. The initial and final receipts are stored in separate one-file sibling directories outside the exact three-file candidate directory.

## 7. Credential contract

[The Phase 1 credential v2 template](evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration-v2.template.json) replaces environment injection with `WINDOWS_DPAPI_CURRENT_USER_V1`. It binds these fixed handles:

- `windows-dpapi-cu://pr12-source-project/management-access-token/v1` for the fine-grained Supabase Management token with endpoint scopes `projects:read`, `projects:write`, and `organizations:read`, and permissions `organization_admin_read`, `organization_projects_read`, `organization_projects_create`, and `infra_add_ons_read`; and
- `windows-dpapi-cu://pr12-source-project/database-password/v1` for a 32–256 byte database password.

Populated DPAPI envelopes live in one owner-controlled Windows directory outside the repository and temporary directories. The configuration binds the exact CurrentUser SID hash, machine-name hash, provider-root lexical and resolved path SHA-256 values, filesystem device/inode identity, `pwsh.exe` path/version/SHA-256, broker/bootstrap SHA-256, role-separated entropy context, envelope filenames/SHA-256 values, protected ACL, and no-reparse/no-overwrite policy. Bootstrap, Node channel, broker, and wrapper reject a reparse point in any provider-root, journal, or evidence path component. They re-resolve the relevant paths and reject provider-root identity drift or equality/containment with the resolved repository, Windows temporary, journal, or evidence trees before claim, decrypt, or remote contact. CurrentUser protects data at rest but does not isolate it from malware or privileged code running as the same account; JavaScript and .NET strings cannot be guaranteed to be zeroized. These residual risks require final owner acceptance through `sameUserDpapiCredentialExposureRiskAccepted: true` in the v5 binding candidate, v4 owner approval candidate, and separate final approval receipt.

Credential bootstrap is a separate local sensitive action governed by the [bootstrap approval template](evidence/commercial-hardening/pr12/source-project-dpapi-bootstrap-approval-v1.template.json). The template fixes `authorizedRoles` to the exact one-element set `["DATABASE_PASSWORD"]`; it cannot reauthorize the Management role. The Management-token envelope was bootstrapped and used only for the separately approved Action-002 token role and is reused without read, decryption, overwrite, or renewed bootstrap authority. Action-003 still requires its separately populated, hash-bound two-role configuration and new database-password envelope; this enablement cycle did not read, decrypt, create, or overwrite either credential. The unchanged bootstrap script preserves the existing Management envelope's bound bootstrap provenance and, after a separate short-lived database-password-only approval, uses `CreateNew`, hidden input, DPAPI CurrentUser, role-separated entropy, owner-plus-SYSTEM ACLs, flush/readback, and mutable-buffer clearing; it never overwrites an envelope.

The Node wrapper validates approval and creates/readbacks the durable claim before invoking the exact hash-bound broker once. It sends bounded canonical JSON over captured stdin. That claim-bound request includes the approved bootstrap-script SHA-256, provider resolved-root SHA-256, and journal/evidence lexical path fingerprints; the broker requires the envelope bootstrap provenance to equal the bound current bootstrap hash. The broker independently validates the claim, expiry, hashes, SID/machine, root/envelope identities, resolved path boundaries, and ACLs, then returns a bounded binary frame only over captured stdout. The Node parent never relays or persists that frame or broker stderr and clears mutable buffers. Execute mode asks for both values; recovery asks for the Management token only and never opens the password envelope. Broker failure consumes the action claim and permits no automatic retry or remote contact.

`.env`, CLI login state, `PR12_SUPABASE_ACCESS_TOKEN`, `PR12_SOURCE_DB_PASSWORD`, every generic or cross-target Supabase/database variable, inherited environment fallback, unbound proxy/TLS/CA/debug/`NODE_OPTIONS` controls, argv, URL, parent stdout/stderr relay, log, evidence, and commit persistence are forbidden. The wrapper uses native HTTPS fetch; Git and broker subprocesses receive explicit non-secret environment allowlists.

## 8. At-most-one POST and recovery

Supabase's documented create endpoint exposes no idempotency key. This preparation therefore does not claim provider-guaranteed exactly-once creation. It implements the strongest fail-closed local contract available:

1. validate offline approval;
2. prove the executing wrapper/contract/credential-channel/evidence-verifier paths and stable file identities belong to the approved clean Git worktree, then create an exclusive action claim keyed by action ID, binding-material hash, payload hash, and final-approval-receipt hash in the owner-bound stable journal directory;
3. read back the claim, revalidate all approval/pricing/DPAPI files and identities, then invoke the claim-bound broker exactly once; broker failure consumes the claim and sends no remote request;
4. retrieve both credentials only through the captured binary broker channel after the claim;
5. enumerate every project page, require bounded pagination arithmetic, unique refs, and exactly one recognized production ref across all pages; reduce that production row in memory to `{ projectRef, protectedProductionProject: true }`, persist no production name/region/status/database metadata or raw body, and stop if the fixed source name already exists;
6. re-read the candidate binding, credential configuration, owner approval, initial approval receipt, final approval receipt, pricing evidence, Action-002 terminal, and official source artifacts into stable file snapshots, re-hash the same bytes that were parsed, and revalidate exact candidate/receipt directory topology, owner-plus-SYSTEM ACLs, file and resolved-path identity, head, clean worktree, governance/implementation hashes, approval expiry, pricing freshness, DPAPI resources, ambient-credential absence, and payload immediately before POST and before every subsequent Management API dispatch;
7. durably flush and read back `POST_INTENT_DURABLE` before sending;
8. send at most one POST; and
9. never automatically retry after credential-broker failure, HTTP error, timeout, reset, malformed/changed response, or process interruption.

The stable journal blocks reuse even when POST was not sent, including a local broker failure. The claim, durable intent, and terminal record each bind the exact final-approval-receipt SHA-256. The durable intent records the completed preflight remote-contact count; recovery conservatively accounts for the possibly dispatched POST before adding reconciliation contacts. Once `POST_INTENT_DURABLE` exists, that action identity can never issue another POST. Before every Management API dispatch, the wrapper first re-reads and verifies the immutable approval inputs, including both initial and final receipts and their exact owner-private topology, then performs the final approval-expiry check; the create POST additionally revalidates the raw official-pricing artifacts and requires pricing freshness beyond the bound request timeout. Only after those guards pass is the dispatch attempt counter incremented immediately before `fetch`. Expiry after a POST prevents further readiness/reconciliation contact and becomes owner-decision evidence without a retry. A timeout or lost response is `UNKNOWN_REMOTE_OUTCOME`. The same run performs at most one fail-closed, read-only all-pages organization-project-list reconciliation while approval remains current and records zero, one, multiple, identity-mismatched, or reconciliation-failed state without another POST. After process interruption, the separate `--reconcile-dispatched-action PR12-ACTION-003` mode first completes a missing terminal record from the same-byte snapshot of an already sealed and verified bundle; otherwise, while the hash-bound approval remains current, it invokes the broker in token-only recovery mode and can perform only read-only all-pages reconciliation and seal recovery evidence. It has no POST path and never decrypts the database-password envelope. A new POST is forbidden; any new creation attempt requires a new owner decision and newly bound action identity. The local claim cannot prevent a different external operator from creating a project concurrently, so the exact organization and operator remain owner-controlled residual risks.

## 9. Evidence contract

The Phase 1 runtime contract uses the explicitly versioned [binding v5](evidence/commercial-hardening/pr12/source-project-provisioning-binding-v5.template.json), [credential configuration v2](evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration-v2.template.json), [owner approval v4](evidence/commercial-hardening/pr12/source-project-provisioning-owner-approval-v4.template.json), [official pricing evidence v2](evidence/commercial-hardening/pr12/source-project-official-pricing-evidence-v2.template.json), [result v5](evidence/commercial-hardening/pr12/source-project-provisioning-result-v5.template.json), and [provider safe projection v4](evidence/commercial-hardening/pr12/source-project-provider-safe-projection-v4.template.json). These six files are the only current Action-003 versioned tuple. The separate final approval receipt v1 is execution authority over the frozen candidate tuple, not a replacement tuple member. Superseded Phase 1-local templates are removed from the working tree and remain recoverable through Git history; removal does not redefine or promote their historical schemas. The unversioned binding/result/provider-export trio remains compatibility-only input for the full commercial-manifest verifier. Promotion from Phase 1-local schema v2 through v5 into that verifier is `NOT_IMPLEMENTED`; a Phase 1-local PASS never implies a COMM PASS. Raw provider bodies must not be retained or reconstructed to bridge the schemas. A separately reviewed, hash-bound v5 promotion verifier is required before any Phase 1 evidence may support commercial qualification.

The wrapper creates a new evidence directory and persists only:

- ordered action-state events;
- secret-free request and provider response projections;
- response-body SHA-256 digests, never bodies or headers;
- organization, region, page coverage, duplicate count, protected-production-ref count, created project ref, provider `created_at`, status, and nested Large variant observation;
- a zero-count production boundary for direct production-project Management API, data-plane, database, and credential contact;
- sole operator/approver identity, explicit lack of independent separation, initial/final approval timestamps, final-approval-receipt SHA-256, broker mode/count, retry count zero, pricing/funding/expiry, project deadline, and cleanup boundary;
- explicit abort, duplicate, unknown-outcome, reconciled, and partial-failure states;
- a privacy/secret scan result; and
- a byte-count/SHA-256 manifest plus `manifest.sha256` sidecar.

Manifest classification is exact by path: action events and the privacy scan are `INTERNAL_NO_PII`; the provider projection and provisioning result are `INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS` because named stable owner/operator identifiers may be personal data. No classification permits patient data, secret values, raw provider bodies, or raw headers.

Before a file is written, the object is traversed as raw keys/string values and compared against every runtime secret value that was successfully retrieved, then its canonical JSON is scanned for credential-bearing fields and patterns, including Supabase `sbp_` Management PATs. This prevents JSON escaping from hiding an exact secret match. A normal PASS, duplicate abort, or contacted/pre-intent execution must record both runtime values as scanned; read-only recovery records its one Management token; only a genuinely pre-contact abort may record zero or one available value. Provider response bodies are content-length checked, streamed with a one-MiB decoded-byte cap, schema-validated in memory against the documented nested region/add-on shapes, and discarded. Provider RFC3339 timestamps, including the documented no-millisecond form, are calendar-validated and normalized to canonical UTC before evidence. Unknown provider fields stop without persisting the body. Evidence is written once to a retained `.partial` directory, flushed, semantically verified, and atomically renamed to its final directory. Only then may the create-once terminal journal refer to the manifest SHA-256. A post-rename verification failure moves the unverified bundle back to its exact partial quarantine path before that path may be written to the terminal journal; if the retained path cannot be proven, no false locator terminal is written. Seal failure is owner-decision evidence and is never retried against the same directory. The read-only `verify-pr12-source-project-provisioning-evidence.mjs` verifier accepts only the exact six-file phase-local bundle, reads every file into one stable byte snapshot with fatal UTF-8 decoding, requires every JSON file to equal its canonical serialization plus one newline, scans both raw text and parsed values, and rejects duplicate-key or alternate-serialization evidence even when its manifest hashes are recomputed. It rechecks the complete file set and identities before return, verifies the manifest sidecar, exact schemas, outcome-specific runtime-producible state sequences, preflight-page remote-contact counts, action/provider/privacy chronology, reconciliation state/count/identity semantics, project/tier, sole-operator control, broker count/mode, official-pricing/funding/expiry/cleanup, journal hashes, and cross-artifact identities/status, and fails on privacy or secret-bearing evidence.

## 10. Side effects, billing, and cleanup

If eventually approved and successful, the exact expected side effect is one new billable Supabase project in the shared Pro organization `kbnsntifrawhimhfjrug`, separate from the protected production project, with its project ref and compute lifecycle created in Tokyo at Large. Creation may also cause provider-internal organization billing, compute, storage, backup, IAM visibility, and control-plane records normally associated with a project. No production-project mutation/contact, application schema, migration history, seed, Auth user, Data API call, backup/restore drill, or integration side effect is authorized.

Current public list-price inputs are:

- Large compute: `1517` USD×10^-4 (`$0.1517`) per project-hour;
- maximum source authorization window after creation: 72 hours;
- maximum compute authorization: `1517 × 72 = 109224` USD×10^-4 (`$10.9224`);
- compute-credit reliance: zero;
- unallocated authorization headroom for known/unknown tax or other incremental charges: `390776` USD×10^-4 (`$39.0776`); and
- owner-governance authorization ceiling and required approved funding: `500000` USD×10^-4 (`$50.0000`).

Those inputs are not an actual quote, tax estimate, or provider-enforced cap. This packet version fixes known additional charges at exactly zero; the `$39.0776` is authorization headroom and does not assert that unknown charges equal zero. The owner must separately and explicitly set `unknownChargesAcknowledged: true` in both approval receipts, the v5 binding approval, and v4 owner approval. `PR12-ACTION-002` authenticated and provider-captured that the shared Organization plan is `PRO`. The payment method being active and Spend Cap being enabled remain owner-reported rather than provider-captured by this work, and Spend Cap does not enforce Compute. The owner has named the funding source as `FUTOSHI IWASAWAが管理するIFs1991's Org登録済み支払方法`, approved `$50.00`, and fixed the policy to fund through 73 hours after the scheduled `PR12-ACTION-003` execution time. The actual scheduled-execution timestamp and resulting canonical UTC `fundedThrough` remain `NOT_CAPTURED`; no charge was incurred by this preparation. The action remains blocked until all three official source captures are fresh and unchanged, known additional charges equal zero, the exact timestamps prove the approved 73-hour policy, and the owner explicitly acknowledges that delayed deletion, unknown charges, or other organization usage can exceed this local governance boundary.

The project deadline is exactly `min(provider created_at + 72h, fundedThrough)`. The deletion-approval request deadline must remain in the future, be no later than 72 hours from every validation immediately preceding execution, and precede `fundedThrough`; sealed PASS evidence also requires it to be no later than the actual project deadline. Paid projects cannot be treated as pausable. Automatic deletion is forbidden. Deletion is permanent and requires separate approval. The cleanup owner, deletion-approval requester/deadline, billing escalation owner, and funded-extension owner must be named before provisioning.

## 11. Required owner decisions

The following must remain unresolved rather than inferred:

- final PR head SHA and the final governance/contract/wrapper/config/evidence hashes;
- populated repository-external Action-002 evidence-directory and terminal-journal inputs plus their raw-path-free fingerprints; the captured target/production Organization ID, name, slug, and Pro plan are fixed;
- final revalidation of the fixed production name/ref/origin and acknowledgment that organization-wide enumeration necessarily observes its ref while persisting no production metadata;
- Action-003 project-list preflight confirmation that the fixed project name is absent before create; the existing `PRO` plan is already bound to the sealed Action-002 evidence and must not trigger another Organization GET;
- fresh official-source byte artifacts/hashes, their retrieval timestamps, known additional charges fixed at exactly zero, explicit acknowledgment of unknown charges, and acknowledgment that tax/other charges are not quoted;
- canonical UTC scheduled execution time and derived `fundedThrough`; the funding source, approved amount `$50.00`, and `scheduled PR12-ACTION-003 + 73 hours` policy are captured;
- the exact scheduled/funded timestamps themselves; exact scheduled+73-hour and Action-002 terminal-journal/evidence linkage verification are implemented, but Action-003 remains non-approvable while required populated values are absent;
- final binding of stable lowercase principal `owner:futoshi-iwasawa` and type `OWNER_DECLARED_STABLE_PRINCIPAL_ID` to every consolidated Action-003 owner field; Phase 1 commercial approver, provisioning/Supabase operator, cleanup/recovery owner, deletion requester, billing/funded-extension owner, and evidence custodian consolidate to that principal under the explicit exception;
- final sole-operator self-approval risk acceptance, no-independent-review acknowledgment, same-Organization IAM/billing/control-plane blast-radius acceptance, organization-list production-ref observation acceptance, production direct-contact prohibition acknowledgment, explicit unknown-charge acknowledgment, five-minute reconfirmation, and provider-spend-cap limitation acknowledgment;
- fine-grained Management token type/permissions; DPAPI configuration ID; current SID/machine; provider-root lexical/resolved fingerprints and device/inode identity; journal/evidence resolved identities; PowerShell/script/envelope hashes; and ACL evidence;
- completion evidence for the Action-003 two-role credential configuration and database-password envelope; the Action-002 Management-token bootstrap/use does not complete this requirement;
- stable journal and evidence-parent directory fingerprints;
- exact request timeout of 30,000 milliseconds, readiness observation maximum of 900 seconds, polling interval of 15 seconds, and acceptance of the fixed 300-second provider/local timestamp skew bound; and
- initial approval receipt SHA-256, the separately recorded final receipt accepting every exact candidate hash and eight risk/boundary statements, final action reconfirmation timestamp, and expiry.

Later-phase owners may remain `UNASSIGNED`; they do not become Phase 1 authority.

## 12. Exact future command boundary

The dedicated read-only identity action was executed once under its separately approved populated binding. Its historical command shape was:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs `
  --execute-authorized-action PR12-ACTION-002 `
  --binding <approved-binding-v1.json> `
  --credential-config <approved-credential-config-v2.json> `
  --approval-evidence <approved-identity-capture-owner-approval-v1.json> `
  --journal-directory <owner-controlled-absolute-directory> `
  --evidence-parent <owner-controlled-absolute-directory>
```

That command completed PASS once. It must not be rerun; Action-003 consumes the sealed result locally and has no Organization entitlement GET route.

After the database-password envelope and fresh public pricing bytes exist, the owner first supplies a fully populated initial receipt and records it without allowing the recorder to invent an approval, timestamp, risk acceptance, or authorization:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs `
  --record-initial `
  --owner-private-root <owner-private-approval-root> `
  --populated-initial-approval-receipt <owner-populated-initial-approval-receipt-v1.json>
```

The recorder writes the accepted receipt with create-new semantics to the fixed one-file directory `<owner-private-approval-root>\source-project-provisioning-initial-approval-receipt-v1\`. It verifies the owner-private root and every existing path component are non-reparse, outside the repository and Windows temporary roots, and protected for only the current Windows user plus `SYSTEM`. It never decrypts a credential and never contacts Supabase.

After that initial receipt has been separately approved and recorded, the local candidate packet can be built with:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs `
  --input <owner-private-canonical-action003-descriptor.json>
```

This preflight performs no Management API request and no credential decryption. It requires an already recorded owner-private initial receipt that authorizes only local packet preparation, creates only the three canonical owner-private candidate inputs, and returns a raw-path-free hash summary. The summary is not execution authority. The owner must then separately accept the exact displayed hashes and risks, populate the final receipt, and record it with:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs `
  --owner-private-root <owner-private-approval-root> `
  --candidate-directory <exact-three-file-candidate-directory> `
  --preflight-descriptor <source-project-provisioning-action003-preflight-descriptor-v1.json> `
  --initial-approval-receipt <recorded-initial-approval-receipt-v1.json> `
  --pricing-evidence <official-pricing-evidence-v2.json> `
  --populated-final-approval-receipt <owner-populated-final-approval-receipt-v1.json>
```

The final recorder derives every bound hash and the clean Git HEAD from stable local reads, validates both the candidate and final executable approval contract, then writes the accepted receipt with create-new semantics to the fixed one-file sibling directory `<owner-private-approval-root>\source-project-provisioning-final-approval-receipt-v1\`. It requires the same canonical preflight descriptor that created the candidate and rejects any descriptor whose `outputDirectoryPath` does not identify that exact three-file candidate. Before validation and again immediately before create-new receipt recording, it runs the preflight's read-only revalidation mode: the sealed Action-002 evidence and terminal, Action-003 journal/evidence parents, both DPAPI envelope resources without decryption, official pricing bytes and freshness, path identities, ACL proofs, clean Git state, and rebuilt candidate artifacts must remain exact. The two raw-path-free revalidation proofs must be identical. It does not accept hashes, HEAD, timestamps, or risk booleans as command-line authority. A dirty/wrong HEAD, changed Action-002 evidence, changed initial receipt, external path/ACL/envelope/pricing bytes, ambient credential, prior Action-003 claim, stale clock, missed schedule, existing output, or repository/temporary output location stops without invoking the provisioning wrapper.

After the sealed `PR12-ACTION-002` evidence and terminal are supplied to the v5 local verifier, all remaining blockers are filled, and the separate final approval receipt matches every then-final hash, the provisioning operator may use:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs `
  --execute-authorized-action PR12-ACTION-003 `
  --binding <candidate-binding-v5.json> `
  --credential-config <candidate-credential-config-v2.json> `
  --approval-evidence <owner-approval-candidate-v4.json> `
  --initial-approval-receipt <initial-approval-receipt-v1.json> `
  --final-approval-receipt <final-approval-receipt-v1.json> `
  --owner-private-approval-root <owner-private-approval-root> `
  --pricing-evidence <official-pricing-evidence.json> `
  --organization-identity-evidence-directory <sealed-action-002-evidence-directory> `
  --organization-identity-terminal <action-002-terminal-journal.json> `
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
