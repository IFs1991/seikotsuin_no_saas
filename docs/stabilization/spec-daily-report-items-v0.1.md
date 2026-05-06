# Daily Report Items v0.1

## Summary

Add per-patient daily report detail rows while preserving `daily_reports` as the
daily aggregate table. Reservations marked `arrived` create or update the same
day's daily report item automatically. The daily report input screen can edit
item fee, billing type, payment method, and next reservation datetime.

## Schema Changes

- Add `public.daily_report_items`.
- Link item rows to `daily_reports`, optional source `reservations`,
  `customers`, `menus`, `resources`, and `master_payment_methods`.
- Store next reservation intent on the item with
  `next_reservation_start_time`, `next_reservation_end_time`, and
  `next_reservation_id`.
- Enforce tenant reference integrity with
  `public.validate_daily_report_items_clinic_refs()`.

## RLS

- Enable RLS on `public.daily_report_items`.
- Allow `admin`, `clinic_admin`, `manager`, `therapist`, and `staff` to select,
  insert, and update rows only when `public.can_access_clinic(clinic_id)` is
  true.
- Allow delete only for `admin`, `clinic_admin`, and `manager` with the same
  clinic scope condition.

## Automation

- `public.sync_arrived_reservation_daily_report_item()` runs after reservation
  insert/update.
- When a reservation becomes `arrived`, it creates the parent `daily_reports`
  row if missing and upserts a single `daily_report_items` row for that
  reservation.
- When an arrived reservation is cancelled, moved away from `arrived`, or soft
  deleted, the auto-created item is removed.
- `public.sync_daily_report_item_totals()` recalculates aggregate totals in
  `daily_reports` after item insert/update/delete.

## Rollback Plan

Rollback SQL is stored at
`docs/stabilization/rollbacks/20260507000100_daily_report_items_rollback.sql`.
It drops the reservation/item triggers, helper functions, and the
`daily_report_items` table. It does not delete or alter existing
`daily_reports` rows.

## Verification

- Run `npm run type-check`.
- Run targeted Jest for the daily report item route and migration tests.
- Run `git diff --check`.
- Apply database migration only after explicit approval using the repository's
  standard Supabase workflow.
