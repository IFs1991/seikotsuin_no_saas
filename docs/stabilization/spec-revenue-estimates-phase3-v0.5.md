# Revenue Estimates Phase 3 v0.5

Source spec: `docs/tiramisu_revenue_context_spec_v0.5.md`

## Scope

Phase 3 adds management-analysis revenue estimates. These values are not claim-final amounts.

Fixed disclaimer:

```txt
経営分析用の概算です。請求確定額ではありません。
```

## DB Objects

- `revenue_estimates`
- `revenue_estimate_lines`
- `revenue_estimate_warnings`
- `revenue_estimate_overrides`
- `daily_report_revenue_estimate_summary` view with `security_invoker = true`

## Tenant Boundary

- `revenue_estimates.clinic_id` must match `daily_report_items.clinic_id`.
- child table `clinic_id` must match parent `revenue_estimates.clinic_id`.
- RLS uses `app_private.can_access_clinic(clinic_id)`.
- `public.can_access_clinic(clinic_id)` is prohibited.

## Calculation Policy

- `private`, `product`, `ticket`: fee/manual amount is a calculated estimate.
- `traffic_accident`, `workers_comp`: fee/manual amount is retained as an estimate, but status is `needs_review` with warning.
- `insurance`: starts with fee-based management estimate; missing visit stage becomes `needs_review`.
- `other`: `needs_review`.
- `overridden` estimates are preserved by recalculation.

## Rollback

Rollback file: `supabase/rollbacks/20260514000300_revenue_estimates_phase3_rollback.sql`

Rollback is destructive because it drops estimate tables and loses estimate data.
