-- @spec docs/stabilization/spec-commercial-atomic-staff-invite-v1.0.md
-- @rollback supabase/rollbacks/20260715043358_commercial_atomic_staff_invite_rollback.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, auth;

-- Token lookup is the serialization point for invite acceptance. Locking the
-- table before the duplicate preflight prevents a new duplicate from racing
-- the UNIQUE constraint into place. Unknown duplicate rows are never repaired
-- or assigned arbitrarily by this migration.
lock table public.staff_invites in access exclusive mode;

do $preflight$
declare
  duplicate_token_groups bigint;
begin
  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
    or to_regrole('postgres') is null
  then
    raise exception
      'PR-08 preflight failed: required Supabase roles are missing';
  end if;

  if to_regprocedure('public.accept_invite(uuid)') is null then
    raise exception
      'PR-08 preflight failed: legacy accept_invite(uuid) is missing';
  end if;

  if to_regclass('public.staff_invites') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.user_permissions') is null
    or to_regclass('public.security_events') is null
    or to_regclass('public.staff') is null
  then
    raise exception
      'PR-08 preflight failed: a required invite relation is missing';
  end if;

  if exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.staff_invites'::regclass
      and con.contype = 'u'
      and con.conkey = array[
        (
          select att.attnum
          from pg_attribute att
          where att.attrelid = 'public.staff_invites'::regclass
            and att.attname = 'token'
            and not att.attisdropped
        )::smallint
      ]
  ) then
    raise exception
      'PR-08 preflight failed: staff_invites.token uniqueness drifted';
  end if;

  select count(*)
  into duplicate_token_groups
  from (
    select token
    from public.staff_invites
    group by token
    having count(*) > 1
  ) duplicate_tokens;

  if duplicate_token_groups <> 0 then
    raise exception
      'PR-08 preflight failed: % duplicate staff_invites token groups require owner review',
      duplicate_token_groups;
  end if;

  -- PR-00 intentionally left this identity boundary unresolved. PR-08 does
  -- not rewrite the FK or invent a public.staff row. The function therefore
  -- fails atomically when a matching staff row does not already exist.
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
      'PR-08 preflight failed: unresolved user_permissions.staff_id boundary drifted';
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
      and constrained_columns.columns = array['staff_id']
  ) then
    raise exception
      'PR-08 preflight failed: staff_id upsert uniqueness is missing';
  end if;
end
$preflight$;

alter table public.staff_invites
  add constraint staff_invites_token_key unique (token);

create or replace function public.accept_staff_invite_atomic(
  p_token uuid,
  p_user_id uuid,
  p_account_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_invite public.staff_invites%rowtype;
  v_normalized_account_email text;
  v_auth_email text;
  v_now timestamptz;
  v_claimed_rows integer;
begin
  if p_token is null
    or p_user_id is null
    or p_account_email is null
    or pg_catalog.btrim(p_account_email) = ''
  then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_NOT_FOUND'
    );
  end if;

  select invite_row.*
  into v_invite
  from public.staff_invites invite_row
  where token = p_token
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_NOT_FOUND'
    );
  end if;

  -- A completed claim is final. The trusted Auth user ID is sufficient for a
  -- same-user retry even after the original invite expires or the account
  -- email later changes. This path performs no write and emits no new audit.
  if v_invite.accepted_at is not null or v_invite.accepted_by is not null then
    if v_invite.accepted_at is null or v_invite.accepted_by is null then
      return pg_catalog.jsonb_build_object(
        'success', false,
        'error_code', 'INVITE_STATE_INVALID'
      );
    end if;

    if v_invite.accepted_by = p_user_id then
      if v_invite.role::text not in ('manager', 'therapist', 'staff') then
        return pg_catalog.jsonb_build_object(
          'success', false,
          'error_code', 'INVITE_INVALID_ROLE'
        );
      end if;

      return pg_catalog.jsonb_build_object(
        'success', true,
        'clinic_id', v_invite.clinic_id,
        'role', v_invite.role::text,
        'idempotent', true
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_ALREADY_ACCEPTED'
    );
  end if;

  -- clock_timestamp(), unlike now(), advances while this call waits for the
  -- row lock held by a concurrent claimant.
  v_now := pg_catalog.clock_timestamp();
  if v_invite.expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_EXPIRED'
    );
  end if;

  if v_invite.role::text not in ('manager', 'therapist', 'staff') then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_INVALID_ROLE'
    );
  end if;

  v_normalized_account_email :=
    pg_catalog.lower(pg_catalog.btrim(p_account_email));

  if v_normalized_account_email is null
    or v_normalized_account_email = ''
    or v_normalized_account_email <>
      pg_catalog.lower(pg_catalog.btrim(v_invite.email::text))
  then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_EMAIL_MISMATCH'
    );
  end if;

  select pg_catalog.lower(pg_catalog.btrim(auth_user.email::text))
  into v_auth_email
  from auth.users auth_user
  where id = p_user_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_ACCOUNT_NOT_FOUND'
    );
  end if;

  if v_auth_email is null or v_auth_email <> v_normalized_account_email then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_ACCOUNT_EMAIL_MISMATCH'
    );
  end if;

  insert into public.profiles (
    user_id,
    clinic_id,
    email,
    full_name,
    role,
    is_active,
    updated_at
  )
  values (
    p_user_id,
    v_invite.clinic_id,
    v_normalized_account_email,
    coalesce(
      nullif(
        pg_catalog.split_part(v_normalized_account_email, '@', 1),
        ''
      ),
      'staff'
    ),
    v_invite.role,
    true,
    v_now
  )
  on conflict (user_id) do update
  set clinic_id = excluded.clinic_id,
      role = excluded.role,
      updated_at = excluded.updated_at;

  insert into public.user_permissions (
    staff_id,
    clinic_id,
    role,
    username,
    hashed_password,
    updated_at
  )
  values (
    p_user_id,
    v_invite.clinic_id,
    v_invite.role,
    v_normalized_account_email,
    'managed_by_supabase',
    v_now
  )
  on conflict (staff_id) do update
  set clinic_id = excluded.clinic_id,
      role = excluded.role,
      username = excluded.username,
      hashed_password = excluded.hashed_password,
      updated_at = excluded.updated_at;

  -- A permission/profile row lock can outlive the invite. Raising here (not
  -- returning) rolls both prior writes back at the RPC statement boundary.
  v_now := pg_catalog.clock_timestamp();
  if v_invite.expires_at <= v_now then
    raise sqlstate 'PVI02' using message = 'INVITE_EXPIRED';
  end if;

  update public.staff_invites
  set accepted_at = v_now,
      accepted_by = p_user_id,
      updated_at = v_now
  where id = v_invite.id
    and accepted_at is null
    and accepted_by is null;

  get diagnostics v_claimed_rows = row_count;
  if v_claimed_rows <> 1 then
    raise sqlstate 'PVI05' using message = 'INVITE_CLAIM_STATE_CHANGED';
  end if;

  insert into public.security_events (
    user_id,
    clinic_id,
    event_type,
    event_category,
    severity_level,
    event_description,
    event_data,
    source_component
  )
  values (
    p_user_id,
    v_invite.clinic_id,
    'staff_invite_accepted',
    'authentication',
    'info',
    'Staff invite accepted atomically',
    pg_catalog.jsonb_build_object(
      'invite_id', v_invite.id,
      'role', v_invite.role::text,
      'idempotent', false
    ),
    'accept_staff_invite_atomic'
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'clinic_id', v_invite.clinic_id,
    'role', v_invite.role::text,
    'idempotent', false
  );
end
$function$;

alter function public.accept_staff_invite_atomic(uuid, uuid, text)
  owner to postgres;

revoke all on function public.accept_staff_invite_atomic(uuid, uuid, text)
  from public, anon, authenticated, service_role;

-- The previous RPC is non-atomic. Preserve the object for catalog/history
-- compatibility but make it unreachable from every application role.
revoke all on function public.accept_invite(uuid)
  from public, anon, authenticated, service_role;

-- CREATE OR REPLACE preserves an existing ACL. Remove every explicit
-- non-owner EXECUTE grantee, including unexpected custom roles, before granting
-- the one reviewed application boundary back to the atomic function.
do $acl_scrub$
declare
  grantee_name name;
begin
  for grantee_name in
    select distinct grantee_role.rolname
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        p.proacl,
        pg_catalog.acldefault('f', p.proowner)
      )
    ) acl
    join pg_catalog.pg_roles grantee_role
      on grantee_role.oid = acl.grantee
    where p.oid =
      'public.accept_staff_invite_atomic(uuid,uuid,text)'::pg_catalog.regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
  loop
    execute pg_catalog.format(
      'revoke all on function public.accept_staff_invite_atomic(uuid, uuid, text) from %I',
      grantee_name
    );
  end loop;

  for grantee_name in
    select distinct grantee_role.rolname
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        p.proacl,
        pg_catalog.acldefault('f', p.proowner)
      )
    ) acl
    join pg_catalog.pg_roles grantee_role
      on grantee_role.oid = acl.grantee
    where p.oid = 'public.accept_invite(uuid)'::pg_catalog.regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
  loop
    execute pg_catalog.format(
      'revoke all on function public.accept_invite(uuid) from %I',
      grantee_name
    );
  end loop;
end
$acl_scrub$;

grant execute on function public.accept_staff_invite_atomic(uuid, uuid, text)
  to service_role;

comment on function public.accept_staff_invite_atomic(uuid, uuid, text) is
  'PR-08 service-role-only atomic staff invite acceptance. Caller identity and email must come from auth.getUser().';

comment on function public.accept_invite(uuid) is
  '[DEPRECATED][DENY] Non-atomic invite acceptance retained only for migration history; no application role may execute it.';

comment on constraint staff_invites_token_key on public.staff_invites is
  'PR-08 serialization invariant: each invite token identifies exactly one row.';

do $postflight$
declare
  atomic_function oid :=
    to_regprocedure('public.accept_staff_invite_atomic(uuid,uuid,text)');
  legacy_function oid := to_regprocedure('public.accept_invite(uuid)');
begin
  if (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'accept_staff_invite_atomic'
  ) <> 1 then
    raise exception
      'PR-08 postflight failed: atomic invite overload count drifted';
  end if;

  if atomic_function is null or legacy_function is null then
    raise exception
      'PR-08 postflight failed: required invite function is missing';
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
      'PR-08 postflight failed: atomic invite function identity drifted';
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
    or has_function_privilege('anon', atomic_function, 'EXECUTE')
    or has_function_privilege('authenticated', atomic_function, 'EXECUTE')
    or not has_function_privilege('service_role', atomic_function, 'EXECUTE')
  then
    raise exception
      'PR-08 postflight failed: atomic invite EXECUTE boundary drifted';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid = legacy_function
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
  )
    or has_function_privilege('anon', legacy_function, 'EXECUTE')
    or has_function_privilege('authenticated', legacy_function, 'EXECUTE')
    or has_function_privilege('service_role', legacy_function, 'EXECUTE')
  then
    raise exception
      'PR-08 postflight failed: legacy invite RPC is still reachable';
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
      'PR-08 postflight failed: token uniqueness is missing';
  end if;
end
$postflight$;

commit;
