-- Rollback for revenue estimate fee item link Phase 3B.
-- Drops only Phase 3B provenance metadata. Estimate rows remain.

drop index if exists public.idx_revenue_estimate_overrides_reason_code;
drop index if exists public.idx_revenue_estimate_lines_schedule_item;
drop index if exists public.idx_revenue_estimate_lines_fee_item;
drop index if exists public.idx_revenue_estimates_used_schedule;

drop trigger if exists revenue_estimate_lines_insurance_fee_ref_check
on public.revenue_estimate_lines;

drop trigger if exists revenue_estimates_insurance_fee_ref_check
on public.revenue_estimates;

drop function if exists public.validate_revenue_estimate_line_insurance_fee_refs();
drop function if exists public.validate_revenue_estimate_insurance_fee_refs();

alter table public.revenue_estimate_overrides
  drop constraint if exists revenue_estimate_overrides_reason_code_check,
  drop column if exists override_reason_code;

alter table public.revenue_estimate_lines
  drop constraint if exists revenue_estimate_lines_fee_item_link_check,
  drop constraint if exists revenue_estimate_lines_source_snapshot_hash_fkey,
  drop constraint if exists revenue_estimate_lines_schedule_item_fkey,
  drop constraint if exists revenue_estimate_lines_schedule_code_fkey,
  drop constraint if exists revenue_estimate_lines_fee_item_id_fkey,
  drop column if exists source_snapshot_hash,
  drop column if exists fee_item_code,
  drop column if exists schedule_code,
  drop column if exists insurance_fee_item_id;

alter table public.revenue_estimates
  drop constraint if exists revenue_estimates_schedule_link_check,
  drop constraint if exists revenue_estimates_source_snapshot_hash_fkey,
  drop constraint if exists revenue_estimates_used_schedule_code_fkey,
  drop column if exists source_snapshot_hash,
  drop column if exists used_schedule_code;
