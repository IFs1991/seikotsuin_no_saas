-- Rollback for Revenue estimates Phase 3.
-- Destructive: dropping these objects removes management estimate data.

drop view if exists public.daily_report_revenue_estimate_summary;

drop trigger if exists revenue_estimate_overrides_ref_check
on public.revenue_estimate_overrides;

drop trigger if exists revenue_estimate_warnings_ref_check
on public.revenue_estimate_warnings;

drop trigger if exists revenue_estimate_lines_ref_check
on public.revenue_estimate_lines;

drop trigger if exists revenue_estimates_ref_check
on public.revenue_estimates;

drop trigger if exists update_revenue_estimates_updated_at
on public.revenue_estimates;

drop function if exists public.validate_revenue_estimate_child_refs();
drop function if exists public.validate_revenue_estimates_refs();

drop policy if exists "revenue_estimate_overrides_insert_for_staff"
on public.revenue_estimate_overrides;

drop policy if exists "revenue_estimate_overrides_select_for_staff"
on public.revenue_estimate_overrides;

drop policy if exists "revenue_estimate_warnings_write_for_staff"
on public.revenue_estimate_warnings;

drop policy if exists "revenue_estimate_warnings_select_for_staff"
on public.revenue_estimate_warnings;

drop policy if exists "revenue_estimate_lines_write_for_staff"
on public.revenue_estimate_lines;

drop policy if exists "revenue_estimate_lines_select_for_staff"
on public.revenue_estimate_lines;

drop policy if exists "revenue_estimates_write_for_staff"
on public.revenue_estimates;

drop policy if exists "revenue_estimates_select_for_staff"
on public.revenue_estimates;

drop index if exists public.idx_revenue_estimate_overrides_estimate;
drop index if exists public.idx_revenue_estimate_warnings_estimate_id;
drop index if exists public.idx_revenue_estimate_warnings_estimate;
drop index if exists public.idx_revenue_estimate_lines_estimate;
drop index if exists public.idx_revenue_estimates_clinic_context;
drop index if exists public.idx_revenue_estimates_clinic_status;

drop table if exists public.revenue_estimate_overrides;
drop table if exists public.revenue_estimate_warnings;
drop table if exists public.revenue_estimate_lines;
drop table if exists public.revenue_estimates;
