-- PR-07 security-preserving rollback / forward-fix guard.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
-- Code compatibility: the reviewed revenues query and visit-pattern RPC remain
--   available through service_role SELECT/EXECUTE only.
-- Data loss: none. This file performs catalog and bounded data checks only.
-- Security regression: none. It does not restore client policies, runtime
--   writes, broad table privileges, or PUBLIC function execution.
-- Lock risk: catalog and bounded data reads only, bounded by transaction-local
--   timeouts before the validation DO statement begins.
-- Forward-fix: disable the affected compatibility read path, preserve the
--   quarantine boundary, and ship a reviewed least-privilege forward-fix.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr07_legacy_contract (
  ordinal integer primary key,
  table_name text not null unique,
  table_oid regclass not null unique,
  service_select_required boolean not null,
  clinic_id_contract text not null,
  quarantine_comment text not null
) on commit drop;

insert into pr07_legacy_contract (
  ordinal,
  table_name,
  table_oid,
  service_select_required,
  clinic_id_contract,
  quarantine_comment
)
values
  (
    1,
    'appointments',
    'public.appointments',
    false,
    'NOT_NULL',
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved. Prior note preserved: [LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。 新規開発では reservations を使用すること。最終的にDROP予定。'
  ),
  (
    2,
    'revenues',
    'public.revenues',
    true,
    'NULLABLE',
    'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.'
  ),
  (
    3,
    'treatment_menu_records',
    'public.treatment_menu_records',
    false,
    'ABSENT',
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.'
  ),
  (
    4,
    'treatments',
    'public.treatments',
    false,
    'NOT_NULL',
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.'
  ),
  (
    5,
    'visits',
    'public.visits',
    true,
    'NULLABLE',
    'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.'
  );

create temporary table pr07_function_contract (
  routine_oid regprocedure primary key,
  result_type text not null,
  argument_list text not null,
  language_name text not null,
  volatility "char" not null,
  parallel_safety "char" not null,
  routine_body text not null
) on commit drop;

insert into pr07_function_contract (
  routine_oid,
  result_type,
  argument_list,
  language_name,
  volatility,
  parallel_safety,
  routine_body
)
values (
  'public.get_hourly_visit_pattern(uuid)',
  'TABLE(hour_of_day integer, day_of_week integer, visit_count integer, avg_revenue numeric)',
  'clinic_uuid uuid',
  'plpgsql',
  'v',
  'u',
  $reviewed_body$
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
$reviewed_body$
);

do $security_preserving_rollback$
declare
  drift text;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260714160944'
  ) then
    raise exception
      'PR-07 rollback refused: migration 20260714160944 is absent';
  end if;

  select string_agg(
    contract.table_oid::text,
    ', ' order by contract.ordinal
  )
  into drift
  from pr07_legacy_contract contract
  join pg_class relation on relation.oid = contract.table_oid
  where relation.relkind <> 'r'
     or relation.relispartition
     or pg_get_userbyid(relation.relowner) <> 'postgres'
     or not relation.relrowsecurity
     or obj_description(contract.table_oid, 'pg_class') is distinct from
       contract.quarantine_comment;

  if drift is not null then
    raise exception
      'PR-07 rollback refused: relation quarantine catalog drift: %',
      drift;
  end if;

  select string_agg(
    contract.table_oid::text || '.clinic_id:' || contract.clinic_id_contract,
    ', ' order by contract.ordinal
  )
  into drift
  from pr07_legacy_contract contract
  left join pg_attribute attribute
    on attribute.attrelid = contract.table_oid
   and attribute.attname = 'clinic_id'
   and not attribute.attisdropped
  where (
    contract.clinic_id_contract = 'ABSENT'
    and attribute.attnum is not null
  ) or (
    contract.clinic_id_contract <> 'ABSENT'
    and (
      attribute.attnum is null
      or attribute.atttypid <> 'uuid'::regtype
      or attribute.attnotnull <> (contract.clinic_id_contract = 'NOT_NULL')
    )
  );

  if drift is not null then
    raise exception 'PR-07 rollback refused: clinic_id catalog drift: %', drift;
  end if;

  select string_agg(
    policies.tablename || ':' || policies.policyname,
    ', ' order by policies.tablename, policies.policyname
  )
  into drift
  from pg_policies policies
  where policies.schemaname = 'public'
    and policies.tablename in (
      'appointments',
      'revenues',
      'treatment_menu_records',
      'treatments',
      'visits'
    );

  if drift is not null then
    raise exception 'PR-07 rollback refused: policy drift: %', drift;
  end if;

  with violations as (
    select format(
      '%s:%s:%s',
      legacy.table_name,
      client.role_name,
      privilege.privilege_type
    ) as violation
    from pr07_legacy_contract legacy
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
      legacy.table_oid,
      privilege.privilege_type
    )

    union all

    select format('%s:service_role:missing SELECT', legacy.table_name)
    from pr07_legacy_contract legacy
    where legacy.service_select_required
      and not has_table_privilege(
        'service_role',
        legacy.table_oid,
        'SELECT'
      )

    union all

    select format('%s:service_role:unexpected SELECT', legacy.table_name)
    from pr07_legacy_contract legacy
    where not legacy.service_select_required
      and has_table_privilege(
        'service_role',
        legacy.table_oid,
        'SELECT'
      )

    union all

    select format(
      '%s:service_role:%s',
      legacy.table_name,
      privilege.privilege_type
    )
    from pr07_legacy_contract legacy
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
      legacy.table_oid,
      privilege.privilege_type
    )
  )
  select string_agg(violation, ', ' order by violation)
  into drift
  from violations;

  if drift is not null then
    raise exception 'PR-07 rollback refused: effective ACL drift: %', drift;
  end if;

  with expected(table_oid, role_name, privilege_type, is_grantable) as (
    values
      ('public.revenues'::regclass, 'service_role', 'SELECT', false),
      ('public.visits'::regclass, 'service_role', 'SELECT', false)
  ),
  actual as (
    select
      contract.table_oid,
      coalesce(grantee.rolname::text, 'PUBLIC') as role_name,
      acl.privilege_type,
      acl.is_grantable
    from pr07_legacy_contract contract
    join pg_class relation on relation.oid = contract.table_oid
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> relation.relowner
  ),
  catalog_drift as (
    select 'missing' as drift_type, missing.*
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || table_oid::text || ':' || role_name || ':' ||
      privilege_type || ':grantable=' || is_grantable::text,
    ', ' order by drift_type, table_oid::text, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 rollback refused: direct table ACL drift: %', drift;
  end if;

  select string_agg(
    contract.table_name || '.' || attribute.attname || ':' ||
      coalesce(grantee.rolname::text, 'PUBLIC') || ':' || acl.privilege_type,
    ', ' order by contract.ordinal, attribute.attnum, grantee.rolname,
      acl.privilege_type
  )
  into drift
  from pr07_legacy_contract contract
  join pg_class relation on relation.oid = contract.table_oid
  join pg_attribute attribute
    on attribute.attrelid = contract.table_oid
   and attribute.attnum > 0
   and not attribute.attisdropped
  cross join lateral aclexplode(attribute.attacl) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  where acl.grantee <> relation.relowner;

  if drift is not null then
    raise exception 'PR-07 rollback refused: column ACL drift: %', drift;
  end if;

  select string_agg(
    member_role.rolname || '->' || granted_role.rolname,
    ', ' order by member_role.rolname, granted_role.rolname
  )
  into drift
  from pg_auth_members membership
  join pg_roles member_role on member_role.oid = membership.member
  join pg_roles granted_role on granted_role.oid = membership.roleid
  where member_role.rolname in ('anon', 'authenticated', 'service_role');

  if drift is not null then
    raise exception
      'PR-07 rollback refused: runtime role membership drift: %',
      drift;
  end if;

  if not exists (
    select 1
    from pr07_function_contract contract
    join pg_proc routine on routine.oid = contract.routine_oid
    join pg_language language_data on language_data.oid = routine.prolang
    where routine.prokind = 'f'
      and not routine.prosecdef
      and pg_get_userbyid(routine.proowner) = 'postgres'
      and coalesce(routine.proconfig, array[]::text[]) =
        array['search_path=public, auth, extensions']
      and pg_get_function_result(routine.oid) = contract.result_type
      and pg_get_function_arguments(routine.oid) = contract.argument_list
      and language_data.lanname = contract.language_name
      and routine.provolatile = contract.volatility
      and routine.proparallel = contract.parallel_safety
      and not routine.proisstrict
      and not routine.proleakproof
      and regexp_replace(
        lower(btrim(routine.prosrc)),
        '[[:space:]]+',
        ' ',
        'g'
      ) = regexp_replace(
        lower(btrim(contract.routine_body)),
        '[[:space:]]+',
        ' ',
        'g'
      )
  ) then
    raise exception
      'PR-07 rollback refused: get_hourly_visit_pattern(uuid) catalog or body drift';
  end if;

  with expected(role_name, privilege_type, is_grantable) as (
    values ('service_role', 'EXECUTE', false)
  ),
  actual as (
    select
      coalesce(grantee.rolname::text, 'PUBLIC') as role_name,
      acl.privilege_type,
      acl.is_grantable
    from pr07_function_contract contract
    join pg_proc routine on routine.oid = contract.routine_oid
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> routine.proowner
  ),
  catalog_drift as (
    select 'missing' as drift_type, missing.*
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || role_name || ':' || privilege_type ||
      ':grantable=' || is_grantable::text,
    ', ' order by drift_type, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 rollback refused: direct function ACL drift: %', drift;
  end if;

  with null_counts(table_name, null_count) as (
    select 'revenues', count(*) from public.revenues where clinic_id is null
    union all
    select 'visits', count(*) from public.visits where clinic_id is null
  )
  select string_agg(
    table_name || ':' || null_count::text,
    ', ' order by table_name
  )
  into drift
  from null_counts
  where null_count <> 0;

  if drift is not null then
    raise exception
      'PR-07 rollback refused: unresolved nullable clinic rows: %',
      drift;
  end if;

  raise notice
    'PR-07 rollback is intentionally validation-only; no policy, privilege, function boundary, table, column, or row was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;
