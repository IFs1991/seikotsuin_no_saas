-- PR-04 security-preserving rollback / forward-fix guard.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
-- Code compatibility: the reviewed trigger and Auth hook callers remain valid.
-- Data loss: none. This file performs catalog checks only.
-- Security regression: none. It never restores PUBLIC/client EXECUTE, resets a
--   fixed search_path, moves btree_gist, or changes hosted Auth configuration.
-- Lock risk: catalog reads only; lock_timeout and statement_timeout are bounded.
-- Forward-fix: disable the affected route or Auth hook if necessary, preserve
--   the hardened ACLs, and ship a new reviewed forward-fix migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr04_expected_private_execute_grants (
  function_signature text not null,
  role_name text not null,
  primary key (function_signature, role_name)
) on commit drop;

insert into pr04_expected_private_execute_grants (function_signature, role_name)
values
  ('app_private.assert_manager_clinic_assignment_valid()', 'service_role'),
  ('app_private.belongs_to_clinic(uuid)', 'anon'),
  ('app_private.belongs_to_clinic(uuid)', 'authenticated'),
  ('app_private.belongs_to_clinic(uuid)', 'service_role'),
  ('app_private.can_access_clinic(uuid)', 'anon'),
  ('app_private.can_access_clinic(uuid)', 'authenticated'),
  ('app_private.can_access_clinic(uuid)', 'service_role'),
  ('app_private.get_current_clinic_id()', 'anon'),
  ('app_private.get_current_clinic_id()', 'authenticated'),
  ('app_private.get_current_clinic_id()', 'service_role'),
  ('app_private.get_current_role()', 'anon'),
  ('app_private.get_current_role()', 'authenticated'),
  ('app_private.get_current_role()', 'service_role'),
  ('app_private.get_sibling_clinic_ids(uuid)', 'authenticated'),
  ('app_private.get_sibling_clinic_ids(uuid)', 'service_role'),
  ('app_private.is_admin()', 'anon'),
  ('app_private.is_admin()', 'authenticated'),
  ('app_private.is_admin()', 'service_role'),
  ('app_private.jwt_clinic_id()', 'anon'),
  ('app_private.jwt_clinic_id()', 'authenticated'),
  ('app_private.jwt_clinic_id()', 'service_role'),
  ('app_private.jwt_is_admin()', 'anon'),
  ('app_private.jwt_is_admin()', 'authenticated'),
  ('app_private.jwt_is_admin()', 'service_role'),
  ('app_private.user_role()', 'anon'),
  ('app_private.user_role()', 'authenticated'),
  ('app_private.user_role()', 'service_role'),
  ('app_private.custom_access_token_hook(jsonb)', 'supabase_auth_admin');

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

do $security_preserving_rollback$
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
      'PR-04 rollback refused: a reviewed SECURITY DEFINER function drifted';
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
      'PR-04 rollback refused: reviewed trigger function is client-executable';
  end if;

  if not (
    select coalesce(p.proconfig, array[]::text[])
      @> array['search_path=public, auth, extensions']
    from pg_proc p
    where p.oid = 'public.normalize_customer_phone(text)'::regprocedure
  ) then
    raise exception
      'PR-04 rollback refused: fixed normalize search_path is absent';
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
  ) then
    raise exception 'PR-04 rollback refused: Auth hook grant matrix is unsafe';
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
      'PR-04 rollback refused: PUBLIC execution remains on app_private function(s): %',
      unsafe_private_function;
  end if;

  with expected as (
    select function_signature, role_name
    from pg_temp.pr04_expected_private_execute_grants
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
      'PR-04 rollback refused: app_private EXECUTE matrix drifted: %',
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
      'PR-04 rollback refused: app_private schema privilege matrix drifted: %',
      schema_privilege_drift;
  end if;

  -- acldefault() detects the built-in PUBLIC EXECUTE fallback even when no
  -- global pg_default_acl row exists.
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
      'PR-04 rollback refused: unsafe global function default remains';
  end if;

  -- Keep explicit default-ACL drift separate from the effective fallback
  -- check above so an absent global row cannot look safe accidentally.
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
      'PR-04 rollback refused: unsafe explicit function default(s) remain: %',
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
    raise exception 'PR-04 rollback refused: reviewed trigger binding drifted';
  end if;

  raise notice
    'PR-04 rollback is intentionally security-preserving; no function ACL or configuration was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;
