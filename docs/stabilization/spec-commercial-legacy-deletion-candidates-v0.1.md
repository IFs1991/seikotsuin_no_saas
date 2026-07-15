# Commercial legacy table deletion candidates v0.1

## Status

- Decision state: deferred; no deletion authorized
- Source program: `docs/stabilization/spec-commercial-hardening-migration-v1.0.md`
- Originating slice: PR-07 legacy quarantine
- Required owner decision: retention period and legal/operational hold
- Current action: quarantine only; deletion remains unauthorized

This document separates eventual deletion analysis from PR-07. It is not a
migration specification and must not be used to drop or truncate data.

## Candidate set

| Table | Current reason | PR-07 state |
| --- | --- | --- |
| `appointments` | superseded by `reservations` | migration-only quarantine |
| `visits` | legacy heatmap source | service-role read-only quarantine |
| `revenues` | legacy analysis/heatmap source | service-role read-only quarantine |
| `treatments` | no runtime reference; legacy appointment model | migration-only quarantine |
| `treatment_menu_records` | no tenant key or runtime reference | migration-only quarantine |

The PR-07 target state is RLS enabled with zero policies for all five tables,
no client table privilege, `service_role` `SELECT` only on `visits` and
`revenues`, and no `service_role` table privilege on the other three. The
`get_hourly_visit_pattern(uuid)` RPC remains service-only because it is a
reviewed reader of `visits`/`revenues`. Quarantine is not evidence that the
underlying data may be discarded.

## Preconditions for any deletion proposal

All of the following require evidence and human approval in a later task:

1. retention period and legal hold are decided;
2. a fresh linked/staging row count and dependency graph are captured;
3. every direct and transitive application/function caller is zero or migrated;
4. backup and restore evidence covers the candidate data;
5. export/archive format and access owner are named;
6. a destructive migration specification and rollback/restore plan exist;
7. staging rehearsal and post-delete smoke tests pass;
8. production maintenance window and operator approval are recorded.
9. linked migration history is first made complete through PR-06 and PR-07 is
   applied and verified there; the observed linked head during PR-07 work was
   PR-05 (`20260714041848`), so linked deletion analysis cannot proceed from the
   current state.

`visits` and `revenues` cannot be deletion candidates while the reviewed
dashboard or clinic-analysis reads remain. `treatment_menu_records` cannot be
removed independently until its foreign-key/dependency order is reviewed.

## Explicit non-actions in PR-07

- no `DROP TABLE`
- no `TRUNCATE`
- no row `DELETE`
- no archival/export mutation
- no retention-period assumption
- no production or linked apply
- no `NOT NULL` conversion or arbitrary clinic assignment for nullable legacy
  rows
