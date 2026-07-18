-- Commercial hardening PR-11: meaning-preserving RLS plan cleanup.
-- @spec docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md
-- @rollback supabase/rollbacks/20260716160402_commercial_rls_plan_cleanup_rollback.sql
--
-- Two reviewed ALL write policies overlap broader SELECT policies. Each ALL
-- policy is split into INSERT/UPDATE/DELETE policies with byte-equivalent
-- predicate text. No actor, role, clinic scope, grant, or read policy changes.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr11_rls_write_source on commit drop as
select
  policy_data.tablename::name as table_name,
  policy_data.policyname::name as retired_policy_name,
  policy_data.qual,
  policy_data.with_check
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
  );

create temporary table pr11_rls_new_policy_contract (
  table_name name not null,
  policy_name name not null,
  command text not null check (command in ('INSERT', 'UPDATE', 'DELETE')),
  intent_comment text not null,
  primary key (table_name, policy_name),
  unique (table_name, command)
) on commit drop;

insert into pr11_rls_new_policy_contract values
  (
    'customer_insurance_coverages',
    'customer_insurance_coverages_insert_for_clinic_pricing_admin',
    'INSERT',
    'PR-11: clinic pricing administrators may INSERT insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'
  ),
  (
    'customer_insurance_coverages',
    'customer_insurance_coverages_update_for_clinic_pricing_admin',
    'UPDATE',
    'PR-11: clinic pricing administrators may UPDATE insurance coverage rows only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.'
  ),
  (
    'customer_insurance_coverages',
    'customer_insurance_coverages_delete_for_clinic_pricing_admin',
    'DELETE',
    'PR-11: clinic pricing administrators may DELETE insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'
  ),
  (
    'menu_billing_profiles',
    'menu_billing_profiles_insert_for_clinic_pricing_admin',
    'INSERT',
    'PR-11: clinic pricing administrators may INSERT menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'
  ),
  (
    'menu_billing_profiles',
    'menu_billing_profiles_update_for_clinic_pricing_admin',
    'UPDATE',
    'PR-11: clinic pricing administrators may UPDATE menu billing profiles only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.'
  ),
  (
    'menu_billing_profiles',
    'menu_billing_profiles_delete_for_clinic_pricing_admin',
    'DELETE',
    'PR-11: clinic pricing administrators may DELETE menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.'
  );

create temporary table pr11_rls_unaffected_snapshot on commit drop as
select
  policy_data.schemaname,
  policy_data.tablename,
  policy_data.policyname,
  policy_data.permissive,
  policy_data.roles,
  policy_data.cmd,
  policy_data.qual,
  policy_data.with_check,
  obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
from pg_policies policy_data
join pg_class table_catalog
  on table_catalog.oid = format(
    '%I.%I',
    policy_data.schemaname,
    policy_data.tablename
  )::regclass
join pg_namespace namespace_catalog
  on namespace_catalog.oid = table_catalog.relnamespace
 and namespace_catalog.nspname = policy_data.schemaname
join pg_policy policy_catalog
  on policy_catalog.polrelid = table_catalog.oid
 and policy_catalog.polname = policy_data.policyname
where policy_data.schemaname = 'public'
  and (policy_data.tablename, policy_data.policyname) not in (
    values
      (
        'customer_insurance_coverages',
        'customer_insurance_coverages_write_for_clinic_pricing_admin'
      ),
      (
        'menu_billing_profiles',
        'menu_billing_profiles_write_for_clinic_pricing_admin'
      )
  );

do $pr11_rls_preflight$
declare
  duplicate_group_count bigint;
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 179 then
    raise exception 'PR-11 RLS preflight failed: reviewed public policy count drift';
  end if;

  if (select count(*) from pr11_rls_write_source) <> 2
    or exists (
      select 1
      from pg_policies policy_data
      where policy_data.schemaname = 'public'
        and (policy_data.tablename, policy_data.policyname) in (
          select table_name::text, retired_policy_name::text
          from pr11_rls_write_source
        )
        and (
          policy_data.permissive <> 'PERMISSIVE'
          or policy_data.roles <> array['authenticated']::name[]
          or policy_data.cmd <> 'ALL'
          or md5(
            coalesce(policy_data.qual, '<NULL>')
            || chr(10)
            || coalesce(policy_data.with_check, '<NULL>')
          ) <> '90836fd21bf2ea809a99a9fe167a69a5'
        )
    )
  then
    raise exception
      'PR-11 RLS preflight failed: reviewed ALL policy identity or predicate drift';
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
    raise exception
      'PR-11 RLS preflight failed: broader retained SELECT policy drift';
  end if;

  if exists (
    select 1
    from pr11_rls_new_policy_contract expected
    join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = expected.table_name
     and actual.policyname = expected.policy_name
  ) then
    raise exception 'PR-11 RLS preflight failed: new policy name conflict';
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
    raise exception 'PR-11 RLS preflight failed: RLS disabled on target table';
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

  if duplicate_group_count <> 18 then
    raise exception
      'PR-11 RLS preflight failed: multiple-permissive baseline drift (actual=%)',
      duplicate_group_count;
  end if;
end
$pr11_rls_preflight$;

drop policy customer_insurance_coverages_write_for_clinic_pricing_admin
on public.customer_insurance_coverages;

create policy customer_insurance_coverages_insert_for_clinic_pricing_admin
on public.customer_insurance_coverages
for insert
to authenticated
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

create policy customer_insurance_coverages_update_for_clinic_pricing_admin
on public.customer_insurance_coverages
for update
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

create policy customer_insurance_coverages_delete_for_clinic_pricing_admin
on public.customer_insurance_coverages
for delete
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

drop policy menu_billing_profiles_write_for_clinic_pricing_admin
on public.menu_billing_profiles;

create policy menu_billing_profiles_insert_for_clinic_pricing_admin
on public.menu_billing_profiles
for insert
to authenticated
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

create policy menu_billing_profiles_update_for_clinic_pricing_admin
on public.menu_billing_profiles
for update
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

create policy menu_billing_profiles_delete_for_clinic_pricing_admin
on public.menu_billing_profiles
for delete
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

comment on policy
  customer_insurance_coverages_insert_for_clinic_pricing_admin
on public.customer_insurance_coverages is
  'PR-11: clinic pricing administrators may INSERT insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.';

comment on policy
  customer_insurance_coverages_update_for_clinic_pricing_admin
on public.customer_insurance_coverages is
  'PR-11: clinic pricing administrators may UPDATE insurance coverage rows only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.';

comment on policy
  customer_insurance_coverages_delete_for_clinic_pricing_admin
on public.customer_insurance_coverages is
  'PR-11: clinic pricing administrators may DELETE insurance coverage rows only within DB-authorized clinic scope; predicate copied from the retired ALL policy.';

comment on policy menu_billing_profiles_insert_for_clinic_pricing_admin
on public.menu_billing_profiles is
  'PR-11: clinic pricing administrators may INSERT menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.';

comment on policy menu_billing_profiles_update_for_clinic_pricing_admin
on public.menu_billing_profiles is
  'PR-11: clinic pricing administrators may UPDATE menu billing profiles only within DB-authorized clinic scope; USING and WITH CHECK copied from the retired ALL policy.';

comment on policy menu_billing_profiles_delete_for_clinic_pricing_admin
on public.menu_billing_profiles is
  'PR-11: clinic pricing administrators may DELETE menu billing profiles only within DB-authorized clinic scope; predicate copied from the retired ALL policy.';

do $pr11_rls_postflight$
declare
  duplicate_group_count bigint;
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> 183 then
    raise exception 'PR-11 RLS postflight failed: reviewed public policy count drift';
  end if;

  if exists (
    with actual as (
      select
        policy_data.schemaname,
        policy_data.tablename,
        policy_data.policyname,
        policy_data.permissive,
        policy_data.roles,
        policy_data.cmd,
        policy_data.qual,
        policy_data.with_check,
        obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
      from pg_policies policy_data
      join pg_class table_catalog
        on table_catalog.oid = format(
          '%I.%I',
          policy_data.schemaname,
          policy_data.tablename
        )::regclass
      join pg_policy policy_catalog
        on policy_catalog.polrelid = table_catalog.oid
       and policy_catalog.polname = policy_data.policyname
      where policy_data.schemaname = 'public'
        and not exists (
          select 1
          from pr11_rls_new_policy_contract target
          where target.table_name = policy_data.tablename
            and target.policy_name = policy_data.policyname
        )
    ), drift_rows as (
      (select * from pr11_rls_unaffected_snapshot except select * from actual)
      union all
      (select * from actual except select * from pr11_rls_unaffected_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception 'PR-11 RLS postflight failed: unrelated policy drift';
  end if;

  if exists (
    select 1
    from pr11_rls_new_policy_contract expected
    join pr11_rls_write_source source
      on source.table_name = expected.table_name
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
       or actual.permissive <> 'PERMISSIVE'
       or actual.roles <> array['authenticated']::name[]
       or actual.cmd <> expected.command
       or actual.qual is distinct from case
         when expected.command = 'INSERT' then null
         else source.qual
       end
       or actual.with_check is distinct from case
         when expected.command = 'DELETE' then null
         else source.with_check
       end
       or obj_description(policy_catalog.oid, 'pg_policy')
          is distinct from expected.intent_comment
  ) then
    raise exception
      'PR-11 RLS postflight failed: split policy predicate/comment drift';
  end if;

  if exists (
    select 1
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and (policy_data.tablename, policy_data.policyname) in (
        select table_name::text, retired_policy_name::text
        from pr11_rls_write_source
      )
  ) then
    raise exception 'PR-11 RLS postflight failed: retired ALL policy remains';
  end if;

  if exists (
    select 1
    from pg_policy policy_catalog
    join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
    join pg_namespace namespace_catalog
      on namespace_catalog.oid = table_catalog.relnamespace
    where namespace_catalog.nspname = 'public'
      and coalesce(obj_description(policy_catalog.oid, 'pg_policy'), '')
          !~ '^PR-(03|11):'
  ) then
    raise exception 'PR-11 RLS postflight failed: policy comment provenance drift';
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
      'PR-11 RLS postflight failed: multiple-permissive residual drift (actual=%)',
      duplicate_group_count;
  end if;
end
$pr11_rls_postflight$;

commit;
