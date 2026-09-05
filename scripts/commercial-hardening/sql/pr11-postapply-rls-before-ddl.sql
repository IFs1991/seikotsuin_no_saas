-- Recreate the exact pre-forward-fix read state inside an outer transaction.
-- The two policies must stop depending on the helper before it is dropped.

drop index public.customer_insurance_coverages_clinic_id_id_idx;
drop index public.menu_billing_profiles_clinic_id_id_idx;

alter policy customer_insurance_coverages_select_for_staff
on public.customer_insurance_coverages
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

alter policy menu_billing_profiles_select_for_staff
on public.menu_billing_profiles
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop function app_private.get_current_accessible_clinic_ids() restrict;

do $exact_before_contract$
begin
  if to_regclass(
      'public.customer_insurance_coverages_clinic_id_id_idx'
    ) is not null
    or to_regclass(
      'public.menu_billing_profiles_clinic_id_id_idx'
    ) is not null
    or to_regprocedure(
      'app_private.get_current_accessible_clinic_ids()'
    ) is not null
    or (
      select count(*)
      from pg_policies policy_data
      where policy_data.schemaname = 'public'
        and (policy_data.tablename, policy_data.policyname) in (
          values
            (
              'customer_insurance_coverages',
              'customer_insurance_coverages_select_for_staff'
            ),
            (
              'menu_billing_profiles',
              'menu_billing_profiles_select_for_staff'
            )
        )
        and md5(
          coalesce(policy_data.qual, '<NULL>')
          || chr(10)
          || coalesce(policy_data.with_check, '<NULL>')
        ) = '4c75ea819ae329a56c37e0a1585cb63f'
    ) <> 2
  then
    raise exception 'PR-11 post-apply RLS BEFORE definition drift';
  end if;
end
$exact_before_contract$;
