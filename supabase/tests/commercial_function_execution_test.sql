begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(20);

select is(
  (
    select count(*)
    from pg_proc p
    where p.oid in (
      'public.update_reservation_notifications_updated_at()'::regprocedure,
      'public.validate_shift_requests_clinic_refs()'::regprocedure,
      'app_private.custom_access_token_hook(jsonb)'::regprocedure
    )
      and p.prosecdef
  ),
  3::bigint,
  'all reviewed privileged routines remain SECURITY DEFINER'
);

select is(
  (
    select coalesce(p.proconfig, array[]::text[])::text
    from pg_proc p
    where p.oid = 'public.normalize_customer_phone(text)'::regprocedure
  ),
  '{"search_path=public, auth, extensions"}'::text,
  'normalize_customer_phone has the reviewed fixed search_path'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.update_reservation_notifications_updated_at()'::regprocedure,
      'public.validate_shift_requests_clinic_refs()'::regprocedure
    ]) target(function_oid)
    cross join unnest(array['anon', 'authenticated']) client(role_name)
    where has_function_privilege(client.role_name, target.function_oid, 'EXECUTE')
  ),
  0::bigint,
  'client roles cannot execute either reviewed trigger function directly'
);

select is(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where n.nspname = 'app_private'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'no app_private function inherits PUBLIC EXECUTE'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  and has_schema_privilege('supabase_auth_admin', 'app_private', 'USAGE')
  and not has_function_privilege(
    'anon',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ),
  'Auth hook execution is limited to supabase_auth_admin'
);

select is(
  (
    with expected(function_signature, role_name) as (
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
        ('app_private.custom_access_token_hook(jsonb)', 'supabase_auth_admin')
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
      select *
      from (select * from expected except select * from actual) missing
      union all
      select *
      from (select * from actual except select * from expected) unexpected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the complete app_private runtime EXECUTE matrix matches exactly'
);

select is(
  (
    with expected(role_name, privilege_type) as (
      values
        ('anon', 'USAGE'),
        ('authenticated', 'USAGE'),
        ('service_role', 'USAGE'),
        ('supabase_auth_admin', 'USAGE')
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
      select *
      from (select * from expected except select * from actual) missing
      union all
      select *
      from (select * from actual except select * from expected) unexpected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the app_private schema privilege matrix matches exactly'
);

select is(
  (
    select count(*)
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
  ),
  0::bigint,
  'future postgres-owned functions remain closed to PUBLIC and client roles'
);

select is(
  (
    select count(*)
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
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'no unsafe explicit function default exists in global or application scope'
);

select ok(
  exists (
    select 1
    from pg_extension
    where extname = 'btree_gist'
      and extrelocatable
  ),
  'btree_gist relocation preflight remains available for a separate reviewed migration'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_no_overlap'
      and convalidated
  ),
  'the btree_gist-backed reservations exclusion constraint remains valid'
);

set local role anon;

select is(
  has_function_privilege(
    current_user,
    'public.update_reservation_notifications_updated_at()',
    'EXECUTE'
  ),
  false,
  'anon has no direct trigger-function execution privilege'
);

reset role;
set local role authenticated;

select is(
  has_function_privilege(
    current_user,
    'public.update_reservation_notifications_updated_at()',
    'EXECUTE'
  ),
  false,
  'authenticated has no direct notification trigger execution privilege'
);

reset role;
set local role anon;

select is(
  has_function_privilege(
    current_user,
    'public.validate_shift_requests_clinic_refs()',
    'EXECUTE'
  ),
  false,
  'anon has no direct shift validator execution privilege'
);

reset role;
set local role authenticated;

select is(
  has_function_privilege(
    current_user,
    'public.validate_shift_requests_clinic_refs()',
    'EXECUTE'
  ),
  false,
  'authenticated has no direct shift validator execution privilege'
);

reset role;
set local role postgres;

create temporary table pr04_phone_probe (
  phone text,
  normalized_phone text generated always as (
    public.normalize_customer_phone(phone)
  ) stored
);

grant insert, select on table pr04_phone_probe to authenticated;

create temporary table pr04_notification_trigger_probe (
  id integer primary key,
  updated_at timestamptz not null
);

create trigger pr04_notification_updated_at
before update on pr04_notification_trigger_probe
for each row
execute function public.update_reservation_notifications_updated_at();

grant insert, update, select on table pr04_notification_trigger_probe
  to authenticated;

insert into public.clinics (id, name)
values
  ('f4040000-0000-4000-8000-000000000001', '__commercial_pr04_clinic_a__'),
  ('f4040000-0000-4000-8000-000000000002', '__commercial_pr04_clinic_b__');

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
values (
  'f4040000-0000-4000-8000-000000000010',
  'commercial-pr04-trigger@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  'authenticated'
);

insert into public.resources (id, clinic_id, name, type, is_deleted)
values (
  'f4040000-0000-4000-8000-000000000020',
  'f4040000-0000-4000-8000-000000000001',
  '__commercial_pr04_staff__',
  'staff',
  false
);

insert into public.shift_request_periods (
  id,
  clinic_id,
  title,
  period_start,
  period_end,
  submission_deadline,
  status,
  created_by
)
values (
  'f4040000-0000-4000-8000-000000000030',
  'f4040000-0000-4000-8000-000000000001',
  '__commercial_pr04_period__',
  current_date,
  current_date + 1,
  now() + interval '1 day',
  'open',
  'f4040000-0000-4000-8000-000000000010'
);

create temporary table pr04_shift_trigger_probe (
  clinic_id uuid not null,
  period_id uuid not null,
  staff_id uuid not null,
  request_type text not null,
  status text not null,
  converted_shift_id uuid
);

create trigger pr04_shift_validator
before insert or update on pr04_shift_trigger_probe
for each row
execute function public.validate_shift_requests_clinic_refs();

grant insert on table pr04_shift_trigger_probe to authenticated;

reset role;
set local role authenticated;

insert into pr04_phone_probe (phone)
values ('+81 90-1234-5678');

select results_eq(
  'select normalized_phone from pr04_phone_probe',
  $$values ('09012345678'::text)$$,
  'generated phone normalization still works for authenticated writes'
);

insert into pr04_notification_trigger_probe (id, updated_at)
values (1, '2000-01-01 00:00:00+00');

select lives_ok(
  'update pr04_notification_trigger_probe set id = id where id = 1',
  'notification trigger still fires without authenticated direct EXECUTE'
);

select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'::timestamptz
    from pr04_notification_trigger_probe
    where id = 1
  ),
  'notification trigger updated the row timestamp'
);

select lives_ok(
  $query$
    insert into pr04_shift_trigger_probe (
      clinic_id,
      period_id,
      staff_id,
      request_type,
      status,
      converted_shift_id
    )
    values (
      'f4040000-0000-4000-8000-000000000001',
      'f4040000-0000-4000-8000-000000000030',
      'f4040000-0000-4000-8000-000000000020',
      'available',
      'submitted',
      null
    )
  $query$,
  'shift validator trigger still accepts a legitimate same-clinic row'
);

select throws_ok(
  $query$
    insert into pr04_shift_trigger_probe (
      clinic_id,
      period_id,
      staff_id,
      request_type,
      status,
      converted_shift_id
    )
    values (
      'f4040000-0000-4000-8000-000000000002',
      'f4040000-0000-4000-8000-000000000030',
      'f4040000-0000-4000-8000-000000000020',
      'available',
      'submitted',
      null
    )
  $query$,
  '23514',
  'shift_requests.period_id clinic mismatch',
  'shift validator trigger still rejects a cross-clinic row'
);

reset role;

select * from finish();

rollback;
