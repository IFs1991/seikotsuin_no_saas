# PR-11 write-amplification measurement

## Probe

The same transaction-rolled-back probe measures three real-table index shapes:

- `blocks` partial indexes: 10,000 sparse rows with both audit FKs null and
  10,000 dense rows with `created_by` populated;
- `shift_requests` full/partial mix: 2,000 rows that populate both new full FK
  indexes, then 2,000 rows that also populate the new `reviewed_by` partial
  index;
- `patient_outreach_recipients` composite partial: 1,000 sparse rows with no
  booking, then 1,000 dense rows with both composite FK columns populated.

This covers nullable single-column, all-NOT-NULL full, and nullable composite
index geometry on actual PR-11 tables. `EXPLAIN (ANALYZE, BUFFERS, WAL,
TIMING OFF, FORMAT JSON)` reports execution time, WAL records/bytes, and shared
dirtied blocks. Three runs are compared by median.

## Before measurements

| Probe                         | Execution ms samples        | Median ms | WAL bytes samples                 | Median WAL bytes | Median dirtied blocks |
| ----------------------------- | --------------------------- | --------: | --------------------------------- | ---------------: | --------------------: |
| blocks sparse partial 10k     | 768.369 / 331.675 / 378.902 |   378.902 | 8,610,843 / 9,279,249 / 8,849,684 |        8,849,684 |                   430 |
| blocks dense partial 10k      | 537.626 / 417.241 / 356.460 |   417.241 | 8,791,828 / 9,487,014 / 8,906,932 |        8,906,932 |                   443 |
| shift full-only 2k            | 104.734 / 98.387 / 90.092   |    98.387 | 1,406,760 / 1,504,788 / 1,437,312 |        1,437,312 |                    82 |
| shift full + partial 2k       | 96.955 / 90.237 / 94.224    |    94.224 | 1,449,124 / 1,488,904 / 1,441,588 |        1,449,124 |                    75 |
| recipient sparse composite 1k | 24.669 / 21.270 / 21.665    |    21.665 | 572,330 / 578,158 / 567,141       |          572,330 |                    37 |
| recipient dense composite 1k  | 39.691 / 31.678 / 31.761    |    31.761 | 607,070 / 559,295 / 604,052       |          604,052 |                    41 |

The execution-time variance is material, so WAL and buffer deltas are reported
alongside timing and no single-run comparison is accepted.

## Initial canonical after measurements (historical)

The canonical after set ran after reindexing only the five zero-row local probe
targets to remove index-only bloat accumulated by earlier rolled-back
diagnostics. `blocks` index bytes fell from 19,578,880 to 90,112 before this
set. No live row, policy, migration record, or schema identity changed.

| Probe                         | Execution ms samples        | Median / limit ms | Time | WAL bytes samples                  | Median / limit WAL bytes | WAL  | Median dirtied blocks |
| ----------------------------- | --------------------------- | ----------------: | ---- | ---------------------------------- | -----------------------: | ---- | --------------------: |
| blocks sparse partial 10k     | 843.370 / 816.903 / 880.961 | 843.370 / 435.737 | FAIL | 8,597,820 / 9,309,016 / 8,589,620  |    8,597,820 / 9,292,168 | PASS |                   423 |
| blocks dense partial 10k      | 890.276 / 940.943 / 960.392 | 940.943 / 521.551 | FAIL | 9,490,172 / 10,174,716 / 9,515,612 |   9,515,612 / 11,133,665 | PASS |                   446 |
| shift full-only 2k            | 192.612 / 201.549 / 209.029 | 201.549 / 198.387 | FAIL | 1,697,712 / 1,799,172 / 1,696,960  |    1,697,712 / 1,868,506 | PASS |                    85 |
| shift full + partial 2k       | 331.107 / 265.062 / 217.099 | 265.062 / 219.224 | FAIL | 1,886,720 / 1,923,496 / 1,886,592  |    1,886,720 / 2,028,774 | PASS |                    87 |
| recipient sparse composite 1k | 61.822 / 57.611 / 40.142    |   57.611 / 46.665 | FAIL | 572,330 / 578,110 / 571,928        |        572,330 / 600,947 | PASS |                    39 |
| recipient dense composite 1k  | 101.116 / 91.929 / 51.639   |   91.929 / 81.761 | FAIL | 723,106 / 655,147 / 722,964        |        722,964 / 755,065 | PASS |                    52 |

All WAL-byte gates pass. All six fixed execution-time gates fail. A later
non-canonical diagnostic could not isolate trigger overhead because the probe
uses `TIMING OFF`; absent per-trigger times are not evidence of zero trigger
cost. It did not replace any canonical sample. The result is recorded as a
blocking performance finding, not rounded into a pass.

## Official paired local rerun

The operator-approved rerun is stored at
`paired-local-rerun-20260717-0815/`. It used three alternating-order pairs
(BEFORE -> AFTER, AFTER -> BEFORE, BEFORE -> AFTER), normalization and exact
postflight checks between every sample, independent psql sessions, and
transaction rollback. The primary gate continues to use the original frozen
limits; paired BEFORE medians below are diagnostic only.

| Probe                         | AFTER execution samples     | AFTER median / fixed limit ms | Time | AFTER median / fixed WAL limit | WAL  | Diagnostic BEFORE median ms |
| ----------------------------- | --------------------------- | ----------------------------: | ---- | -----------------------------: | ---- | --------------------------: |
| blocks sparse partial 10k     | 900.388 / 661.338 / 656.796 |            661.338 / 435.7373 | FAIL |        8,597,844 / 9,292,168.2 | PASS |                     611.703 |
| blocks dense partial 10k      | 875.486 / 805.017 / 651.967 |           805.017 / 521.55125 | FAIL |         9,501,068 / 11,133,665 | PASS |                     729.877 |
| shift full-only 2k            | 140.262 / 161.993 / 196.304 |             161.993 / 198.387 | PASS |        1,697,688 / 1,868,505.6 | PASS |                     148.498 |
| shift full + partial 2k       | 174.521 / 202.837 / 158.067 |             174.521 / 219.224 | PASS |        1,886,672 / 2,028,773.6 | PASS |                     163.576 |
| recipient sparse composite 1k | 39.738 / 30.101 / 42.075    |               39.738 / 46.665 | PASS |            572,354 / 600,946.5 | PASS |                      50.060 |
| recipient dense composite 1k  | 80.062 / 48.632 / 67.521    |               67.521 / 81.761 | PASS |              723,058 / 755,065 | PASS |                      76.478 |

The official write result is four of six execution-time gates PASS and all six
WAL gates PASS. Paired diagnostic deltas do not change that result: sparse and
dense `blocks` remain above the frozen limits. All 13 clean-state snapshots
cover the same 17 relations and have the same SHA-256, so no accumulated table
or index state was substituted between samples.

## Thresholds

Thresholds were fixed before the after run in the paired specification:

- sparse: execution median +15% or +25 ms (whichever is larger), WAL +5%;
- dense: execution median +25% or +50 ms (whichever is larger), WAL +25%.
- shift full-only: execution median +35% or +100 ms, WAL +30%;
- shift full + partial: execution median +45% or +125 ms, WAL +40%;
- recipient sparse composite: execution median +15% or +25 ms, WAL +5%;
- recipient dense composite: execution median +30% or +50 ms, WAL +25%.

Passing these local thresholds is not production approval. Hosted null
fractions, write rate, table size, and lock behavior remain PR-12 gates.
