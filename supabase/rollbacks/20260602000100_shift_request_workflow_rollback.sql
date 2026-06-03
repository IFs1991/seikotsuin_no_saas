-- ================================================================
-- Rollback: Manager shift request workflow v0.2
-- ================================================================

begin;

set search_path = public, auth, extensions;

revoke all on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  from public, anon, authenticated, service_role;
drop function if exists public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text);

drop policy if exists "shift_request_audit_logs_select_scoped" on public.shift_request_audit_logs;
drop policy if exists "shift_requests_update_scoped" on public.shift_requests;
drop policy if exists "shift_requests_insert_scoped" on public.shift_requests;
drop policy if exists "shift_requests_select_scoped" on public.shift_requests;
drop policy if exists "shift_request_periods_update_managers" on public.shift_request_periods;
drop policy if exists "shift_request_periods_insert_managers" on public.shift_request_periods;
drop policy if exists "shift_request_periods_select_scoped" on public.shift_request_periods;

drop trigger if exists update_shift_requests_updated_at on public.shift_requests;
drop trigger if exists update_shift_request_periods_updated_at on public.shift_request_periods;
drop trigger if exists validate_shift_requests_clinic_refs_trigger on public.shift_requests;
drop function if exists public.validate_shift_requests_clinic_refs();

drop index if exists public.shift_request_audit_logs_actor_created_idx;
drop index if exists public.shift_request_audit_logs_request_created_idx;
drop index if exists public.shift_request_audit_logs_period_created_idx;
drop index if exists public.shift_request_audit_logs_clinic_created_idx;
drop index if exists public.staff_shifts_conversion_overlap_idx;
drop index if exists public.shift_requests_approved_constraints_idx;
drop index if exists public.shift_requests_convertible_idx;
drop index if exists public.shift_requests_clinic_type_status_idx;
drop index if exists public.shift_requests_converted_shift_idx;
drop index if exists public.shift_requests_period_staff_idx;
drop index if exists public.shift_requests_clinic_staff_time_idx;
drop index if exists public.shift_requests_clinic_period_status_idx;
drop index if exists public.shift_request_periods_clinic_status_deadline_idx;
drop index if exists public.shift_request_periods_clinic_range_idx;

drop table if exists public.shift_request_audit_logs;
drop table if exists public.shift_requests;
drop table if exists public.shift_request_periods;

-- Restore the pre-migration legacy policy. This rollback intentionally returns
-- to the prior state; applying the forward migration removes it again.
create policy "staff_preferences_insert"
on public.staff_preferences
for insert
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin', 'manager', 'therapist', 'staff'])
  and app_private.can_access_clinic(clinic_id)
);

commit;
