begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(38);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles owner_role on owner_role.oid = p.proowner
    where n.nspname = 'public'
      and p.proname = 'accept_staff_invite_atomic'
      and p.oid =
        'public.accept_staff_invite_atomic(uuid,uuid,text)'::regprocedure
      and owner_role.rolname = 'postgres'
      and p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and pg_get_function_result(p.oid) = 'jsonb'
      and (
        select count(*)
        from pg_proc overload
        join pg_namespace overload_namespace
          on overload_namespace.oid = overload.pronamespace
        where overload_namespace.nspname = 'public'
          and overload.proname = 'accept_staff_invite_atomic'
      ) = 1
  ),
  1::bigint,
  'atomic invite RPC has the exact reviewed identity'
);

select is(
  (
    select count(*)
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
  ),
  1::bigint,
  'staff invite token identifies exactly one row'
);

select is(
  (
    select count(*)
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid =
      'public.accept_staff_invite_atomic(uuid,uuid,text)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee not in (p.proowner, 'service_role'::regrole)
  ),
  0::bigint,
  'no unexpected non-owner role has atomic invite EXECUTE privilege'
);

select is(
  has_function_privilege(
    'anon',
    'public.accept_staff_invite_atomic(uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'anon has no atomic invite EXECUTE privilege'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.accept_staff_invite_atomic(uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated has no atomic invite EXECUTE privilege'
);

select is(
  (
    select count(*)
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid =
      'public.accept_staff_invite_atomic(uuid,uuid,text)'::regprocedure
      and acl.grantee = 'service_role'::regrole
      and acl.privilege_type = 'EXECUTE'
      and not acl.is_grantable
  ),
  1::bigint,
  'service_role has one direct non-delegable atomic EXECUTE grant'
);

select is(
  (
    select count(*)
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid = 'public.accept_invite(uuid)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> p.proowner
  ),
  0::bigint,
  'no non-owner role can execute the legacy non-atomic RPC'
);

select is(
  has_function_privilege(
    'anon',
    'public.accept_invite(uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the legacy non-atomic RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.accept_invite(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute the legacy non-atomic RPC'
);

select is(
  has_function_privilege(
    'service_role',
    'public.accept_invite(uuid)',
    'EXECUTE'
  ),
  false,
  'service_role cannot execute the legacy non-atomic RPC'
);

select is(
  (
    select count(*)
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
  ),
  1::bigint,
  'PR-08 preserves the unresolved staff_id FK instead of guessing identity'
);

set local role service_role;

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000099',
    'f8080000-0000-4000-8000-000000000099',
    'nobody@example.invalid'
  ) ->> 'error_code',
  'INVITE_NOT_FOUND',
  'service_role can execute the atomic RPC'
);

reset role;

insert into public.clinics (id, name)
values (
  'f8080000-0000-4000-8000-000000000001',
  '__commercial_pr08_clinic__'
);

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
values
  (
    'f8080000-0000-4000-8000-000000000010',
    'invited@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'f8080000-0000-4000-8000-000000000011',
    'other@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'f8080000-0000-4000-8000-000000000012',
    'missing-staff@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'f8080000-0000-4000-8000-000000000013',
    'profile-failure@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'f8080000-0000-4000-8000-000000000014',
    'audit-failure@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  (
    'f8080000-0000-4000-8000-000000000015',
    'expiry-during@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

insert into public.staff (
  id,
  clinic_id,
  name,
  role,
  email,
  password_hash
)
values
  (
    'f8080000-0000-4000-8000-000000000010',
    'f8080000-0000-4000-8000-000000000001',
    '__commercial_pr08_invited__',
    'staff',
    'invited@example.invalid',
    'managed_by_supabase'
  ),
  (
    'f8080000-0000-4000-8000-000000000011',
    'f8080000-0000-4000-8000-000000000001',
    '__commercial_pr08_other__',
    'staff',
    'other@example.invalid',
    'managed_by_supabase'
  ),
  (
    'f8080000-0000-4000-8000-000000000013',
    'f8080000-0000-4000-8000-000000000001',
    '__commercial_pr08_profile_failure__',
    'staff',
    'profile-failure@example.invalid',
    'managed_by_supabase'
  ),
  (
    'f8080000-0000-4000-8000-000000000014',
    'f8080000-0000-4000-8000-000000000001',
    '__commercial_pr08_audit_failure__',
    'staff',
    'audit-failure@example.invalid',
    'managed_by_supabase'
  ),
  (
    'f8080000-0000-4000-8000-000000000015',
    'f8080000-0000-4000-8000-000000000001',
    '__commercial_pr08_expiry_during__',
    'staff',
    'expiry-during@example.invalid',
    'managed_by_supabase'
  );

insert into public.staff_invites (
  id,
  clinic_id,
  email,
  role,
  token,
  expires_at,
  created_by
)
values
  (
    'f8080000-0000-4000-8000-000000000101',
    'f8080000-0000-4000-8000-000000000001',
    '  Invited@Example.Invalid  ',
    'manager',
    'f8080000-0000-4000-8000-000000000201',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000102',
    'f8080000-0000-4000-8000-000000000001',
    'expired@example.invalid',
    'staff',
    'f8080000-0000-4000-8000-000000000202',
    '2000-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000103',
    'f8080000-0000-4000-8000-000000000001',
    'invalid-role@example.invalid',
    'admin',
    'f8080000-0000-4000-8000-000000000203',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000104',
    'f8080000-0000-4000-8000-000000000001',
    'missing-staff@example.invalid',
    'staff',
    'f8080000-0000-4000-8000-000000000204',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000105',
    'f8080000-0000-4000-8000-000000000001',
    'profile-failure@example.invalid',
    'therapist',
    'f8080000-0000-4000-8000-000000000205',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000106',
    'f8080000-0000-4000-8000-000000000001',
    'audit-failure@example.invalid',
    'staff',
    'f8080000-0000-4000-8000-000000000206',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000107',
    'f8080000-0000-4000-8000-000000000001',
    'invalid-state@example.invalid',
    'staff',
    'f8080000-0000-4000-8000-000000000207',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  ),
  (
    'f8080000-0000-4000-8000-000000000108',
    'f8080000-0000-4000-8000-000000000001',
    'expiry-during@example.invalid',
    'staff',
    'f8080000-0000-4000-8000-000000000208',
    '2099-01-01T00:00:00Z',
    'f8080000-0000-4000-8000-000000000010'
  );

update public.staff_invites
set accepted_at = now()
where token = 'f8080000-0000-4000-8000-000000000207';

create function public.pr08_test_fail_profile()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.user_id = 'f8080000-0000-4000-8000-000000000013'::uuid then
    raise sqlstate 'PVI11' using message = 'PR08_PROFILE_FAILURE';
  elsif new.user_id = 'f8080000-0000-4000-8000-000000000015'::uuid then
    perform pg_catalog.pg_sleep(3);
  end if;
  return new;
end
$function$;

create trigger pr08_test_fail_profile
before insert or update on public.profiles
for each row
execute function public.pr08_test_fail_profile();

create function public.pr08_test_fail_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.user_id = 'f8080000-0000-4000-8000-000000000014'::uuid
    and new.source_component = 'accept_staff_invite_atomic'
  then
    raise sqlstate 'PVI12' using message = 'PR08_AUDIT_FAILURE';
  end if;
  return new;
end
$function$;

create trigger pr08_test_fail_audit
before insert on public.security_events
for each row
execute function public.pr08_test_fail_audit();

create temporary table pr08_results (
  label text primary key,
  result jsonb not null
);

insert into pr08_results (label, result)
values (
  'first',
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000201',
    'f8080000-0000-4000-8000-000000000010',
    '  INVITED@EXAMPLE.INVALID  '
  )
);

select is(
  (select result from pr08_results where label = 'first'),
  jsonb_build_object(
    'success', true,
    'clinic_id', 'f8080000-0000-4000-8000-000000000001'::uuid,
    'role', 'manager',
    'idempotent', false
  ),
  'first claim succeeds with normalized email and invite-derived authority'
);

select results_eq(
  $query$
    select clinic_id, role::text, email::text
    from public.profiles
    where user_id = 'f8080000-0000-4000-8000-000000000010'
  $query$,
  $expected$
    values (
      'f8080000-0000-4000-8000-000000000001'::uuid,
      'manager'::text,
      'invited@example.invalid'::text
    )
  $expected$,
  'profile assignment commits with the invite clinic and role'
);

select results_eq(
  $query$
    select clinic_id, role::text, username::text, hashed_password
    from public.user_permissions
    where staff_id = 'f8080000-0000-4000-8000-000000000010'
  $query$,
  $expected$
    values (
      'f8080000-0000-4000-8000-000000000001'::uuid,
      'manager'::text,
      'invited@example.invalid'::text,
      'managed_by_supabase'::text
    )
  $expected$,
  'permission assignment commits with the same authority values'
);

select is(
  (
    select accepted_by
    from public.staff_invites
    where token = 'f8080000-0000-4000-8000-000000000201'
      and accepted_at is not null
  ),
  'f8080000-0000-4000-8000-000000000010'::uuid,
  'the locked invite is claimed by the trusted Auth user'
);

select is(
  (
    select count(*)
    from public.security_events
    where source_component = 'accept_staff_invite_atomic'
      and user_id = 'f8080000-0000-4000-8000-000000000010'
      and event_type = 'staff_invite_accepted'
  ),
  1::bigint,
  'one success audit event commits'
);

insert into pr08_results (label, result)
values (
  'retry',
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000201',
    'f8080000-0000-4000-8000-000000000010',
    'changed-after-claim@example.invalid'
  )
);

select is(
  (select result ->> 'idempotent' from pr08_results where label = 'retry'),
  'true',
  'same-user retry is idempotent even after account email changes'
);

select is(
  (
    select count(*)
    from public.security_events
    where source_component = 'accept_staff_invite_atomic'
      and user_id = 'f8080000-0000-4000-8000-000000000010'
  ),
  1::bigint,
  'idempotent retry emits no duplicate audit event'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000201',
    'f8080000-0000-4000-8000-000000000011',
    'other@example.invalid'
  ) ->> 'error_code',
  'INVITE_ALREADY_ACCEPTED',
  'a different user loses the serialized claim'
);

select is(
  (
    select count(*)
    from public.profiles
    where user_id = 'f8080000-0000-4000-8000-000000000011'
  ),
  0::bigint,
  'losing user receives no profile mutation'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000299',
    'f8080000-0000-4000-8000-000000000010',
    'invited@example.invalid'
  ) ->> 'error_code',
  'INVITE_NOT_FOUND',
  'unknown token fails closed'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000204',
    'f8080000-0000-4000-8000-000000000012',
    null::text
  ) ->> 'error_code',
  'INVITE_NOT_FOUND',
  'missing account email fails closed as absent identity input'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000204',
    'f8080000-0000-4000-8000-000000000012',
    '   '
  ) ->> 'error_code',
  'INVITE_NOT_FOUND',
  'blank account email fails closed as absent identity input'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000202',
    'f8080000-0000-4000-8000-000000000010',
    'invited@example.invalid'
  ) ->> 'error_code',
  'INVITE_EXPIRED',
  'expired invite fails closed'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000203',
    'f8080000-0000-4000-8000-000000000010',
    'invited@example.invalid'
  ) ->> 'error_code',
  'INVITE_INVALID_ROLE',
  'privileged stored role is rejected'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000207',
    'f8080000-0000-4000-8000-000000000010',
    'invited@example.invalid'
  ) ->> 'error_code',
  'INVITE_STATE_INVALID',
  'inconsistent accepted columns fail closed'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000204',
    'f8080000-0000-4000-8000-000000000012',
    'wrong@example.invalid'
  ) ->> 'error_code',
  'INVITE_EMAIL_MISMATCH',
  'invite/account email mismatch is rejected before mutation'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000204',
    'f8080000-0000-4000-8000-000000000011',
    'missing-staff@example.invalid'
  ) ->> 'error_code',
  'INVITE_ACCOUNT_EMAIL_MISMATCH',
  'supplied email must also match the Auth user row'
);

select is(
  public.accept_staff_invite_atomic(
    'f8080000-0000-4000-8000-000000000204',
    'f8080000-0000-4000-8000-000000000099',
    'missing-staff@example.invalid'
  ) ->> 'error_code',
  'INVITE_ACCOUNT_NOT_FOUND',
  'unknown Auth user fails closed before mutation'
);

select throws_ok(
  $query$
    select public.accept_staff_invite_atomic(
      'f8080000-0000-4000-8000-000000000204',
      'f8080000-0000-4000-8000-000000000012',
      'missing-staff@example.invalid'
    )
  $query$,
  '23503',
  null::text,
  'unresolved missing staff identity fails at the existing FK'
);

select results_eq(
  $query$
    select
      (select count(*) from public.profiles where user_id = 'f8080000-0000-4000-8000-000000000012')::bigint,
      (select count(*) from public.user_permissions where staff_id = 'f8080000-0000-4000-8000-000000000012')::bigint,
      (select count(*) from public.staff_invites where token = 'f8080000-0000-4000-8000-000000000204' and accepted_at is not null)::bigint,
      (select count(*) from public.security_events where user_id = 'f8080000-0000-4000-8000-000000000012' and source_component = 'accept_staff_invite_atomic')::bigint
  $query$,
  'values (0::bigint, 0::bigint, 0::bigint, 0::bigint)',
  'missing staff failure rolls every acceptance state back'
);

update public.staff_invites
set expires_at = pg_catalog.clock_timestamp() + interval '2 seconds'
where token = 'f8080000-0000-4000-8000-000000000208';

select throws_ok(
  $query$
    select public.accept_staff_invite_atomic(
      'f8080000-0000-4000-8000-000000000208',
      'f8080000-0000-4000-8000-000000000015',
      'expiry-during@example.invalid'
    )
  $query$,
  'PVI02',
  'INVITE_EXPIRED',
  'expiry after profile and permission work aborts the atomic statement'
);

select results_eq(
  $query$
    select
      (select count(*) from public.profiles where user_id = 'f8080000-0000-4000-8000-000000000015')::bigint,
      (select count(*) from public.user_permissions where staff_id = 'f8080000-0000-4000-8000-000000000015')::bigint,
      (select count(*) from public.staff_invites where token = 'f8080000-0000-4000-8000-000000000208' and accepted_at is not null)::bigint,
      (select count(*) from public.security_events where user_id = 'f8080000-0000-4000-8000-000000000015' and source_component = 'accept_staff_invite_atomic')::bigint
  $query$,
  'values (0::bigint, 0::bigint, 0::bigint, 0::bigint)',
  'mid-transaction expiry rolls profile, permission, invite, and audit back'
);

select throws_ok(
  $query$
    select public.accept_staff_invite_atomic(
      'f8080000-0000-4000-8000-000000000205',
      'f8080000-0000-4000-8000-000000000013',
      'profile-failure@example.invalid'
    )
  $query$,
  'PVI11',
  'PR08_PROFILE_FAILURE',
  'profile failure aborts the atomic statement'
);

select results_eq(
  $query$
    select
      (select count(*) from public.profiles where user_id = 'f8080000-0000-4000-8000-000000000013')::bigint,
      (select count(*) from public.user_permissions where staff_id = 'f8080000-0000-4000-8000-000000000013')::bigint,
      (select count(*) from public.staff_invites where token = 'f8080000-0000-4000-8000-000000000205' and accepted_at is not null)::bigint
  $query$,
  'values (0::bigint, 0::bigint, 0::bigint)',
  'profile failure leaves permission and invite unchanged'
);

select throws_ok(
  $query$
    select public.accept_staff_invite_atomic(
      'f8080000-0000-4000-8000-000000000206',
      'f8080000-0000-4000-8000-000000000014',
      'audit-failure@example.invalid'
    )
  $query$,
  'PVI12',
  'PR08_AUDIT_FAILURE',
  'audit failure aborts the atomic statement'
);

select results_eq(
  $query$
    select
      (select count(*) from public.profiles where user_id = 'f8080000-0000-4000-8000-000000000014')::bigint,
      (select count(*) from public.user_permissions where staff_id = 'f8080000-0000-4000-8000-000000000014')::bigint,
      (select count(*) from public.staff_invites where token = 'f8080000-0000-4000-8000-000000000206' and accepted_at is not null)::bigint,
      (select count(*) from public.security_events where user_id = 'f8080000-0000-4000-8000-000000000014' and source_component = 'accept_staff_invite_atomic')::bigint
  $query$,
  'values (0::bigint, 0::bigint, 0::bigint, 0::bigint)',
  'audit failure rolls profile, permission, invite, and audit back'
);

select * from finish();

rollback;
