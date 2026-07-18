-- Transaction-only PR-11 RLS statement-scope candidate.
-- The caller owns the transaction and must ROLLBACK.

do $candidate_preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'PR-11 RLS candidate requires postgres';
  end if;

  if to_regprocedure(
      'app_private.get_current_accessible_clinic_ids()'
    ) is not null
    or to_regclass(
      'public.customer_insurance_coverages_clinic_id_id_idx'
    ) is not null
    or to_regclass(
      'public.menu_billing_profiles_clinic_id_id_idx'
    ) is not null
  then
    raise exception 'PR-11 RLS candidate identity collision';
  end if;
end
$candidate_preflight$;

create function app_private.get_current_accessible_clinic_ids()
returns uuid[]
language sql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
  with current_authorities as (
    select distinct up.clinic_id as primary_clinic_id
    from public.user_permissions up
    join public.profiles profile_data
      on profile_data.user_id = up.staff_id
     and profile_data.is_active is true
    where up.staff_id = (select auth.uid())
  ), organization_roots as (
    select
      authority.primary_clinic_id,
      coalesce(clinic_data.parent_id, authority.primary_clinic_id)
        as root_clinic_id
    from current_authorities authority
    left join public.clinics clinic_data
      on clinic_data.id = authority.primary_clinic_id
  ), candidate_clinics as (
    select authority.primary_clinic_id as clinic_id
    from current_authorities authority
    where authority.primary_clinic_id is not null

    union

    select roots.root_clinic_id
    from organization_roots roots
    where roots.root_clinic_id is not null

    union

    select child_clinic.id
    from organization_roots roots
    join public.clinics child_clinic
      on child_clinic.parent_id = roots.root_clinic_id

    union

    select assignment.clinic_id
    from public.manager_clinic_assignments assignment
    where assignment.manager_user_id = (select auth.uid())
      and assignment.revoked_at is null
  )
  select coalesce(
    array_agg(candidate_clinics.clinic_id order by candidate_clinics.clinic_id),
    array[]::uuid[]
  )
  from candidate_clinics
  where app_private.can_access_clinic(candidate_clinics.clinic_id)
$function$;

alter function app_private.get_current_accessible_clinic_ids()
owner to postgres;

revoke all
on function app_private.get_current_accessible_clinic_ids()
from public, anon, authenticated, service_role;

grant execute
on function app_private.get_current_accessible_clinic_ids()
to authenticated;

comment on function app_private.get_current_accessible_clinic_ids() is
  'PR-11-FIX: statement-stable DB-authoritative clinic scope for the two reviewed SELECT policies.';

alter policy customer_insurance_coverages_select_for_staff
on public.customer_insurance_coverages
to authenticated
using (
  (select app_private.get_current_role()) = any (
    array[
      'admin'::text,
      'clinic_admin'::text,
      'manager'::text,
      'therapist'::text,
      'staff'::text
    ]
  )
  and customer_insurance_coverages.clinic_id = any (
    ((select app_private.get_current_accessible_clinic_ids()))::uuid[]
  )
);

alter policy menu_billing_profiles_select_for_staff
on public.menu_billing_profiles
to authenticated
using (
  (select app_private.get_current_role()) = any (
    array[
      'admin'::text,
      'clinic_admin'::text,
      'manager'::text,
      'therapist'::text,
      'staff'::text
    ]
  )
  and menu_billing_profiles.clinic_id = any (
    ((select app_private.get_current_accessible_clinic_ids()))::uuid[]
  )
);

create index customer_insurance_coverages_clinic_id_id_idx
on public.customer_insurance_coverages using btree (clinic_id, id);

create index menu_billing_profiles_clinic_id_id_idx
on public.menu_billing_profiles using btree (clinic_id, id);

comment on index public.customer_insurance_coverages_clinic_id_id_idx is
  'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.';

comment on index public.menu_billing_profiles_clinic_id_id_idx is
  'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.';

\ir ../red-contracts/13_pr11_rls_statement_scope.sql

select jsonb_build_object(
  'kind', 'rls_scope_candidate_catalog',
  'helper_count', 1,
  'helper_contract_pass', true,
  'policy_count', 2,
  'policy_contract_pass', true,
  'index_count', 2,
  'index_contract_pass', true,
  'source_helpers_unchanged', true,
  'contract_pass', true
) as candidate_catalog;
