-- Rollback for insurance fee system master Phase 3A-1.
-- Destructive: drops insurance fee master sources, schedules, items, warnings, and diffs.

drop trigger if exists insurance_fee_items_mutation_guard
on public.insurance_fee_items;

drop trigger if exists insurance_fee_schedules_revision_guard
on public.insurance_fee_schedules;

drop trigger if exists insurance_fee_schedules_active_range_check
on public.insurance_fee_schedules;

drop trigger if exists update_insurance_fee_warning_definitions_updated_at
on public.insurance_fee_warning_definitions;

drop trigger if exists update_insurance_fee_items_updated_at
on public.insurance_fee_items;

drop trigger if exists update_insurance_fee_schedules_updated_at
on public.insurance_fee_schedules;

drop trigger if exists update_insurance_fee_sources_updated_at
on public.insurance_fee_sources;

revoke execute on function public.protect_insurance_fee_schedule_revision()
from service_role;

revoke execute on function public.validate_insurance_fee_item_mutation()
from service_role;

revoke execute on function public.validate_insurance_fee_schedule_active_range()
from service_role;

drop function if exists public.validate_insurance_fee_item_mutation();
drop function if exists public.protect_insurance_fee_schedule_revision();
drop function if exists public.validate_insurance_fee_schedule_active_range();

drop policy if exists "insurance_fee_revision_diffs_select_for_authenticated"
on public.insurance_fee_revision_diffs;

drop policy if exists "insurance_fee_warning_definitions_select_for_authenticated"
on public.insurance_fee_warning_definitions;

drop policy if exists "insurance_fee_items_select_for_authenticated"
on public.insurance_fee_items;

drop policy if exists "insurance_fee_schedules_select_for_authenticated"
on public.insurance_fee_schedules;

drop policy if exists "insurance_fee_source_snapshots_select_for_authenticated"
on public.insurance_fee_source_snapshots;

drop policy if exists "insurance_fee_sources_select_for_authenticated"
on public.insurance_fee_sources;

drop index if exists public.idx_insurance_fee_revision_diffs_schedule_pair;
drop index if exists public.idx_insurance_fee_items_schedule_sort;
drop index if exists public.idx_insurance_fee_schedules_active_resolver;
drop index if exists public.idx_insurance_fee_source_snapshots_source_recorded;

drop table if exists public.insurance_fee_revision_diffs;
drop table if exists public.insurance_fee_warning_definitions;
drop table if exists public.insurance_fee_items;
drop table if exists public.insurance_fee_schedules;
drop table if exists public.insurance_fee_source_snapshots;
drop table if exists public.insurance_fee_sources;
