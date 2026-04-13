-- ================================================================
-- Rollback: Multiple Permissive Exact Duplicate Cleanup
-- ================================================================
-- Target: 20260413000500_multiple_permissive_exact_duplicate_cleanup.sql
-- ================================================================

begin;

drop policy if exists "staff_shifts_delete_policy" on public.staff_shifts;
create policy "staff_shifts_delete_policy" on public.staff_shifts
    for delete
    using (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and public.can_access_clinic(clinic_id)));

drop policy if exists "staff_shifts_insert_policy" on public.staff_shifts;
create policy "staff_shifts_insert_policy" on public.staff_shifts
    for insert
    with check (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and public.can_access_clinic(clinic_id)));

drop policy if exists "staff_shifts_select_policy" on public.staff_shifts;
create policy "staff_shifts_select_policy" on public.staff_shifts
    for select
    using (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])) and public.can_access_clinic(clinic_id)));

drop policy if exists "staff_shifts_update_policy" on public.staff_shifts;
create policy "staff_shifts_update_policy" on public.staff_shifts
    for update
    using (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and public.can_access_clinic(clinic_id)));

drop policy if exists "staff_preferences_delete_policy" on public.staff_preferences;
create policy "staff_preferences_delete_policy" on public.staff_preferences
    for delete
    using (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])) and public.can_access_clinic(clinic_id)));

drop policy if exists "staff_preferences_select_policy" on public.staff_preferences;
create policy "staff_preferences_select_policy" on public.staff_preferences
    for select
    using (((public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])) and public.can_access_clinic(clinic_id)));

commit;
