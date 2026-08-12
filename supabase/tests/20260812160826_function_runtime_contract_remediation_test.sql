begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(49);

select is(
  (
    select count(*)
    from pg_proc target
    where target.oid in (
      'public.analyze_staff_efficiency(uuid,integer)'::regprocedure,
      'public.calculate_churn_risk_score(uuid)'::regprocedure,
      'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure,
      'public.predict_revenue(uuid,integer)'::regprocedure
    )
  ),
  7::bigint,
  'all repaired function signatures exist'
);

select is(
  (
    select count(*)
    from pg_proc target
    where target.oid in (
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure
    )
      and target.prosecdef
  ),
  3::bigint,
  'three privileged functions remain SECURITY DEFINER'
);

select is(
  (
    select count(*)
    from pg_proc target
    where target.oid in (
      'public.analyze_staff_efficiency(uuid,integer)'::regprocedure,
      'public.calculate_churn_risk_score(uuid)'::regprocedure,
      'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
      'public.predict_revenue(uuid,integer)'::regprocedure
    )
      and not target.prosecdef
  ),
  4::bigint,
  'four legacy public functions remain SECURITY INVOKER'
);

select is(
  (
    select count(*)
    from pg_proc target
    where target.oid in (
      'public.analyze_staff_efficiency(uuid,integer)'::regprocedure,
      'public.calculate_churn_risk_score(uuid)'::regprocedure,
      'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure,
      'public.predict_revenue(uuid,integer)'::regprocedure
    )
      and exists (
        select 1
        from unnest(coalesce(target.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  ),
  7::bigint,
  'every repaired function keeps a fixed search_path'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure
    ]) as target(function_oid)
    cross join unnest(array['anon', 'authenticated']) as client(role_name)
    where has_function_privilege(client.role_name, target.function_oid, 'execute')
  ),
  0::bigint,
  'client roles cannot execute service-role-only functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure
    ]) as target(function_oid)
    where has_function_privilege('service_role', target.function_oid, 'execute')
  ),
  3::bigint,
  'service_role can execute all privileged functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.analyze_staff_efficiency(uuid,integer)'::regprocedure,
      'public.calculate_churn_risk_score(uuid)'::regprocedure,
      'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
      'public.predict_revenue(uuid,integer)'::regprocedure
    ]) as target(function_oid)
    cross join unnest(array['anon', 'authenticated', 'service_role']) as client(role_name)
    where has_function_privilege(client.role_name, target.function_oid, 'execute')
  ),
  12::bigint,
  'legacy invoker execution grants remain compatible'
);

select is(
  (
    select count(*)
    from (values
      ('public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure, array['service_role']::text[]),
      ('public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure, array['service_role']::text[]),
      ('public.get_invite_by_token(uuid)'::regprocedure, array['service_role']::text[])
    ) as expected(function_oid, execute_roles)
    cross join lateral (
      select coalesce(
        array_agg(expected_role order by expected_role collate "C"),
        array[]::text[]
      ) as execute_roles
      from unnest(expected.execute_roles) expected_role
    ) normalized_expected
    cross join lateral (
      select
        coalesce(
          array_agg(
            distinct actual_grant.role_name collate "C"
            order by actual_grant.role_name collate "C"
          ),
          array[]::text[]
        ) as execute_roles,
        coalesce(bool_or(actual_grant.is_grantable), false) as has_grant_option
      from (
        select case
          when acl_entry.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl_entry.grantee)::text
        end as role_name,
        acl_entry.is_grantable
        from pg_proc target_proc
        cross join lateral aclexplode(
          coalesce(target_proc.proacl, acldefault('f', target_proc.proowner))
        ) acl_entry
        where target_proc.oid = expected.function_oid
          and acl_entry.privilege_type = 'EXECUTE'
          and acl_entry.grantee <> target_proc.proowner
      ) actual_grant
    ) actual
    where actual.execute_roles = normalized_expected.execute_roles
      and not actual.has_grant_option
  ),
  3::bigint,
  'privileged functions have exactly the service_role EXECUTE grant'
);

select is(
  (
    select count(*)
    from (values
      ('public.analyze_staff_efficiency(uuid,integer)'::regprocedure, array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.calculate_churn_risk_score(uuid)'::regprocedure, array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure, array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.predict_revenue(uuid,integer)'::regprocedure, array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[])
    ) as expected(function_oid, execute_roles)
    cross join lateral (
      select coalesce(
        array_agg(expected_role order by expected_role collate "C"),
        array[]::text[]
      ) as execute_roles
      from unnest(expected.execute_roles) expected_role
    ) normalized_expected
    cross join lateral (
      select
        coalesce(
          array_agg(
            distinct actual_grant.role_name collate "C"
            order by actual_grant.role_name collate "C"
          ),
          array[]::text[]
        ) as execute_roles,
        coalesce(bool_or(actual_grant.is_grantable), false) as has_grant_option
      from (
        select case
          when acl_entry.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(acl_entry.grantee)::text
        end as role_name,
        acl_entry.is_grantable
        from pg_proc target_proc
        cross join lateral aclexplode(
          coalesce(target_proc.proacl, acldefault('f', target_proc.proowner))
        ) acl_entry
        where target_proc.oid = expected.function_oid
          and acl_entry.privilege_type = 'EXECUTE'
          and acl_entry.grantee <> target_proc.proowner
      ) actual_grant
    ) actual
    where actual.execute_roles = normalized_expected.execute_roles
      and not actual.has_grant_option
  ),
  4::bigint,
  'legacy invoker functions have exactly the compatible EXECUTE grants'
);

select is(
  (
    select count(*)
    from pg_proc target
    where target.oid in (
      'public.analyze_staff_efficiency(uuid,integer)'::regprocedure,
      'public.calculate_churn_risk_score(uuid)'::regprocedure,
      'public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
      'public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)'::regprocedure,
      'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure,
      'public.get_invite_by_token(uuid)'::regprocedure,
      'public.predict_revenue(uuid,integer)'::regprocedure
    )
      and pg_get_userbyid(target.proowner) = 'postgres'
  ),
  7::bigint,
  'all repaired functions retain the reviewed postgres owner'
);

select ok(
  'security_invoker=true' = any(
    coalesce(
      (select reloptions from pg_class where oid = 'public.daily_revenue_summary'::regclass),
      array[]::text[]
    )
  ),
  'daily revenue summary remains a security invoker view'
);

insert into public.clinics (id, name)
values
  ('f8120000-0000-4000-8000-000000000001', '__function_contract_clinic_a__'),
  ('f8120000-0000-4000-8000-000000000002', '__function_contract_clinic_b__');

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
  'f8120000-0000-4000-8000-000000000010',
  'function-contract@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  'authenticated'
);

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values (
  'f8120000-0000-4000-8000-000000000010',
  'f8120000-0000-4000-8000-000000000001',
  '__function_contract_user__',
  'staff',
  'function-contract@example.invalid',
  'not-used'
);

insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
values (
  'f8120000-0000-4000-8000-000000000010',
  'f8120000-0000-4000-8000-000000000001',
  'function-contract@example.invalid',
  'Function Contract User',
  'staff',
  true
);

insert into public.user_permissions (
  staff_id,
  username,
  hashed_password,
  role,
  clinic_id
)
values (
  'f8120000-0000-4000-8000-000000000010',
  'function-contract-user',
  'not-used',
  'staff',
  'f8120000-0000-4000-8000-000000000001'
);

insert into public.resources (
  id,
  clinic_id,
  name,
  type,
  working_hours,
  is_active,
  is_bookable,
  is_deleted
)
values
  (
    'f8120000-0000-4000-8000-000000000020',
    'f8120000-0000-4000-8000-000000000001',
    '__function_contract_staff_a__',
    'staff',
    jsonb_build_object(
      to_char(date '2099-01-05', 'Day'),
      jsonb_build_object('start', '09:00', 'end', '10:00')
    ),
    true,
    true,
    false
  ),
  (
    'f8120000-0000-4000-8000-000000000021',
    'f8120000-0000-4000-8000-000000000002',
    '__function_contract_staff_b__',
    'staff',
    default,
    true,
    true,
    false
  );

insert into public.customers (id, clinic_id, name, phone, is_deleted)
values
  ('f8120000-0000-4000-8000-000000000030', 'f8120000-0000-4000-8000-000000000001', '__repeat_patient_a__', '09081200030', false),
  ('f8120000-0000-4000-8000-000000000031', 'f8120000-0000-4000-8000-000000000001', '__single_patient_a__', '09081200031', false),
  ('f8120000-0000-4000-8000-000000000032', 'f8120000-0000-4000-8000-000000000001', '__no_visit_patient_a__', '09081200032', false),
  ('f8120000-0000-4000-8000-000000000033', 'f8120000-0000-4000-8000-000000000001', '__recent_patient_a__', '09081200033', false),
  ('f8120000-0000-4000-8000-000000000034', 'f8120000-0000-4000-8000-000000000002', '__repeat_patient_b__', '09081200034', false);

insert into public.menus (
  id, clinic_id, name, price, duration_minutes, is_active, is_public, is_deleted
)
values
  ('f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000001', '__function_contract_menu_a__', 5000, 30, true, true, false),
  ('f8120000-0000-4000-8000-000000000041', 'f8120000-0000-4000-8000-000000000002', '__function_contract_menu_b__', 5000, 30, true, true, false);

insert into public.reservations (
  id,
  clinic_id,
  customer_id,
  menu_id,
  staff_id,
  start_time,
  end_time,
  status,
  channel,
  actual_price,
  is_deleted
)
values
  ('f8120000-0000-4000-8000-000000000101', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000030', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000102', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000030', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 57) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 57) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000103', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000030', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 50) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 50) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000104', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000031', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 20) + time '13:00') at time zone 'Asia/Tokyo', (((current_date - 20) + time '13:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000105', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000033', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 5) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 5) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 16000, false),
  ('f8120000-0000-4000-8000-000000000106', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000033', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', ((current_date - 1) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 1) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 8000, false),
  ('f8120000-0000-4000-8000-000000000107', 'f8120000-0000-4000-8000-000000000002', 'f8120000-0000-4000-8000-000000000034', 'f8120000-0000-4000-8000-000000000041', 'f8120000-0000-4000-8000-000000000021', ((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000108', 'f8120000-0000-4000-8000-000000000002', 'f8120000-0000-4000-8000-000000000034', 'f8120000-0000-4000-8000-000000000041', 'f8120000-0000-4000-8000-000000000021', ((current_date - 57) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 57) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000109', 'f8120000-0000-4000-8000-000000000002', 'f8120000-0000-4000-8000-000000000034', 'f8120000-0000-4000-8000-000000000041', 'f8120000-0000-4000-8000-000000000021', ((current_date - 50) + time '12:00') at time zone 'Asia/Tokyo', (((current_date - 50) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000110', 'f8120000-0000-4000-8000-000000000001', 'f8120000-0000-4000-8000-000000000033', 'f8120000-0000-4000-8000-000000000040', 'f8120000-0000-4000-8000-000000000020', timestamptz '2099-01-01 09:00:00+09', timestamptz '2099-01-01 09:30:00+09', 'confirmed', 'phone', 5000, false),
  ('f8120000-0000-4000-8000-000000000111', 'f8120000-0000-4000-8000-000000000002', 'f8120000-0000-4000-8000-000000000034', 'f8120000-0000-4000-8000-000000000041', 'f8120000-0000-4000-8000-000000000021', ((current_date - 1) + time '14:00') at time zone 'Asia/Tokyo', (((current_date - 1) + time '14:00') at time zone 'Asia/Tokyo') + interval '30 minutes', 'completed', 'phone', 99999, false);

insert into public.blocks (
  id, clinic_id, resource_id, start_time, end_time, reason, is_active, is_deleted
)
values (
  'f8120000-0000-4000-8000-000000000120',
  'f8120000-0000-4000-8000-000000000001',
  'f8120000-0000-4000-8000-000000000020',
  timestamptz '2099-01-02 09:00:00+09',
  timestamptz '2099-01-02 10:00:00+09',
  'test block',
  true,
  false
);

insert into public.staff_invites (
  id, clinic_id, email, role, token, expires_at, accepted_at, created_by
)
values
  ('f8120000-0000-4000-8000-000000000130', 'f8120000-0000-4000-8000-000000000001', 'valid-invite@example.invalid', 'staff', 'f8120000-0000-4000-8000-000000000131', now() + interval '1 day', null, 'f8120000-0000-4000-8000-000000000010'),
  ('f8120000-0000-4000-8000-000000000132', 'f8120000-0000-4000-8000-000000000001', 'expired-invite@example.invalid', 'staff', 'f8120000-0000-4000-8000-000000000133', now() - interval '1 day', null, 'f8120000-0000-4000-8000-000000000010'),
  ('f8120000-0000-4000-8000-000000000134', 'f8120000-0000-4000-8000-000000000001', 'accepted-invite@example.invalid', 'staff', 'f8120000-0000-4000-8000-000000000135', now() + interval '1 day', now(), 'f8120000-0000-4000-8000-000000000010');

insert into public.daily_reports (id, clinic_id, report_date)
values (
  'f8120000-0000-4000-8000-000000000140',
  'f8120000-0000-4000-8000-000000000001',
  date '2099-02-01'
);

insert into public.daily_report_items (
  id,
  clinic_id,
  daily_report_id,
  report_date,
  patient_name,
  treatment_name,
  duration_minutes,
  fee,
  billing_type,
  source,
  revenue_context_code,
  revenue_context_source,
  amount_source,
  estimate_status,
  pricing_snapshot_status
)
values (
  'f8120000-0000-4000-8000-000000000141',
  'f8120000-0000-4000-8000-000000000001',
  'f8120000-0000-4000-8000-000000000140',
  date '2099-02-01',
  '__pricing_patient__',
  '__pricing_treatment__',
  30,
  5000,
  'private',
  'manual',
  'private',
  'manual',
  'manual',
  'not_calculated',
  'pending'
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
  'f8120000-0000-4000-8000-000000000150',
  'f8120000-0000-4000-8000-000000000001',
  '__function_contract_period__',
  date '2099-03-01',
  date '2099-03-31',
  timestamptz '2099-02-20 00:00:00+09',
  'open',
  'f8120000-0000-4000-8000-000000000010'
);

insert into public.shift_requests (
  id,
  clinic_id,
  period_id,
  staff_id,
  request_type,
  start_time,
  end_time,
  status,
  submitted_by,
  submitted_for_role
)
values (
  'f8120000-0000-4000-8000-000000000151',
  'f8120000-0000-4000-8000-000000000001',
  'f8120000-0000-4000-8000-000000000150',
  'f8120000-0000-4000-8000-000000000020',
  'available',
  timestamptz '2099-03-01 09:00:00+09',
  timestamptz '2099-03-01 17:00:00+09',
  'approved',
  'f8120000-0000-4000-8000-000000000010',
  'staff'
);

set local role service_role;

select lives_ok(
  $$
    select *
    from public.confirm_daily_report_item_pricing(
      'f8120000-0000-4000-8000-000000000001',
      'f8120000-0000-4000-8000-000000000141',
      null::integer,
      null::numeric,
      false,
      null::text,
      null::uuid
    )
  $$,
  'pricing confirmation executes without ambiguous output parameters'
);

select lives_ok(
  $$
    select *
    from public.confirm_daily_report_item_pricing(
      'f8120000-0000-4000-8000-000000000001',
      'f8120000-0000-4000-8000-000000000141',
      null::integer,
      null::numeric,
      false,
      null::text,
      null::uuid
    )
  $$,
  'pricing confirmation can upsert the same item a second time'
);

select is(
  (
    select count(*)
    from public.revenue_estimates
    where daily_report_item_id = 'f8120000-0000-4000-8000-000000000141'
  ),
  1::bigint,
  'pricing upsert leaves exactly one estimate'
);

select is(
  (
    select count(*)
    from public.revenue_estimate_lines estimate_line
    join public.revenue_estimates estimate on estimate.id = estimate_line.revenue_estimate_id
    where estimate.daily_report_item_id = 'f8120000-0000-4000-8000-000000000141'
  ),
  1::bigint,
  'pricing recalculation replaces estimate lines without duplication'
);

select throws_ok(
  $$
    select *
    from public.confirm_daily_report_item_pricing(
      'f8120000-0000-4000-8000-000000000002',
      'f8120000-0000-4000-8000-000000000141',
      null::integer,
      null::numeric,
      false,
      null::text,
      null::uuid
    )
  $$,
  '23503',
  'daily_report_items.id not found',
  'pricing confirmation rejects a mismatched clinic without partial writes'
);

select is(
  (
    select count(*)
    from public.revenue_estimates
    where daily_report_item_id = 'f8120000-0000-4000-8000-000000000141'
  ),
  1::bigint,
  'rejected cross-clinic pricing call leaves the existing estimate unchanged'
);

select results_eq(
  $$
    select clinic_name
    from public.get_invite_by_token('f8120000-0000-4000-8000-000000000131')
  $$,
  $$values ('__function_contract_clinic_a__'::text)$$,
  'invite lookup returns varchar clinic names through its text contract'
);

select is(
  (
    select count(*)
    from public.get_invite_by_token('f8120000-0000-4000-8000-000000000133')
  ),
  0::bigint,
  'expired invites remain hidden'
);

select is(
  (
    select count(*)
    from public.get_invite_by_token('f8120000-0000-4000-8000-000000000135')
  ),
  0::bigint,
  'accepted invites remain hidden'
);

select lives_ok(
  $$
    select *
    from public.convert_shift_requests(
      'f8120000-0000-4000-8000-000000000001',
      'f8120000-0000-4000-8000-000000000150',
      array['f8120000-0000-4000-8000-000000000151']::uuid[],
      'selected',
      'f8120000-0000-4000-8000-000000000010',
      'manager'
    )
  $$,
  'real shift conversion still completes atomically'
);

select is(
  (
    select count(*)
    from public.staff_shifts
    where clinic_id = 'f8120000-0000-4000-8000-000000000001'
      and start_time = timestamptz '2099-03-01 09:00:00+09'
  ),
  1::bigint,
  'shift conversion creates one confirmed shift'
);

select results_eq(
  $$
    select status, converted_shift_id is not null
    from public.shift_requests
    where id = 'f8120000-0000-4000-8000-000000000151'
  $$,
  $$values ('converted'::text, true)$$,
  'shift request records the converted state and shift id'
);

select is(
  (
    select count(*)
    from public.shift_request_audit_logs
    where request_id = 'f8120000-0000-4000-8000-000000000151'
      and action = 'request_convert'
  ),
  1::bigint,
  'shift conversion creates one audit record'
);

select throws_ok(
  $$
    select *
    from public.convert_shift_requests(
      'f8120000-0000-4000-8000-000000000001',
      'f8120000-0000-4000-8000-000000000150',
      array['f8120000-0000-4000-8000-000000000151']::uuid[],
      'selected',
      'f8120000-0000-4000-8000-000000000010',
      'manager'
    )
  $$,
  '23514',
  'selected request_ids include non-convertible requests',
  'a converted request cannot be converted twice'
);

select lives_ok(
  $$
    select *
    from public.convert_shift_requests(
      'f8120000-0000-4000-8000-000000000001',
      'f8120000-0000-4000-8000-000000000150',
      null,
      'all_approved',
      'f8120000-0000-4000-8000-000000000010',
      'manager'
    )
  $$,
  'all-approved shift conversion returns cleanly with zero candidates'
);

reset role;
set local role postgres;

select results_eq(
  $$
    select has_conflict, conflict_type::text, conflicting_reservation_id
    from public.check_reservation_conflict(
      'f8120000-0000-4000-8000-000000000020',
      timestamptz '2099-01-01 09:00:00+09',
      timestamptz '2099-01-01 09:30:00+09',
      null
    )
  $$,
  $$values (true, 'reservation'::text, 'f8120000-0000-4000-8000-000000000110'::uuid)$$,
  'reservation conflicts return the declared varchar discriminator'
);

select results_eq(
  $$
    select has_conflict, conflict_type::text, conflicting_reservation_id
    from public.check_reservation_conflict(
      'f8120000-0000-4000-8000-000000000020',
      timestamptz '2099-01-02 09:00:00+09',
      timestamptz '2099-01-02 09:30:00+09',
      null
    )
  $$,
  $$values (true, 'block'::text, 'f8120000-0000-4000-8000-000000000120'::uuid)$$,
  'block conflicts return the declared varchar discriminator'
);

select is(
  (
    select has_conflict
    from public.check_reservation_conflict(
      'f8120000-0000-4000-8000-000000000020',
      timestamptz '2099-01-03 09:00:00+09',
      timestamptz '2099-01-03 09:30:00+09',
      null
    )
  ),
  false,
  'an empty slot returns no conflict'
);

select is(
  (
    select has_conflict
    from public.check_reservation_conflict(
      'f8120000-0000-4000-8000-000000000020',
      timestamptz '2099-01-01 09:00:00+09',
      timestamptz '2099-01-01 09:30:00+09',
      'f8120000-0000-4000-8000-000000000110'
    )
  ),
  false,
  'excluded reservation ids are ignored'
);

select is(
  (
    select count(*)
    from public.get_available_time_slots(
      'f8120000-0000-4000-8000-000000000020',
      date '2099-01-05',
      30,
      30
    )
  ),
  2::bigint,
  'available-time caller executes the repaired conflict function transitively'
);

select is(
  public.calculate_churn_risk_score('f8120000-0000-4000-8000-000000000030'),
  80::numeric,
  'repeat patient risk uses reservation-backed treatment gaps'
);

select is(
  public.calculate_churn_risk_score('f8120000-0000-4000-8000-000000000031'),
  55::numeric,
  'overdue single visit keeps the application risk floor'
);

select is(
  public.calculate_churn_risk_score('f8120000-0000-4000-8000-000000000032'),
  0::numeric,
  'patient with no completed visit has zero churn risk'
);

select is(
  (
    select count(*)
    from public.predict_revenue('f8120000-0000-4000-8000-000000000001', 2)
  ),
  2::bigint,
  'revenue forecast returns one row per requested day without loop shadowing'
);

select results_eq(
  $$
    select efficiency_score, revenue_per_hour, patients_per_day
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000001',
      7
    )
    where staff_id = 'f8120000-0000-4000-8000-000000000020'
  $$,
  $$values (36000.00::numeric, 1500.00::numeric, 0.50::numeric)$$,
  'seven-day staff analysis includes both recent working days'
);

select results_eq(
  $$
    select efficiency_score, revenue_per_hour, patients_per_day
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000001',
      3
    )
    where staff_id = 'f8120000-0000-4000-8000-000000000020'
  $$,
  $$values (24000.00::numeric, 1000.00::numeric, 1.00::numeric)$$,
  'analysis_period changes the staff efficiency window'
);

select results_eq(
  $$
    select efficiency_score, revenue_per_hour, patients_per_day
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000001',
      null
    )
    where staff_id = 'f8120000-0000-4000-8000-000000000020'
  $$,
  $$values (29000.00::numeric, 1208.33::numeric, 0.67::numeric)$$,
  'null analysis period normalizes to thirty days'
);

select results_eq(
  $$
    select efficiency_score, revenue_per_hour, patients_per_day
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000001',
      0
    )
    where staff_id = 'f8120000-0000-4000-8000-000000000020'
  $$,
  $$values (null::numeric, null::numeric, null::numeric)$$,
  'zero analysis period normalizes to one day'
);

select ok(
  (
    select prosrc like '%PRAGMA:TABLE: shift_request_conversion_candidates%'
      and prosrc like '%PRAGMA:TABLE: shift_request_conversion_map%'
    from pg_proc
    where oid = 'public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)'::regprocedure
  ),
  'conversion function declares both temporary table contracts for lint'
);

select ok(
  (
    select prosrc !~* 'day_counter[[:space:]]+integer[[:space:]]*;'
    from pg_proc
    where oid = 'public.predict_revenue(uuid,integer)'::regprocedure
  ),
  'revenue forecast has no explicit shadowed loop variable'
);

do $claims$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'f8120000-0000-4000-8000-000000000010',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'user_role', 'staff',
        'clinic_scope_ids', jsonb_build_array(
          'f8120000-0000-4000-8000-000000000001'
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
  public.calculate_churn_risk_score('f8120000-0000-4000-8000-000000000030'),
  80::numeric,
  'authenticated staff can calculate risk inside their clinic scope'
);

select is(
  public.calculate_churn_risk_score('f8120000-0000-4000-8000-000000000034'),
  0::numeric,
  'authenticated churn calculation cannot observe another clinic'
);

select is(
  (
    select count(*)
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000001',
      7
    )
  ),
  1::bigint,
  'authenticated staff analysis returns in-scope resources'
);

select is(
  (
    select count(*)
    from public.analyze_staff_efficiency(
      'f8120000-0000-4000-8000-000000000002',
      7
    )
  ),
  0::bigint,
  'authenticated staff analysis returns no cross-clinic resources'
);

select is(
  (
    select has_conflict
    from public.check_reservation_conflict(
      'f8120000-0000-4000-8000-000000000021',
      ((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo',
      (((current_date - 64) + time '12:00') at time zone 'Asia/Tokyo') + interval '30 minutes',
      null
    )
  ),
  false,
  'authenticated conflict lookup cannot reveal another clinic reservation'
);

select is(
  (
    select count(*)
    from public.daily_revenue_summary
    where clinic_id = 'f8120000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'security-invoker revenue view exposes no cross-clinic rows'
);

select ok(
  exists (
    select 1
    from public.predict_revenue('f8120000-0000-4000-8000-000000000001', 2)
    where predicted_revenue is not null
  ),
  'authenticated revenue forecast can use in-scope revenue rows'
);

select results_eq(
  $$
    select predicted_revenue
    from public.predict_revenue('f8120000-0000-4000-8000-000000000002', 2)
    order by forecast_date
  $$,
  $$values (0::numeric), (0::numeric)$$,
  'authenticated revenue forecast cannot reveal another clinic revenue value'
);

reset role;
set local role postgres;

select * from finish();

rollback;
