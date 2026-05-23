# Revenue Estimate Fee Item Link Phase 3B Spec v0.9

## Scope

Phase 3B links management-analysis revenue estimates to the insurance fee
system master provenance created in Phase 3A. The link is metadata for
traceability. It does not make estimates claim-final amounts and does not
rewrite `daily_report_items.fee`.

This PR owns:

- nullable provenance columns on `revenue_estimates`;
- nullable provenance columns on `revenue_estimate_lines`;
- `override_reason_code` on `revenue_estimate_overrides`;
- API persistence of the resolved schedule and safely matched fee item
  provenance when recalculating estimates;
- focused tests for migration shape and recalculation persistence.

## Calculation Policy

Existing Phase 3 calculation policy remains the source of estimate amounts.
Manual `daily_report_items.fee` may remain the management estimate input.

Insurance fee master amounts are not used to auto-fill `daily_report_items.fee`
or to replace the existing estimate total in this PR. Phase 3B stores the
resolved schedule and, only when a single safe item match is available, the
matched item provenance on the estimate line.

## Traffic Accident Rule

For `traffic_accident`, official master-derived automatic unit price, line
amount, daily report fee, or estimate total remains prohibited.

A traffic-accident schedule may be stored as estimate provenance. Estimate
lines must not store a traffic-accident master item link because those master
items are manual-only. The existing manual fee estimate remains
`needs_review`, keeps `TRAFFIC_ACCIDENT_REVIEW`, and keeps the fixed
disclaimer:

```txt
経営分析用の概算です。請求確定額ではありません。
```

## DB Changes

Forward migration:

```txt
supabase/migrations/20260523000200_revenue_estimate_fee_item_link_phase3b.sql
```

Rollback:

```txt
supabase/rollbacks/20260523000200_revenue_estimate_fee_item_link_phase3b_rollback.sql
```

The migration adds:

- `revenue_estimates.used_schedule_code`
- `revenue_estimates.source_snapshot_hash`
- `revenue_estimate_lines.insurance_fee_item_id`
- `revenue_estimate_lines.schedule_code`
- `revenue_estimate_lines.fee_item_code`
- `revenue_estimate_lines.source_snapshot_hash`
- `revenue_estimate_overrides.override_reason_code`

The migration also adds fail-closed database guards:

- estimate-level schedule provenance must point to an active schedule whose
  payer context matches `revenue_estimates.revenue_context_code`;
- the linked schedule must cover the `daily_report_items.report_date`;
- estimate-level `source_snapshot_hash` must match the resolved schedule;
- line-level item provenance must match the parent estimate schedule;
- line-level item provenance must point to an automatic, non-manual master item;
- line-level traffic-accident item links are rejected.

The rollback removes only Phase 3B metadata columns, constraints, and indexes.
It does not drop Phase 3 estimate tables. Rolling back after data has been
written loses Phase 3B provenance metadata but preserves estimate rows and
manual override rows.

## Resolver Policy

The recalculation API resolves master provenance only for these payer contexts:

- `insurance`
- `workers_comp`
- `traffic_accident`

The default profession is `judo` because current daily report items do not yet
store a profession field. Future PRs can make profession selection explicit per
clinic or per item without changing the Phase 3B storage contract.

If no active schedule is available, recalculation keeps the existing Phase 3
fee-based estimate behavior and stores no master provenance. If a schedule is
resolved but no single safe fee item can be matched to the existing estimate
line, the schedule provenance is still stored while the line item provenance is
left null.

## Non-Scope

Phase 3B does not include:

- claim-final billing;
- official tariff bulk import or seed generation;
- interpreting calculation condition JSON;
- retroactive rewriting of existing daily report fees;
- automatic traffic-accident master pricing;
- admin UI for master maintenance.

## Verification

Use the repository npm scripts:

```powershell
npm run test -- --runTestsByPath src/__tests__/api/revenue-estimate-fee-item-link-phase3b-migration.test.ts src/__tests__/insurance-fees/revenue-estimate-link.test.ts src/__tests__/api/revenue-estimates-recalculate-route.test.ts
npm run test -- --runTestsByPath src/__tests__/api/insurance-fee-system-master-phase3a-migration.test.ts src/__tests__/api/insurance-fee-system-master-phase3a2-migration.test.ts src/__tests__/lib/revenue-estimate.test.ts
npm run type-check
npm run lint
npm run build
```

Before a manual database push, check migration drift:

```powershell
supabase db push --dry-run
```
