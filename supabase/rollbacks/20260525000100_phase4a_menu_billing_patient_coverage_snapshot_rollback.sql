-- Rollback for Phase 4A menu billing, coverage, and revenue breakdown snapshots.
-- This rollback refuses to destroy business snapshot data if Phase 4A rows exist.

do $$
begin
  if to_regclass('public.menu_template_billing_profiles') is not null
    and exists (select 1 from public.menu_template_billing_profiles limit 1)
  then
    raise exception 'Refusing rollback: menu_template_billing_profiles contains data';
  end if;

  if to_regclass('public.menu_billing_profiles') is not null
    and exists (select 1 from public.menu_billing_profiles limit 1)
  then
    raise exception 'Refusing rollback: menu_billing_profiles contains data';
  end if;

  if to_regclass('public.customer_insurance_coverages') is not null
    and exists (select 1 from public.customer_insurance_coverages limit 1)
  then
    raise exception 'Refusing rollback: customer_insurance_coverages contains data';
  end if;

  if exists (
    select 1
    from public.daily_report_items
    where menu_billing_profile_id is not null
      or customer_insurance_coverage_id is not null
      or patient_burden_rate is not null
      or coverage_resolution_source is not null
      or pricing_snapshot_status <> 'pending'
      or pricing_confirmed_at is not null
    limit 1
  ) then
    raise exception 'Refusing rollback: daily_report_items contains Phase 4A pricing snapshots';
  end if;

  if exists (
    select 1
    from public.revenue_estimate_lines
    where amount_role is not null
    limit 1
  ) then
    raise exception 'Refusing rollback: revenue_estimate_lines contains Phase 4A amount roles';
  end if;
end
$$;

drop view if exists public.daily_report_revenue_breakdown_summary;

drop trigger if exists daily_report_items_pricing_ref_check
on public.daily_report_items;
drop function if exists public.validate_daily_report_item_pricing_refs();

drop function if exists public.confirm_daily_report_item_pricing(
  uuid,
  uuid,
  integer,
  numeric,
  boolean,
  text,
  uuid
);

drop trigger if exists customer_insurance_coverages_overlap_guard
on public.customer_insurance_coverages;
drop trigger if exists customer_insurance_coverages_ref_check
on public.customer_insurance_coverages;
drop trigger if exists update_customer_insurance_coverages_updated_at
on public.customer_insurance_coverages;
drop function if exists public.reject_overlapping_confirmed_customer_coverage();
drop function if exists public.validate_customer_insurance_coverage_refs();

drop trigger if exists menu_billing_profiles_ref_check
on public.menu_billing_profiles;
drop trigger if exists update_menu_billing_profiles_updated_at
on public.menu_billing_profiles;
drop function if exists public.validate_menu_billing_profile_refs();

drop trigger if exists menu_template_billing_profiles_ref_check
on public.menu_template_billing_profiles;
drop trigger if exists update_menu_template_billing_profiles_updated_at
on public.menu_template_billing_profiles;
drop function if exists public.validate_menu_template_billing_profile_refs();

drop trigger if exists daily_report_items_recalculate_totals
on public.daily_report_items;

create trigger daily_report_items_recalculate_totals
after insert or update or delete on public.daily_report_items
for each row execute function public.sync_daily_report_item_totals();

alter table public.revenue_estimate_lines
  drop constraint if exists revenue_estimate_lines_amount_role_check,
  drop column if exists amount_role;

drop index if exists public.idx_revenue_estimate_lines_amount_role;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_patient_burden_rate_check,
  drop constraint if exists daily_report_items_coverage_resolution_source_check,
  drop constraint if exists daily_report_items_pricing_snapshot_status_check,
  drop column if exists menu_billing_profile_id,
  drop column if exists customer_insurance_coverage_id,
  drop column if exists patient_burden_rate,
  drop column if exists coverage_resolution_source,
  drop column if exists pricing_snapshot_status,
  drop column if exists pricing_confirmed_at;

drop index if exists public.idx_daily_report_items_coverage;
drop index if exists public.idx_customer_insurance_coverages_current_lookup;
drop index if exists public.idx_menu_billing_profiles_resolve;
drop index if exists public.idx_menu_template_billing_profiles_resolve;

drop table if exists public.customer_insurance_coverages;
drop table if exists public.menu_billing_profiles;
drop table if exists public.menu_template_billing_profiles;
