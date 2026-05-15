-- Rollback for care episode and visit stage Phase 2.
-- Destructive: removes care episode links and visit stage analysis data.

drop trigger if exists daily_report_items_analysis_ref_check
on public.daily_report_items;

revoke execute on function public.validate_daily_report_items_analysis_refs()
from service_role;

drop function if exists public.validate_daily_report_items_analysis_refs();

drop index if exists public.idx_daily_report_items_visit_stage;
drop index if exists public.idx_daily_report_items_care_episode;

alter table if exists public.daily_report_items
  drop constraint if exists daily_report_items_visit_ordinal_check,
  drop constraint if exists daily_report_items_visit_stage_code_fkey,
  drop constraint if exists daily_report_items_care_episode_id_fkey;

alter table if exists public.daily_report_items
  drop column if exists visit_stage_code,
  drop column if exists visit_ordinal_in_episode,
  drop column if exists care_episode_id;

drop policy if exists "care_episodes_update_for_staff"
on public.care_episodes;

drop policy if exists "care_episodes_insert_for_staff"
on public.care_episodes;

drop policy if exists "care_episodes_select_for_staff"
on public.care_episodes;

drop trigger if exists update_care_episodes_updated_at
on public.care_episodes;

drop index if exists public.idx_care_episodes_clinic_started_on;
drop index if exists public.idx_care_episodes_clinic_customer_status;

drop table if exists public.care_episodes;

drop policy if exists "visit_stage_definitions_select_for_authenticated"
on public.visit_stage_definitions;

drop trigger if exists update_visit_stage_definitions_updated_at
on public.visit_stage_definitions;

drop table if exists public.visit_stage_definitions;
