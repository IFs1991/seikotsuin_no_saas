do $commercial_red$
declare
  contract_drift text;
begin
  with legacy(table_name, relation, service_select_required) as (
    values
      ('appointments', 'public.appointments'::regclass, false),
      ('revenues', 'public.revenues'::regclass, true),
      ('treatment_menu_records', 'public.treatment_menu_records'::regclass, false),
      ('treatments', 'public.treatments'::regclass, false),
      ('visits', 'public.visits'::regclass, true)
  ),
  expected_table_acl(relation, role_name, privilege_type, is_grantable) as (
    values
      ('public.revenues'::regclass, 'service_role', 'SELECT', false),
      ('public.visits'::regclass, 'service_role', 'SELECT', false)
  ),
  actual_table_acl as (
    select
      legacy.relation,
      coalesce(grantee.rolname::text, 'PUBLIC') as role_name,
      acl.privilege_type,
      acl.is_grantable
    from legacy
    join pg_class relation_data on relation_data.oid = legacy.relation
    cross join lateral aclexplode(
      coalesce(
        relation_data.relacl,
        acldefault('r', relation_data.relowner)
      )
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> relation_data.relowner
  ),
  table_acl_drift as (
    select 'missing' as drift_type, missing.*
    from (
      select * from expected_table_acl
      except
      select * from actual_table_acl
    ) missing
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select * from actual_table_acl
      except
      select * from expected_table_acl
    ) unexpected
  ),
  expected_function_acl(role_name, privilege_type, is_grantable) as (
    values ('service_role', 'EXECUTE', false)
  ),
  actual_function_acl as (
    select
      coalesce(grantee.rolname::text, 'PUBLIC') as role_name,
      acl.privilege_type,
      acl.is_grantable
    from pg_proc routine
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where routine.oid = to_regprocedure(
      'public.get_hourly_visit_pattern(uuid)'
    )
      and acl.grantee <> routine.proowner
  ),
  function_acl_drift as (
    select 'missing' as drift_type, missing.*
    from (
      select * from expected_function_acl
      except
      select * from actual_function_acl
    ) missing
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select * from actual_function_acl
      except
      select * from expected_function_acl
    ) unexpected
  ),
  violations as (
    select format(
      '%s:%s:%s',
      legacy.table_name,
      client.role_name,
      privilege.privilege_type
    ) as violation
    from legacy
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
    where has_table_privilege(
      client.role_name,
      legacy.relation,
      privilege.privilege_type
    )

    union all

    select format('%s:service_role:missing SELECT', legacy.table_name)
    from legacy
    where not has_table_privilege(
      'service_role',
      legacy.relation,
      'SELECT'
    )
      and legacy.service_select_required

    union all

    select format('%s:service_role:unexpected SELECT', legacy.table_name)
    from legacy
    where has_table_privilege(
      'service_role',
      legacy.relation,
      'SELECT'
    )
      and not legacy.service_select_required

    union all

    select format(
      '%s:service_role:%s',
      legacy.table_name,
      privilege.privilege_type
    )
    from legacy
    cross join unnest(array[
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    ]) privilege(privilege_type)
    where has_table_privilege(
      'service_role',
      legacy.relation,
      privilege.privilege_type
    )

    union all

    select format(
      'direct table ACL %s:%s:%s:%s:grantable=%s',
      drift_type,
      relation,
      role_name,
      privilege_type,
      is_grantable
    )
    from table_acl_drift

    union all

    select format(
      'column ACL:%s.%s:%s:%s',
      legacy.table_name,
      attribute.attname,
      coalesce(grantee.rolname::text, 'PUBLIC'),
      acl.privilege_type
    )
    from legacy
    join pg_class relation_data on relation_data.oid = legacy.relation
    join pg_attribute attribute
      on attribute.attrelid = legacy.relation
     and attribute.attnum > 0
     and not attribute.attisdropped
    cross join lateral aclexplode(attribute.attacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> relation_data.relowner

    union all

    select 'runtime role membership:' || member_role.rolname || '->' ||
      granted_role.rolname
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    join pg_roles granted_role on granted_role.oid = membership.roleid
    where member_role.rolname in ('anon', 'authenticated', 'service_role')

    union all

    select legacy.table_name || ':RLS disabled'
    from legacy
    join pg_class table_catalog on table_catalog.oid = legacy.relation
    where not table_catalog.relrowsecurity

    union all

    select policies.tablename || ':policy:' || policies.policyname
    from pg_policies policies
    where policies.schemaname = 'public'
      and policies.tablename in (
        'appointments',
        'revenues',
        'treatment_menu_records',
        'treatments',
        'visits'
      )

    union all

    select 'revenues:NULL clinic_id:' || count(*)::text
    from public.revenues
    where clinic_id is null
    having count(*) > 0

    union all

    select 'visits:NULL clinic_id:' || count(*)::text
    from public.visits
    where clinic_id is null
    having count(*) > 0

    union all

    select 'get_hourly_visit_pattern:missing service_role EXECUTE'
    where not has_function_privilege(
      'service_role',
      'public.get_hourly_visit_pattern(uuid)',
      'EXECUTE'
    )

    union all

    select 'get_hourly_visit_pattern:' || client.role_name || ':EXECUTE'
    from unnest(array['anon', 'authenticated']) client(role_name)
    where has_function_privilege(
      client.role_name,
      'public.get_hourly_visit_pattern(uuid)',
      'EXECUTE'
    )

    union all

    select 'get_hourly_visit_pattern:catalog or body drift'
    where not exists (
      select 1
      from pg_proc routine
      join pg_language language_data on language_data.oid = routine.prolang
      where routine.oid = to_regprocedure(
        'public.get_hourly_visit_pattern(uuid)'
      )
        and routine.prokind = 'f'
        and not routine.prosecdef
        and pg_get_userbyid(routine.proowner) = 'postgres'
        and coalesce(routine.proconfig, array[]::text[]) =
          array['search_path=public, auth, extensions']
        and pg_get_function_result(routine.oid) =
          'TABLE(hour_of_day integer, day_of_week integer, visit_count integer, avg_revenue numeric)'
        and pg_get_function_arguments(routine.oid) = 'clinic_uuid uuid'
        and language_data.lanname = 'plpgsql'
        and routine.provolatile = 'v'
        and routine.proparallel = 'u'
        and not routine.proisstrict
        and not routine.proleakproof
        and regexp_replace(
          lower(btrim(routine.prosrc)),
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
    )

    union all

    select format(
      'direct function ACL %s:%s:%s:grantable=%s',
      drift_type,
      role_name,
      privilege_type,
      is_grantable
    )
    from function_acl_drift
  )
  select string_agg(violation, '; ' order by violation)
  into contract_drift
  from violations;

  if contract_drift is not null then
    raise exception
      'RED COMM-LEGACY-001: legacy quarantine contract drift: %',
      contract_drift;
  end if;
end
$commercial_red$;
