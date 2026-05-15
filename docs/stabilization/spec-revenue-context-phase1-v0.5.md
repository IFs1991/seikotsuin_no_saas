# Revenue Context Phase 1 v0.5

Source spec: `docs/tiramisu_revenue_context_spec_v0.5.md`

## Scope

Phase 1 adds revenue context classification while keeping
`daily_report_items` as the daily report detail SSOT.

Implemented objects:

- `public.revenue_contexts`
- `daily_report_items.revenue_context_code`
- `daily_report_items.revenue_context_source`
- `daily_report_items.amount_source`
- `daily_report_items.estimate_status`
- `public.daily_report_item_tag_definitions`
- `public.daily_report_item_tags`
- `public.daily_report_revenue_context_summary`
- `public.sync_arrived_reservation_daily_report_item()` replacement

## Compatibility Rules

- `billing_type` remains `insurance | private`.
- `revenue_context_code=insurance` maps to `billing_type=insurance`.
- All other Phase 1 selectable contexts map to `billing_type=private`.
- `mixed` is seeded for future compatibility but is not selectable and is
  excluded from analysis.

## Security Rules

- New tenant-scoped RLS policies use `app_private.can_access_clinic()`.
- The summary view uses `security_invoker = true`.
- Tag rows are checked against their item clinic via
  `validate_daily_report_item_tags_refs()`.
- The arrived reservation trigger preserves manual and override
  classifications.

## Rollback

Rollback script:
`supabase/rollbacks/20260514000100_revenue_context_phase1_rollback.sql`

Rollback is destructive because it drops revenue context columns and tag data.
Dump production data before using it.

## Verification

Non-destructive checks:

```powershell
npm run type-check
npm run test -- --runTestsByPath src/__tests__/api/revenue-context-phase1-migration.test.ts src/__tests__/api/daily-report-items-route.test.ts src/__tests__/api/revenue-api.test.ts
```

DB replay checks require explicit approval because `supabase db reset --local`
is destructive for the local database.
