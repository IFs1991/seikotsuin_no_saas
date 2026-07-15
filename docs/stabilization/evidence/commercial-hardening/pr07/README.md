# Commercial hardening PR-07 evidence

## Scope

- Base: `5ea81017`, after PR-06 merged.
- Branch: `codex/commercial-hardening-pr07`.
- Local migration head observed at branch creation: `20260714120318` (PR-06).
- Linked migration head observed read-only: `20260714041848` (PR-05).
- Specification:
  `docs/stabilization/spec-commercial-legacy-quarantine-v1.0.md`.
- Objective: make the five reviewed legacy relations impossible to write from
  application roles, retain only two service-side reads, preserve all data, and
  block unresolved nullable-clinic rows.
- Production/linked migration application and deletion are excluded. Linked
  PR-07 application is additionally blocked until PR-06 history parity is
  established.

## Baseline confirmation

- PR-06 is GitHub PR #95 and was merged before this branch was created.
- PR-06 Quality, Build, Database Contract, Full Jest, Security, and App E2E
  checks were green.
- Local `main` was fast-forwarded to `origin/main` before creating PR-07.
- User-owned untracked files present before the branch were preserved and left
  untouched. They must remain outside the PR-07 staging scope.
- No linked migration was applied: the linked project is one program slice
  behind the local prerequisite, at PR-05 rather than PR-06.

## RED evidence

Before the PR-07 migration:

- `service_role` had all table privileges on all five candidate relations;
- nine authenticated policies remained on `appointments`, `visits`, and
  `revenues`;
- `COMM-LEGACY-001` reproduced RED;
- all earlier expected-GREEN commercial contracts stayed GREEN;
- PR-08 `COMM-INVITE-001` remained intentionally RED.

Executed command:

```powershell
npm run commercial:red:db
```

Result: PASS for the phase map; 14/14 contracts matched their expected phase,
including `06a_legacy_quarantine.sql` as RED.

## Data preservation evidence

Read-only aggregate queries selected only counts. Local and linked results are
stored in `data-preservation-before.csv`: every candidate table contained zero
rows and both nullable tenant columns contained zero null rows on 2026-07-15
JST. No linked data or configuration was changed.

The migration snapshots all five counts inside its transaction and verifies
the same counts before commit. It contains no row mutation or destructive DDL.
`visits.clinic_id` and `revenues.clinic_id` remain nullable in the schema. A
non-zero null count aborts the migration and requires a separate repair spec;
PR-07 neither assigns an arbitrary clinic nor adds `NOT NULL`.

The target ACL/RLS/function contract is recorded in
`legacy-quarantine-matrix.csv`. Its post-migration catalog status is `PASS`.
The policy count moved from 191 to 182, exactly matching removal of the nine
reviewed legacy policies, and the five table row counts remained unchanged.

## Runtime inventory

`runtime-reference-inventory.json` is generated and checked by:

```powershell
npm run commercial:verify:legacy-quarantine
```

The exact allowed runtime boundary is one clinic-scoped literal `revenues`
`.from()` SELECT and one literal call to the read-only, service-only
`get_hourly_visit_pattern` RPC. Within the scanned JS/TS variants, literal
candidate `.from()` mutations, additional literal candidate `.from()`/`.rpc()`
references, and literal candidate names in the reviewed operational scripts
fail the verifier. Raw SQL, computed names, and transitive callers are outside
that static proof.

The verifier also covers operational scripts. PR-07 removes:

- `visits`/`revenues` upserts from `scripts/e2e/seed-e2e-data.mjs`;
- `visits`/`revenues` deletes from `scripts/e2e/cleanup-e2e-data.mjs`;
- `visits`/`revenues` from the required-table list in
  `scripts/e2e/preflight.mjs`;
- the optional `revenues` probe from
  `scripts/verify-supabase-connection.mjs`.

The canonical reservation-backed analytics fixtures remain. No database row
was deleted by these script changes.

The static inventory cannot prove every computed or transitive caller. A
read-only catalog review identified `analyze_patient_segments`,
`calculate_churn_risk_score`, `calculate_patient_ltv`, and
`get_hourly_revenue_pattern` as additional legacy-relation dependencies. PR-07
does not classify them as verified callers: only the exact
`get_hourly_visit_pattern(uuid)` body is frozen by migration, RED, rollback,
and pgTAP contracts. The remaining dependency review is recorded as a residual
risk and a mandatory gate in the deletion-candidate specification.

## Final verification

Results are filled only after commands actually run.

| Check | Result | Evidence |
| --- | --- | --- |
| PR-07 RED proof | PASS | `COMM-LEGACY-001` matched RED before migration |
| Local/linked prerequisite inventory | PASS | local PR-06 head; linked PR-05 head observed read-only |
| Runtime inventory check | PASS | final inventory is current; scanned literal runtime/operational references match the allowlist |
| Local PR-07 migration apply | PASS | approved local-only `migration up` completed after the preflight comment-preservation fix |
| Local clean migration replay | PASS | approved `db reset --local --no-seed --yes` replayed all migrations through `20260714160944` |
| Rollback validation guard | PASS | validation-only SQL completed against the post-PR-07 local catalog; it made no persistent change |
| PR-07 focused Jest | PASS | 1 suite / 8 tests |
| PR-02 through PR-07 migration-contract Jest | PASS | 6 suites / 70 tests |
| PR-07 pgTAP | PASS | included in the full local pgTAP result: 10 files / 281 tests |
| Full commercial DB contracts | PASS | 14/14 contracts matched; PR-07 GREEN and PR-08 intentionally RED |
| Append-only migration history | PASS | 50 frozen / 6 appended |
| E2E fixture seed/cleanup idempotence | PASS | validation, seed twice, and cleanup twice completed without legacy writes/deletes |
| Targeted Chromium Playwright | PASS | dashboard plus cross-clinic isolation: 19/19; direct `visits`/`revenues` denial and fixture cleanup included |
| Full Chromium Playwright | NOT_VERIFIED | standard `webServer` orchestration hung before test launch; the numeric-host diagnostic run is not valid auth-cookie evidence |
| Supabase connection check | PASS | clinics/patients probes completed after removing the optional legacy probe |
| Generated type parity | PASS_WITH_NORMALIZATION | schema-equivalent after the allowed PostgREST metadata-only normalization (`null` versus `14.5`); not byte-identical |
| TypeScript | PASS | `npm run type-check` |
| ESLint | PASS | `npm run lint` |
| Full Jest | FAIL | final-tree run: 398 suites total, 391 passed, 3 failed, 4 skipped; 3037 tests passed, 4 failed, 28 skipped. The corrected real-DB suite now honors its documented Jest skip; the four remaining failures are two login and two PR-08 invite tests outside this slice |
| PR-07 security regression | PASS | exact table ACL/RLS denials, service reads/writes, function ACL, tenant negative cases, and 191-to-182 policy count verified |
| Build | PASS | production build completed; existing warnings only |
| Secret scan | PASS | `npm run scan:secrets` |
| Read-only subagent audits | PASS | independent migration and security audits completed with no unresolved P0-P3; tests/docs findings were remediated and rechecked |
| Linked/production migration apply | NOT_RUN | linked lacks PR-06 prerequisite and requires operator approval |
| Deletion | NOT_RUN | explicitly prohibited by PR-07 |

## Recovery

The paired rollback is validation-only. It never recreates client policies,
restores service-role writes, disables RLS, or changes data. A failure uses
route disablement plus a reviewed forward fix. The validation guard was
executed successfully against the final local catalog.

## DoD mapping

`docs/stabilization/DoD-v0.1.md` is historical; the following are the concrete
PR-07 checks that reuse its deterministic local-development gates:

| DoD | PR-07 evidence required | Current state |
| --- | --- | --- |
| DOD-01 | connection verifier succeeds after removing the optional legacy probe | PASS |
| DOD-02 | clean local reset replays the append-only PR-07 migration | PASS |
| DOD-04 | exact `supabase db push --local --dry-run` plus catalog/row-count checks | PARTIAL: catalog and row-count assertions PASS; the separately approval-gated exact dry-run was not run |
| DOD-05 | fixture validation and E2E seed/cleanup stay idempotent without legacy writes/deletes | PASS |
| DOD-06 | Playwright baseURL/webServer alignment is stable | PARTIAL: standalone 127.0.0.1 targeted run 19/19 PASS; standard webServer orchestration hung before launch |
| DOD-07 | Playwright launches on Windows without `spawn EPERM` | PASS: Chromium launched and 19 targeted tests completed |
| DOD-08 | RLS ON, zero policies, no client ACL, exact service SELECT-only ACL, service-only RPC | PASS |
| DOD-09 | surviving `revenues` route retains clinic guard/predicate; dashboard uses reviewed RPC | PASS |
| DOD-10 | type-check/lint and build succeed | PASS |
| DOD-11 | focused/full Jest and security tests succeed on Windows | PARTIAL: focused/security checks PASS; full Jest has four unrelated login/invite failures after excluding the corrected real-DB/mock mismatch |
| DOD-12 | generated schema types remain equivalent; nullable legacy columns stay nullable | PASS_WITH_NORMALIZATION: only allowed PostgREST metadata differs |
