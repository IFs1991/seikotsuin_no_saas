-- Rollback for:
-- supabase/migrations/20260625000100_staff_profiles_memberships.sql
--
-- Data-loss warning:
-- This removes staff_profiles, staff_clinic_memberships, and the helper
-- staff_shifts columns introduced for help assignment. Run only before
-- production help assignment data is relied upon, or after exporting the data.

drop policy if exists "staff_clinic_memberships_write_admin_only"
on public.staff_clinic_memberships;
drop policy if exists "staff_clinic_memberships_select_scoped"
on public.staff_clinic_memberships;
drop policy if exists "staff_profiles_write_admin_only"
on public.staff_profiles;
drop policy if exists "staff_profiles_select_scoped"
on public.staff_profiles;

drop trigger if exists update_staff_clinic_memberships_updated_at
on public.staff_clinic_memberships;
drop trigger if exists update_staff_profiles_updated_at
on public.staff_profiles;

alter table if exists public.staff_shifts
  drop constraint if exists staff_shifts_time_preset_check,
  drop constraint if exists staff_shifts_assignment_type_check,
  drop column if exists source_shift_request_id,
  drop column if exists time_preset,
  drop column if exists assignment_type,
  drop column if exists home_clinic_id,
  drop column if exists staff_profile_id;

drop table if exists public.staff_clinic_memberships;
drop table if exists public.staff_profiles;
