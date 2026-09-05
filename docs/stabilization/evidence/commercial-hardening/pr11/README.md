# Commercial hardening PR-11 evidence

## Current status

- PR-10 prerequisite: merged; all required GitHub checks succeeded.
- Base tree: identical to merged PR-10 tree; isolated branch/worktree used.
- Repository implementation: append-only forward-fix authored and persistently
  applied to the local database with explicit owner approval; pilot-only
  `PASS_WITH_RISK` applies to the one remaining fixed wall-clock failure.
- RED proof: both PR-11 contracts reproduced on the PR-10 schema before
  implementation; all eighteen commercial contracts are GREEN after apply.
- Local migration apply: all three PR-11 migrations completed with explicit
  operator approval using the repository-pinned Supabase CLI `2.109.0`; local
  head is `20260718011731`.
- DB verification: full repository pgTAP 437/437 PASS, the post-apply packet is
  52/52 PASS, and all three validation-only recovery guards PASS.
- Operator-approved local paired/rollback comparison: complete. The official
  post-apply fixed gate is 8/9 primary execution PASS and 1/9 FAIL; all six
  primary WAL gates and both auxiliary RLS write execution/WAL gates PASS.
- Independent read-only audits: final security/tenant, migration/performance
  evidence, and waiver/release-boundary audits PASS with no blocking findings.
- Hosted/staging/production mutation: not performed.

## Scope decision

- 91 local unindexed-FK findings were classified.
- 44 active/service constraints were reviewed.
- 41 new indexes: 36 partial nullable-key indexes and 5 full indexes.
- Three proven existing access paths are retained instead of duplicated.
- Twelve legacy and thirty-five unclassified constraints receive no DDL.
- Two meaning-preserving RLS `ALL` splits are implemented as six command
  policies; calendar global-admin and menu role-split semantics are retained.
- All unused indexes are retained.

Exact decisions:

- `fk-index-decision-matrix.csv` (44 decisions: 41 create + 3 existing)
- `fk-residual-exception-matrix.csv` (exact 50 residual constraints with
  owner/review gate/reason)
- `rls-policy-decision-matrix.csv` (18 decisions: 2 resolve + 16 retain)
- `rls-residual-exception-matrix.csv` (exact 16 after groups with ordered policy
  names and predicate-component hashes)
- `advisor-performance-before.json`
- `advisor-performance-after.json`

## RED evidence

Command:

`npm run commercial:red:db`

Result on the PR-10 local schema:

- 14 prior commercial contracts: expected GREEN;
- `10_performance_fk_indexes.sql`: expected RED reproduced;
- `11_performance_rls_plan.sql`: expected RED reproduced;
- aggregate result: all 16 phase expectations matched.

The final index RED checks full/partial predicates, exact FK definitions/order,
index validity, comments, existing paths, and the bidirectional exact residual
set. The final RLS RED checks component equality, roles, commands, comments,
retained policies, policy count, and the exact residual role/action/policy-hash
set. Counts alone are not acceptance evidence.

## Performance before evidence

The canonical transaction-rolled-back synthetic probe ran three times. The
selective read used a sequential scan with a 1.851 ms median. Single-column
partial, full-plus-partial, and composite-partial write samples plus the forced
eligibility plans for all three retained paths are recorded in:

- `representative-query-plans.md`
- `write-amplification.md`

The authenticated RLS probe also ran three times before migration with 2,000
rows per affected table and transaction rollback. Both plans contained the
redundant narrow `ALL` role predicate plus the broader staff predicate, with
two SELECT-applicable policies per table. Raw run summaries and plan hashes are
in `rls-plan-before.json`; the limits frozen from that before evidence and the
actual after measurements are in `rls-plan-after.json`.

## Local apply and after evidence

Migration history records both PR-11 versions:

- `20260716160342`
- `20260716160402`

The after catalog contains 41 valid FK indexes, 183 public policies, sixteen
reviewed multiple-permissive residuals, one SELECT-applicable policy on each
RLS target, and zero `auth_rls_initplan` findings. Both recovery files executed
as validation-only guards and changed no index or policy.

The initial canonical performance after set was captured after normalizing a local
measurement artifact. Repeated transaction-rolled-back probes left all five
target tables with zero rows and zero heap bytes but enlarged their indexes
(`blocks` indexes totaled 19,578,880 bytes). Local `REINDEX TABLE` on only
those zero-row probe targets reduced the totals to their empty-table baseline
(`blocks`: 90,112 bytes) without changing data, policy, schema identity, or
migration history. The earlier contaminated after attempts remain
non-canonical diagnostics and were not substituted into the result.

| Zero-row probe table           | Index bytes before | Index bytes after |
| ------------------------------ | -----------------: | ----------------: |
| `blocks`                       |         19,578,880 |            90,112 |
| `customer_insurance_coverages` |            933,888 |            57,344 |
| `menu_billing_profiles`        |          1,474,560 |            65,536 |
| `patient_outreach_recipients`  |          1,679,360 |            40,960 |
| `shift_requests`               |          2,367,488 |            90,112 |

That initial set passed the selective read and every WAL-byte limit, but failed
all six write and both authenticated RLS wall-clock limits. It remains
historical evidence and was not discarded.

The subsequently operator-approved official paired rerun is recorded under
`paired-local-rerun-20260717-0815/`. Each family alternated BEFORE/AFTER order
across three pairs, normalized and verified 17 physical relations between
samples, used independent psql sessions, and rolled every diagnostic schema
change and fixture back. All 13 clean-state snapshots have the same SHA-256,
all 37 postflights pass, all 25 runtime checks are quiescent/stable, and all 24
host/container resource captures are valid. The manifest reports
`localOnly=true`, `productionTouched=false`, 87/87 successful steps, and 12
samples.

The immutable manifest binds the files as they existed during execution.
Post-run outcome-only edits changed two narrative input hashes: the spec moved
from `93febbbab19d1e51a81b150ba00e8b2593c64d033d1c0afa00b1dece23d31b78`
to `8e0cd571e7c79eb534537df63db33f381dfcbb1d35c74185e8b5a866d3201f6e`,
and this write-amplification report moved from
`10ed234ab3b90e920b2340de04fc5cf00cfb334bfa73495fed609dea0ed5938c` to
`4b0ea759a985974d05e7d64b376de968b2c73ff0638823727a262c554df0374e`.
The manifest was not rewritten. Its other nine protocol/plan inputs, including
the runner and all paired SQL, still match; frozen limits and executable probe
logic were not changed.

The official primary decision continues to use the original frozen limits;
the paired BEFORE values are diagnostic only:

| Fixed execution gate                 | AFTER median ms | Fixed limit ms | Result |
| ------------------------------------ | --------------: | -------------: | ------ |
| selective read                       |           0.080 |          2.851 | PASS   |
| blocks sparse insert 10k             |         661.338 |       435.7373 | FAIL   |
| blocks dense insert 10k              |         805.017 |      521.55125 | FAIL   |
| shift full-only insert 2k            |         161.993 |        198.387 | PASS   |
| shift full + partial insert 2k       |         174.521 |        219.224 | PASS   |
| recipient sparse composite insert 1k |          39.738 |         46.665 | PASS   |
| recipient dense composite insert 1k  |          67.521 |         81.761 | PASS   |
| customer insurance coverage RLS read |         105.951 |         66.757 | FAIL   |
| menu billing profile RLS read        |          68.152 |        63.3855 | FAIL   |

All six WAL-byte gates pass. Performance-plan and RLS-semantic contracts also
pass, but the four fixed execution-time failures keep `primaryPass=false`.
No threshold was relaxed, rounded, or recomputed from the diagnostic paired
BEFORE samples.

## PostgreSQL 17.6.1.104 pgTAP harness observation

An uncounted diagnostic pgTAP run terminated the local backend after 16/49
assertions at the first authenticated nested RLS `EXPLAIN`. The migrations had
already committed and the test used a separate connection. The same unchanged
plan probe completed normally through top-level psql, returning the broader
staff predicate and one SELECT policy per table.

The crash path reused a temporary PL/pgSQL helper created and previously
executed as `postgres` after switching to `authenticated`. The final harness
drops that helper and creates both explicit `SECURITY INVOKER` RLS helpers
under `authenticated`, matching creation and execution database roles. No
production policy, function, privilege, or clinic scope was changed. The final
focused pgTAP run passed 49/49 and the full DB suite passed 434/434. This is a
pinned-image observation, not a claim of a confirmed upstream PostgreSQL bug.

## Migration/recovery boundary

- `20260716160342_commercial_performance_safe_fk_indexes.sql`
- `20260716160402_commercial_rls_plan_cleanup.sql`
- paired validation-only recovery guards under `supabase/rollbacks/`
- no applied migration was edited
- no recovery file drops indexes or recreates broad `ALL` policies
- regular index DDL aborts above 64 MiB per relation, on long transactions,
  catalog drift, or lock timeout
- all 44 reviewed FK definitions are hash-bound through parent relation,
  referenced columns, MATCH mode, and update/delete actions

## Master specification section 1.2 decision

The implementation follows the master specification's business priority of
reducing `accident probability x accident loss x irreversibility`:

- tenant and clinic authorization semantics are hash-bound and covered by
  negative tenant A/B tests instead of being traded for planner simplicity;
- index removal is excluded, and both recovery files are validation-only, so
  a latency response cannot silently restore broader authorization or make an
  irreversible catalog change;
- the comparison ran only on the approved local target with transaction
  rollback, exact postflight checks, and no reset or volume deletion;
- the four frozen latency failures are preserved as a stop signal. Technical
  neatness or a favorable diagnostic pair cannot override commercial safety.

## Pre-forward-fix verification and stop decision

The following preserves the immutable stop decision before the owner waiver and
append-only forward fix; it is not the final post-apply verification status.

- commercial RED/GREEN contracts 16/16 PASS;
- PR-11 pgTAP 49/49 and full pgTAP 434/434 PASS;
- both validation-only recovery guards PASS;
- both type checks, lint, and the focused PR-11 Jest contract (9/9) PASS;
- client Jest PASS (83/83 suites, 516 passed and one skipped test). Server Jest
  has 318 passing suites and 2,872 passing tests, but two login E2E tests FAIL.
  The same two failures reproduce on unchanged PR-10: stale mocks omit the
  service-role-backed fail-closed authority path and still expect a manager at
  `/dashboard` instead of the current `/manager`. PR-11 SQL/RLS is not in that
  execution path, but the full Jest gate is not claimed as PASS;
- build compiles and completes lint/type validation and 169/169 static pages
  with local-only Supabase environment values, but did not exit successfully:
  `Collecting build traces` remained stalled and the targeted build processes
  were stopped. The build gate is therefore NOT_VERIFIED, not PASS;
- generated-type parity and secret scan PASS;
- two independent read-only post-apply audits PASS for evidence integrity and
  security/catalog semantics;
- the standard secret scanner does not cover `docs/`, `scripts/`, or
  `supabase/`; independent scoped credential/JWT/connection-string scans of
  PR-11 source and all 272 official artifacts found zero matches;
- target PR-11 commit SHA, clean replay, and seed verification are NOT_RUN.
  They cannot be claimed from a dirty PR-10-based benchmark manifest and must
  be closed only after the fixed performance decision permits a target commit;
- At that measurement stop, commit, push, and PR creation were intentionally
  blocked while the original fixed performance gate failed. The later owner
  waiver below is a separate, explicit merge-risk decision.

## Owner-approved pilot waiver and append-only forward fix

On 2026-07-18, `product_owner` accepted only the four frozen local wall-clock
failures as a non-blocking, time-bounded `PASS_WITH_RISK` for an attended pilot
of two to three clinics. The original `primaryPass=false`, `gate-fail` status,
thresholds, samples, and raw evidence remain unchanged. This owner decision is
recorded separately in `pilot-performance-waiver.yaml` and expires at
`2026-08-18T23:59:59+09:00`.

The Node `v24.18.0` rehearsal produced:

| Probe                    | Candidate median |  Fixed limit | Raw result |
| ------------------------ | ---------------: | -----------: | ---------- |
| blocks sparse insert 10k |       675.858 ms |  435.7373 ms | FAIL       |
| blocks dense insert 10k  |       904.092 ms | 521.55125 ms | FAIL       |
| coverage insert 2k       |       211.933 ms |   124.709 ms | FAIL       |
| menu profile insert 2k   |       243.075 ms |   135.944 ms | FAIL       |

All measured WAL caps pass. Coverage/menu reads pass at `11.520 ms` and
`3.060 ms`, respectively, using the natural new `Index Scan`, no target Sort,
bitmap scan, or sequential scan, a 250-row stop, and two scalar InitPlans with
one loop each. Blocks preserved all 15 paired SQLSTATE/message/diagnostic/
cascade cases, all 27 RLS semantic cases matched exactly, and pgTAP was 49/49
for the rehearsal revision. Every logical snapshot matched
`884667bc5a207efd00ef60417ed69f4f6a36b5ac5cce3fd28811cf65fcceb2b1` and every
normalized physical snapshot matched
`516c7efc0d685952208f33a9878cde53558d03276fe0badc29f1ba35fe9736de`.

The complete 446-file, 5,310,314-byte evidence set is preserved under
`forward-fix-rehearsal-20260718-01/`. Rehearsal artifact hashes:

- summary:
  `D04E2528263A302B94697F562EEE84DA0EA43A1E20B5C952C6C9059686DEE927`;
- manifest:
  `EC1687B7C7411D917CD8E6EF70F0E3EFC168F75B85AABDCD893B1D0A8F0B8A62`;
- frozen gates:
  `9938B6225EF05DE07BD960EEDE7C811A5C33F07120B3861B7F3BD35BA3BA2FE5`.

The exact candidate is now the append-only migration
`20260718011731_commercial_pr11_fixed_performance_forward_fix.sql` with a paired
validation-only recovery guard. Before persistent local application, its full
preflight/postflight and recovery guard were executed inside an outer local
transaction and rolled back; both passed and the database returned to migration
head `20260716160402`, with the old blocks/policy hashes and no candidate helper
or indexes present.

Four rollback-only negative guard probes also PASS: a target-policy mutation,
an unauthorized `service_role` helper grant, one candidate-index removal, and
the blocks trigger being disabled were each rejected by the exact intended
guard branch. Every failed connection rolled back, and a final catalog query
returned `PR11_NEGATIVE_GUARD_RESTORATION_PASS`.

The persistent post-apply runner first produced a five-file `safety-fail`
packet under `forward-fix-postapply-official-attempt-20260718-01/`. It detected
a canonical write-probe hash mismatch before any sample or candidate SQL
execution (`candidateSqlExecutionCount=0`, `samples=0`) and therefore made no
measurement mutation. The failed packet is preserved rather than overwritten.

After the hash literal and permanent-head normalizer were corrected, the
official run under `forward-fix-postapply-official-20260718-02/` completed 209
steps, 25 samples, 446 files, and 5,274,080 bytes. Permanent AFTER was compared
against transaction-only BEFORE in three alternating pairs; every candidate
transaction rolled back, and every logical, catalog, data, ACL, RLS, and
normalized physical guard returned to the permanent start state.

Primary fixed execution results are:

| Probe                                | Median ms | Fixed limit ms | Result |
| ------------------------------------ | --------: | -------------: | ------ |
| created-by read 100 of 20k           |     0.047 |          2.851 | PASS   |
| blocks sparse insert 10k             |   429.129 |       435.7373 | PASS   |
| blocks dense insert 10k              |   549.305 |      521.55125 | FAIL   |
| shift full-only insert 2k            |   146.153 |        198.387 | PASS   |
| shift full-plus-partial insert 2k    |   120.435 |        219.224 | PASS   |
| outreach recipient sparse insert 1k  |    20.591 |         46.665 | PASS   |
| outreach recipient dense insert 1k   |    27.794 |         81.761 | PASS   |
| customer insurance coverage RLS read |     2.961 |         66.757 | PASS   |
| menu billing profile RLS read        |     1.212 |        63.3855 | PASS   |

Only `performance.dense_insert_10000` is an observed waived failure. The
approved four-result waiver list remains the ceiling recorded before this run;
the other three rehearsal failures now pass without threshold, sample, actor,
fixture, JWT, policy predicate, or planner changes. Coverage/menu auxiliary
writes pass at `75.578/92.011 ms`, with `1,205,616/1,608,444` WAL bytes. The
natural target plans are the exact new `Index Scan`, have no Sort, bitmap heap,
or target sequential scan, stop at 250 rows, and execute both scalar InitPlans
once. Blocks SQLSTATE/message/diagnostics match all 15 pairs, 27/27 semantic
cases match, and the post-apply pgTAP packet is 52/52.

The successful summary records `primaryPass=false`,
`hardNonWaivedPass=true`, `pilotWaiverApplicable=true`,
`mergeEligibility=PASS_WITH_RISK`, and
`generalCommercialReleaseEligible=false`. Evidence identity:

- logical baseline:
  `c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78`;
- normalized physical baseline:
  `94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86`;
- official summary SHA-256:
  `C9EEC6EF5ACBECAC591206FC9536E85A6CE900214D26E404B64D654680379F41`;
- official manifest SHA-256:
  `11F9C8DBEA406823C3F0A06542802C8BB6319AD00D534F30A4F2570DC4B5A285`;
- frozen write-gates SHA-256:
  `D2DFFC9A7285EEFF429AF7AC671FC55176428E0755AA5C2E7169FE47678CBD8E`;
- failed-attempt manifest SHA-256:
  `38AA7280DB9A64E010A708968793E238D77CE2F4912FB898D2210802B277B503`.

The successful manifest intentionally freezes the exact pre-outcome spec and
waiver revisions used for measurement. This README and the spec status section
were updated only after the raw packet closed; executable probes, migrations,
recovery guards, the waiver decision, raw summary, and raw manifest remain
byte-identical to the measured inputs and outputs.

The waiver does not cover tenant isolation, authorization, SQLSTATE/message,
ACL/RLS, composite FK, WAL, plan shape, read latency, restoration, clean replay,
or CI. It excludes bulk imports/external bulk synchronization and expires on a
fourth clinic, bulk enablement, related DDL/policy/helper or DB-tier change,
related incident, or the date above. It permits merge review only; it does not
authorize staging/production application or general commercial release.

## Final local verification

The final worktree and persistent local migration head were verified with Node
`v24.18.0` and Supabase CLI `2.109.0`:

- all 18 commercial RED/GREEN DB contracts PASS;
- all 14 pgTAP files and 437 assertions PASS;
- the atomic staff-invite verifier PASSes REST-role denial, service execution,
  same-user idempotency, different-user exclusion, and expiry during row-lock
  wait;
- the focused PR-11 Jest contract is 14/14 PASS; Security Tests are 31 suites
  and 431 tests PASS; the CI-equivalent non-E2E Jest run is 400 suites with
  3,388 passed and two skipped tests;
- migration-history parity, generated-type parity, both TypeScript checks,
  `lint:ci`, commercial lint, route inventory/coverage, source inventory,
  fixture validation, mobile asset validation, and standard secret scan PASS;
- the additional evidence/source credential scan covers 1,181 PR-11 evidence
  files and finds zero private keys, provider tokens, JWTs, credential URLs,
  password fields, or `PGPASSWORD` assignments;
- the scoped `.gitattributes` binary rule preserves every captured `.raw` file
  byte-for-byte. All 1,181 staged evidence blobs match their worktree bytes,
  including the 628 CRLF raw captures, and manifest hashes remain reproducible;
- targeted PR-11 Prettier check and `git diff --check` PASS. The master program
  spec retains its pre-existing formatting style to avoid an unrelated
  document-wide rewrite;
- the Node 24 production build exits 0 after compiling, lint/type validation,
  and generation of 169/169 static pages. Its warnings are pre-existing and
  remain below the repository `lint:ci` budget;
- the persistent local catalog ends at migration `20260718011731` with 183
  public policies, one exact private scope helper, and both exact new indexes.

Three independent post-implementation read-only audits PASS with no P0/P1 or
blocking finding: security/tenant semantics; migration/performance evidence and
publish scope; and waiver/spec/release boundaries. They independently confirmed
that the only current fixed-gate failure is dense blocks 10k, that all security
and restoration gates remain non-waived, and that the two unreferenced rejected
fallback SQL files must stay outside the commit.

A clean migration replay is intentionally not claimed locally because DB reset
and volume deletion are prohibited; it must be proven by the isolated GitHub
`Database Contract` job on the pushed target SHA. Commit, push, Draft PR
creation, and required CI are not claimed in this local packet.

## Release boundary

Local measurements are not representative hosted evidence. PR-12 must refresh
table sizes, null fractions, write rate, natural plans, maintenance window,
and lock strategy in staging. Production DB/Auth/configuration changes and any
index drop require separate human approval.
