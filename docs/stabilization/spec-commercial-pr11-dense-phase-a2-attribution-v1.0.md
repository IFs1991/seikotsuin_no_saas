# Commercial PR-11 dense fixed-gate Phase A2 attribution

## Status and authority boundary

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-11 dense fixed-performance follow-up, Phase A2
- Repository base: `aaf3837f6f8053b0379a2d4caea65880952ce027`
- Local database head: `20260718011731`
- PostgreSQL identity: version `170006`, system identifier
  `7662783869098430503`
- Toolchain: Node 24, Supabase CLI `2.109.0`, PostgreSQL client 17
- Authorized now: read-only evidence packaging, environment validity checks,
  and the previously approved local ROLLBACK-only comparison after validity
- Not authorized: permanent DDL, migration creation or apply, database reset,
  Docker volume deletion, staging/production access, commit, push, or PR

Phase A2 does not rewrite the Phase A `FAIL`. Its purpose is to distinguish
candidate behavior under an uncommitted DDL transaction from steady-state
index absence, and to prevent host/session interference from being mislabeled
as a candidate effect.

## Input findings

The protected inputs are:

- `pr11_phase_a_investigation_team_handoff.md`;
- `report-pr11-dense-insert-gate-fail-root-cause-v0.1-20260718.md`;
- the complete `resource-index-drop-rollback-phase-a-20260719-03` packet;
- the Phase A manifest, summary, frozen gates, and audit addenda; and
- every source file named by the Phase A manifest's `inputHashes` map.

The following classifications are immutable inputs:

```text
RELEASE_DECISION: FAIL_STOP
CANDIDATE_UNDER_PHASE_A_PROTOCOL: REJECTED
STEADY_STATE_CAUSAL_EFFECT: NOT_PROVEN
PHASE_A_WALL_CLOCK_CAUSAL_VALIDITY: INCONCLUSIVE
```

Phase A proved that the singleton-index retirement did not pass that protocol.
It did not prove that a committed, reconnected, steady-state index absence is
slower. The candidate reduced sparse/dense WAL records, WAL bytes, and shared
buffer hits while unrelated negative controls became slower by similar or
larger wall-clock factors. The existing cascade WAL value is `NOT_PROVEN`.

## D0 — self-contained evidence

Before any Phase A2 candidate execution, create a new immutable packet that:

1. copies the two investigation reports and original Phase A ZIP;
2. reads the original Phase A `manifest.json` and copies every repository file
   in its `inputHashes` map while preserving repository-relative paths;
3. recomputes each source SHA-256 and rejects any mismatch;
4. copies the Phase A manifest, summary, frozen gates, and audit addenda;
5. writes a package manifest containing the SHA-256 of every copied file; and
6. never edits or replaces an old packet.

The package is evidence only. It does not make the old Phase A generated
summary's cascade `walPass=true` valid; the audit addendum remains authoritative.

## D1 — environment validity before database timing

Five one-second host samples and one Docker/DB inventory are captured before
any timing query. The following admission gates are frozen before collection.

| Gate                    | Required value                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| AC power                | every sample online                                                       |
| Battery discharge       | zero samples                                                              |
| Available memory        | every sample at least 4 GiB and 25% of physical RAM                       |
| CPU utility             | every sample at most 10%                                                  |
| CPU performance         | every sample at least 90%; frequency coefficient of variation at most 10% |
| Other Docker projects   | zero running containers outside the target project                        |
| Restarting containers   | zero                                                                      |
| Target DB container CPU | every sample at most 2%                                                   |
| Docker block I/O        | no increase during the five-second admission window                       |
| Target DB health        | running, healthy, not restarting, not OOM-killed, not dead                |
| Commit usage            | every sample at most 80%                                                  |
| Hard paging             | `PagesInputPersec=0` and `PageReadsPersec=0` in every sample              |
| DPC/interrupt           | each at most 5% in every sample                                           |
| Database clients        | zero other active, blocked, or idle-in-transaction clients                |
| Maintenance             | zero VACUUM and CREATE INDEX progress rows                                |
| Background DB work      | no checkpointer or WAL counter increase across admission                  |
| DB identity             | exact database, version, system identifier, and migration head            |
| Singleton state         | exact `public.idx_blocks_resource_id` present                             |
| Canonical probe         | SHA-256 `5e6ae3af...49c756c3cb65`                                         |

The active Windows power-plan GUID must remain the official Balanced GUID
`381b4222-f694-41f0-9685-ff5bb260df2e`; Phase A2 does not create or switch to a
new power plan. Processor-performance counters, commit usage, page faults,
pages input, Docker memory/block I/O, PostgreSQL GUCs,
checkpointer counters, and WAL counters are evidence fields. They are not used
post hoc to rescue an invalid run.

If any hard gate fails:

- result is `ENVIRONMENT_INVALID`;
- candidate DDL execution count must remain zero;
- D2, canonical current A/A, and all four arms are `NOT_RUN`;
- candidate effect remains `NOT_PROVEN`; and
- no threshold, sample, or fixture may be changed.

This is not a candidate `FAIL`. It states that the host cannot support a valid
wall-clock attribution experiment at that time.

## D1b — current A/A validity after host admission

Only after all D1 host/DB gates pass, execute six byte-identical current
canonical samples as three sham pairs in order
`A1/B1`, `B2/A2`, `A3/B3`. A and B are both the unchanged current state.

- The canonical probe, fixture, actor, JWT, GUC, fixed thresholds, and all
  samples remain unchanged.
- A and B must each satisfy all seven current execution medians and six current
  WAL medians against the existing fixed gates.
- The four unrelated write probes are negative controls. Within every pair and
  between the A/B medians, the slower/faster ratio must be at most `1.25`.
- All six samples are included.
- Each sample must restore the official logical and normalized physical hashes.

Failure is `ENVIRONMENT_INVALID`, not candidate `FAIL`. D2 remains `NOT_RUN`.

## D2 — four-arm diagnostic after validity

D2 is diagnostic attribution and does not replace the unchanged canonical
release gate. Run at row counts 100, 1,000, and 10,000 using the same synthetic
identities and data shape. The byte-identical canonical measurements remain in
D1b and are separate from the parameterized diagnostic probe.

All four diagnostic arms use a fresh `psql` backend and the same caller-owned
outer transaction. The diagnostic SQL is derived from the canonical probe by
removing only its transaction ownership and parameterizing the sparse/dense
`generate_series` upper bound. This avoids comparing a self-owned transaction
with an already-open transaction.

The four arms are:

1. `CURRENT`: outer transaction, no DDL or explicit table lock; singleton
   exists.
2. `LOCK_ONLY`: an outer transaction holds `ACCESS EXCLUSIVE` on
   `public.blocks`; singleton exists.
3. `DROP_ROLLBACK_TO_SAVEPOINT`: outer transaction creates a savepoint, drops
   the singleton, rolls back to the savepoint, proves the original singleton
   OID/definition and lock state restored, then runs the diagnostic probe.
4. `DROP_UNCOMMITTED`: outer transaction drops the singleton and retains the
   uncommitted catalog change and lock while running the diagnostic probe.

The order is frozen before the first run and balanced across repetitions. Each
of the four states runs three times at each of the three row counts: 36 samples
total. `DROP_ROLLBACK_TO_SAVEPOINT` and `DROP_UNCOMMITTED` each execute the
exact DDL nine times, so the expected candidate DDL count is 18. All samples
are accepted. Every arm ends in full `ROLLBACK`. Before/after logical,
catalog, ACL, RLS, data, and normalized physical hashes must match.

The comparison separates:

- current steady transaction behavior;
- outer transaction plus lock behavior;
- DDL/relcache/plan invalidation residue after savepoint rollback; and
- uncommitted index absence plus retained DDL lock.

It does not prove committed steady-state behavior. That classification remains
`NOT_PROVEN` until D3.

## D4 — diagnostic-only attribution telemetry

The unchanged canonical gate retains `TIMING OFF`. Separate diagnostic samples
may use `TIMING ON` and session-local `auto_explain` only to attribute cost.
They are never substituted for canonical execution values.

Capture:

- total execution, Planning Time, root BUFFERS/WAL, and trigger Time/Calls;
- `blocks_clinic_ref_check`, created/deleted-by RI, clinic RI, and composite
  resource RI trigger entries;
- before/after `pg_stat_user_indexes` and `pg_statio_user_indexes` deltas;
- checkpointer, WAL, and relevant `pg_stat_io` deltas;
- process CPU time, host CPU/load/performance, available memory, paging, and
  Docker CPU/memory/block I/O around every sample; and
- exact probe start/end timestamps and session/transaction metadata.

Telemetry overhead makes these diagnostic values unsuitable as release-gate
measurements.

## Cascade WAL correction

The root `resources` ModifyTable node's 84 WAL bytes exclude child deletes
performed by the RI AFTER trigger. Phase A2 must not report them as cascade
WAL.

For an isolated sample with no concurrent writers:

1. create the 10,000-child fixture;
2. record `pg_current_wal_insert_lsn()` immediately before parent deletion;
3. delete the parent and prove all 10,000 children were removed;
4. record the insert LSN immediately after deletion;
5. compute `pg_wal_lsn_diff(after_lsn, before_lsn)`; and
6. record `pg_stat_wal` before/after as corroboration.

Any concurrent writer, maintenance progress, lock timeout, or missing child
count invalidates the sample. LSN delta is server-global, so quiescence is a
hard prerequisite.

## D3 — isolated committed A/B authorization boundary

D3 requires two clean-replay local Supabase stacks on distinct project IDs,
ports, networks, containers, and newly created volumes:

- A: exact current schema;
- B: one-off local-only committed singleton drop followed by reconnect.

The stacks must run sequentially, not simultaneously, to avoid competing for
the same laptop CPU/RAM. A/B order is balanced, and 7–9 samples are used. The
existing local database is never reset or changed.

Starting these stacks, committing the one-off schema state, and later deleting
their containers/volumes are outside the current ROLLBACK-only authority and
require separate explicit owner approval. D3 is therefore designed here but
not executed automatically.

## Classification model

The final result uses distinct fields:

```yaml
release_decision: FAIL_STOP | ELIGIBLE_FOR_NEXT_GATE
environment_validity: PASS | ENVIRONMENT_INVALID
candidate_under_phase_a_protocol: REJECTED
rollback_only_attribution: PASS | FAIL | NOT_RUN | NOT_PROVEN
steady_state_causal_effect: PASS | FAIL | NOT_PROVEN
cascade_wal: PASS | FAIL | NOT_PROVEN | NOT_RUN
next_action: string
```

`PASS`, `FAIL`, `ENVIRONMENT_INVALID`, and `NOT_PROVEN` are never aliases.

## Security and repository invariants

- RLS, clinic scope, policies, authorization helpers, GRANTs, ACLs, FK,
  triggers, SQLSTATE/message contracts, generated types, dependencies, and
  application interfaces are unchanged.
- Applied PR-11 migrations, recovery guards, waiver, and old evidence remain
  byte-identical.
- No source or evidence file may contain a credential, production identifier,
  patient record, or real contact detail.
- Docker collection is allowlist-only. Raw labels, environment, engine/container
  UUIDs, bind-mount paths, vendor contacts, health logs, process IDs, and local
  user paths are not collected. Host collection omits battery/device names.
- Candidate SQL execution is forbidden before D1 and D1b pass.
- Any safety or restoration failure stops the run without another candidate.

## DoD mapping

- DOD-01/DOD-04: exact base, migration head, immutable source bundle, and
  rollback restoration.
- DOD-08: security/catalog hashes remain unchanged and fail closed.
- DOD-10/DOD-11: invalid environments stop before performance attribution.
- DOD-12: no application, generated type, dependency, or public API change.
