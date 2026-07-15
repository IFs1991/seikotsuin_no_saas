-- PR-08 security-preserving recovery guard.
--
-- There is no automatic down migration for atomic invite acceptance. Dropping
-- the atomic RPC, removing token uniqueness, restoring client EXECUTE on the
-- legacy RPC, or returning to the direct multi-write application path would
-- reintroduce the vulnerability. Disable the invite UI/route if necessary and
-- ship a reviewed forward fix. This script only validates that the safe lower
-- bound is still present; it makes no persistent change.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, auth;

do $recovery_guard$
declare
  atomic_function oid :=
    to_regprocedure('public.accept_staff_invite_atomic(uuid,uuid,text)');
  legacy_function oid := to_regprocedure('public.accept_invite(uuid)');
  expected_body_sha256 constant text :=
    '9f9350f511eb8fc10525cba98157399e4733f4416e6947ba2d09168f351c1444';
begin
  if atomic_function is null or legacy_function is null then
    raise exception
      'PR-08 recovery blocked: required invite function is missing; use a reviewed forward fix';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'accept_staff_invite_atomic'
  ) <> 1 then
    raise exception
      'PR-08 recovery blocked: atomic function overload count drifted; use a reviewed forward fix';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_roles owner_role on owner_role.oid = p.proowner
    where p.oid = atomic_function
      and owner_role.rolname = 'postgres'
      and p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and pg_get_function_result(p.oid) = 'jsonb'
      and pg_get_function_identity_arguments(p.oid) =
        'p_token uuid, p_user_id uuid, p_account_email text'
  ) then
    raise exception
      'PR-08 recovery blocked: atomic function identity drifted; use a reviewed forward fix';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = atomic_function
      and pg_catalog.encode(
        extensions.digest(p.prosrc, 'sha256'),
        'hex'
      ) = expected_body_sha256
  ) then
    raise exception
      'PR-08 recovery blocked: atomic function body drifted; use a reviewed forward fix';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid = atomic_function
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee not in (p.proowner, 'service_role'::regrole)
  )
    or (
      select count(*)
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = atomic_function
        and acl.grantee = 'service_role'::regrole
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    ) <> 1
    or exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = legacy_function
        and acl.privilege_type = 'EXECUTE'
        and acl.grantee <> p.proowner
    )
    or has_function_privilege('anon', atomic_function, 'EXECUTE')
    or has_function_privilege('authenticated', atomic_function, 'EXECUTE')
    or not has_function_privilege('service_role', atomic_function, 'EXECUTE')
    or has_function_privilege('anon', legacy_function, 'EXECUTE')
    or has_function_privilege('authenticated', legacy_function, 'EXECUTE')
    or has_function_privilege('service_role', legacy_function, 'EXECUTE')
  then
    raise exception
      'PR-08 recovery blocked: invite EXECUTE boundary drifted; use a reviewed forward fix';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = keys.attnum
    ) child_columns on true
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.confkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.confrelid
       and att.attnum = keys.attnum
    ) parent_columns on true
    where con.conname = 'user_permissions_staff_id_fkey'
      and con.conrelid = 'public.user_permissions'::regclass
      and con.confrelid = 'public.staff'::regclass
      and child_columns.columns = array['staff_id']
      and parent_columns.columns = array['id']
      and con.convalidated
  ) then
    raise exception
      'PR-08 recovery blocked: unresolved staff_id FK drifted; use a reviewed forward fix';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = keys.attnum
    ) constrained_columns on true
    where con.conname = 'user_permissions_staff_id_key'
      and con.conrelid = 'public.user_permissions'::regclass
      and con.contype = 'u'
      and con.convalidated
      and constrained_columns.columns = array['staff_id']
  ) then
    raise exception
      'PR-08 recovery blocked: staff_id upsert uniqueness drifted; use a reviewed forward fix';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = keys.attnum
    ) constrained_columns on true
    where con.conname = 'staff_invites_token_key'
      and con.conrelid = 'public.staff_invites'::regclass
      and con.contype = 'u'
      and con.convalidated
      and constrained_columns.columns = array['token']
  ) then
    raise exception
      'PR-08 recovery blocked: token uniqueness is missing; use a reviewed forward fix';
  end if;

end
$recovery_guard$;

rollback;
