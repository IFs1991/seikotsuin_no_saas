# PR12 Isolated Staging and DR Runbook v1.0

## Status

- Run state: `NOT_RUN`
- Staging authorization: `false`
- Production authorization: `false`
- Target commit/project/region/tier: `NOT_CAPTURED / UNASSIGNED`
- Exact mutating commands: `NOT_CAPTURED`
- Commercial release: `NO_GO`

This runbook is executable only after [the approval packet](../stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml) is complete, SHA-256 pinned, and explicitly approved. Until then, only the local/offline checks in section 2 are allowed.

## 1. Roles and separation of duties

| Role               | Current owner | Required responsibility                                                 |
| ------------------ | ------------- | ----------------------------------------------------------------------- |
| Release approver   | `UNASSIGNED`  | approve exact head, project, data, thresholds, commands, cost, and risk |
| Staging owner      | `UNASSIGNED`  | project isolation, region/tier/settings identity                        |
| Migration operator | `UNASSIGNED`  | clean replay, parity, lock/duration capture                             |
| Security reviewer  | `UNASSIGNED`  | tenant/Auth/Data API/GraphQL/service-role evidence                      |
| Restore owner      | `UNASSIGNED`  | backup source, restore target, integrity, RTO/RPO                       |
| Monitoring owner   | `UNASSIGNED`  | canary, abort signals, 24h/72h review                                   |
| Incident owner     | `UNASSIGNED`  | abort, containment, communication, forward-fix decision                 |

The operator cannot self-approve a high-risk gate. Production credentials and patient data are prohibited.

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

The repository requires Supabase CLI `2.109.0`. The PATH CLI observed during preparation was `2.109.1`, so it is not accepted as execution evidence. An official Windows `2.109.0` release asset was verified outside the repository at SHA-256 `d2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b`; version plus `link`, `migration list`, `db push`, `db dump`, `db advisors`, `gen types`, and `status` help succeeded. Do not upgrade the repository pin.

## 3. Approval preflight — hard stop

All fields below must be concrete before a staging connection:

- Draft head SHA, approval-packet SHA-256, and an `APPROVED` machine-readable binding that the verifier matches to the current Git HEAD
- project ref/name, region, tier, database/PostgREST/extension versions
- synthetic/anonymized source, volume, row counts, hashes, expiry
- fixed PR11 contract hash, exact 9/6/2+2 result shape, plus separately frozen hosted workload/concurrency/order/duration/SLO
- CPU, pool, lock, WAL, migration-duration abort thresholds
- exact hash-pinned tenant/Auth/JWT/role/CRUD, Data API, and GraphQL matrices, including independent ACL/RLS expected outcomes
- Stripe test mode and every external integration disposition
- backup/restore method, source watermark, target, RTO/RPO thresholds, start/end events, durable-watermark definition, and clock/source
- hash-pinned environment-only credential channel/storage/retrieval/logging contract and redaction behavior
- exact commands, expected side effects, estimated time/cost
- machine privacy scan plus named human review method/evidence
- staging, migration, restore, security, privacy, monitoring, incident, and approval owners
- approval expiry and every revalidation trigger

If any field remains `UNASSIGNED`, `NOT_CAPTURED`, or `NOT_RUN`, stop. The current packet intentionally fails this check.

## 4. Exact staging command freeze

Status: `NOT_CAPTURED`.

No mutating staging command is written as approved executable text in this revision because the exact project, tier, data, backup/restore method, and CLI `2.109.0` invocation are unknown. Command templates are not approval and must not be run.

After owner decisions, add a reviewed command ledger to a new approval-packet revision. Each entry must contain:

- ID and purpose
- exact executable and arguments with secrets represented only by environment-variable names
- working directory and exact target project allowlist
- whether it is read-only or mutating
- expected schema/data/WAL/backup/external side effects
- timeout, abort signal, recovery step, stdout/stderr artifact paths
- CLI `2.109.0` `--help` evidence for every used subcommand

The ledger must reject production project identity and must not use a linked-project default without comparing the returned project ref to the approved value.

## 5. Freeze phase

Before the first sample:

1. Record `git rev-parse HEAD`; require it to equal the approved SHA.
2. Hash the approval packet, all three security/API matrices (including Data API/GraphQL runtime configuration), credential-channel contract, performance contract, migration input contract, all probes, runner/adapter, and data package.
3. Verify all 61 migration and 60 rollback aggregate hashes and parity.
4. Freeze hosted workload, concurrency, sample order, p95/p99/throughput/5xx/timeout, CPU/pool/lock/WAL/duration, and RTO/RPO thresholds.
5. Capture `node --version`, `supabase --version`, and `psql --version` through their approved command IDs, hash stdout/stderr, require empty stderr, and verify actual Node 24 plus Supabase CLI `2.109.0` and approved `psql`. Confirm process-environment-only credential injection from the approved server secret store into an ephemeral server subprocess; forbid values in browser, CLI/URL, client response, logs, source control, and evidence. Record approval before any command timestamp and reject execution outside the approval window.
6. Create a new evidence directory. Refuse an existing/non-empty directory.
7. Run privacy preflight. Stop on any secret, credentialed URL, real identity, patient data, or user-home path. Machine scanning is necessary but not sufficient; record a named human privacy review and hashed review evidence.

No value may be recalculated after observing a sample.

## 6. Read-only environment identity

Capture before mutation:

- project ref/name, organization boundary, region, tier
- Postgres/PostgREST/Supabase CLI/psql/Node versions and system identifier
- migration history and current head
- DB size, critical row counts, pool/role configuration, long transactions, locks
- Data API enabled state, exposed schemas, automatic grants
- `postgres` and `supabase_admin` default ACLs
- schema USAGE and relation/column/sequence/function privileges
- `pg_graphql` installed version, enabled state, schemas, introspection
- Advisor security/performance baseline
- backup capability and external-integration state

Dashboard/config facts and catalog ACL/RLS facts are separate artifacts.

## 7. Clean migration replay and data preparation

Only after explicit approval:

1. Confirm isolated project is empty/replaceable and not production.
2. Capture the initial migration list, schema hash, and row counts.
3. Perform the owner-approved clean full replay through `20260718011731`.
4. Capture every migration start/end, exit, lock, duration, stdout/stderr hash, and final history.
5. Compare local/remote ordered migration history and the frozen input-set contract.
6. Load only the approved synthetic/anonymized data package.
7. Verify row-count targets, fixture/actor identities, source hash, and no patient PII.
8. Generate Supabase types from the target and compare to the committed file without writing it.
9. Capture normalized schema/catalog/data hashes and drift results.

Stop on replay, history, type, seed, row-count, or schema drift. Do not edit an applied migration.

## 8. Database security qualification

Run pgTAP/catalog/behavior contracts for:

- RLS enabled and exact policy role/command/predicate behavior
- relation/default/column/sequence/schema privileges
- function EXECUTE, owner, fixed search path, invoker/definer, volatility, comments
- helper fail-closed behavior and trigger identity
- composite FK, cascade, missing/null resource, cross-clinic, parent re-home
- internal-table client denial, shared-master read-only, legacy quarantine

Then run tenant A/B read/insert/update/delete negatives for every major role. Record ACL-denied, RLS-zero-row, and business-validation denials as distinct expected outcomes with SQLSTATE/message/row counts.

## 9. Auth and JWT qualification

Use real hosted Auth sign-in and refresh. Do not obtain a hosted JWT signing secret or fabricate hosted user tokens.

Cases include DB-authoritative role/scope, missing authority, permissions-query error, inactive/missing profile, revoked or owner-defined expired manager assignment, stale JWT, empty bearer, malformed/expired JWT, anon, authenticated, and service-role. A stale JWT must not restore revoked DB authority. `user_metadata` is never authorization authority.

Service-role/secret requests run only in a server-side subprocess after scope checks. Scan browser assets, responses, logs, command records, and evidence for exposure.

## 10. Data API and GraphQL qualification

For REST, freeze a hash-pinned matrix of `case ID × role × object × operation × expected HTTP × expected SQLSTATE × expected row count × expected ACL outcome × expected RLS outcome`. Execution records the matching observed fields and the verifier compares them. Cover schema USAGE, relation/column/sequence/function ACL, intended allow paths, intended deny paths, RLS result, tenant A/B, and service-role server-only behavior.

For GraphQL:

- capture installed version, enabled state, exposed schemas, and introspection;
- if enabled, run anon/authenticated/service-role operation, tenant, field visibility, and introspection cases;
- if disabled, capture the state and endpoint rejection;
- never label it `NOT_APPLICABLE` merely because it was not tested.

Stop on any unexpected object/field, status, row, tenant, or introspection result.

## 11. Canonical PR11 performance and hosted SLO

Verify every source hash in `frozen-pr11-performance-contract.json`. Preserve actor, fixture, JWT, GUC, probe, three-sample median, `<=`, and paired order.

Run all 9 primary execution, 6 WAL, 2 auxiliary execution, 2 auxiliary WAL, natural-plan, semantic, SQLSTATE/message, trigger/FK call-count, and 52-case pgTAP gates. Record every exact three-sample set, calculated median, frozen limit, unit, and hashed evidence; the execution verifier rejects missing/extra IDs, recalculated limits, median mismatch, or failure. Created-by and RLS target plans must be natural. The existing post-gate diagnostic forcing is not acceptance evidence and cannot be expanded.

Then run the separately frozen hosted workload and SLO. Hosted success cannot replace a fixed PR11 failure; either failure aborts.

## 12. Advisor diff and pre-restore integrity

Capture security/performance Advisor results before and after replay/qualification. New critical/security findings are zero. Every exception needs owner, reason, expiry, and mitigation; suppressing a warning is not remediation.

Capture row counts, schema/data hashes, tenant matrices, and side-effect ledger immediately before backup. Verify external integrations remain disabled or sandboxed and duplicate count is zero.

## 13. Backup and restore drill

Use only the owner-approved method. PR11 validation-only rollback SQL is not a restore.

1. Record source identity, backup start/end, restore point, source watermark, owner-approved RTO start/end events and clock/source, plus the RPO durable-watermark and observation definitions.
2. Create/use the approved isolated restore target; reject production identity.
3. Restore DB and any explicitly approved Storage/Auth/config scope.
4. Record the approved RTO events with the frozen clock/source and compute RTO without changing the definition.
5. Compute RPO from the frozen durable-watermark and observation definitions with their recorded clock/source.
6. Verify migration head, generated types, schema/data hashes, critical row counts, Auth, and tenant isolation.
7. Repeat Data API/GraphQL/service-role and tenant A/B negatives.
8. Create/update a reservation only within synthetic data and verify no duplicate external event.
9. Record gaps, failures, follow-up owner/date, evidence retention, and target cleanup decision.
10. Run the machine privacy scan, complete the named human privacy review, then run `verify-pr12-evidence-manifest.mjs` against the final manifest. A verifier failure is an abort, never a documentation-only warning.

The SSOT reference targets are RTO 8h and RPO 24h, but they are not binding until owner-approved in the packet.

## 14. Canary and production-plan rehearsal

This section remains `NOT_RUN` and design-only until later approval. Freeze code/DB deploy order, flags, canary cohort, traffic percentage, observation window, monitoring queries, abort thresholds, communication owner, and forward-fix path.

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

Immediate staging observation records 4xx/5xx/timeouts, DB CPU/pool/locks/WAL/latency, Auth failures, RLS/ACL denials, duplicate events, billing sandbox state, and evidence collector health.

A later production plan must include immediate smoke plus 24h/72h review. Sign-off requires every blocking COMM gate to be valid `PASS` for the exact commit/environment. `PASS_WITH_RISK` cannot waive tenant isolation, authorization, data loss, restore, or billing integrity.

## 18. Current stop point

After local verification, audits, push, Draft PR, and eight same-head CI jobs, stop and present the approval packet. The current packet remains incomplete, so staging connection and execution are prohibited until explicit owner approval of a new complete revision.
