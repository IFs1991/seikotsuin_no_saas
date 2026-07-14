begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, auth, extensions;

-- Keep the reviewed ACL contract in one transaction-local relation so
-- preflight and postflight cannot drift apart. The extra service_role and
-- PUBLIC rows are valid only before this migration removes them.
create temporary table pr04_expected_private_execute_grants (
  function_signature text not null,
  role_name text not null,
  purpose text not null,
  expected_before boolean not null,
  expected_after boolean not null,
  primary key (function_signature, role_name)
) on commit drop;

insert into pr04_expected_private_execute_grants (
  function_signature,
  role_name,
  purpose,
  expected_before,
  expected_after
)
values
  ('app_private.assert_manager_clinic_assignment_valid()', 'service_role', 'trigger', true, true),
  ('app_private.belongs_to_clinic(uuid)', 'anon', 'rls_helper', true, true),
  ('app_private.belongs_to_clinic(uuid)', 'authenticated', 'rls_helper', true, true),
  ('app_private.belongs_to_clinic(uuid)', 'service_role', 'rls_helper', true, true),
  ('app_private.can_access_clinic(uuid)', 'anon', 'rls_helper', true, true),
  ('app_private.can_access_clinic(uuid)', 'authenticated', 'rls_helper', true, true),
  ('app_private.can_access_clinic(uuid)', 'service_role', 'rls_helper', true, true),
  ('app_private.get_current_clinic_id()', 'anon', 'rls_helper', true, true),
  ('app_private.get_current_clinic_id()', 'authenticated', 'rls_helper', true, true),
  ('app_private.get_current_clinic_id()', 'service_role', 'rls_helper', true, true),
  ('app_private.get_current_role()', 'anon', 'rls_helper', true, true),
  ('app_private.get_current_role()', 'authenticated', 'rls_helper', true, true),
  ('app_private.get_current_role()', 'service_role', 'rls_helper', true, true),
  ('app_private.get_sibling_clinic_ids(uuid)', 'authenticated', 'rls_helper', true, true),
  ('app_private.get_sibling_clinic_ids(uuid)', 'service_role', 'rls_helper', true, true),
  ('app_private.is_admin()', 'anon', 'rls_helper', true, true),
  ('app_private.is_admin()', 'authenticated', 'rls_helper', true, true),
  ('app_private.is_admin()', 'service_role', 'rls_helper', true, true),
  ('app_private.jwt_clinic_id()', 'anon', 'rls_helper', true, true),
  ('app_private.jwt_clinic_id()', 'authenticated', 'rls_helper', true, true),
  ('app_private.jwt_clinic_id()', 'service_role', 'rls_helper', true, true),
  ('app_private.jwt_is_admin()', 'anon', 'rls_helper', true, true),
  ('app_private.jwt_is_admin()', 'authenticated', 'rls_helper', true, true),
  ('app_private.jwt_is_admin()', 'service_role', 'rls_helper', true, true),
  ('app_private.user_role()', 'anon', 'rls_helper', true, true),
  ('app_private.user_role()', 'authenticated', 'rls_helper', true, true),
  ('app_private.user_role()', 'service_role', 'rls_helper', true, true),
  ('app_private.custom_access_token_hook(jsonb)', 'supabase_auth_admin', 'auth_hook', true, true),
  ('app_private.custom_access_token_hook(jsonb)', 'service_role', 'auth_hook', true, false);

insert into pr04_expected_private_execute_grants (
  function_signature,
  role_name,
  purpose,
  expected_before,
  expected_after
)
select
  function_signature,
  'PUBLIC',
  'default_public',
  true,
  false
from unnest(array[
  'app_private.assert_subscription_org_root_clinic()',
  'app_private.belongs_to_clinic(uuid)',
  'app_private.can_access_clinic(uuid)',
  'app_private.custom_access_token_hook(jsonb)',
  'app_private.get_current_clinic_id()',
  'app_private.get_current_role()',
  'app_private.get_sibling_clinic_ids(uuid)',
  'app_private.is_admin()',
  'app_private.jwt_clinic_id()',
  'app_private.jwt_is_admin()',
  'app_private.user_role()'
]) expected_public(function_signature);

create temporary table pr04_expected_private_schema_privileges (
  role_name text not null,
  privilege_type text not null,
  primary key (role_name, privilege_type)
) on commit drop;

insert into pr04_expected_private_schema_privileges (role_name, privilege_type)
values
  ('anon', 'USAGE'),
  ('authenticated', 'USAGE'),
  ('service_role', 'USAGE'),
  ('supabase_auth_admin', 'USAGE');

-- PR-04 closes the reviewed routine boundaries without changing function
-- bodies, RLS policy semantics, or trigger ownership. PR-02 must already have
-- removed unsafe future-function defaults and PR-03 must already be applied.
do $preflight$
declare
  target_signature text;
  private_grant_drift text;
  schema_privilege_drift text;
begin
  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
    or to_regrole('supabase_auth_admin') is null
    or to_regrole('postgres') is null
  then
    raise exception 'PR-04 preflight failed: required Supabase roles are missing';
  end if;

  foreach target_signature in array array[
    'public.normalize_customer_phone(text)',
    'public.update_reservation_notifications_updated_at()',
    'public.validate_shift_requests_clinic_refs()',
    'app_private.custom_access_token_hook(jsonb)'
  ]
  loop
    if to_regprocedure(target_signature) is null then
      raise exception
        'PR-04 preflight failed: required function is missing: %',
        target_signature;
    end if;
  end loop;

  if (
    select count(*)
    from pg_proc p
    where p.oid in (
      'public.update_reservation_notifications_updated_at()'::regprocedure,
      'public.validate_shift_requests_clinic_refs()'::regprocedure,
      'app_private.custom_access_token_hook(jsonb)'::regprocedure
    )
      and p.prosecdef
  ) <> 3 then
    raise exception
      'PR-04 preflight failed: a reviewed SECURITY DEFINER function changed identity';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.reservation_notifications'::regclass
      and t.tgname = 'reservation_notifications_updated_at_trigger'
      and t.tgfoid =
        'public.update_reservation_notifications_updated_at()'::regprocedure
      and not t.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.shift_requests'::regclass
      and t.tgname = 'validate_shift_requests_clinic_refs_trigger'
      and t.tgfoid = 'public.validate_shift_requests_clinic_refs()'::regprocedure
      and not t.tgisinternal
  ) then
    raise exception 'PR-04 preflight failed: reviewed trigger binding drifted';
  end if;

  -- Enforce the PR-02 dependency instead of silently repairing an out-of-order
  -- deployment. PostgreSQL's built-in function default grants PUBLIC EXECUTE.
  -- acldefault() is intentional: it detects PostgreSQL's built-in PUBLIC
  -- EXECUTE fallback even when no global pg_default_acl row exists.
  if exists (
    select 1
    from pg_roles owner_role
    left join pg_default_acl d
      on d.defaclrole = owner_role.oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', owner_role.oid))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where owner_role.rolname = 'postgres'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception
      'PR-04 preflight failed: PR-02 future-function default revoke is absent';
  end if;

  if not exists (
    select 1
    from pg_extension
    where extname = 'btree_gist'
  ) then
    raise exception 'PR-04 preflight failed: btree_gist extension is missing';
  end if;

  -- Compare both sides of the reviewed before-state. PUBLIC and the Auth-hook
  -- service_role grant are allowed only because this migration removes them.
  with expected as (
    select function_signature, role_name
    from pg_temp.pr04_expected_private_execute_grants
    where expected_before
  ),
  actual as (
    select
      p.oid::regprocedure::text as function_signature,
      case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname::text
      end as role_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'app_private'
      and acl.grantee <> p.proowner
      and acl.privilege_type = 'EXECUTE'
  ),
  drift as (
    select 'missing' as drift_type, function_signature, role_name
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, function_signature, role_name
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || function_signature || ':' || role_name,
    ', '
    order by drift_type, function_signature, role_name
  )
  into private_grant_drift
  from drift;

  if private_grant_drift is not null then
    raise exception
      'PR-04 preflight failed: app_private EXECUTE matrix drifted: %',
      private_grant_drift;
  end if;

  with expected as (
    select role_name, privilege_type
    from pg_temp.pr04_expected_private_schema_privileges
  ),
  actual as (
    select
      case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname::text
      end as role_name,
      acl.privilege_type
    from pg_namespace n
    cross join lateral aclexplode(
      coalesce(n.nspacl, acldefault('n', n.nspowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'app_private'
      and acl.grantee <> n.nspowner
  ),
  drift as (
    select 'missing' as drift_type, role_name, privilege_type
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, role_name, privilege_type
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || role_name || ':' || privilege_type,
    ', '
    order by drift_type, role_name, privilege_type
  )
  into schema_privilege_drift
  from drift;

  if schema_privilege_drift is not null then
    raise exception
      'PR-04 preflight failed: app_private schema privilege matrix drifted: %',
      schema_privilege_drift;
  end if;
end
$preflight$;

alter function public.normalize_customer_phone(text)
  set search_path = public, auth, extensions;

revoke execute on function public.update_reservation_notifications_updated_at()
  from public, anon, authenticated;

revoke execute on function public.validate_shift_requests_clinic_refs()
  from public, anon, authenticated;

-- app_private remains available to policy callers through its existing schema
-- USAGE and exact helper grants. Only inherited PUBLIC routine execution is
-- removed here; blanket schema USAGE revocation would break RLS evaluation.
revoke execute on all functions in schema app_private from public;

-- Supabase Auth is the sole runtime caller configured for this hook.
revoke execute on function app_private.custom_access_token_hook(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function app_private.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- Reassert the revoke-only future-function contract. The global form closes
-- PostgreSQL's built-in PUBLIC default; schema forms document both application
-- schemas and protect against explicit default-ACL drift.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema app_private
  revoke execute on functions from public, anon, authenticated;

do $postflight$
declare
  unsafe_private_function text;
  unsafe_default_privilege text;
  private_grant_drift text;
  schema_privilege_drift text;
begin
  if (
    select count(*)
    from pg_proc p
    where p.oid in (
      'public.update_reservation_notifications_updated_at()'::regprocedure,
      'public.validate_shift_requests_clinic_refs()'::regprocedure,
      'app_private.custom_access_token_hook(jsonb)'::regprocedure
    )
      and p.prosecdef
  ) <> 3 then
    raise exception
      'PR-04 postflight failed: a reviewed SECURITY DEFINER function changed identity';
  end if;

  if not (
    select coalesce(p.proconfig, array[]::text[])
      @> array['search_path=public, auth, extensions']
    from pg_proc p
    where p.oid = 'public.normalize_customer_phone(text)'::regprocedure
  ) then
    raise exception
      'PR-04 postflight failed: normalize_customer_phone search_path is not fixed';
  end if;

  if has_function_privilege(
    'anon',
    'public.update_reservation_notifications_updated_at()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.update_reservation_notifications_updated_at()',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.validate_shift_requests_clinic_refs()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.validate_shift_requests_clinic_refs()',
    'EXECUTE'
  ) then
    raise exception
      'PR-04 postflight failed: client execution remains on a reviewed trigger function';
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
  into unsafe_private_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) acl
  where n.nspname = 'app_private'
    and acl.grantee = 0
    and acl.privilege_type = 'EXECUTE';

  if unsafe_private_function is not null then
    raise exception
      'PR-04 postflight failed: PUBLIC execution remains on app_private function(s): %',
      unsafe_private_function;
  end if;

  if has_function_privilege(
    'anon',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'supabase_auth_admin',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ) or not has_schema_privilege(
    'supabase_auth_admin',
    'app_private',
    'USAGE'
  ) then
    raise exception
      'PR-04 postflight failed: custom access token hook grant matrix drifted';
  end if;

  with expected as (
    select function_signature, role_name
    from pg_temp.pr04_expected_private_execute_grants
    where expected_after
  ),
  actual as (
    select
      p.oid::regprocedure::text as function_signature,
      case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname::text
      end as role_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'app_private'
      and acl.grantee <> p.proowner
      and acl.privilege_type = 'EXECUTE'
  ),
  drift as (
    select 'missing' as drift_type, function_signature, role_name
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, function_signature, role_name
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || function_signature || ':' || role_name,
    ', '
    order by drift_type, function_signature, role_name
  )
  into private_grant_drift
  from drift;

  if private_grant_drift is not null then
    raise exception
      'PR-04 postflight failed: app_private EXECUTE matrix drifted: %',
      private_grant_drift;
  end if;

  with expected as (
    select role_name, privilege_type
    from pg_temp.pr04_expected_private_schema_privileges
  ),
  actual as (
    select
      case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname::text
      end as role_name,
      acl.privilege_type
    from pg_namespace n
    cross join lateral aclexplode(
      coalesce(n.nspacl, acldefault('n', n.nspowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'app_private'
      and acl.grantee <> n.nspowner
  ),
  drift as (
    select 'missing' as drift_type, role_name, privilege_type
    from (select * from expected except select * from actual) missing
    union all
    select 'unexpected' as drift_type, role_name, privilege_type
    from (select * from actual except select * from expected) unexpected
  )
  select string_agg(
    drift_type || ':' || role_name || ':' || privilege_type,
    ', '
    order by drift_type, role_name, privilege_type
  )
  into schema_privilege_drift
  from drift;

  if schema_privilege_drift is not null then
    raise exception
      'PR-04 postflight failed: app_private schema privilege matrix drifted: %',
      schema_privilege_drift;
  end if;

  -- acldefault() is intentional: it detects PostgreSQL's built-in PUBLIC
  -- EXECUTE fallback even when no global pg_default_acl row exists.
  if exists (
    select 1
    from pg_roles owner_role
    left join pg_default_acl d
      on d.defaclrole = owner_role.oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', owner_role.oid))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where owner_role.rolname = 'postgres'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception
      'PR-04 postflight failed: unsafe future-function default remains';
  end if;

  -- This second check is intentionally separate: it inspects explicit
  -- global/public/app_private pg_default_acl rows for named-role drift.
  select string_agg(
    coalesce(n.nspname, '<global>') || ':' ||
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
    ', '
    order by coalesce(n.nspname, '<global>'), acl.grantee
  )
  into unsafe_default_privilege
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  where owner_role.rolname = 'postgres'
    and d.defaclobjtype = 'f'
    and (
      d.defaclnamespace = 0
      or n.nspname in ('public', 'app_private')
    )
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
    and acl.privilege_type = 'EXECUTE';

  if unsafe_default_privilege is not null then
    raise exception
      'PR-04 postflight failed: unsafe explicit function default(s) remain: %',
      unsafe_default_privilege;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.reservation_notifications'::regclass
      and t.tgname = 'reservation_notifications_updated_at_trigger'
      and t.tgfoid =
        'public.update_reservation_notifications_updated_at()'::regprocedure
      and not t.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.shift_requests'::regclass
      and t.tgname = 'validate_shift_requests_clinic_refs_trigger'
      and t.tgfoid = 'public.validate_shift_requests_clinic_refs()'::regprocedure
      and not t.tgisinternal
  ) then
    raise exception 'PR-04 postflight failed: reviewed trigger binding changed';
  end if;
end
$postflight$;

commit;
