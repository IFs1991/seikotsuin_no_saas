-- Reverts supabase/migrations/20260507000100_daily_report_items.sql.
-- This drops per-patient daily report item storage and automation.

drop trigger if exists sync_daily_report_item_from_arrived_reservation on public.reservations;
drop trigger if exists daily_report_items_recalculate_totals on public.daily_report_items;
drop trigger if exists update_daily_report_items_updated_at on public.daily_report_items;
drop trigger if exists daily_report_items_clinic_ref_check on public.daily_report_items;

drop function if exists public.sync_arrived_reservation_daily_report_item();
drop function if exists public.sync_daily_report_item_totals();
drop function if exists public.recalculate_daily_report_totals(uuid);
drop function if exists public.validate_daily_report_items_clinic_refs();

drop table if exists public.daily_report_items;
