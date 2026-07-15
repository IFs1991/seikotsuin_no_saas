begin;

set local search_path = pg_catalog, extensions, public, auth;

set local role postgres;

grant usage on schema extensions
  to session_user, anon, authenticated, service_role;

reset role;

select plan(27);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
      and c.relkind = 'r'
  ),
  5::bigint,
  'the PR-07 quarantine contains exactly five ordinary legacy tables'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
      and c.relkind = 'r'
      and c.relrowsecurity
  ),
  5::bigint,
  'row-level security is enabled on every quarantined legacy table'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
  ),
  0::bigint,
  'quarantined legacy tables have no RLS policies'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    ]) privilege(privilege_type)
    where n.nspname = 'public'
      and c.relname in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
      and c.relkind = 'r'
      and has_table_privilege(
        client.role_name,
        c.oid,
        privilege.privilege_type
      )
  ),
  0::bigint,
  'anon and authenticated have no effective legacy-table privileges'
);

select is(
  (
    select count(*)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    cross join unnest(array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'REFERENCES'
    ]) privilege(privilege_type)
    where n.nspname = 'public'
      and c.relname in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege(
        client.role_name,
        c.oid,
        a.attnum,
        privilege.privilege_type
      )
  ),
  0::bigint,
  'anon and authenticated have no effective legacy-column privileges'
);

select is(
  (
    with expected(table_name, privilege_type) as (
      values
        ('revenues', 'SELECT'),
        ('visits', 'SELECT')
    ),
    actual as (
      select c.relname as table_name, privilege.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN'
      ]) privilege(privilege_type)
      where n.nspname = 'public'
        and c.relname in (
          'appointments',
          'revenues',
          'treatment_menu_records',
          'treatments',
          'visits'
        )
        and c.relkind = 'r'
        and has_table_privilege(
          'service_role',
          c.oid,
          privilege.privilege_type
        )
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'service_role legacy privileges are exactly SELECT on visits and revenues'
);

select is(
  (
    select count(*)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and c.relname in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and grantee.rolname = 'service_role'
  ),
  0::bigint,
  'service_role has no column-level legacy privilege escape hatch'
);

select is(
  (
    with expected(table_name, role_name, privilege_type, is_grantable) as (
      values
        ('revenues', 'service_role', 'SELECT', false),
        ('visits', 'service_role', 'SELECT', false)
    ),
    actual as (
      select
        c.relname::text as table_name,
        coalesce(grantee.rolname::text, 'PUBLIC') as role_name,
        acl.privilege_type,
        acl.is_grantable
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, acldefault('r', c.relowner))
      ) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and c.relname in (
          'appointments',
          'revenues',
          'treatment_menu_records',
          'treatments',
          'visits'
        )
        and c.relkind = 'r'
        and acl.grantee <> c.relowner
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'non-owner legacy table ACLs are exactly the two reviewed service reads'
);

select is(
  (
    select count(*)
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname in ('anon', 'authenticated', 'service_role')
  ),
  0::bigint,
  'runtime API roles inherit or SET no privilege-bearing parent role'
);

select is(
  (
    (select count(*) from public.visits where clinic_id is null)
    +
    (select count(*) from public.revenues where clinic_id is null)
  ),
  0::bigint,
  'visits and revenues contain no unresolved null clinic_id rows'
);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_hourly_visit_pattern'
      and p.pronargs = 1
      and p.proargtypes[0] = 'uuid'::regtype::oid
      and not p.prosecdef
      and coalesce(p.proconfig, array[]::text[])
        @> array['search_path=public, auth, extensions']
  ),
  1::bigint,
  'the legacy heatmap remains SECURITY INVOKER with a fixed search_path'
);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_language language_data on language_data.oid = p.prolang
    where p.oid = to_regprocedure('public.get_hourly_visit_pattern(uuid)')
      and pg_get_function_result(p.oid) =
        'TABLE(hour_of_day integer, day_of_week integer, visit_count integer, avg_revenue numeric)'
      and pg_get_function_arguments(p.oid) = 'clinic_uuid uuid'
      and language_data.lanname = 'plpgsql'
      and p.provolatile = 'v'
      and p.proparallel = 'u'
      and not p.proisstrict
      and not p.proleakproof
      and regexp_replace(
        lower(btrim(p.prosrc)),
        '[[:space:]]+',
        ' ',
        'g'
      ) = regexp_replace(
        lower(btrim($reviewed_body$
begin
  return query
  select
    extract(hour from v.visit_date)::integer as hour_of_day,
    extract(dow from v.visit_date)::integer as day_of_week,
    count(v.id)::integer as visit_count,
    avg(r.amount)::decimal(10, 2) as avg_revenue
  from public.visits v
  left join public.revenues r
    on r.visit_id = v.id
    and r.clinic_id = v.clinic_id
  where v.clinic_id = clinic_uuid
    and v.visit_date >= current_date - interval '30 days'
  group by
    extract(hour from v.visit_date),
    extract(dow from v.visit_date)
  order by day_of_week, hour_of_day;
end;
$reviewed_body$)),
        '[[:space:]]+',
        ' ',
        'g'
      )
  ),
  1::bigint,
  'the legacy heatmap body preserves both clinic filters and reviewed semantics'
);

select is(
  (
    with expected(role_name, privilege_type, is_grantable) as (
      values ('service_role', 'EXECUTE', false)
    ),
    actual as (
      select
        case
          when acl.grantee = 0 then 'PUBLIC'
          else grantee.rolname::text
        end as role_name,
        acl.privilege_type,
        acl.is_grantable
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      left join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = 'public'
        and p.proname = 'get_hourly_visit_pattern'
        and p.pronargs = 1
        and p.proargtypes[0] = 'uuid'::regtype::oid
        and acl.grantee <> p.proowner
        and acl.privilege_type = 'EXECUTE'
    ),
    differences as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select count(*) from differences
  ),
  0::bigint,
  'the legacy heatmap non-owner EXECUTE ACL belongs only to service_role'
);

set local role anon;

select throws_ok(
  'select * from public.visits limit 0',
  '42501',
  null::text,
  'anon cannot directly read a quarantined legacy table'
);

reset role;
set local role authenticated;

select throws_ok(
  'select * from public.revenues limit 0',
  '42501',
  null::text,
  'authenticated cannot directly read a quarantined legacy table'
);

reset role;
set local role anon;

select ok(
  not has_function_privilege(
    current_user,
    'public.get_hourly_visit_pattern(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the quarantined legacy heatmap'
);

reset role;
set local role authenticated;

select ok(
  not has_function_privilege(
    current_user,
    'public.get_hourly_visit_pattern(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the quarantined legacy heatmap'
);

reset role;
set local role service_role;

select lives_ok(
  'select * from public.visits limit 0',
  'service_role can read visits for the reviewed compatibility path'
);

select lives_ok(
  'select * from public.revenues limit 0',
  'service_role can read revenues for the reviewed compatibility path'
);

select throws_ok(
  'select * from public.appointments limit 0',
  '42501',
  null::text,
  'service_role cannot read quarantined appointments'
);

select throws_ok(
  'select * from public.treatments limit 0',
  '42501',
  null::text,
  'service_role cannot read quarantined treatments'
);

select throws_ok(
  'select * from public.treatment_menu_records limit 0',
  '42501',
  null::text,
  'service_role cannot read quarantined treatment menu records'
);

select throws_ok(
  'insert into public.visits default values',
  '42501',
  null::text,
  'service_role cannot insert into legacy tables'
);

select throws_ok(
  'update public.revenues set amount = amount where false',
  '42501',
  null::text,
  'service_role cannot update legacy tables'
);

select throws_ok(
  'delete from public.visits where false',
  '42501',
  null::text,
  'service_role cannot delete from legacy tables'
);

select throws_ok(
  'truncate table public.revenues',
  '42501',
  null::text,
  'service_role cannot truncate legacy tables'
);

select lives_ok(
  $query$
    select count(*)
    from public.get_hourly_visit_pattern(
      '00000000-0000-0000-0000-000000000000'
    )
  $query$,
  'service_role can execute the reviewed legacy heatmap path'
);

reset role;

select * from finish();

rollback;
