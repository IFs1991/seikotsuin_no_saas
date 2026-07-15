do $commercial_red$
declare
  function_oid oid;
  legacy_function_oid oid;
begin
  function_oid := to_regprocedure(
    'public.accept_staff_invite_atomic(uuid,uuid,text)'
  );

  if function_oid is null then
    raise exception 'RED COMM-INVITE-001: atomic staff invite function is absent';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'accept_staff_invite_atomic'
  ) <> 1 then
    raise exception 'RED COMM-INVITE-006: atomic staff invite overload count drifted';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid = function_oid
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee not in (p.proowner, 'service_role'::regrole)
  )
    or (
      select count(*)
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = function_oid
        and acl.grantee = 'service_role'::regrole
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    ) <> 1
    or has_function_privilege('anon', function_oid, 'EXECUTE')
    or has_function_privilege('authenticated', function_oid, 'EXECUTE')
    or not has_function_privilege('service_role', function_oid, 'EXECUTE') then
    raise exception 'RED COMM-INVITE-002: atomic staff invite function is client-executable';
  end if;

  legacy_function_oid := to_regprocedure('public.accept_invite(uuid)');
  if legacy_function_oid is null
    or exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = legacy_function_oid
        and acl.privilege_type = 'EXECUTE'
        and acl.grantee <> p.proowner
    )
    or has_function_privilege('anon', legacy_function_oid, 'EXECUTE')
    or has_function_privilege('authenticated', legacy_function_oid, 'EXECUTE')
    or has_function_privilege('service_role', legacy_function_oid, 'EXECUTE')
  then
    raise exception 'RED COMM-INVITE-004: legacy invite function remains reachable';
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
    raise exception 'RED COMM-INVITE-005: staff invite token is not unique';
  end if;
end
$commercial_red$;
