# PR-12 entry-readiness handoff

## Decision

- PR-12 planning: `GO`
- PR-12 Draft PR preparation: `GO`
- PR-12 Draft PR creation: `NOT_YET`
- Phase A2 closure Draft PR creation: `AUTHORIZED`
- Phase A2 closure Ready transition: `AUTHORIZED_AFTER_GATES`
- Phase A2 closure merge: `HUMAN_ONLY`
- isolated staging execution: `NOT_AUTHORIZED`
- PR-12 merge: `NO_GO`
- production apply: `NOT_AUTHORIZED`
- general commercial release: `NO_GO`

PR-11の現在スキーマを変更せず、`public.idx_blocks_resource_id`を保持した
状態でPR-12の計画とDraft準備へ進める。Phase A2 evidence commit
`25a983e6f39a02855667f9e943523f7cb4aa40ee`は公開承認済みであり、closure
Draft PRは作成できる。required local checks、独立監査、同一head SHAの8 CI jobが
PASSした場合だけReadyへ変更し、mergeは人間が行う。Phase A2 closureをmergeする
までPR-12 Draft PR自体は作成しない。Phase A2の結果をPASSへ変更せず、未証明の
dense性能をisolated stagingのblocking qualificationへ引き渡す。

## Authority / SSOT

- status、blocking、evidence形式は
  [Change DoD](../quality/change-dod-v1.0.md)を正本とする。
- 商用判定は
  [Commercial Release Qualification](../releases/commercial-release-qualification-v1.0.md)
  の`COMM-DB`、`COMM-TENANT`、`COMM-AUTH`、`COMM-API`、`COMM-BILL`、
  `COMM-OPS`全blocking gateを同一commitで満たす。
- PR-12の実装・staging・DR・release順序は
  [商用ハードニングmigration正本](spec-commercial-hardening-migration-v1.0.md)
  に従う。
- [PR-11 pilot waiver](evidence/commercial-hardening/pr11/pilot-performance-waiver.yaml)
  は`PASS_WITH_RISK`、`blocking: false`、期限
  `2026-08-18T23:59:59+09:00`で、PR-11 merge eligibility限定である。
  PR-12、staging、production、一般商用releaseへ継承しない。
- 2026-05-30以降の新規Supabase projectではData APIへの自動公開を仮定せず、
  [Supabase公式変更](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
  に従ってproject設定、明示GRANT、RLSを別々に検証する。

## Frozen facts

- PR-11 merge commitは
  `aaf3837f6f8053b0379a2d4caea65880952ce027`。
- migration headは`20260718011731`。
- 既存のpilot waiverはPR-11のmerge eligibility限定であり、staging、
  production、一般商用releaseを許可しない。
- 公式post-apply結果は9 primary execution gate中8 PASS、dense 10,000 insert
  だけが`549.305 ms > 521.55125 ms`でFAILした。
- Phase A2は`FAIL_STOP / ENVIRONMENT_INVALID`。candidate SQLは0回、恒久DDLは
  0件、D1b/D2は`NOT_RUN`、committed steady-state effectは`NOT_PROVEN`。
- 非対象HookOps stackをvolume-preservingで停止しても、RAM、commit、CPU、
  hard paging、incidental WALの環境gateが残った。
- これは「現在のPCでは因果測定が成立しない」ことを証明する。PC性能が旧
  dense FAILの唯一の原因であることは証明しない。
- restoration後の17-relation logical hashは
  `c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78`、
  normalized physical hashは
  `94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`。

Closure/governance records (become SSOT only after human review and merge):

- [Phase A2 closure](evidence/commercial-hardening/pr11/dense-phase-a2-closure-20260719.yaml)
- [Phase A2 report](report-pr11-dense-phase-a2-environment-validity-v0.1-20260719.md)
- [PR-12 performance entry gate](evidence/commercial-hardening/pr12/pr11-performance-entry-gate.yaml)

## PR-12 entry boundaries

| Boundary                        | Current state  | Exit condition                                      |
| ------------------------------- | -------------- | --------------------------------------------------- |
| Branch/spec/runbook preparation | GO             | Phase A2 closure is reviewable                      |
| PR-12 Draft PR preparation      | GO             | all unverified work remains explicit                |
| PR-12 Draft PR creation         | NOT_YET        | Phase A2 closure is reviewed and merged             |
| Isolated staging execution      | NOT_AUTHORIZED | explicit owner approval and frozen entry thresholds |
| PR-12 merge                     | NO_GO          | staging, restore, CI, audits, and human review PASS |
| Production apply                | NOT_AUTHORIZED | separate production approval packet                 |
| General commercial release      | NO_GO          | all blocking commercial gates PASS                  |
| Singleton-index retirement      | NOT_AUTHORIZED | separate causal proof and owner approval            |

The historical fixed thresholds, samples, actors, fixtures, JWTs, probe SQL,
and raw evidence remain unchanged. PR-12 may add hosted product-SLO gates, but
those limits must be frozen before the first staging sample and must not rewrite
the historical PR-11 result.

## Isolated staging acceptance

Before the first staging measurement:

1. Merge the sanitized Phase A2 closure without the quarantined `-01` packet.
2. Create the PR-12 branch from the latest `main`.
3. Refresh `docs/releases/current-gate-status.yaml` for the exact PR-12 commit;
   the current file is still a PR-02-era snapshot.
4. Obtain explicit human approval for the isolated project, representative data
   source, hosted database tier, and external-side-effect sandboxing.
5. Freeze workload, concurrency, sample order, p95/p99, throughput, 5xx,
   timeout, database CPU, pool, lock, WAL, migration-duration, RTO, and RPO
   limits before observing results.
6. Hash-pin the canonical PR-11 probe and every original fixed execution, WAL,
   plan, and semantic gate before observing results. Hosted SLOs are additive;
   they do not replace those fixed gates.
7. Record Data API enabled state, exposed schemas, automatic-grants setting,
   `postgres`/`supabase_admin` default privileges, schema `USAGE`, and explicit
   relation, column, sequence, and function privileges for `anon`,
   `authenticated`, and `service_role`. Record the service-role credential's
   server-only storage/use and non-exposure boundary.
8. Record `pg_graphql` installed version, enabled state, exposed schemas, and
   introspection setting. If GraphQL is intentionally disabled, prove the
   disabled state and endpoint rejection before classifying its smoke gate as
   `NOT_APPLICABLE`.

Qualification must then cover:

- clean full migration replay, seed, generated types, and schema parity;
- anonymized or synthetic representative data and natural query plans;
- unchanged canonical PR-11 probes and hosted representative workloads;
- all original PR-11 fixed execution, WAL, plan, and semantic gates at their
  original thresholds; hosted product SLOs cannot substitute for them;
- all roles, tenant A/B CRUD negatives, inactive/stale/JWT boundaries;
- Data API exposed-schema/default-privilege/ACL inventory, anon/authenticated
  relation/column allow-and-deny REST direct-role smoke, and independent RLS
  policy results;
- server-only service-role REST/RPC smoke with no credential in browser bundles,
  client responses, logs, or committed evidence;
- GraphQL direct-role, tenant, column-field visibility, and introspection smoke
  for anon/authenticated/server-only service-role when enabled, or an
  evidence-backed `NOT_APPLICABLE` result when intentionally disabled;
- RLS, ACL, helper, trigger, SQLSTATE/message, cascade, and composite FK;
- all `COMM-DB`, `COMM-TENANT`, `COMM-AUTH`, `COMM-API`, `COMM-BILL`, and
  `COMM-OPS` blocking gates on the exact qualification commit;
- advisor security/performance diff and required CI on the same SHA;
- backup/restore, restored hashes/row counts/tenant isolation, measured RTO/RPO;
- sandboxed external side effects with zero duplication; and
- independent security, migration, evidence, and release audits.

## Abort criteria

Stop without threshold changes or sample exclusion if any of the following
occurs:

- cross-tenant read/write or authorization-boundary regression;
- migration, generated-type, schema, seed, RLS, ACL, helper, trigger, or FK
  drift;
- a frozen latency, timeout, CPU, pool, lock, WAL, or duration gate fails;
- any original canonical PR-11 fixed execution, WAL, plan, or semantic gate
  fails;
- Data API/GraphQL configuration, privilege inventory, or direct-role smoke
  differs from the frozen model;
- a service-role credential appears in a browser bundle, client response, log,
  or committed evidence;
- lock timeout, service error spike, or new critical Advisor finding;
- restore integrity, restored tenant isolation, RTO, or RPO failure; or
- duplicate external side effect.

Any schema remediation is a separate owner-approved append-only forward-fix.
PR-12 preparation does not authorize index removal or a security-regressive
rollback.

## Required owner decisions

Before isolated staging execution, obtain explicit decisions for:

1. isolated staging project creation or use;
2. representative data source and hosted database tier;
3. frozen performance, abort, RTO, and RPO thresholds;
4. staging, restore, monitoring, and incident owners; and
5. external integrations that remain disabled or sandboxed.
6. Data API enabled state, exposed schemas, automatic grants, and the explicit
   relation/column/sequence/function privilege model for all three API roles.
7. GraphQL enabled/disabled intent; a disabled deployment requires an
   evidence-backed `NOT_APPLICABLE` decision.
8. Service-role server-only storage/use boundary and its REST, RPC, and
   conditional GraphQL smoke scope.

Production apply and general commercial release remain separate later
decisions. The existing pilot waiver must remain byte-identical and cannot be
extended by implication.

## Evidence retention

- `dense-phase-a2-environment-20260719-02` is the sanitized initial admission
  packet.
- `dense-phase-a2-environment-20260719-03` is the sanitized approved
  volume-preserving isolation packet.
- Both packets contain no detected high-confidence secret, JWT, user-home path,
  or real email address, but they retain non-secret local container/project
  names, image versions, and host metrics. The product owner reviewed and
  approved those metadata for public repository publication on 2026-07-19.
- Container-identity, destroy-event, and volume-inventory restoration claims are
  recorded as manual observations in the report/closure rather than a dedicated
  machine-replayable raw artifact. The product owner accepted this limitation as
  closure-only `PASS_WITH_RISK` through `2026-08-18T23:59:59+09:00`. This risk
  does not carry into PR-12 isolated staging or release; durable restoration
  evidence must be collected during PR-12 isolated staging before its
  qualification can pass.
- `dense-phase-a2-environment-20260719-01` is a preserved local-only quarantine
  containing unnecessary local identifiers. It is ignored by exact path and
  must not be staged or committed.
- DB reset, volume deletion, staging, production, migration, permanent DDL,
  application API, RLS, ACL, generated-type, and dependency changes are outside
  this preparation scope.

The publication approval authorizes only selective commit/push and the Phase A2
closure PR through Ready after its gates pass. It does not authorize closure PR
merge, a PR-12 branch or Draft PR, isolated staging, production, index
retirement, or general commercial release.
