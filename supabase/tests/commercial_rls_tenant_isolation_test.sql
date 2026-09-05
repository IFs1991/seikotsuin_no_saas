begin;

set local search_path = pg_catalog, extensions, public;

set local role postgres;

grant usage on schema extensions
  to session_user, anon, authenticated, service_role;

reset role;

select plan(20);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'graphql_public')
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  0::bigint,
  'all exposed tables have RLS enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
  ),
  183::bigint,
  'public policy count matches the reviewed PR-11 catalog after two ALL policies split into command policies'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and roles <> array['authenticated']::name[]
  ),
  0::bigint,
  'every public policy targets authenticated explicitly'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        roles && array['public', 'anon', 'service_role']::name[]
        or policyname ~* 'service[_ ]role'
        or coalesce(qual, '') ~* 'service_role'
        or coalesce(with_check, '') ~* 'service_role'
      )
  ),
  0::bigint,
  'service_role bypass has no RLS policy and clients inherit no public policy'
);

select is(
  (
    select count(*)
    from pg_policy policy_catalog
    join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
    join pg_namespace namespace_catalog
      on namespace_catalog.oid = table_catalog.relnamespace
    where namespace_catalog.nspname = 'public'
      and coalesce(
        obj_description(policy_catalog.oid, 'pg_policy'),
        ''
      ) !~ '^PR-(03|11):'
  ),
  0::bigint,
  'every retained policy has a reviewed PR-03 or PR-11 actor and intent comment'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(qual, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mp\.clinic_id\s*=\s*p\.clinic_id\M'
        or coalesce(with_check, '') ~ '\mup\.clinic_id\s*=\s*up\.clinic_id\M'
      )
  ),
  0::bigint,
  'clinic settings policies contain no self-comparison tautology'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('treatment_menu_records', 'treatments')
  ),
  0::bigint,
  'legacy treatment tables remain deny-all for clients'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        values
          ('clinic_settings', 'clinic_settings_select_policy'),
          ('clinic_settings', 'clinic_settings_upsert_policy'),
          ('clinics', 'clinics_admin_select'),
          ('improvement_backlog', 'improvement_backlog_admin_all'),
          (
            'improvement_backlog',
            'improvement_backlog_authenticated_select'
          ),
          ('improvement_backlog', 'Admins can manage backlog'),
          ('mfa_usage_stats', 'Admins can view MFA usage stats'),
          ('staff_preferences', 'staff_preferences_update_policy'),
          ('staff_preferences', 'staff_preferences_upsert_policy'),
          ('user_mfa_settings', 'Admins can view clinic MFA settings'),
          ('user_mfa_settings', 'Users can view own MFA settings')
      )
  ),
  0::bigint,
  'reviewed tautological duplicate and subsumed policies are absent'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        values
          (
            'manager_clinic_assignments',
            'manager_clinic_assignments_select_admin_or_self_active'
          ),
          ('calendar_feed_tokens', 'calendar_feed_tokens_select_scoped'),
          ('staff_profiles', 'staff_profiles_select_scoped'),
          ('shift_requests', 'shift_requests_select_scoped'),
          ('shift_requests', 'shift_requests_insert_scoped'),
          ('shift_requests', 'shift_requests_update_scoped')
      )
      and position(
        'SELECT auth.uid()' in concat_ws(' ', qual, with_check)
      ) > 0
  ),
  6::bigint,
  'all six retained auth.uid policies use initialization plans'
);

set local role anon;

select throws_ok(
  'select * from public.clinic_settings limit 0',
  '42501',
  null::text,
  'anon direct relation access is denied before RLS evaluation'
);

reset role;
set local role service_role;

select lives_ok(
  'select * from public.email_outbox limit 0',
  'legitimate service flow remains available without a service_role policy'
);

reset role;
set local role postgres;

insert into public.clinics (id, name, parent_id)
values
  (
    'f3030000-0000-4000-8000-000000000000',
    '__commercial_pr03_root_a__',
    null
  ),
  (
    'f3030000-0000-4000-8000-0000000000ff',
    '__commercial_pr03_root_b__',
    null
  ),
  (
    'f3030000-0000-4000-8000-000000000001',
    '__commercial_pr03_clinic_a__',
    'f3030000-0000-4000-8000-000000000000'
  ),
  (
    'f3030000-0000-4000-8000-000000000002',
    '__commercial_pr03_clinic_b__',
    'f3030000-0000-4000-8000-0000000000ff'
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
    'f3030000-0000-4000-8000-000000000010',
    'commercial-pr03-manager@example.invalid',
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
    'f3030000-0000-4000-8000-000000000020',
    'commercial-pr09-clinic-admin@example.invalid',
    extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

insert into public.profiles (
  user_id,
  clinic_id,
  email,
  full_name,
  role,
  is_active
)
values
  (
    'f3030000-0000-4000-8000-000000000010',
    'f3030000-0000-4000-8000-000000000001',
    'commercial-pr03-manager@example.invalid',
    'Commercial PR03 Manager',
    'manager',
    true
  ),
  (
    'f3030000-0000-4000-8000-000000000020',
    'f3030000-0000-4000-8000-000000000000',
    'commercial-pr09-clinic-admin@example.invalid',
    'Commercial PR09 Clinic Admin',
    'clinic_admin',
    true
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
    'f3030000-0000-4000-8000-000000000010',
    'f3030000-0000-4000-8000-000000000001',
    'Commercial PR03 Manager',
    'manager',
    'commercial-pr03-manager@example.invalid',
    'not-used'
  ),
  (
    'f3030000-0000-4000-8000-000000000020',
    'f3030000-0000-4000-8000-000000000000',
    'Commercial PR09 Clinic Admin',
    'clinic_admin',
    'commercial-pr09-clinic-admin@example.invalid',
    'not-used'
  );

insert into public.user_permissions (
  staff_id,
  username,
  hashed_password,
  role,
  clinic_id
)
values
  (
    'f3030000-0000-4000-8000-000000000010',
    'commercial-pr03-manager',
    'not-used',
    'manager',
    'f3030000-0000-4000-8000-000000000001'
  ),
  (
    'f3030000-0000-4000-8000-000000000020',
    'commercial-pr09-clinic-admin',
    'not-used',
    'clinic_admin',
    'f3030000-0000-4000-8000-000000000000'
  );

insert into public.clinic_settings (clinic_id, category, settings)
values
  (
    'f3030000-0000-4000-8000-000000000001',
    'clinic_basic',
    '{"owner":"a"}'::jsonb
  ),
  (
    'f3030000-0000-4000-8000-000000000002',
    'clinic_basic',
    '{"owner":"b"}'::jsonb
  );

do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3030000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'manager',
        'clinic_scope_ids', jsonb_build_array(
          'f3030000-0000-4000-8000-000000000001',
          'f3030000-0000-4000-8000-000000000002'
        )
      )
    )::text,
    true
  );
end
$claims$;

reset role;
set local role authenticated;

select is(
  (
    select count(*)
    from public.clinic_settings
    where clinic_id in (
      'f3030000-0000-4000-8000-000000000001',
      'f3030000-0000-4000-8000-000000000002'
    )
  ),
  0::bigint,
  'unassigned manager is fail-closed even when JWT scope lists both clinics'
);

select results_eq(
  $query$
    update public.clinic_settings
    set settings = '{"blocked":true}'::jsonb
    where clinic_id = 'f3030000-0000-4000-8000-000000000002'
    returning clinic_id::text
  $query$,
  $expected$
    select null::text where false
  $expected$,
  'unassigned manager cannot update tenant B'
);

reset role;
set local role postgres;

insert into public.manager_clinic_assignments (
  manager_user_id,
  clinic_id,
  assigned_by
)
values (
  'f3030000-0000-4000-8000-000000000010',
  'f3030000-0000-4000-8000-000000000001',
  'f3030000-0000-4000-8000-000000000010'
);

reset role;
set local role authenticated;

select results_eq(
  $query$
    select clinic_id::text
    from public.clinic_settings
    order by clinic_id
  $query$,
  $expected$
    values ('f3030000-0000-4000-8000-000000000001'::text)
  $expected$,
  'active manager assignment exposes tenant A only'
);

select results_eq(
  $query$
    update public.clinic_settings
    set settings = '{"blocked":true}'::jsonb
    where clinic_id = 'f3030000-0000-4000-8000-000000000002'
    returning clinic_id::text
  $query$,
  $expected$
    select null::text where false
  $expected$,
  'tenant A manager cannot update tenant B'
);

select results_eq(
  $query$
    update public.clinic_settings
    set settings = '{"allowed":true}'::jsonb
    where clinic_id = 'f3030000-0000-4000-8000-000000000001'
    returning clinic_id::text
  $query$,
  $expected$
    values ('f3030000-0000-4000-8000-000000000001'::text)
  $expected$,
  'tenant A manager can update the assigned clinic'
);

reset role;
set local role postgres;

update public.manager_clinic_assignments
set revoked_at = now(), revoke_reason = 'commercial-pr03-test'
where manager_user_id = 'f3030000-0000-4000-8000-000000000010'
  and clinic_id = 'f3030000-0000-4000-8000-000000000001';

reset role;
set local role authenticated;

select is(
  (
    select count(*)
    from public.clinic_settings
    where clinic_id in (
      'f3030000-0000-4000-8000-000000000001',
      'f3030000-0000-4000-8000-000000000002'
    )
  ),
  0::bigint,
  'revoked manager assignment immediately denies both tenants'
);

reset role;
set local role postgres;

do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f3030000-0000-4000-8000-000000000020',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'clinic_admin',
        'clinic_scope_ids', jsonb_build_array(
          'f3030000-0000-4000-8000-000000000001'
        )
      )
    )::text,
    true
  );
end
$claims$;

reset role;
set local role authenticated;

select results_eq(
  $query$
    select clinic_id::text
    from public.clinic_settings
    order by clinic_id
  $query$,
  $expected$
    values ('f3030000-0000-4000-8000-000000000001'::text)
  $expected$,
  'clinic admin scope can read tenant A but not tenant B'
);

select results_eq(
  $query$
    update public.clinic_settings
    set settings = '{"blocked":true}'::jsonb
    where clinic_id = 'f3030000-0000-4000-8000-000000000002'
    returning clinic_id::text
  $query$,
  $expected$
    select null::text where false
  $expected$,
  'clinic admin scope cannot update tenant B'
);

select throws_ok(
  $query$
    update public.profiles
    set role = 'admin'
    where user_id = 'f3030000-0000-4000-8000-000000000010'
  $query$,
  '42501',
  null::text,
  'authenticated clients cannot self-update profile authority columns'
);

reset role;

select * from finish();

rollback;
