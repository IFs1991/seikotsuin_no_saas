# PR-11 dense fixed-gate Phase A2 environment-validity report

## Decision

```yaml
release_decision: FAIL_STOP
environment_validity: ENVIRONMENT_INVALID
phase_a_original_result: FAIL
candidate_under_phase_a_protocol: REJECTED
steady_state_index_effect: NOT_PROVEN
d1_current_a_a: NOT_RUN
d2_four_arm: NOT_RUN
d3_committed_a_b: NOT_AUTHORIZED
candidate_sql_execution_count: 0
permanent_ddl_applied: false
next_action: STABILIZE_HOST_THEN_RERUN_D1
```

Phase A2 correctly stopped at environment admission. This is not a new candidate
performance failure. The current host cannot support a causal wall-clock
comparison, so no candidate SQL or canonical timing sample was executed.

## Protected inputs and implementation

The investigation used the supplied
`pr11_phase_a_investigation_team_handoff.md`, the existing root-cause report,
and the complete Phase A `resource-index-drop-rollback-phase-a-20260719-03`
packet as immutable inputs.

Phase A2 adds only the following investigation surfaces:

- `spec-commercial-pr11-dense-phase-a2-attribution-v1.0.md`;
- `collect-pr11-phase-a2-host-telemetry.ps1`;
- `pr11-phase-a2-environment-preflight.sql`;
- `run-pr11-dense-phase-a2-environment.mjs`; and
- `commercial-pr11-dense-phase-a2-environment-contract.test.ts`.

There is no migration, recovery SQL, application change, generated-type change,
dependency change, or permanent DDL.

## D0 evidence-integrity result

Evidence directory:

`docs/stabilization/evidence/commercial-hardening/pr11/dense-phase-a2-environment-20260719-02`

The self-contained package contains all 24 files named by the Phase A
`inputHashes` map plus the protected reports, Phase A evidence records, original
ZIP, and Phase A2 sources. Its package manifest covers 37 files. Independent
recomputation found 37 files, zero missing entries, zero byte-count mismatches,
and zero SHA-256 mismatches. The frozen Phase A input-bundle hash is
`be8b451ab71c29573e21a3e4d4736943d419a607f25d93331226c0ceb3336a68`.

The first local attempt (`-01`) is quarantined and is not a commit candidate. It
correctly stopped with candidate count zero, but its raw Docker/host collection
included unnecessary local identifiers and its YAML used a non-canonical field
name. It was preserved rather than overwritten. `-02` allowlists telemetry
fields, emits the exact classification schema, and pins both result JSON and
YAML in the manifest.

The run fixed Node 24, Supabase CLI `2.109.0`, the exact CLI/archive hashes,
PostgreSQL `170006`, system identifier `7662783869098430503`, migration head
`20260718011731`, canonical-probe hash, and both official state hashes before
admission.

## D1 observations

The authoritative admission window ran from `2026-07-19T00:22:42.291166Z` to
`2026-07-19T00:23:18.146123Z`.

| Observation               | Frozen requirement           | Actual                                           | Result |
| ------------------------- | ---------------------------- | ------------------------------------------------ | ------ |
| AC power                  | online in all 5 samples      | online/not discharging in all 5                  | PASS   |
| Power plan                | exact Balanced GUID          | `381b4222-f694-41f0-9685-ff5bb260df2e`           | PASS   |
| Available RAM             | at least 4 GiB and 25%       | 1.78–1.90 GiB; 11.35–12.09%                      | FAIL   |
| Commit usage              | at most 80%                  | 86% in all 5                                     | FAIL   |
| CPU utility               | at most 10%                  | 33–128%                                          | FAIL   |
| Hard paging               | zero page input/read         | 3/5 samples; input 83–263/s, reads 11–19/s       | FAIL   |
| Other Docker projects     | zero running                 | 11 HookOps containers running/restarting         | FAIL   |
| Restarting containers     | zero                         | `supabase_vector_hookops` restarting, count 1083 | FAIL   |
| Target DB CPU             | at most 2%                   | 0.07%, 3.91%, 0.07%, 0.08%, 0.08%                | FAIL   |
| Target DB health          | healthy and stable           | healthy, restart 0, no OOM                       | PASS   |
| DB clients/maintenance    | zero                         | zero                                             | PASS   |
| Checkpointer              | no admission-window increase | unchanged                                        | PASS   |
| WAL                       | no admission-window increase | +9 records/+422 bytes                            | FAIL   |
| Logical state             | official baseline            | `c1ab040c…d7a0f78`                               | PASS   |
| Normalized physical state | official baseline            | `94760df8…231f86`                                | PASS   |

Docker Desktop exposes 4 vCPUs and 7.757 GiB to all stacks. The target PR-11
database stayed healthy with no competing client or maintenance progress, but
its CPU crossed the admission limit in one Docker sample. Together with the
host RAM, paging, CPU, co-tenant, restart-loop, and WAL failures, this is a
host/shared-VM admission failure rather than a valid candidate timing window.

## Approved volume-preserving HookOps isolation repeat

After explicit owner approval, the 11 running/restarting HookOps containers
were stopped by exact container name. No container or volume was removed, no
database was reset, and the target PR-11 stack remained running and healthy.
The HookOps database, Kong, and analytics containers recorded exit code 137
after the stop timeout, so restoration explicitly started the database first
and waited for crash recovery to reach `healthy` before starting dependants.
The HookOps volume inventory remained the same four `local` volumes:

- `supabase_config_hookops`;
- `supabase_db_hookops`;
- `supabase_edge_runtime_hookops`; and
- `supabase_storage_hookops`.

The pre-stop and post-restore canonical inventory SHA-256 is
`b1d31b8aded8cd29c04e5706183659ccad82462f19c2c931c5ab097e6e5d6a12`.
The canonical byte stream is the four name-sorted
`Name<TAB>Driver<TAB>Scope` rows joined by LF without a trailing LF. This hash
proves inventory equality, not volume-content equality. All four volumes retain
both the Compose and Supabase project label `hookops`; the database,
edge-runtime, and storage named-volume mount mappings also remain present.

The new evidence directory is:

`docs/stabilization/evidence/commercial-hardening/pr11/dense-phase-a2-environment-20260719-03`

Independent recomputation found all 37 package entries and all 84 stdout/stderr
step streams byte- and SHA-256-identical to their manifests, with zero non-zero
collection-step exits. The result JSON hash is
`bf080640ae06ae30e2cd851ee47f57e343eafcd80ccdf7d0b880b1a0e373a721`;
the result YAML hash is
`e22fe7a41237cf3ce58f13498c6282ef9ec622be4e9ce5dcbda9388863dc7716`.

The isolation admission window ran from `2026-07-19T00:53:01.647137Z` to
`2026-07-19T00:53:46.651008Z`.

| Observation               | Frozen requirement           | Isolated-stack actual                     | Result |
| ------------------------- | ---------------------------- | ----------------------------------------- | ------ |
| AC power                  | online in all 5 samples      | online/not discharging in all 5           | PASS   |
| Power plan                | exact Balanced GUID          | exact GUID                                | PASS   |
| Available RAM             | at least 4 GiB and 25%       | 0.95–1.09 GiB; 6.04–6.94%                 | FAIL   |
| Commit usage              | at most 80%                  | 83–84%                                    | FAIL   |
| CPU utility               | at most 10%                  | 104–114%                                  | FAIL   |
| Hard paging               | zero page input/read         | all 5; input 159–70,679/s, reads 23–5,900 | FAIL   |
| Other Docker projects     | zero running                 | zero                                      | PASS   |
| Restarting containers     | zero                         | zero                                      | PASS   |
| Target DB CPU             | at most 2%                   | 0.07–0.24%                                | PASS   |
| Target DB health          | healthy and stable           | healthy, restart 0, no OOM                | PASS   |
| DB clients/maintenance    | zero                         | zero                                      | PASS   |
| Checkpointer              | no admission-window increase | unchanged                                 | PASS   |
| WAL                       | no admission-window increase | +11 records/+514 bytes                    | FAIL   |
| Logical state             | official baseline            | `c1ab040c…d7a0f78`                        | PASS   |
| Normalized physical state | official baseline            | `94760df8…231f86`                         | PASS   |

Stopping HookOps removed the external-Docker and restart-loop admission
failures and kept target DB CPU below its fixed ceiling. It did not make the
host admissible: memory pressure, CPU saturation, hard paging, and incidental
WAL activity remained. This proves that HookOps was a real co-tenant but that
stopping it alone is insufficient. It does not identify the exact share of the
remaining pressure attributable to the target Docker VM, WSL, operating-system
work, or other user workloads.

The runner again stopped before D1b/D2. Candidate SQL executions remained zero,
no canonical performance sample was run, and the two official state hashes
matched. The HookOps stack was then restored in dependency order: its database
first and healthy, analytics second and healthy, followed by the remaining
previously running services. The edge-runtime container, which had already been
stopped for seven months, was not started. The vector service returned to its
pre-existing restarting/unhealthy condition; its restart counter was reset by
the manual stop/start, so counter equality is not a restoration invariant.

Independent read-only restoration audit found the same container identities for
all 11 restored services and zero Docker destroy events in the surrounding
two-hour window. The target stack's three-volume canonical inventory SHA-256
also matched its pre-stop value,
`0b2700bc97f10e514670e2c795d3e9ecc89efb249c164c0be56594741ab335d1`.
As with the HookOps hash, this is an inventory hash rather than a content-byte
hash.

After restoration, the target database remained healthy with system identifier
`7662783869098430503`, migration head `20260718011731`, singleton OID `18714`,
and singleton-definition MD5 `7a4092df4bfffa0e82d7936ba6384362`.
Independent read-only recomputation again produced one 17-relation logical
snapshot with hash `c1ab040c…d7a0f78` and 172 stable physical records with hash
`94760df8…231f86`.

## What the evidence says about cause

### Proven

1. The Phase A candidate was measured in a different transaction state from
   current. Its uncommitted `DROP INDEX` retained an `ACCESS EXCLUSIVE` lock and
   DDL/relcache/plan-invalidation state until rollback. That protocol is not a
   steady-state committed-index comparison.
2. The Phase A candidate did less database work but took longer in wall-clock
   time. Sparse WAL records fell by about 10,106 and WAL bytes by 0.73 MB
   (about 711 KiB); dense records fell by about 10,110 and bytes by 0.73 MB
   (about 713 KiB).
3. Phase A negative-control writes that do not use the resource singleton also
   became 1.68–3.51 times slower in candidate sessions. This is inconsistent
   with attributing all elapsed-time regression to that index.
4. Phase A started with only 1.50 GiB free RAM. The earlier official fixed-gate
   packet started with 4.18 GiB. The current Phase A2 host remained far below
   the fixed requirement at 1.78–1.90 GiB, with hard paging and high CPU
   utility.
5. The current environment is invalid for causal timing. D1 therefore prevented
   D1b/D2 and preserved the database exactly; candidate execution count is zero.

### Important limitation

Most continuously running HookOps containers show a start time around
`2026-07-18T01:10:46Z`, before both the official packet
(`02:57:42Z`) and Phase A (`16:07:35Z`). Their presence is an uncontrolled
co-tenant and contributes materially to current resource pressure, but presence
alone does not explain why Phase A differed from the earlier official run. The
available-RAM difference is directly recorded; the exact historical CPU,
paging, thermal, and restart-loop contribution was not recorded during Phase A.

Therefore:

- the old Phase A `FAIL` remains valid for that protocol;
- the singleton retirement is not approved by Phase A;
- the singleton's committed steady-state causal effect remains `NOT_PROVEN`;
- the current evidence proves an invalid measurement environment, not the exact
  percentage of the old regression caused by each host process; and
- the structural dense-insert diagnosis involving `blocks_created_by_idx` and
  created-by referential-integrity work remains a separate input finding, not a
  reason to auto-drop either index.

## Required next sequence

1. Keep AC online and the exact Balanced power-plan GUID.
2. Treat the approved `-03` isolation repeat as evidence that stopping HookOps
   alone is insufficient. Do not run D1b/D2 in the present host state.
3. Manually close or suspend enough non-target host workloads to maintain at
   least 4 GiB and 25% available memory, commit usage at most 80%, CPU utility
   at most 10%, and zero hard paging across all five samples. If that cannot be
   achieved without disrupting the target stack, use a dedicated quiet host.
4. With owner approval, stop HookOps again by exact container name immediately
   before measurement, preserve all containers and volumes, and verify that no
   restart-policy recovery occurred.
5. Rerun D1 into a new evidence directory. Do not reuse or overwrite `-01`,
   `-02`, or `-03`.
6. Only after D1 passes, run six byte-identical current/current sham samples
   (D1b). Any instability is `ENVIRONMENT_INVALID`, not candidate `FAIL`.
7. Only after D1b passes, run the approved ROLLBACK-only four-arm D2 protocol.
   All arms must use the same fresh-backend/outer-transaction shape. D2 may
   attribute lock/DDL/uncommitted-index effects but cannot prove committed
   steady state.
8. A clean-replay committed A/B experiment (D3) requires separate explicit
   approval and isolated, sequential local stacks. It is the required causal
   gate before authoring a permanent index-retirement migration.

No threshold recalculation, sample exclusion, planner forcing, trigger change,
policy/RLS change, migration authoring, commit, push, or PR is justified by this
Phase A2 result.

## Requested PR-12 preparation boundary (2026-07-19)

The historical `FAIL_STOP / ENVIRONMENT_INVALID` result above is unchanged.
After this investigation completed, the product owner first requested local
preparation for a possible PR-12 transition with the current merged schema.
That initial request was limited to a reviewable closure candidate and PR-12
branch/spec/runbook planning.

The product owner subsequently made the following publication decisions on
2026-07-19:

- the non-secret local operational metadata in the sanitized `-02` and `-03`
  packets is approved for public repository publication;
- selective commit and push of the Phase A2 evidence and governance files is
  authorized;
- creation of the Phase A2 closure Draft PR is authorized, and it may be marked
  Ready only after the required local checks, independent read-only audits, and
  all eight required CI jobs pass on one head SHA; and
- the missing machine-replayable restoration observation artifact is accepted
  as a closure-only `PASS_WITH_RISK` residual risk through
  `2026-08-18T23:59:59+09:00`. The mitigation is to collect durable restoration
  evidence during PR-12 isolated staging. This acceptance must not be inherited
  by staging qualification or commercial release.

The `-02` and `-03` packets contain no detected high-confidence secret, JWT,
user-home path, or real email address; their four email-shaped values use the
reserved `example.invalid` domain. They do retain non-secret local
container/project names, exact image versions, and host metrics. The product
owner completed and approved that metadata review on 2026-07-19. The recorded
container-identity, destroy-event, and volume-inventory restoration facts are
manual observations without a dedicated machine-replayable raw artifact. That
limitation is accepted only for this closure record under the dated
`PASS_WITH_RISK` decision above; PR-12 isolated staging must replace it with
durable evidence before staging qualification can pass.

The unproven dense performance risk is transferred to a new blocking isolated-
staging qualification in PR-12. `public.idx_blocks_resource_id` remains present;
neither this preparation request nor the existing PR-11 pilot waiver authorizes its
retirement. The quarantined `-01` packet remains local-only, while both sanitized
`-02` and `-03` packets are retained because their before/after environment
observations form one evidence set.

The publication decision does not authorize merge of the Phase A2 closure PR,
creation of a PR-12 branch or Draft PR, isolated-staging execution, PR-12 merge,
production apply, general commercial release, a migration, permanent DDL, DB
reset, or volume deletion. Merge remains a human-only action. Every later
boundary requires its own recorded owner decision and the applicable commercial
gates.

## DoD mapping

- DOD-01/DOD-04: exact repository/database/tool identity and self-contained
  immutable input hashes are recorded.
- DOD-08: logical/catalog/data/ACL/RLS and normalized physical hashes equal the
  official baselines after read-only collection.
- DOD-10/DOD-11: invalid host/runtime conditions stop before performance
  attribution and candidate SQL.
- DOD-12: application interfaces, generated types, dependencies, migrations,
  recovery guards, and security semantics are unchanged.
