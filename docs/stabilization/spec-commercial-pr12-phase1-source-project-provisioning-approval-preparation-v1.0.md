# PR12 Phase 1 source project provisioning approval preparation v1.0

Status: **LOCAL PREPARATION ONLY / PHASE 1 ACTION NOT APPROVED / CREDENTIAL BOOTSTRAP NOT RUN / REMOTE NOT RUN / COMMERCIAL NO_GO**

Date: 2026-07-23 JST

Revision: 2026-07-24 JST — owner-authorized local preparation for the sole-operator exception, official-pricing-evidence substitution, Windows DPAPI credential channel, and a USD 50 / 72-hour owner-governance ceiling. This revision is not approval of `PR12-ACTION-003`.

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
- exact target organization allow-binding;
- production organization ID/slug denylist and production project-ref denylist;
- current Pro entitlement expectation, the literal `seikotsuin-pr12-isolated-qualification-20260719` name, Tokyo, and Large;
- the frozen production ref `qnanuoqveidwvacvbhqp` in the denylist;
- the canonical lowercase stable sole-operator principal ID, the display name `FUTOSHI IWASAWA`, transparent same-person role consolidation, no independent-human-review claim, explicit self-approval risk acceptance, a minimum five-minute approval/reconfirmation cooling-off period, and a maximum 30-minute approval window;
- integer-scaled official pricing arithmetic: `1517 × 72 = 109224` USD×10^-4 (`$10.9224`), zero credit reliance, `$39.0776` unallocated headroom, exactly `$50.0000` approved funding, acknowledgment that the ceiling is not provider-enforced, and cleanup responsibility;
- distinct owner-controlled action-journal and evidence-parent lexical fingerprints and resolved directory identities, with no equality or ancestor/descendant overlap;
- a hash-bound Windows DPAPI CurrentUser provider whose lexical root fingerprint, resolved-root fingerprint, filesystem device/inode identity, exact PowerShell/broker/bootstrap/envelope hashes, owner SID and machine fingerprints, strict owner-plus-SYSTEM ACL policy, and two fixed opaque handles all match; every provider-root, journal, and evidence path component must be a normal directory rather than a junction, symlink, or other reparse point, and the resolved provider tree must be disjoint from the repository, Windows temporary trees, journal tree, and evidence tree; and
- absence of generic/cross-target Supabase or database credential names and unbound proxy, TLS, CA, Node debug, or Node option controls.

`NOT_CAPTURED`, `NOT_IMPLEMENTED`, `NOT_RUN`, `UNASSIGNED`, wrong hash/head, dirty worktree, an executing implementation path or file-identity mismatch, expired approval, or a prior claim all stop locally.

## 7. Credential contract

[The Phase 1 credential v2 template](evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration-v2.template.json) replaces environment injection with `WINDOWS_DPAPI_CURRENT_USER_V1`. It binds these fixed handles:

- `windows-dpapi-cu://pr12-source-project/management-access-token/v1` for the fine-grained Supabase Management token with endpoint scopes `projects:read`, `projects:write`, and `organizations:read`, and permissions `organization_admin_read`, `organization_projects_read`, `organization_projects_create`, and `infra_add_ons_read`; and
- `windows-dpapi-cu://pr12-source-project/database-password/v1` for a 32–256 byte database password.

Populated DPAPI envelopes live in one owner-controlled Windows directory outside the repository and temporary directories. The configuration binds the exact CurrentUser SID hash, machine-name hash, provider-root lexical and resolved path SHA-256 values, filesystem device/inode identity, `pwsh.exe` path/version/SHA-256, broker/bootstrap SHA-256, role-separated entropy context, envelope filenames/SHA-256 values, protected ACL, and no-reparse/no-overwrite policy. Bootstrap, Node channel, broker, and wrapper reject a reparse point in any provider-root, journal, or evidence path component. They re-resolve the relevant paths and reject provider-root identity drift or equality/containment with the resolved repository, Windows temporary, journal, or evidence trees before claim, decrypt, or remote contact. CurrentUser protects data at rest but does not isolate it from malware or privileged code running as the same account; JavaScript and .NET strings cannot be guaranteed to be zeroized. These residual risks require final owner acceptance.

Credential bootstrap is a separate local sensitive action governed by the [bootstrap approval template](evidence/commercial-hardening/pr12/source-project-dpapi-bootstrap-approval-v1.template.json). The 2026-07-24 preparation authorization does not authorize interactive reading of either real secret or creation of a populated envelope, and neither occurred. The bootstrap script uses `CreateNew`, hidden input, DPAPI CurrentUser, role-separated entropy, owner-plus-SYSTEM ACLs, flush/readback, and mutable-buffer clearing; it never overwrites an envelope.

The Node wrapper validates approval and creates/readbacks the durable claim before invoking the exact hash-bound broker once. It sends bounded canonical JSON over captured stdin. That claim-bound request includes the approved bootstrap-script SHA-256, provider resolved-root SHA-256, and journal/evidence lexical path fingerprints; the broker requires the envelope bootstrap provenance to equal the bound current bootstrap hash. The broker independently validates the claim, expiry, hashes, SID/machine, root/envelope identities, resolved path boundaries, and ACLs, then returns a bounded binary frame only over captured stdout. The Node parent never relays or persists that frame or broker stderr and clears mutable buffers. Execute mode asks for both values; recovery asks for the Management token only and never opens the password envelope. Broker failure consumes the action claim and permits no automatic retry or remote contact.

`.env`, CLI login state, `PR12_SUPABASE_ACCESS_TOKEN`, `PR12_SOURCE_DB_PASSWORD`, every generic or cross-target Supabase/database variable, inherited environment fallback, unbound proxy/TLS/CA/debug/`NODE_OPTIONS` controls, argv, URL, parent stdout/stderr relay, log, evidence, and commit persistence are forbidden. The wrapper uses native HTTPS fetch; Git and broker subprocesses receive explicit non-secret environment allowlists.

## 8. At-most-one POST and recovery

Supabase's documented create endpoint exposes no idempotency key. This preparation therefore does not claim provider-guaranteed exactly-once creation. It implements the strongest fail-closed local contract available:

1. validate offline approval;
2. prove the executing wrapper/contract/credential-channel/evidence-verifier paths and stable file identities belong to the approved clean Git worktree, then create an exclusive action claim keyed by action ID, binding-material hash, and payload hash in the owner-bound stable journal directory;
3. read back the claim, revalidate all approval/pricing/DPAPI files and identities, then invoke the claim-bound broker exactly once; broker failure consumes the claim and sends no remote request;
4. retrieve both credentials only through the captured binary broker channel after the claim;
5. enumerate every project page, require bounded pagination arithmetic and unique refs across pages, and stop if the fixed name already exists;
6. re-read each approval input and official source artifact into one stable file snapshot, re-hash the same bytes that were parsed, and revalidate file identity, head, clean worktree, governance/implementation hashes, approval expiry, pricing freshness, DPAPI resources, ambient-credential absence, and payload immediately before POST;
7. durably flush and read back `POST_INTENT_DURABLE` before sending;
8. send at most one POST; and
9. never automatically retry after credential-broker failure, HTTP error, timeout, reset, malformed/changed response, or process interruption.

The stable journal blocks reuse even when POST was not sent, including a local broker failure. The durable intent records the completed preflight remote-contact count; recovery conservatively accounts for the possibly dispatched POST before adding reconciliation contacts. Once `POST_INTENT_DURABLE` exists, that action identity can never issue another POST. Every Management API contact rechecks the canonical approval expiry synchronously before `fetch`; the create POST additionally requires official-pricing freshness to extend beyond the bound request timeout. Expiry after a POST prevents further readiness/reconciliation contact and becomes owner-decision evidence without a retry. A timeout or lost response is `UNKNOWN_REMOTE_OUTCOME`. The same run performs at most one fail-closed, read-only all-pages organization-project-list reconciliation while approval remains current and records zero, one, multiple, identity-mismatched, or reconciliation-failed state without another POST. After process interruption, the separate `--reconcile-dispatched-action PR12-ACTION-003` mode first completes a missing terminal record from the same-byte snapshot of an already sealed and verified bundle; otherwise, while the hash-bound approval remains current, it invokes the broker in token-only recovery mode and can perform only read-only all-pages reconciliation and seal recovery evidence. It has no POST path and never decrypts the database-password envelope. A new POST is forbidden; any new creation attempt requires a new owner decision and newly bound action identity. The local claim cannot prevent a different external operator from creating a project concurrently, so the exact organization and operator remain owner-controlled residual risks.

## 9. Evidence contract

The Phase 1 runtime contract uses the explicitly versioned [binding v3](evidence/commercial-hardening/pr12/source-project-provisioning-binding-v3.template.json), [credential configuration v2](evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration-v2.template.json), [owner approval v2](evidence/commercial-hardening/pr12/source-project-provisioning-owner-approval-v2.template.json), [official pricing evidence v2](evidence/commercial-hardening/pr12/source-project-official-pricing-evidence-v2.template.json), [result v3](evidence/commercial-hardening/pr12/source-project-provisioning-result-v3.template.json), and [provider safe projection v2](evidence/commercial-hardening/pr12/source-project-provider-safe-projection-v2.template.json). V2 binding/result and unversioned schema-v1 files remain historical/legacy inputs; they are not silently redefined. Promotion from every Phase 1-local schema version 2 or later into the existing full commercial-manifest verifier is `NOT_IMPLEMENTED`; a Phase 1-local PASS never implies a COMM PASS. Raw provider bodies must not be retained or reconstructed to bridge the schemas. A separately reviewed, hash-bound v3 promotion verifier is required before any Phase 1 evidence may support commercial qualification.

The wrapper creates a new evidence directory and persists only:

- ordered action-state events;
- secret-free request and provider response projections;
- response-body SHA-256 digests, never bodies or headers;
- organization, region, page coverage, duplicate count, project ref, provider `created_at`, status, and nested Large variant observation;
- sole operator/approver identity, explicit lack of independent separation, timestamps, broker mode/count, retry count zero, pricing/funding/expiry, project deadline, and cleanup boundary;
- explicit abort, duplicate, unknown-outcome, reconciled, and partial-failure states;
- a privacy/secret scan result; and
- a byte-count/SHA-256 manifest plus `manifest.sha256` sidecar.

Manifest classification is exact by path: action events and the privacy scan are `INTERNAL_NO_PII`; the provider projection and provisioning result are `INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS` because named stable owner/operator identifiers may be personal data. No classification permits patient data, secret values, raw provider bodies, or raw headers.

Before a file is written, the object is traversed as raw keys/string values and compared against every runtime secret value that was successfully retrieved, then its canonical JSON is scanned for credential-bearing fields and patterns, including Supabase `sbp_` Management PATs. This prevents JSON escaping from hiding an exact secret match. A normal PASS, duplicate abort, or contacted/pre-intent execution must record both runtime values as scanned; read-only recovery records its one Management token; only a genuinely pre-contact abort may record zero or one available value. Provider response bodies are content-length checked, streamed with a one-MiB decoded-byte cap, schema-validated in memory against the documented nested region/add-on shapes, and discarded. Provider RFC3339 timestamps, including the documented no-millisecond form, are calendar-validated and normalized to canonical UTC before evidence. Unknown provider fields stop without persisting the body. Evidence is written once to a retained `.partial` directory, flushed, semantically verified, and atomically renamed to its final directory. Only then may the create-once terminal journal refer to the manifest SHA-256. A post-rename verification failure moves the unverified bundle back to its exact partial quarantine path before that path may be written to the terminal journal; if the retained path cannot be proven, no false locator terminal is written. Seal failure is owner-decision evidence and is never retried against the same directory. The read-only `verify-pr12-source-project-provisioning-evidence.mjs` verifier accepts only the exact six-file phase-local bundle, reads every file into one stable byte snapshot with fatal UTF-8 decoding, requires every JSON file to equal its canonical serialization plus one newline, scans both raw text and parsed values, and rejects duplicate-key or alternate-serialization evidence even when its manifest hashes are recomputed. It rechecks the complete file set and identities before return, verifies the manifest sidecar, exact schemas, outcome-specific runtime-producible state sequences, preflight-page remote-contact counts, action/provider/privacy chronology, reconciliation state/count/identity semantics, project/tier, sole-operator control, broker count/mode, official-pricing/funding/expiry/cleanup, journal hashes, and cross-artifact identities/status, and fails on privacy or secret-bearing evidence.

## 10. Side effects, billing, and cleanup

If eventually approved and successful, the exact expected side effect is one new billable Supabase project in the approved non-production organization, with its project ref and compute lifecycle created in Tokyo at Large. Creation may also cause provider-internal billing, compute, storage, backup, and control-plane records normally associated with a project. No application schema, migration history, seed, Auth user, API call, backup/restore drill, or integration side effect is authorized.

Current public list-price inputs are:

- Large compute: `1517` USD×10^-4 (`$0.1517`) per project-hour;
- maximum source authorization window after creation: 72 hours;
- maximum compute authorization: `1517 × 72 = 109224` USD×10^-4 (`$10.9224`);
- compute-credit reliance: zero;
- unallocated authorization headroom for known/unknown tax or other incremental charges: `390776` USD×10^-4 (`$39.0776`); and
- owner-governance authorization ceiling and required approved funding: `500000` USD×10^-4 (`$50.0000`).

Those inputs are not an actual quote, tax estimate, or provider-enforced cap. The `$39.0776` is authorization headroom, not an assertion that unknown charges equal zero. The owner has authorized the ceiling design, but existing target-organization Pro status, known additional charges, funding source, full `$50` funding record, `fundedThrough`, official-source byte captures/hashes, and acknowledgment of unknown-charge/provider-cap residual risk are still `NOT_CAPTURED`. The action remains blocked until all three official source captures are fresh and unchanged, known incremental charges fit within headroom, exactly `$50` is funded through at least approval expiry plus 72 hours, and the owner explicitly acknowledges that delayed deletion or other organization usage can exceed this local governance boundary.

The project deadline is exactly `min(provider created_at + 72h, fundedThrough)`. The deletion-approval request deadline must remain in the future, be no later than 72 hours from every validation immediately preceding execution, and precede `fundedThrough`; sealed PASS evidence also requires it to be no later than the actual project deadline. Paid projects cannot be treated as pausable. Automatic deletion is forbidden. Deletion is permanent and requires separate approval. The cleanup owner, deletion-approval requester/deadline, billing escalation owner, and funded-extension owner must be named before provisioning.

## 11. Required owner decisions

The following must remain unresolved rather than inferred:

- final PR head SHA and the final governance/contract/wrapper/config/evidence hashes;
- target organization ID and slug;
- production organization ID and slug denylist;
- confirmation of the existing Pro entitlement and fixed project name;
- fresh official-source byte artifacts/hashes, their retrieval timestamps, known incremental charges within the `$39.0776` headroom, and acknowledgment that tax/other charges are not quoted;
- exact `$50` approved funding record, funding source, and `fundedThrough`;
- the stable lowercase principal ID and ID type for `FUTOSHI IWASAWA`; Phase 1 commercial approver, provisioning/Supabase operator, cleanup/recovery owner, deletion requester, billing/funded-extension owner, and evidence custodian all consolidate to that principal under the explicit exception;
- final sole-operator self-approval risk acceptance, no-independent-review acknowledgment, five-minute reconfirmation, and provider-spend-cap limitation acknowledgment;
- fine-grained Management token type/permissions; DPAPI configuration ID; current SID/machine; provider-root lexical/resolved fingerprints and device/inode identity; journal/evidence resolved identities; PowerShell/script/envelope hashes; and ACL evidence;
- a separately approved and completed real-credential bootstrap record; populated encrypted envelopes and both fixed handle fingerprints;
- stable journal and evidence-parent directory fingerprints;
- request timeout, readiness observation limit, polling interval, and acceptance of the fixed 300-second provider/local timestamp skew bound; and
- final action approval/reconfirmation timestamps and expiry.

Later-phase owners may remain `UNASSIGNED`; they do not become Phase 1 authority.

## 12. Exact future command boundary

Only after all blockers are filled and a separate owner approval record matches the final hashes may the operator use:

```powershell
fnm exec --using=24 node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs `
  --execute-authorized-action PR12-ACTION-003 `
  --binding <approved-binding.json> `
  --credential-config <approved-credential-config.json> `
  --approval-evidence <owner-approval.json> `
  --pricing-evidence <official-pricing-evidence.json> `
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
