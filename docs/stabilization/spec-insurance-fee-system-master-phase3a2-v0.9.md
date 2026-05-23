# Insurance Fee System Master Phase 3A-2 Spec v0.9

## Scope

Phase 3A-2 adds the resolver, validation, and representative golden fixture
harness deferred by Phase 3A-1. It is still master-only work. It does not link
insurance fee master rows into `revenue_estimates`, estimate lines,
recalculation routes, daily reports, or claim-final billing.

This PR owns:

- `resolveInsuranceFeeSchedule()` for date-bound active schedule selection.
- `resolveInsuranceFeeItems()` for deterministic item selection under a
  resolved schedule.
- `validateInsuranceFeeMaster()` and `npm run insurance:validate-master` for
  read-only master readiness diagnostics.
- representative `fixtures/insurance-fee-cases/*.json` and focused golden case
  tests.
- a forward DB guard that prevents converting an existing schedule to
  `traffic_accident` when its current items expose automatic amounts.

## Resolver Rules

Schedule resolution is based on:

- `profession_type`
- `payer_context_code`
- `treatmentDate >= effective_from`
- `effective_to is null or treatmentDate <= effective_to`
- `schedule_status = active`

Exactly one schedule must match. Zero matches raise `SCHEDULE_NOT_FOUND`; more
than one raises `SCHEDULE_OVERLAP_DETECTED`.

Item resolution is deterministic by `sort_order`, then `item_code`. It does not
calculate revenue estimate totals, does not write snapshots, and does not
interpret calculation-condition JSON.

## Traffic Accident Rule

A `traffic_accident` schedule can resolve as context, but item resolution must
not expose automatic master pricing. Resolved traffic-accident items must be:

- `amount_yen = null`
- `manual_amount_required = true`
- `auto_calculation_allowed = false`

Manual `daily_report_items.fee` behavior remains the Phase 3 estimate policy:
manual fees may remain management estimates but must stay `needs_review` with
the traffic-accident review warning and the fixed disclaimer.

## Validation Rules

The validation command is read-only and reports diagnostics for:

- overlapping active schedules for the same profession and payer context;
- active schedules without source snapshot provenance;
- active schedules referencing a missing source snapshot;
- traffic-accident items that expose automatic amounts;
- manual-only or auto-calculation-disabled items that still expose amounts;
- duplicate `(schedule_code, item_code)` fixtures or rows;
- item warning codes that are malformed or undefined;
- golden cases pointing at non-active or missing schedules.

## Migration And Rollback

`supabase/migrations/20260523000100_insurance_fee_system_master_phase3a2.sql`
adds a schedule context mutation guard. It closes the Phase 3A-1 gap where an
unlocked schedule could be changed from `insurance` to `traffic_accident` after
automatic amount items had already been inserted.

Rollback file:

```txt
supabase/rollbacks/20260523000100_insurance_fee_system_master_phase3a2_rollback.sql
```

Rollback is not data-destructive. It drops only the Phase 3A-2 trigger and
function. After rollback, the Phase 3A-1 item insert/update guard remains, but
the schedule-context conversion gap returns.

## Non-Scope

Phase 3A-2 does not include:

- Phase 3B `revenue_estimates` linkage;
- claim-final billing;
- traffic-accident automatic unit price, line amount, or estimate total;
- official tariff bulk import or seed generation;
- full receipt-system completeness for every tariff case;
- admin UI for master maintenance;
- revision diff persistence.

## Verification

Use the repository npm scripts:

```powershell
npm run test -- --runTestsByPath src/__tests__/insurance-fees/schedule-resolver.test.ts src/__tests__/insurance-fees/validate-master.test.ts src/__tests__/insurance-fees/golden-cases.test.ts src/__tests__/api/insurance-fee-system-master-phase3a2-migration.test.ts
npm run insurance:validate-master -- --help
npm run type-check
npm run lint
npm run build
```

Because this PR adds a migration, check local migration drift before manual DB
push:

```powershell
supabase db push --local --dry-run
```
