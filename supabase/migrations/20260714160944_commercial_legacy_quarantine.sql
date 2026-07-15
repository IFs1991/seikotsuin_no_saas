-- Commercial hardening PR-07: quarantine legacy tables without deleting data.
-- @spec docs/stabilization/spec-commercial-legacy-quarantine-v1.0.md
-- @rollback supabase/rollbacks/20260714160944_commercial_legacy_quarantine_rollback.sql
--
-- This migration is data-preserving and fail-closed. It aborts before DDL on
-- catalog drift or unresolved nullable clinic rows. Runtime compatibility is
-- limited to reviewed service-role reads from visits and revenues.

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
  clinic_id_contract text not null check (
    clinic_id_contract in ('NOT_NULL', 'NULLABLE', 'ABSENT')
  ),
  preflight_comment text,
  quarantine_comment text not null
) on commit drop;

insert into pr07_legacy_contract (
  ordinal,
  table_name,
  table_oid,
  service_select_required,
  clinic_id_contract,
  preflight_comment,
  quarantine_comment
)
values
  (
    1,
    'appointments',
    'public.appointments',
    false,
    'NOT_NULL',
    E'[LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。\n新規開発では reservations を使用すること。最終的にDROP予定。',
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved. Prior note preserved: [LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。 新規開発では reservations を使用すること。最終的にDROP予定。'
  ),
  (
    2,
    'revenues',
    'public.revenues',
    true,
    'NULLABLE',
    null,
    'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.'
  ),
  (
    3,
    'treatment_menu_records',
    'public.treatment_menu_records',
    false,
    'ABSENT',
    null,
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.'
  ),
  (
    4,
    'treatments',
    'public.treatments',
    false,
    'NOT_NULL',
    null,
    'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.'
  ),
  (
    5,
    'visits',
    'public.visits',
    true,
    'NULLABLE',
    null,
    'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.'
  );

create temporary table pr07_policy_contract (
  table_name text not null,
  policy_name text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into pr07_policy_contract (table_name, policy_name)
values
  ('appointments', 'appointments_select_for_staff'),
  ('revenues', 'revenues_delete_for_admin'),
  ('revenues', 'revenues_insert_for_managers'),
  ('revenues', 'revenues_select_for_managers'),
  ('revenues', 'revenues_update_for_managers'),
  ('visits', 'visits_delete_for_managers'),
  ('visits', 'visits_insert_for_staff'),
  ('visits', 'visits_select_for_staff'),
  ('visits', 'visits_update_for_staff');

create temporary table pr07_table_acl_contract (
  phase text not null check (phase in ('preflight', 'postflight')),
  table_oid regclass not null,
  role_name text not null,
  privilege_type text not null,
  is_grantable boolean not null,
  primary key (phase, table_oid, role_name, privilege_type)
) on commit drop;

insert into pr07_table_acl_contract (
  phase,
  table_oid,
  role_name,
  privilege_type,
  is_grantable
)
select
  'preflight',
  contract.table_oid,
  'service_role',
  privilege.privilege_type,
  false
from pr07_legacy_contract contract
cross join unnest(array[
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN'
]) privilege(privilege_type);

insert into pr07_table_acl_contract (
  phase,
  table_oid,
  role_name,
  privilege_type,
  is_grantable
)
values
  ('postflight', 'public.revenues', 'service_role', 'SELECT', false),
  ('postflight', 'public.visits', 'service_role', 'SELECT', false);

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

create temporary table pr07_function_acl_contract (
  phase text not null check (phase in ('preflight', 'postflight')),
  role_name text not null,
  privilege_type text not null,
  is_grantable boolean not null,
  primary key (phase, role_name, privilege_type)
) on commit drop;

insert into pr07_function_acl_contract (
  phase,
  role_name,
  privilege_type,
  is_grantable
)
values
  ('preflight', 'PUBLIC', 'EXECUTE', false),
  ('preflight', 'anon', 'EXECUTE', false),
  ('preflight', 'authenticated', 'EXECUTE', false),
  ('preflight', 'service_role', 'EXECUTE', false),
  ('postflight', 'service_role', 'EXECUTE', false);

create temporary table pr07_data_snapshot (
  table_oid regclass primary key,
  row_count bigint not null,
  null_clinic_id_count bigint
) on commit drop;

do $snapshot$
declare
  target record;
  relation_row_count bigint;
  relation_null_count bigint;
begin
  for target in
    select * from pr07_legacy_contract order by ordinal
  loop
    execute format('select count(*) from %s', target.table_oid)
      into relation_row_count;

    if target.clinic_id_contract = 'ABSENT' then
      relation_null_count := null;
    else
      execute format(
        'select count(*) from %s where clinic_id is null',
        target.table_oid
      ) into relation_null_count;
    end if;

    insert into pr07_data_snapshot (
      table_oid,
      row_count,
      null_clinic_id_count
    ) values (
      target.table_oid,
      relation_row_count,
      relation_null_count
    );
  end loop;
end
$snapshot$;

do $preflight$
declare
  drift text;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260714120318'
  ) then
    raise exception
      'PR-07 preflight failed: required PR-06 migration 20260714120318 is absent';
  end if;

  select string_agg(role_name, ', ' order by role_name)
  into drift
  from unnest(array['anon', 'authenticated', 'service_role']) role_list(role_name)
  where to_regrole(role_name) is null;

  if drift is not null then
    raise exception 'PR-07 preflight failed: required role absent: %', drift;
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
     or not relation.relrowsecurity;

  if drift is not null then
    raise exception
      'PR-07 preflight failed: target relation kind, owner, or RLS drift: %',
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
    raise exception 'PR-07 preflight failed: clinic_id catalog drift: %', drift;
  end if;

  with actual as (
    select
      policies.tablename::text as table_name,
      policies.policyname::text as policy_name
    from pg_policies policies
    where policies.schemaname = 'public'
      and policies.tablename in (
        select contract.table_name from pr07_legacy_contract contract
      )
  ),
  catalog_drift as (
    select 'missing' as drift_type, expected.table_name, expected.policy_name
    from (
      select table_name, policy_name from pr07_policy_contract
      except
      select table_name, policy_name from actual
    ) expected
    union all
    select 'unexpected' as drift_type, unexpected.table_name, unexpected.policy_name
    from (
      select table_name, policy_name from actual
      except
      select table_name, policy_name from pr07_policy_contract
    ) unexpected
  )
  select string_agg(
    drift_type || ':' || table_name || ':' || policy_name,
    ', ' order by drift_type, table_name, policy_name
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 preflight failed: policy catalog drift: %', drift;
  end if;

  with violations as (
    select format(
      '%s:%s:%s',
      contract.table_name,
      client.role_name,
      privilege.privilege_type
    ) as violation
    from pr07_legacy_contract contract
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
      contract.table_oid,
      privilege.privilege_type
    )

    union all

    select format(
      '%s:service_role:missing %s',
      contract.table_name,
      privilege.privilege_type
    )
    from pr07_legacy_contract contract
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
    where not has_table_privilege(
      'service_role',
      contract.table_oid,
      privilege.privilege_type
    )
  )
  select string_agg(violation, ', ' order by violation)
  into drift
  from violations;

  if drift is not null then
    raise exception 'PR-07 preflight failed: expected PR-02 ACL drift: %', drift;
  end if;

  with actual as (
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
    select 'missing' as drift_type, expected.*
    from (
      select table_oid, role_name, privilege_type, is_grantable
      from pr07_table_acl_contract
      where phase = 'preflight'
      except
      select table_oid, role_name, privilege_type, is_grantable
      from actual
    ) expected
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select table_oid, role_name, privilege_type, is_grantable
      from actual
      except
      select table_oid, role_name, privilege_type, is_grantable
      from pr07_table_acl_contract
      where phase = 'preflight'
    ) unexpected
  )
  select string_agg(
    drift_type || ':' || table_oid::text || ':' || role_name || ':' ||
      privilege_type || ':grantable=' || is_grantable::text,
    ', ' order by drift_type, table_oid::text, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 preflight failed: direct table ACL drift: %', drift;
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
    raise exception 'PR-07 preflight failed: column ACL drift: %', drift;
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
      'PR-07 preflight failed: runtime role membership drift: %',
      drift;
  end if;

  select string_agg(
    contract.table_oid::text,
    ', ' order by contract.ordinal
  )
  into drift
  from pr07_legacy_contract contract
  where obj_description(contract.table_oid, 'pg_class') is distinct from
    contract.preflight_comment;

  if drift is not null then
    raise exception
      'PR-07 preflight failed: target table comment drift requires review before replacement: %',
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
      'PR-07 preflight failed: get_hourly_visit_pattern(uuid) catalog or body drift';
  end if;

  with actual as (
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
    select 'missing' as drift_type, expected.*
    from (
      select role_name, privilege_type, is_grantable
      from pr07_function_acl_contract
      where phase = 'preflight'
      except
      select role_name, privilege_type, is_grantable from actual
    ) expected
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select role_name, privilege_type, is_grantable from actual
      except
      select role_name, privilege_type, is_grantable
      from pr07_function_acl_contract
      where phase = 'preflight'
    ) unexpected
  )
  select string_agg(
    drift_type || ':' || role_name || ':' || privilege_type ||
      ':grantable=' || is_grantable::text,
    ', ' order by drift_type, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception
      'PR-07 preflight failed: direct function ACL drift: %',
      drift;
  end if;

  select string_agg(
    contract.table_oid::text || ':' || snapshot.null_clinic_id_count::text,
    ', ' order by contract.ordinal
  )
  into drift
  from pr07_legacy_contract contract
  join pr07_data_snapshot snapshot using (table_oid)
  where contract.clinic_id_contract <> 'ABSENT'
    and snapshot.null_clinic_id_count <> 0;

  if drift is not null then
    raise exception
      'PR-07 preflight failed: unresolved nullable clinic rows require a reviewed repair plan: %',
      drift;
  end if;
end
$preflight$;

alter table public.appointments enable row level security;
alter table public.revenues enable row level security;
alter table public.treatment_menu_records enable row level security;
alter table public.treatments enable row level security;
alter table public.visits enable row level security;

drop policy appointments_select_for_staff on public.appointments;
drop policy revenues_delete_for_admin on public.revenues;
drop policy revenues_insert_for_managers on public.revenues;
drop policy revenues_select_for_managers on public.revenues;
drop policy revenues_update_for_managers on public.revenues;
drop policy visits_delete_for_managers on public.visits;
drop policy visits_insert_for_staff on public.visits;
drop policy visits_select_for_staff on public.visits;
drop policy visits_update_for_staff on public.visits;

revoke all privileges on table
  public.appointments,
  public.revenues,
  public.treatment_menu_records,
  public.treatments,
  public.visits
from public, anon, authenticated, service_role;

grant select on table public.revenues, public.visits to service_role;

revoke all privileges on function public.get_hourly_visit_pattern(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_hourly_visit_pattern(uuid) to service_role;

comment on table public.appointments is
  'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved. Prior note preserved: [LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。 新規開発では reservations を使用すること。最終的にDROP予定。';
comment on table public.revenues is
  'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.';
comment on table public.treatment_menu_records is
  'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.';
comment on table public.treatments is
  'PR-07 legacy quarantine: migration-only, RLS enabled, zero policies, no runtime grants, data preserved.';
comment on table public.visits is
  'PR-07 legacy quarantine: compatibility read-only via service_role SELECT, RLS enabled, zero policies, no writes, data preserved.';

do $postflight$
declare
  drift text;
  target record;
  current_row_count bigint;
  current_null_count bigint;
begin
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
     or not relation.relrowsecurity;

  if drift is not null then
    raise exception
      'PR-07 postflight failed: target relation kind, owner, or RLS drift: %',
      drift;
  end if;

  select string_agg(
    policies.tablename || ':' || policies.policyname,
    ', ' order by policies.tablename, policies.policyname
  )
  into drift
  from pg_policies policies
  where policies.schemaname = 'public'
    and policies.tablename in (
      select contract.table_name from pr07_legacy_contract contract
    );

  if drift is not null then
    raise exception 'PR-07 postflight failed: policy remains: %', drift;
  end if;

  with violations as (
    select format(
      '%s:%s:%s',
      contract.table_name,
      client.role_name,
      privilege.privilege_type
    ) as violation
    from pr07_legacy_contract contract
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
      contract.table_oid,
      privilege.privilege_type
    )

    union all

    select format('%s:service_role:missing SELECT', contract.table_name)
    from pr07_legacy_contract contract
    where contract.service_select_required
      and not has_table_privilege(
        'service_role',
        contract.table_oid,
        'SELECT'
      )

    union all

    select format('%s:service_role:unexpected SELECT', contract.table_name)
    from pr07_legacy_contract contract
    where not contract.service_select_required
      and has_table_privilege(
        'service_role',
        contract.table_oid,
        'SELECT'
      )

    union all

    select format(
      '%s:service_role:%s',
      contract.table_name,
      privilege.privilege_type
    )
    from pr07_legacy_contract contract
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
      contract.table_oid,
      privilege.privilege_type
    )
  )
  select string_agg(violation, ', ' order by violation)
  into drift
  from violations;

  if drift is not null then
    raise exception 'PR-07 postflight failed: effective ACL drift: %', drift;
  end if;

  with actual as (
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
    select 'missing' as drift_type, expected.*
    from (
      select table_oid, role_name, privilege_type, is_grantable
      from pr07_table_acl_contract
      where phase = 'postflight'
      except
      select table_oid, role_name, privilege_type, is_grantable
      from actual
    ) expected
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select table_oid, role_name, privilege_type, is_grantable
      from actual
      except
      select table_oid, role_name, privilege_type, is_grantable
      from pr07_table_acl_contract
      where phase = 'postflight'
    ) unexpected
  )
  select string_agg(
    drift_type || ':' || table_oid::text || ':' || role_name || ':' ||
      privilege_type || ':grantable=' || is_grantable::text,
    ', ' order by drift_type, table_oid::text, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 postflight failed: direct table ACL drift: %', drift;
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
    raise exception 'PR-07 postflight failed: column ACL drift: %', drift;
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
      'PR-07 postflight failed: runtime role membership drift: %',
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
      'PR-07 postflight failed: get_hourly_visit_pattern(uuid) catalog or body drift';
  end if;

  with actual as (
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
    select 'missing' as drift_type, expected.*
    from (
      select role_name, privilege_type, is_grantable
      from pr07_function_acl_contract
      where phase = 'postflight'
      except
      select role_name, privilege_type, is_grantable from actual
    ) expected
    union all
    select 'unexpected' as drift_type, unexpected.*
    from (
      select role_name, privilege_type, is_grantable from actual
      except
      select role_name, privilege_type, is_grantable
      from pr07_function_acl_contract
      where phase = 'postflight'
    ) unexpected
  )
  select string_agg(
    drift_type || ':' || role_name || ':' || privilege_type ||
      ':grantable=' || is_grantable::text,
    ', ' order by drift_type, role_name, privilege_type
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-07 postflight failed: direct function ACL drift: %', drift;
  end if;

  select string_agg(
    contract.table_oid::text,
    ', ' order by contract.ordinal
  )
  into drift
  from pr07_legacy_contract contract
  where obj_description(contract.table_oid, 'pg_class') is distinct from
    contract.quarantine_comment;

  if drift is not null then
    raise exception 'PR-07 postflight failed: quarantine comment drift: %', drift;
  end if;

  for target in
    select
      contract.*,
      snapshot.row_count,
      snapshot.null_clinic_id_count
    from pr07_legacy_contract contract
    join pr07_data_snapshot snapshot using (table_oid)
    order by contract.ordinal
  loop
    execute format('select count(*) from %s', target.table_oid)
      into current_row_count;

    if current_row_count <> target.row_count then
      raise exception
        'PR-07 postflight failed: row count changed on % (before=%, after=%)',
        target.table_oid,
        target.row_count,
        current_row_count;
    end if;

    if target.clinic_id_contract <> 'ABSENT' then
      execute format(
        'select count(*) from %s where clinic_id is null',
        target.table_oid
      ) into current_null_count;

      if current_null_count <> target.null_clinic_id_count
         or current_null_count <> 0 then
        raise exception
          'PR-07 postflight failed: clinic_id null count drift on % (before=%, after=%)',
          target.table_oid,
          target.null_clinic_id_count,
          current_null_count;
      end if;
    end if;
  end loop;
end
$postflight$;

commit;
