begin;

do $commercial_red$
declare
  actor_id constant uuid := 'f1000000-0000-4000-8000-000000000001';
  clinic_a constant uuid := 'f1000000-0000-4000-8000-000000000011';
  clinic_b constant uuid := 'f1000000-0000-4000-8000-000000000012';
  profile_updates integer := 0;
  visible_settings integer := 0;
  cross_tenant_updates integer := 0;
begin
  insert into public.clinics (id, name)
  values
    (clinic_a, 'commercial-red-profile-clinic-a'),
    (clinic_b, 'commercial-red-profile-clinic-b');

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
    actor_id,
    'commercial-red-profile@example.invalid',
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
  values (
    actor_id,
    clinic_a,
    'commercial-red-profile@example.invalid',
    'commercial-red-profile-user',
    'staff',
    true
  );

  insert into public.clinic_settings (clinic_id, category, settings)
  values
    (clinic_a, 'clinic_basic', '{"owner":"a"}'::jsonb),
    (clinic_b, 'clinic_basic', '{"owner":"b"}'::jsonb);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor_id::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  begin
    update public.profiles
    set role = 'manager', clinic_id = clinic_b, is_active = true
    where user_id = actor_id;
    get diagnostics profile_updates = row_count;

    select count(*)
    into visible_settings
    from public.clinic_settings
    where clinic_id in (clinic_a, clinic_b);

    update public.clinic_settings
    set settings = '{"compromised":true}'::jsonb
    where clinic_id = clinic_a
      and category = 'clinic_basic';
    get diagnostics cross_tenant_updates = row_count;
  exception
    when insufficient_privilege then
      null;
  end;

  if profile_updates = 1
    and visible_settings = 2
    and cross_tenant_updates = 1 then
    raise exception 'RED COMM-AUTH-001: self profile privilege escalation reached cross-tenant clinic_settings';
  end if;

end
$commercial_red$;

rollback;
