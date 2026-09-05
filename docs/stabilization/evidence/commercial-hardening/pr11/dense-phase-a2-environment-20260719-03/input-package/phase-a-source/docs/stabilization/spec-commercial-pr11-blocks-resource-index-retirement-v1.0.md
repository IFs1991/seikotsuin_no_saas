# Commercial PR-11: `blocks.resource_id` singleton-index retirement

## Status

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-11 fixed-performance follow-up, Phase A (ROLLBACK-only comparison)
- Required repository base: migration head `20260718011731`
- Authorized repository change in this phase: specification, non-mutating
  contracts, and rollback-only comparison harness
- Local database scope: the exact candidate DDL is authorized only inside the
  approved comparison transactions that always end in `ROLLBACK`; permanent
  local apply is not authorized
- Staging/production access or apply: excluded
- Permanent migration and recovery SQL: deliberately not authored

This specification records one bounded candidate for a rollback-only local
comparison. It does not reclassify the immutable PR-11 dense fixed-gate result,
does not extend the pilot waiver, and does not authorize an index drop outside
the comparison transaction.

## Objective and hypothesis boundary

The permanent PR-11 state records
`performance.dense_insert_10000 = 549.305 ms`, above the frozen
`521.55125 ms` limit. The canonical sparse and dense probes both populate a
non-null `resource_id`, so both currently maintain these two full B-trees:

- `public.idx_blocks_resource_id (resource_id)`; and
- `public.blocks_resource_clinic_idx (resource_id, clinic_id)`.

The second index was added by PR-05 for the validated composite tenant FK. Its
leftmost key is `resource_id`, so PostgreSQL can use it for equality conditions
on `resource_id` as well as the full `(resource_id, clinic_id)` key. This follows
the PostgreSQL multicolumn-index leftmost-column rule. The official PR-11
physical evidence records both indexes at 147,456 bytes after the 20,000-row
probe, and records the singleton definition unchanged throughout the run.

Those facts justify a measured candidate, not a performance conclusion. The
fixed thresholds, canonical probe, fixture, actor, JWT, sample set, planner
settings, and historical FAIL remain immutable. In particular,
`blocks_created_by_idx` and every FK/trigger are outside this candidate.

Reference: [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html).

## Frozen current and candidate catalog

### Current singleton preflight

Before entering the candidate state, the comparison harness must require
exactly one object named `public.idx_blocks_resource_id` and prove that it is:

- a valid, ready, live, non-unique, non-primary, plain full B-tree on exactly
  `public.blocks(resource_id)`;
- free of expressions, a predicate, `INCLUDE` columns, and constraint backing;
- definition MD5 `7a4092df4bfffa0e82d7936ba6384362`; and
- not depended on as `pg_constraint.conindid`.

Any name collision, invalid index, definition drift, or constraint backing is a
hard stop. It must not be converted into an `IF EXISTS` success.

### Only authorized transaction candidate

The candidate DDL is exactly:

```sql
drop index public.idx_blocks_resource_id;
```

It may run only after the preflight and baseline snapshots, inside one local
transaction that ends in `ROLLBACK`. `IF EXISTS`, `CASCADE`, `CONCURRENTLY`, a
renamed replacement, an equivalent one-column index, and any second DDL change
are forbidden. The contract file itself is validation-only and contains no
`DROP`, `CREATE`, `ALTER`, data mutation, grant, or revoke statement.

### Exact GREEN catalog

`RED COMM-PERF-005` intentionally fails on the current database because the
singleton is present. After the exact transaction-only drop, it may become
GREEN only when all of the following are true:

1. `public.blocks` has exactly the ten expected remaining indexes. Every name,
   `pg_get_indexdef` MD5, access method, uniqueness/primary flag,
   valid/ready/live state, predicate/expression shape, and intent comment must
   match. No renamed or structurally equivalent singleton is accepted.
2. `blocks_resource_clinic_idx` remains the exact full, plain, non-unique B-tree
   `(resource_id, clinic_id)`, definition MD5
   `9901fe5e728a0fe29c3ca32c6759b736`.
3. `blocks_resource_id_fkey` remains the validated, immediate `MATCH SIMPLE`
   `(resource_id, clinic_id) -> resources(id, clinic_id)` FK with `ON UPDATE NO
ACTION`, `ON DELETE CASCADE`, and definition MD5
   `a3e490b595d9cf3153c16f482e053df3`.
4. `resources_id_clinic_unique` remains validated with definition MD5
   `6c2d9cf01a89532d7a688b7d4a43b242`, and both child columns remain `NOT NULL`.
5. `blocks_clinic_ref_check` remains enabled and bound to the unchanged
   `public.validate_blocks_clinic_refs()` function. Their definition MD5 values
   remain `39c16618a7c772d6b9ecd1a541d0c2a5` and
   `fe160976fe22dac01208d155ebf16984` respectively.
6. The exact post-PR11 catalog hashes for the 17 normalized relations remain:
   columns `3019ca607039201b5c8f73aad280424d`, helpers
   `bbcc63179bc72b3cada981ebfc158553`, policies
   `cf8d035d1b3ad5c1834b45794d5f1574`, triggers
   `bf45366a67070170d788938279dc36e8`, constraints
   `23922d2c0ddc8c7a0df144df722c43ca`, and relation security/ACL
   `fc66b0426f2e950d2b5e9b3189466177`. The exact `public.blocks` table ACL MD5
   remains `0b0844aa406026a93c399db93c0307eb`.
7. The migration inventory remains 61 rows at head `20260718011731`, with
   inventory hash `b3c029146da59fb99daee65de36e9657`.

The official post-apply packet also freezes the complete logical baseline
SHA-256 as `c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78`
and the normalized physical baseline SHA-256 as
`94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`.
The candidate catalog is expected to differ only while the singleton is absent;
after every `ROLLBACK`, both complete baseline hashes must be restored exactly.

The index-catalog hash is intentionally not compared with the old all-index
hash while inside the candidate transaction: the single authorized removal is
the experiment variable. Instead, the contract compares the complete exact
`public.blocks` candidate index set bidirectionally. Every other catalog class
is held byte-for-byte equivalent by the frozen hashes above.

## Security and behavior invariants

Retiring the redundant access path must not change referential enforcement or
the product-visible error contract. The comparison must preserve all existing
PR-11 checks, including:

- the same-clinic, cross-clinic, missing-resource, null-resource, and
  null-clinic insert/update/re-home cases;
- resource-delete and clinic-delete cascades;
- exact SQLSTATE, message, constraint/schema/table/column diagnostics;
- the catalog and behavior represented by the existing 27 RLS semantic cases,
  every reviewed role, tenant A/B isolation, inactive/missing authority, and
  absent/empty/malformed JWT boundaries, proven unchanged in Phase A by the
  official logical/security hashes (the cases are rerun in Phase B before any
  permanent proposal);
- `postgres` ownership, `SECURITY INVOKER`, search path, function/table ACL,
  table RLS/FORCE RLS flags, and the 183-policy inventory; and
- every unrelated policy, authority helper, trigger, constraint, index, and
  data row.

The composite FK is mandatory. The candidate must never weaken clinic scope,
RLS, grants, or fail-closed authorization to recover performance.

## Rollback-only local comparison

The comparison requires Node 24 and Supabase CLI `2.109.0`, uses a new evidence
directory, and never modifies historical evidence. It is local only: no
staging/production connection, database reset, Docker volume deletion, or
fixture/probe rewrite is permitted.

Run three alternating pairs in the frozen order `current/candidate`,
`candidate/current`, `current/candidate`. Each sample must use the unchanged
canonical probe and must capture its raw JSON plan and WAL data. Before and
after every sample, compare the 17-relation logical, catalog, data, ACL, RLS,
and normalized physical hashes. Every candidate transaction must `ROLLBACK`,
and its postflight must prove that `idx_blocks_resource_id` is restored with
its original definition and that the complete baseline hashes match.

The unchanged primary hard gates are:

| Probe                                   |  Execution median |        WAL bytes |
| --------------------------------------- | ----------------: | ---------------: |
| created-by read 100 of 20,000           |     `<= 2.851 ms` |              n/a |
| sparse `blocks` insert 10,000           |  `<= 435.7373 ms` | `<= 9,292,168.2` |
| dense `blocks` insert 10,000            | `<= 521.55125 ms` |  `<= 11,133,665` |
| full shift insert 2,000                 |   `<= 198.387 ms` | `<= 1,868,505.6` |
| full + partial shift insert 2,000       |   `<= 219.224 ms` | `<= 2,028,773.6` |
| sparse recipient composite insert 1,000 |    `<= 46.665 ms` |   `<= 600,946.5` |
| dense recipient composite insert 1,000  |    `<= 81.761 ms` |     `<= 755,065` |

For both sparse and dense `blocks` probes, the candidate median must be
strictly lower than current, the candidate must be faster in at least two of
three paired samples, and candidate WAL records and bytes must be no greater
than current in every pair. All six samples are included.

The separate 20,000-row natural-plan fixture must prove that candidate
resource-only and resource-plus-clinic reads use
`blocks_resource_clinic_idx`, that the active/time path uses
`idx_blocks_resource_time` or the composite index, that returned row counts
match, and that no target `Seq Scan` occurs. The three-pair 10,000-child cascade
gate requires candidate execution to be no more than current median plus
`max(25%, 50 ms)`, candidate WAL to be no more than current median plus 25%,
no lock timeout, and complete deletion of all child rows.

No sample may be excluded, no planner GUC may be forced, and no threshold may
be recalculated. The SQLSTATE/message/cascade contract and every restoration
hash are also hard gates. One failure stops the experiment; it does not permit
another candidate or a permanent migration.

## Immutable PR-11 artifacts

Phase A must leave all applied PR-11 migrations and validation-only recovery
guards byte-identical:

- `20260716160342_commercial_performance_safe_fk_indexes.sql` and recovery SQL;
- `20260716160402_commercial_rls_plan_cleanup.sql` and recovery SQL; and
- `20260718011731_commercial_pr11_fixed_performance_forward_fix.sql` and
  recovery SQL.

The root PR-11 evidence files, the four completed evidence packets, and
`pilot-performance-waiver.yaml` are immutable inputs. The waiver continues to
record `primary_measurement_pass: false`; a related permanent DDL change would
trigger its expiry condition and therefore cannot inherit `PASS_WITH_RISK`.

The static contract freezes the exact SHA-256 values of those migrations,
recovery guards, evidence files, evidence packets, and waiver. New comparison
outputs must be written to a new sibling directory and must not alter an old
packet.

## Stop and future authorization boundary

Phase A ends only after the current-state RED, transaction-candidate GREEN,
all six canonical samples, natural plans, three-pair cascade comparison,
15-case compatibility harness, and every restoration hash have been recorded
in a new evidence directory. Any failure is preserved and stops the work. A
PASS also stops after reporting the raw measurements, paired deltas, WAL,
plans, hashes, and exact candidate DDL.

Phase A does not add or apply a permanent migration, add recovery SQL, commit,
push, or open a pull request. A later permanent implementation requires a
second explicit owner approval, must be an append-only forward migration after
`20260718011731`, must ship a validation-only recovery guard, and must obtain
fresh approval before local apply. Automatic index recreation and destructive
rollback remain unauthorized.

## DoD mapping

- DOD-01: exact local migration head and pinned toolchain preflight.
- DOD-02/DOD-04: bounded single-variable DDL, fail-closed catalog contract,
  rollback restoration, and append-only future boundary.
- DOD-08: unchanged RLS, role, clinic-scope, FK, and tenant-negative behavior.
- DOD-10/DOD-11: static RED-contract review now; full pgTAP/Jest/security and
  fixed performance gates before any permanent proposal.
- DOD-12: no application interface or generated-type change.
