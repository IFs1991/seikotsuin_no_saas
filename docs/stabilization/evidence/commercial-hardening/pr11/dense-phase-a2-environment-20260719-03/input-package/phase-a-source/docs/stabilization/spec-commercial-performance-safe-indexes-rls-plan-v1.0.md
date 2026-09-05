# Commercial hardening PR-11: performance-safe indexes and RLS plan cleanup

## Status

- Program: `SPEC-COMMERCIAL-HARDENING-MIGRATION-2026-07-11`
- Phase: PR-11
- Base: PR-10 head `978a01a47c3c57126680d91b41c116180e60d129`
- Repository implementation: owner-approved append-only forward-fix authored
  and persistently applied to the local database; the remaining fixed local
  wall-clock failure is accepted only as pilot `PASS_WITH_RISK`
- Local migration apply: all three PR-11 migrations completed with explicit
  operator approval using CLI `2.109.0`; the post-apply paired run verified the
  permanent head `20260718011731`
- Staging/production apply: excluded; PR-12 and human approval required

## Objective

Reduce reviewed foreign-key and RLS planner overhead without changing tenant,
role, billing, or patient-data authorization semantics. Index removal is out of
scope. The implementation must prefer measured access paths over clearing an
Advisor count, and every unresolved warning must be an explicit exception.

## Frozen before state

The PR-10 local database has:

- 91 `unindexed_foreign_keys` findings;
- 0 `auth_rls_initplan` findings;
- 18 expanded `multiple_permissive_policies` groups;
- 172 `unused_index` observations; and
- 179 `public` policies, all explicitly `TO authenticated`.

The linked database was queried read-only and is behind the repository
migration head. It is not a rollout target for this PR. No hosted schema,
policy, Auth setting, or data was changed.

## FK index decision

The 91 findings divide into:

| Classification               | Count | PR-11 decision                               |
| ---------------------------- | ----: | -------------------------------------------- |
| active/service (`A`/`B`)     |    44 | 41 new indexes and 3 reviewed existing paths |
| legacy quarantine (`E`)      |    12 | no DDL; retain quarantine                    |
| unknown / block-unclassified |    35 | no DDL until classification owner decision   |

All 44 active/service constraints are validated `MATCH SIMPLE` foreign keys.
Thirty-seven include a nullable child column. Three nullable/active constraints
already have useful paths or are covered by the existing-path decision, leaving
36 partial and 5 full indexes to create.

### New indexes

- Five all-`NOT NULL` foreign keys receive full B-tree indexes in exact FK key
  order.
- Thirty-six nullable foreign keys receive exact-order B-tree indexes with
  `WHERE <all FK columns> IS NOT NULL`.
- The partial predicate contains every row that PostgreSQL must inspect for a
  `MATCH SIMPLE` FK lookup while avoiding entries for exempt null keys.
- No index uses expressions, `INCLUDE`, or a predicate not recorded in the
  decision matrix.

The exact decision registry contains 44 rows: 41 index actions and three
reviewed existing paths. It is stored at
`docs/stabilization/evidence/commercial-hardening/pr11/fk-index-decision-matrix.csv`.
The exact 50-row residual registry (three reviewed active paths, twelve legacy
constraints, and thirty-five unclassified constraints) records constraint
identity, owner, review gate, and reason at
`docs/stabilization/evidence/commercial-hardening/pr11/fk-residual-exception-matrix.csv`.

### Reviewed existing paths

1. `patient_outreach_recipients_customer_clinic_fkey` uses
   `patient_outreach_recipients_customer_idx (clinic_id, customer_id,
created_at DESC)`. Equality on both FK columns is set-equivalent despite
   reverse order.
2. `patient_outreach_recipients_campaign_clinic_fkey` uses
   `patient_outreach_recipients_campaign_idx (campaign_id, created_at)`.
   `patient_outreach_campaigns.id` is globally unique, so `campaign_id`
   determines `clinic_id` and the trailing FK key adds no selectivity.
3. `reservations_campaign_clinic_fkey` uses the partial
   `reservations_campaign_id_idx (campaign_id) WHERE campaign_id IS NOT NULL`.
   The same global campaign identity rule applies and the predicate covers all
   FK-relevant rows.

Forced eligibility plans must continue to show the named Index/Bitmap Index
paths. These plans prove eligibility, not production latency.

### Ordinary versus concurrent build

The forward migration is transactional and uses ordinary `CREATE INDEX` only
when every target relation remains at or below 64 MiB. It aborts on larger
relations, long-running transactions, a five-second lock timeout, catalog
drift, or an existing equivalent index. This bound is intentionally far above
the current pilot snapshot while remaining a fail-closed signal that the
transactional path is no longer appropriate.

`CREATE INDEX CONCURRENTLY` is not substituted automatically because it cannot
run inside this transaction and requires invalid-index cleanup and a separate
operator-reviewed rollout. PR-12 must refresh table size, `pg_stats.null_frac`,
write rate, and lock-window evidence before any hosted apply.

## RLS plan decision

Only the following classified policies have a proven meaning-preserving
transformation:

- `customer_insurance_coverages_write_for_clinic_pricing_admin`;
- `menu_billing_profiles_write_for_clinic_pricing_admin`.

For each table, the existing broader staff `SELECT` policy remains byte-for-
byte unchanged. The narrower `ALL` write policy is replaced by:

- `INSERT`: original `WITH CHECK` only;
- `UPDATE`: original `USING` and `WITH CHECK`;
- `DELETE`: original `USING` only.

Every new policy is permissive, explicitly `TO authenticated`, and has a
`PR-11:` actor/intent comment. The migration snapshots all 177 unrelated
policies and refuses to commit if any name, command, role, expression, mode, or
comment changes. Policy count moves from 179 to 183 and expanded duplicate
groups from 18 to 16.

`calendar_feed_tokens_write_admin_only` remains unchanged because the current
global-admin write reach depends on the unresolved owner decision about global
admin clinic access. `menus` retains its intentional manager/staff role split.
All other residual groups are unclassified or need dedicated authorization
TDD. The decision registry has 18 rows: two resolved groups and sixteen retained
exceptions. It is stored at
`docs/stabilization/evidence/commercial-hardening/pr11/rls-policy-decision-matrix.csv`.
The exact 16-row after-state registry, including role, action, ordered policy
names, predicate-component hashes, owner, review gate, and reason, is
`docs/stabilization/evidence/commercial-hardening/pr11/rls-residual-exception-matrix.csv`.

The current `auth_rls_initplan` count is already zero. PR-11 adds no auth call
and changes no unaffected expression; zero must remain the after-state.

## Unused indexes

All existing indexes are retained. Local scan counts and low-traffic pilot
statistics are observation-only and are not removal evidence. Any future
`DROP INDEX` requires a separate PR, workload window, rollback plan, and human
approval.

## Fail-closed migration contract

### Index migration

- Verify exact FK definition hashes (child/parent relations, ordered columns,
  MATCH mode, ON UPDATE/DELETE action, and SET NULL column list), validation
  state, and reviewed nullability.
- Reject target-name collisions and pre-existing equivalent ordered paths.
- Abort above the 64 MiB per-relation ordinary-build limit or when a client
  transaction has been open for more than five minutes.
- Create exactly 36 partial and 5 full valid/ready/live plain B-tree indexes.
- Validate all three existing paths and the globally unique parent ID premise.
- Prove no RLS flag, relation ACL, policy, or constraint drift.

### RLS migration

- Require the exact two source `ALL` predicate hashes and exact two retained
  `SELECT` hashes.
- Require the 179-policy and 18-expanded-group before state.
- Reject all new-policy name collisions and disabled RLS.
- Compare every unrelated policy before and after.
- Require exact component equality between retired and split predicates,
  exact comments, 183 policies, and 16 residual groups.

## RED contract

- `RED COMM-PERF-001` requires the exact 41-index/full-partial contract, the
  three reviewed paths, and the exact identity set of all 50 residuals.
- `RED COMM-PERF-002` requires the exact split-policy component relationships,
  comments, retained reads/exceptions, 183 policies, and the exact names and
  predicate-component hashes of all 16 residual groups.
- Both contracts fail on the PR-10 database before either migration exists.

## Performance measurement contract

`scripts/commercial-hardening/sql/pr11-performance-probe.sql` creates synthetic
fixtures inside `BEGIN`/`ROLLBACK` and captures identical before/after
`EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING OFF, FORMAT JSON)` plans.

The predeclared local thresholds are:

- selective read: after execution time must not exceed before median by more
  than the greater of 10% or 1 ms, and the new partial index must be used;
- sparse 10,000-row insert (both nullable audit FKs null): after median must
  not exceed before by more than the greater of 15% or 25 ms, and WAL bytes
  must not increase by more than 5%;
- dense 10,000-row insert (one nullable FK populated): after median must not
  exceed before by more than the greater of 25% or 50 ms, and WAL bytes must
  not increase by more than 25%.
- `shift_requests` 2,000-row full-only case: after median must not exceed the
  greater of 35% or 100 ms, and WAL bytes must not increase by more than 30%.
- `shift_requests` 2,000-row full-plus-partial case: after median must not
  exceed the greater of 45% or 125 ms, and WAL bytes must not increase by more
  than 40%.
- `patient_outreach_recipients` 1,000-row sparse composite case: after median
  must not exceed the greater of 15% or 25 ms, and WAL bytes must not increase
  by more than 5%.
- `patient_outreach_recipients` 1,000-row dense composite case: after median
  must not exceed the greater of 30% or 50 ms, and WAL bytes must not increase
  by more than 25%.

Three runs are used and medians reported. Timing variance, empty production
statistics, and synthetic data prevent extrapolating these values to hosted
traffic; PR-12 repeats the probe on staging-equivalent representative data.

`scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql` separately creates
2,000 rows per affected table inside `BEGIN`/`ROLLBACK`, executes as an
`authenticated` clinic administrator, and captures the policy count, RLS
filter, index path, buffers, planning time, and execution time. Before and after
use the identical fixture and three-run median. The after plan must retain the
broad staff role predicate, omit the retired narrow `ALL` role predicate, keep
`auth_rls_initplan` at zero, and remain within `before * 1.10 + 2 ms`.

## Tests

- Final RED proof on the PR-10 database.
- Static Jest contract for paired migrations, recovery guards, exact target
  registry, responsibility separation, and GREEN phase transition.
- pgTAP catalog checks for full/partial paths, policy components, comments,
  exact residual identities/hashes, authenticated RLS plan filters, and tenant
  A/B behavior.
- Clinic-admin A can read/write A and cannot read/write or re-home into B.
- Manager, therapist, and staff can read A only. A table-driven pgTAP helper
  executes all 36 negative combinations (three roles × two tables × two
  tenants × INSERT/UPDATE/DELETE) and requires every write to be denied.
- The pgTAP transaction grants DML on only these two tables to `authenticated`
  and rolls it back, so these cases isolate RLS predicate semantics while the
  production SELECT-only table ACL and the migration grant set remain unchanged.
- Existing `commercial_rls_tenant_isolation_test.sql` is updated to the exact
  183-policy inventory and explicit `PR-03|PR-11` provenance allowlist.
- The pinned local Supabase Postgres `17.6.1.104` image terminated one backend
  when a `postgres`-created temporary PL/pgSQL helper was reused after
  `SET ROLE authenticated` for nested RLS `EXPLAIN`. Production policies and
  functions were not involved. The pgTAP harness now creates its explicit
  `SECURITY INVOKER` RLS helpers under the same `authenticated` database role
  that executes them. The unchanged standalone psql plan probe and the final
  49/49 pgTAP run independently verify the same filters.
- Advisor, migration history, generated type parity, type checks, lint, Jest,
  security suite, build, and secret scan remain required.

## Local validation outcome

The three migrations, eighteen commercial contracts, three validation-only
recovery guards, and all 437 repository pgTAP assertions pass on the local
database. The authenticated after plans retain one broader staff SELECT policy
per table and remove the retired narrower SELECT-applicable policy. The
post-apply forward-fix probe adds a separate 52/52 pgTAP packet for exact
function, trigger, policy, ACL, index, tenant, and restoration contracts.

The initial canonical local after run did not pass the predeclared execution-
time gates. All write WAL-byte gates and the selective-read gate passed, but
all six write execution medians and both authenticated RLS execution medians
exceeded their fixed limits. Repeated rollback probes had inflated empty-table
indexes; the five zero-row target tables were reindexed locally before that
set, and the timing failures remained. That evidence is retained unchanged.

The operator then approved a local-only paired/rollback comparison without DB
reset or volume deletion. That pre-forward-fix official rerun alternated
BEFORE/AFTER order over three pairs, normalized 17 relations between samples,
verified the exact logical/catalog state after every transaction, captured
host/container and PostgreSQL quiescence telemetry, and ended with identical
physical clean-state hashes. It completed 87/87 steps and 12 samples with no
production touch.

The pre-forward-fix primary result still uses the original frozen limits. Five
of nine execution gates pass. `blocks` sparse (661.338 > 435.7373 ms), `blocks`
dense (805.017 > 521.55125 ms), `customer_insurance_coverages` RLS (105.951 >
66.757 ms), and `menu_billing_profiles` RLS (68.152 > 63.3855 ms) fail. All six
WAL limits, the performance-plan contract, and the RLS-semantic contract pass.
The concurrently measured BEFORE medians are diagnostic only and cannot
replace or recompute the frozen limits. That immutable result remains
`primaryPass=false`; it is historical input to the separately approved forward
migration and pilot-only waiver below.

This stop decision implements master specification section 1.2: tenant/clinic
authorization and validation-only recovery minimize catastrophic and
irreversible risk, while an attractive paired comparison cannot override a
predeclared commercial safety gate. No threshold, failed sample, RLS predicate,
or clinic scope was weakened to obtain a PASS.

## Owner-approved pilot-only performance waiver (2026-07-18)

- Decision ID: `PR11-PERF-WAIVER-2026-07-18`
- Decision status: `PASS_WITH_RISK`
- Blocking: `false` for PR-11 merge eligibility only
- Scope: attended pilot for two to three clinics; bulk import, external bulk
  synchronization, and unattended multi-thousand-row batches remain disabled
- Owner / approver: `product_owner`
- Approved: `2026-07-18`
- Safe-default expiry: `2026-08-18T23:59:59+09:00`
- Measurement status: `primaryPass=false` remains unchanged
- Hard non-waived status: `hardNonWaivedPass=true`
- Merge eligibility: `PASS_WITH_RISK`; general commercial release: `false`

The Node `v24.18.0` forward-fix rehearsal retained the exact frozen probes,
actors, JWTs, fixtures, planner settings, samples, and thresholds. It records
the following four wall-clock failures without renaming any result to PASS:

| Probe                    | Candidate median |  Fixed limit | Measurement |
| ------------------------ | ---------------: | -----------: | ----------- |
| blocks sparse insert 10k |       675.858 ms |  435.7373 ms | FAIL        |
| blocks dense insert 10k  |       904.092 ms | 521.55125 ms | FAIL        |
| coverage insert 2k       |       211.933 ms |   124.709 ms | FAIL        |
| menu profile insert 2k   |       243.075 ms |   135.944 ms | FAIL        |

Those four rehearsal failures define the maximum owner-approved waiver scope.
After persistent local application, the official post-apply paired run produced
the following primary fixed-gate result without changing any canonical input:

| Primary execution probe              |  Median | Fixed limit | Measurement |
| ------------------------------------ | ------: | ----------: | ----------- |
| created-by read 100 of 20k           |   0.047 |       2.851 | PASS        |
| blocks sparse insert 10k             | 429.129 |    435.7373 | PASS        |
| blocks dense insert 10k              | 549.305 |   521.55125 | FAIL        |
| shift full-only insert 2k            | 146.153 |     198.387 | PASS        |
| shift full-plus-partial insert 2k    | 120.435 |     219.224 | PASS        |
| outreach recipient sparse insert 1k  |  20.591 |      46.665 | PASS        |
| outreach recipient dense insert 1k   |  27.794 |      81.761 | PASS        |
| customer insurance coverage RLS read |   2.961 |      66.757 | PASS        |
| menu billing profile RLS read        |   1.212 |     63.3855 | PASS        |

Thus 8/9 primary execution gates pass. Only
`performance.dense_insert_10000` uses the waiver; the three other rehearsal
failures now pass their unchanged limits. All six primary WAL gates pass. The
two auxiliary write gates also pass: coverage is `75.578 <= 124.709 ms` with
`1,205,616 <= 1,220,025` WAL bytes, and menu is `92.011 <= 135.944 ms` with
`1,608,444 <= 1,718,510` WAL bytes.

The following remain hard and non-waivable:

- coverage/menu read gates (`2.961 <= 66.757 ms` and
  `1.212 <= 63.3855 ms`), natural `Index Scan`, no target `Sort`, bitmap/seq
  scan, 250-row stop, and both scalar InitPlans executing once;
- all six primary and two auxiliary WAL limits; the primary medians are
  `8,583,244`, `9,497,580`, `1,697,712`, `1,886,696`, `572,330`, and `723,106`
  bytes, and the auxiliary medians are `1,205,616` and `1,608,444` bytes;
- the exact blocks SQLSTATE, message, diagnostic metadata, insert/update/
  re-home, and resource/clinic cascade contract (15 paired cases, 30 results);
- all 27 current/candidate semantic cases, every reviewed role, tenant A/B,
  inactive/missing authority, and absent/empty/malformed JWT boundaries;
- function/table ACL, RLS/FORCE RLS flags, the 183-policy inventory, existing
  authority helpers, the blocks trigger, and the composite FK;
- all logical/physical restoration hashes, pgTAP, clean replay, and required
  CI jobs.

The pilot UI writes one row per blocks, insurance-coverage, or menu-profile
save. The synthetic 10,000/2,000-row probes therefore remain valuable capacity
signals but do not represent normal attended pilot requests. Residual risk is
DB CPU saturation, connection-pool queueing, timeouts, and index write
amplification if a large write path is introduced. Mitigation is to keep bulk
paths disabled, throttle or disable affected writes on regression, monitor
p95/p99, 5xx, timeouts, DB CPU, pool pressure, and locks, and review at 24 and
72 hours.

The waiver expires and requires the fixed probes to be re-run before the fourth
clinic, bulk enablement, a related DDL/policy/helper change, database-tier
change, a related incident, or the expiry date. It never authorizes staging or
production application, general commercial release, an index drop, or a
threshold/sample/planner change.

The exact implementation is append-only migration
`20260718011731_commercial_pr11_fixed_performance_forward_fix.sql`. It preserves
the existing blocks trigger and composite FK, adds an exact-compatible normal-
path lookup, adds one private statement-stable scope helper whose candidates
are still filtered by `can_access_clinic(uuid)`, alters only the two reviewed
SELECT policies, and adds exactly two plain `(clinic_id, id)` B-trees. Existing
PR-11 migrations and recovery guards remain byte-identical. The new paired
recovery file is validation-only.

Machine-readable owner acceptance is stored in
`docs/stabilization/evidence/commercial-hardening/pr11/pilot-performance-waiver.yaml`.
The immutable rehearsal summary SHA-256 is
`D04E2528263A302B94697F562EEE84DA0EA43A1E20B5C952C6C9059686DEE927`;
the manifest records `primaryPass=false` and `status=gate-fail`.

The first post-apply official attempt stopped fail-closed before any sample or
candidate SQL execution because a canonical write-probe hash and the expected
migration head did not agree. Its five-file `safety-fail` packet is retained.
After correcting those runner inputs, the official run completed 209 steps and
25 samples, with 446 files and 5,274,080 bytes of evidence. It ended
`status=pass-with-risk`, `primaryPass=false`, `hardNonWaivedPass=true`,
`pilotWaiverApplicable=true`, and `generalCommercialReleaseEligible=false`.
The exact logical and normalized physical baselines are respectively
`c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78` and
`94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`.
The immutable official summary and manifest SHA-256 values are
`C9EEC6EF5ACBECAC591206FC9536E85A6CE900214D26E404B64D654680379F41`
and `11F9C8DBEA406823C3F0A06542802C8BB6319AD00D534F30A4F2570DC4B5A285`.

## Rollback / forward-fix

All three paired recovery files are validation-only.

- The index guard never drops an index. On measured regression, throttle the
  affected write path and ship a separately approved forward migration.
- The RLS guard never recreates `ALL` policies. On policy drift, disable the
  affected write path and ship a reviewed forward-fix.
- The original `20260716160402` guard intentionally rejects the new SELECT
  policy hash after this append-only forward-fix. It remains historical proof,
  not an automatic rollback for the new state.
- The `20260718011731` guard validates the exact new functions, policies,
  indexes, ACL/RLS/FK catalog, and data consistency. It never drops an index,
  restores an old policy, changes an ACL, or mutates data.

This avoids restoring broader or ambiguous authorization and respects the
separate approval required for index removal.

## DoD mapping

- DOD-01: local Supabase readiness and exact migration head.
- DOD-02/DOD-04: append-only migrations, exact catalog contracts, bounded
  locks, table-size gate, and paired recovery guards.
- DOD-08: exact RLS semantics and tenant A/B negative tests.
- DOD-10/DOD-11: build, focused/security/full Jest, and pgTAP.
- DOD-12: generated types remain unchanged and parity is verified.

## Residual / release boundary

- 50 FK Advisor findings remain by design and are frozen by child table,
  constraint name, and ordered child-key columns:
  three proven active existing paths, twelve quarantined legacy relations, and
  thirty-five unclassified relations.
- 16 expanded multiple-permissive groups remain with exact role/action/policy
  hashes and owner/reason/review-gate rows.
- Hosted null fractions, write rates, representative latency, maintenance
  window, and global-admin reach remain owner/PR-12 gates.
- No staging, production, Auth configuration, branch-protection, or index-drop
  operation is authorized by PR-11.
