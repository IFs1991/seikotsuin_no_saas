-- PR-11 RLS-plan recovery guard.
--
-- Recreating broad ALL policies is not an automated rollback. This script
-- validates the meaning-preserving split and directs recovery to a reviewed
-- forward-fix without changing policies, grants, or data.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr11_rls_recovery_policy (
  table_name name not null,
  policy_name name not null,
  command text not null check (command in ('INSERT', 'UPDATE', 'DELETE')),
  intent_comment text not null,
  primary key (table_name, policy_name),
  unique (table_name, command)
) on commit drop;

insert into pr11_rls_recovery_policy values
  ('customer_insurance_coverages', 'customer_insurance_coverages_insert_for_clinic_pricing_admin', 'INSERT', 'PR-11: clinic pricing administrators may INSERT insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'),
  ('customer_insurance_coverages', 'customer_insurance_coverages_update_for_clinic_pricing_admin', 'UPDATE', 'PR-11: clinic pricing administrators may UPDATE insurance coverage rows only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.'),
  ('customer_insurance_coverages', 'customer_insurance_coverages_delete_for_clinic_pricing_admin', 'DELETE', 'PR-11: clinic pricing administrators may DELETE insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'),
  ('menu_billing_profiles', 'menu_billing_profiles_insert_for_clinic_pricing_admin', 'INSERT', 'PR-11: clinic pricing administrators may INSERT menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'),
  ('menu_billing_profiles', 'menu_billing_profiles_update_for_clinic_pricing_admin', 'UPDATE', 'PR-11: clinic pricing administrators may UPDATE menu billing profiles only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.'),
  ('menu_billing_profiles', 'menu_billing_profiles_delete_for_clinic_pricing_admin', 'DELETE', 'PR-11: clinic pricing administrators may DELETE menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.');

do $pr11_rls_recovery_guard$
declare
  duplicate_group_count bigint;
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 183 then
    raise exception 'PR-11 RLS recovery refused: public policy count drift';
  end if;

  if exists (
    select 1
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and (policy_data.tablename, policy_data.policyname) in (
        values
          (
            'customer_insurance_coverages',
            'customer_insurance_coverages_write_for_clinic_pricing_admin'
          ),
          (
            'menu_billing_profiles',
            'menu_billing_profiles_write_for_clinic_pricing_admin'
          )
      )
  ) then
    raise exception 'PR-11 RLS recovery refused: retired ALL policy returned';
  end if;

  if (select count(*) from pr11_rls_recovery_policy) <> 6
    or exists (
      select 1
      from pr11_rls_recovery_policy expected
      left join pg_policies actual
        on actual.schemaname = 'public'
       and actual.tablename = expected.table_name
       and actual.policyname = expected.policy_name
      left join pg_class table_catalog
        on table_catalog.oid = format('public.%I', expected.table_name)::regclass
      left join pg_policy policy_catalog
        on policy_catalog.polrelid = table_catalog.oid
       and policy_catalog.polname = expected.policy_name
      where actual.policyname is null
         or actual.permissive is distinct from 'PERMISSIVE'
         or actual.roles is distinct from array['authenticated']::name[]
         or actual.cmd is distinct from expected.command
         or (expected.command = 'INSERT' and (
           actual.qual is not null or actual.with_check is null
         ))
         or (expected.command = 'UPDATE' and (
           actual.qual is null or actual.with_check is null
         ))
         or (expected.command = 'DELETE' and (
           actual.qual is null or actual.with_check is not null
         ))
         or obj_description(policy_catalog.oid, 'pg_policy')
            is distinct from expected.intent_comment
    )
  then
    raise exception
      'PR-11 RLS recovery refused: exact split policy identity or shape drift';
  end if;

  if exists (
    with policy_components as (
      select
        policy_data.tablename,
        policy_data.policyname,
        policy_data.permissive,
        policy_data.roles,
        policy_data.cmd,
        policy_data.qual,
        policy_data.with_check,
        obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
      from pr11_rls_recovery_policy expected
      join pg_policies policy_data
        on policy_data.schemaname = 'public'
       and policy_data.tablename = expected.table_name
       and policy_data.policyname = expected.policy_name
      join pg_class table_catalog
        on table_catalog.oid = format(
          '%I.%I',
          policy_data.schemaname,
          policy_data.tablename
        )::regclass
      join pg_policy policy_catalog
        on policy_catalog.polrelid = table_catalog.oid
       and policy_catalog.polname = policy_data.policyname
    ), grouped as (
      select
        tablename,
        max(qual) filter (where cmd = 'UPDATE') as update_qual,
        max(with_check) filter (where cmd = 'UPDATE') as update_check,
        max(with_check) filter (where cmd = 'INSERT') as insert_check,
        max(qual) filter (where cmd = 'DELETE') as delete_qual,
        count(*) as policy_count,
        count(*) filter (
          where permissive = 'PERMISSIVE'
            and roles = array['authenticated']::name[]
            and intent_comment ~ '^PR-11:'
        ) as valid_metadata_count,
        count(*) filter (
          where (cmd = 'INSERT' and qual is null and with_check is not null)
             or (
               cmd = 'UPDATE'
               and qual is not null
               and with_check is not null
             )
             or (cmd = 'DELETE' and qual is not null and with_check is null)
        ) as valid_shape_count
      from policy_components
      group by tablename
    )
    select 1
    from grouped
    where policy_count <> 3
       or valid_metadata_count <> 3
       or valid_shape_count <> 3
       or update_qual is distinct from update_check
       or insert_check is distinct from update_check
       or delete_qual is distinct from update_qual
       or md5(
         coalesce(update_qual, '<NULL>')
         || chr(10)
         || coalesce(update_check, '<NULL>')
       ) <> '90836fd21bf2ea809a99a9fe167a69a5'
  ) then
    raise exception
      'PR-11 RLS recovery refused: split policy semantic drift. Disable the affected write path and use a reviewed forward-fix';
  end if;

  if (
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
      and policy_data.permissive = 'PERMISSIVE'
      and policy_data.roles = array['authenticated']::name[]
      and policy_data.cmd = 'SELECT'
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '4c75ea819ae329a56c37e0a1585cb63f'
  ) <> 2 then
    raise exception 'PR-11 RLS recovery refused: retained SELECT drift';
  end if;

  if exists (
    select 1
    from pg_class table_catalog
    where table_catalog.oid in (
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and not table_catalog.relrowsecurity
  ) then
    raise exception 'PR-11 RLS recovery refused: RLS disabled';
  end if;

  with expanded as (
    select
      policy_data.tablename,
      role_name,
      action_name
    from pg_policies policy_data
    cross join lateral unnest(policy_data.roles) roles(role_name)
    cross join lateral unnest(
      case policy_data.cmd
        when 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
        else array[policy_data.cmd]::text[]
      end
    ) actions(action_name)
    where policy_data.schemaname = 'public'
      and policy_data.permissive = 'PERMISSIVE'
  ), duplicate_groups as (
    select tablename, role_name, action_name
    from expanded
    group by tablename, role_name, action_name
    having count(*) > 1
  )
  select count(*) into duplicate_group_count from duplicate_groups;

  if duplicate_group_count <> 16 then
    raise exception
      'PR-11 RLS recovery refused: multiple-permissive residual drift (actual=%)',
      duplicate_group_count;
  end if;

  raise notice
    'PR-11 RLS recovery is validation-only; no policy was changed. Use a reviewed forward-fix.';
end
$pr11_rls_recovery_guard$;

commit;
