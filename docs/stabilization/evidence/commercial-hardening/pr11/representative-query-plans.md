# PR-11 representative query plans

## Method

`scripts/commercial-hardening/sql/pr11-performance-probe.sql` creates only
synthetic rows inside `BEGIN`/`ROLLBACK`. Natural plans are used for the
selective `blocks.created_by` read. `enable_seqscan=off` is used only to prove
eligibility of the three reviewed existing paths; those forced plans are not
latency evidence.

`scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql` separately creates
2,000 rows per affected table and executes unchanged before/after as an
`authenticated` clinic administrator. It captures the actual RLS filter,
SELECT-applicable policy count, buffers, path, and three-run timing inside a
rolled-back transaction.

## Before

Three before runs were completed on migration head `20260715083609`.

| Probe                                           | Before plan                                                       | Before execution median |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------: |
| 100 matching `blocks.created_by` rows of 20,000 | `Seq Scan` under `Aggregate`                                      |                1.851 ms |
| recipient customer + clinic                     | `Index Only Scan` on `patient_outreach_recipients_customer_idx`   |        eligibility only |
| recipient campaign                              | `Bitmap Index Scan` on `patient_outreach_recipients_campaign_idx` |        eligibility only |
| reservation campaign + clinic                   | `Index Scan` on `reservations_campaign_id_idx`, clinic filter     |        eligibility only |

The canonical extended-probe read samples were 1.608 ms, 1.851 ms, and
2.366 ms. Earlier smoke-run samples are superseded because they did not include
the full/composite write-shape fixtures now required by the probe contract.

Authenticated RLS before-state:

| Probe                        | Returned | SELECT policies | Before samples (ms)      | Median (ms) | Before RLS filter                                                  |
| ---------------------------- | -------: | --------------: | ------------------------ | ----------: | ------------------------------------------------------------------ |
| customer insurance coverages |      250 |               2 | 46.738 / 59.549 / 58.870 |      58.870 | `can_access_clinic AND (pricing-admin role OR broader staff role)` |
| menu billing profiles        |      250 |               2 | 47.586 / 55.805 / 63.014 |      55.805 | `can_access_clinic AND (pricing-admin role OR broader staff role)` |

The exact plan summaries, buffers, selected indexes, and raw plan hashes are
stored in `rls-plan-before.json`. Advisor `auth_rls_initplan` remained zero.

## Initial canonical after (historical)

The migrations were applied locally with explicit approval and pinned CLI
`2.109.0`. The canonical after read samples were 0.140, 0.106, and 0.108 ms
(median 0.108 ms). Every run used `blocks_created_by_idx`, and the median is
below the fixed 2.851 ms limit: **PASS**.

Authenticated RLS after-state:

| Probe                        | Returned | SELECT policies | After samples (ms)          | Median (ms) | Limit (ms) | Semantics | Latency |
| ---------------------------- | -------: | --------------: | --------------------------- | ----------: | ---------: | --------- | ------- |
| customer insurance coverages |      250 |               1 | 285.940 / 150.062 / 151.494 |     151.494 |     66.757 | PASS      | FAIL    |
| menu billing profiles        |      250 |               1 | 122.905 / 157.577 / 98.138  |     122.905 |     63.386 | PASS      | FAIL    |

All six plans retained only
`can_access_clinic AND role = ANY [admin, clinic_admin, manager, therapist, staff]`.
The retired narrower pricing-admin predicate was absent, the exact retained
policy count was one per table, and `auth_rls_initplan` remained zero. Exact
buffers, paths, and hashes are in `rls-plan-after.json`.

The timing gate remains **BLOCKED**. Before the canonical after set, the five
zero-row probe targets were locally reindexed to remove index-only bloat left
by repeated rollback probes. The failure persisted after normalization; no
threshold or sample was changed.

The operator-approved official paired rerun supersedes this section for the
current stop decision while preserving these measurements as history. Its
fixed result, raw/parsed plans, exact frozen-limit hash, and RLS semantic checks
are under `paired-local-rerun-20260717-0815/`; `fixed-gate-summary.json` reports
the selective read PASS and both authenticated RLS latency gates FAIL, with
the performance-plan and RLS-semantic contracts PASS.

## Hosted limitation

The local target tables were empty before synthetic fixtures and do not model
hosted distributions. PR-12 must repeat natural before/after plans with
representative staging data before production apply.
