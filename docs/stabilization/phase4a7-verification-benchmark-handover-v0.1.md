# Phase 4A-7 Verification / Benchmark Handover v0.1

## Summary

Phase 4A-7 closes the menu billing, patient coverage, pricing snapshot, and revenue breakdown work by locking the main correctness and performance assumptions into tests and a repeatable readiness check.

This phase does not add a new user-facing workflow. It hardens the existing Phase 4A path:

- Daily report pricing context reads current coverage with `verification_status = 'confirmed'` so the query aligns with the partial current-lookup index.
- Daily report pricing context uses batch coverage/profile queries, not per-row coverage API calls.
- Daily report aggregate trigger execution is still limited to `fee`, `billing_type`, and `daily_report_id`.
- `public.sync_daily_report_item_totals()` now returns early when an update fired the trigger but those aggregate inputs did not actually change.
- `public.sync_daily_report_item_totals()` keeps an explicit `search_path` while preserving service-role-only execute grants.
- A small readiness script records the structural benchmark preconditions before manual DB timing.

## Benchmark Baseline

Use this phase as the initial baseline for the following operations:

| Operation | Target |
|---|---:|
| Current coverage lookup after patient selection | P95 <= 200ms |
| One daily report item pricing confirmation | P95 <= 500ms |
| Monthly `/api/revenue` read | P95 <= 800ms |
| Confirmed snapshot reservation-sync aggregate churn | 0 unnecessary recalculations |

Recommended manual measurement points:

1. `/api/daily-reports/items?include_pricing_context=true`
2. `/api/daily-reports/items/[id]/pricing/confirm`
3. `/api/revenue`
4. Arrived reservation sync touching a confirmed daily report item

Before timing remote DB behavior, run:

```powershell
npm run phase4a:verify-benchmark-readiness
npm run test -- --runInBand --runTestsByPath src/__tests__/api/phase4a7-verification-benchmark-hardening.test.ts src/__tests__/api/daily-report-items-route.test.ts src/__tests__/api/phase4a-menu-billing-patient-coverage-snapshot-migration.test.ts src/__tests__/api/revenue-api.test.ts src/__tests__/pages/daily-report-input-pricing-ui.test.tsx src/__tests__/pages/revenue.test.tsx
```

## Rollback Verification

Phase 4A-7 has its own rollback:

```text
supabase/rollbacks/20260528000100_phase4a7_verification_benchmark_hardening_rollback.sql
```

The rollback restores the pre-4A-7 `public.sync_daily_report_item_totals()` behavior. It does not drop Phase 4A business tables and does not remove snapshot data.

Before applying this migration remotely, use:

```powershell
supabase db push --dry-run
```

Do not run `supabase db push` until the PR is merged and the remote target is confirmed.

## Manual UI Check

Check these screens after deployment:

1. `/daily-reports/input`
   - Daily report rows load with pricing context.
   - Insurance rows show the current patient burden rate when a confirmed coverage exists.
   - Traffic accident and workers comp rows remain manual estimates and do not say they are confirmed claim amounts.
   - Confirming an insurance row does not require a manual override when a current coverage is available.

2. `/revenue`
   - Revenue summary still loads.
   - `売上見込み内訳` shows patient copay, insurer receivable, private revenue, traffic accident estimate, and workers comp estimate when those snapshot lines exist.
   - Traffic accident and workers comp detail provenance remains manual-estimate wording.

## Remaining Risk

- This phase provides structural performance checks and a DB function hardening migration. It does not replace real remote `EXPLAIN ANALYZE` or browser-network P95 collection.
- Existing historical lint warnings outside the Phase 4A-7 diff may still appear in full build output.
- Supabase migration application must be done manually after PR merge.
