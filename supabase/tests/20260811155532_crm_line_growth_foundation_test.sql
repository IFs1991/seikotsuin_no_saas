begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(30);

select has_table('public', 'patient_identity_aliases', 'identity aliases table exists');
select has_table('public', 'patient_staff_preferences', 'staff preferences table exists');
select has_table('public', 'staff_availability_events', 'availability events table exists');
select has_table('public', 'staff_availability_notifications', 'availability notifications table exists');
select has_table('public', 'reservation_rewards', 'reservation rewards table exists');

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'patient_identity_aliases',
        'patient_staff_preferences',
        'staff_availability_events',
        'staff_availability_notifications',
        'reservation_rewards'
      )
      and relation.relrowsecurity
  ),
  5::bigint,
  'all CRM LINE tables have RLS enabled'
);

select is(
  (
    select count(*)
    from unnest(array[
      'patient_identity_aliases',
      'patient_staff_preferences',
      'staff_availability_events',
      'staff_availability_notifications',
      'reservation_rewards'
    ]) table_name
    cross join unnest(array['anon', 'authenticated']) role_name
    where has_table_privilege(role_name, 'public.' || table_name, 'SELECT')
       or has_table_privilege(role_name, 'public.' || table_name, 'INSERT')
       or has_table_privilege(role_name, 'public.' || table_name, 'UPDATE')
       or has_table_privilege(role_name, 'public.' || table_name, 'DELETE')
  ),
  0::bigint,
  'anon and authenticated have no direct CRM LINE table privileges'
);

select isnt_empty(
  $$
    select 1
    from pg_constraint
    where conrelid = 'public.staff_availability_notifications'::regclass
      and conname = 'staff_availability_notifications_outbox_clinic_fkey'
  $$,
  'notification outbox reference is clinic-scoped'
);

select is(
  (
    select count(*)
    from pg_proc routine
    where routine.oid in (
      'public.create_staff_availability_event(uuid,uuid,uuid,timestamptz,text,uuid,jsonb)'::regprocedure,
      'public.create_staff_availability_reservation(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,boolean,jsonb,uuid)'::regprocedure,
      'public.finalize_staff_availability_delivery(uuid,uuid,uuid,text,timestamptz,text)'::regprocedure
    )
      and not routine.prosecdef
  ),
  3::bigint,
  'all CRM LINE mutation functions are SECURITY INVOKER'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.create_staff_availability_event(uuid,uuid,uuid,timestamptz,text,uuid,jsonb)'::regprocedure,
      'public.create_staff_availability_reservation(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,boolean,jsonb,uuid)'::regprocedure,
      'public.finalize_staff_availability_delivery(uuid,uuid,uuid,text,timestamptz,text)'::regprocedure
    ]) as target(function_oid)
    cross join unnest(array['anon', 'authenticated']) as client(role_name)
    where has_function_privilege(client.role_name, target.function_oid, 'EXECUTE')
  ),
  0::bigint,
  'client roles cannot execute CRM LINE mutation functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.create_staff_availability_event(uuid,uuid,uuid,timestamptz,text,uuid,jsonb)'::regprocedure,
      'public.create_staff_availability_reservation(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,boolean,jsonb,uuid)'::regprocedure,
      'public.finalize_staff_availability_delivery(uuid,uuid,uuid,text,timestamptz,text)'::regprocedure
    ]) as target(function_oid)
    where has_function_privilege('service_role', target.function_oid, 'EXECUTE')
  ),
  3::bigint,
  'service_role can execute all CRM LINE mutation functions'
);

insert into public.clinics (id, name)
values
  ('a6080000-0000-4000-8000-000000000001', '__crm_line_clinic_a__'),
  ('a6080000-0000-4000-8000-000000000002', '__crm_line_clinic_b__');

insert into public.clinic_line_credentials (
  clinic_id, messaging_channel_id, login_channel_id,
  channel_secret_encrypted, assertion_private_key_encrypted, assertion_kid,
  is_active, credentials_verified_at, setup_completed_at
)
values (
  'a6080000-0000-4000-8000-000000000001',
  'crm-messaging-channel-a',
  'crm-login-channel-a',
  'encrypted-crm-channel-secret-a',
  'encrypted-crm-private-key-a',
  'crm-assertion-kid-a',
  true,
  now(),
  now()
);

insert into public.clinic_feature_flags (
  clinic_id, line_booking_enabled, line_notification_enabled, line_chat_enabled
)
values (
  'a6080000-0000-4000-8000-000000000001', false, true, false
);

insert into public.resources (
  id, clinic_id, name, type, is_active, is_bookable, is_deleted
)
values
  ('a6080000-0000-4000-8000-000000000011', 'a6080000-0000-4000-8000-000000000001', '__crm_staff_a__', 'staff', true, true, false),
  ('a6080000-0000-4000-8000-000000000012', 'a6080000-0000-4000-8000-000000000001', '__crm_room_a__', 'room', true, true, false),
  ('a6080000-0000-4000-8000-000000000013', 'a6080000-0000-4000-8000-000000000002', '__crm_staff_b__', 'staff', true, true, false);

insert into public.customers (
  id, clinic_id, name, phone, line_user_id, is_deleted
)
values (
  'a6080000-0000-4000-8000-000000000021',
  'a6080000-0000-4000-8000-000000000001',
  '__crm_customer_a__',
  '09000000001',
  'U-crm-line-a',
  false
);

insert into public.menus (
  id, clinic_id, name, price, duration_minutes, is_active, is_public, is_deleted
)
values (
  'a6080000-0000-4000-8000-000000000031',
  'a6080000-0000-4000-8000-000000000001',
  '__crm_menu_a__',
  5000,
  30,
  true,
  true,
  false
);

insert into public.reservations (
  id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time,
  status, channel, is_deleted
)
values (
  'a6080000-0000-4000-8000-000000000041',
  'a6080000-0000-4000-8000-000000000001',
  'a6080000-0000-4000-8000-000000000021',
  'a6080000-0000-4000-8000-000000000031',
  'a6080000-0000-4000-8000-000000000011',
  now() - interval '10 days',
  now() - interval '10 days' + interval '30 minutes',
  'completed',
  'phone',
  false
);

insert into public.patient_staff_preferences (
  clinic_id, customer_id, staff_id, notification_enabled
)
values (
  'a6080000-0000-4000-8000-000000000001',
  'a6080000-0000-4000-8000-000000000021',
  'a6080000-0000-4000-8000-000000000011',
  true
);

select throws_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000101',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000012',
      now() + interval '1 day',
      'priority_booking',
      null,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_STAFF_NOT_FOUND',
  'non-staff resource is rejected before event creation'
);

select is(
  (select count(*) from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000101'),
  0::bigint,
  'non-staff rejection leaves no event row'
);

select throws_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000102',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000013',
      now() + interval '1 day',
      'priority_booking',
      null,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_STAFF_NOT_FOUND',
  'cross-clinic staff is rejected'
);

select is(
  (select count(*) from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000102'),
  0::bigint,
  'cross-clinic staff rejection leaves no event row'
);

select throws_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000103',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000011',
      now() - interval '1 minute',
      'priority_booking',
      null,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_TIME_OUT_OF_RANGE',
  'past event time is rejected'
);

select is(
  (select count(*) from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000103'),
  0::bigint,
  'past-time rejection leaves no event row'
);

select throws_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000104',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '1 day'),
      'priority_booking',
      null,
      jsonb_build_array(jsonb_build_object(
        'customerId', 'a6080000-0000-4000-8000-000000000021',
        'lineUserId', 'U-wrong-line',
        'text', 'invalid recipient',
        'bookingUrl', 'https://example.invalid/invalid'
      ))
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_RECIPIENT_NOT_ELIGIBLE',
  'invalid current LINE identity rolls back the whole event transaction'
);

select ok(
  not exists (select 1 from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000104')
  and not exists (select 1 from public.staff_availability_notifications where availability_event_id = 'a6080000-0000-4000-8000-000000000104')
  and not exists (
    select 1 from public.line_message_outbox
    where payload @> '{"availability":{"eventId":"a6080000-0000-4000-8000-000000000104"}}'::jsonb
  ),
  'event, notification, and outbox all roll back together'
);

select lives_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000105',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '1 day'),
      'priority_booking',
      null,
      jsonb_build_array(jsonb_build_object(
        'customerId', 'a6080000-0000-4000-8000-000000000021',
        'lineUserId', 'U-crm-line-a',
        'text', 'valid recipient',
        'bookingUrl', 'https://example.invalid/valid'
      ))
    )
  $$,
  'eligible recipient creates an atomic availability notification set'
);

select ok(
  (select count(*) = 1 from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000105')
  and (select count(*) = 1 from public.staff_availability_notifications where availability_event_id = 'a6080000-0000-4000-8000-000000000105')
  and (
    select count(*) = 1
    from public.line_message_outbox
    where payload @> '{"availability":{"eventId":"a6080000-0000-4000-8000-000000000105"}}'::jsonb
  ),
  'event, notification, and outbox are all present exactly once'
);

select lives_ok(
  $$
    select * from public.create_staff_availability_reservation(
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000105',
      'a6080000-0000-4000-8000-000000000021',
      'U-crm-line-a',
      'a6080000-0000-4000-8000-000000000031',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '1 day'),
      date_trunc('minute', now() + interval '1 day') + interval '30 minutes',
      null,
      'line',
      true,
      '[]'::jsonb,
      null
    )
  $$,
  'matching staff, customer, LINE identity, and time creates the reservation'
);

select ok(
  (select status = 'booked' from public.staff_availability_events where id = 'a6080000-0000-4000-8000-000000000105')
  and (
    select status = 'booked' and booked_reservation_id is not null
    from public.staff_availability_notifications
    where availability_event_id = 'a6080000-0000-4000-8000-000000000105'
  )
  and (
    select count(*) = 1
    from public.reservation_rewards
    where metadata @> '{"availability_event_id":"a6080000-0000-4000-8000-000000000105"}'::jsonb
  ),
  'successful claim books event and notification and issues one reward'
);

select throws_ok(
  $$
    select * from public.create_staff_availability_reservation(
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000105',
      'a6080000-0000-4000-8000-000000000021',
      'U-crm-line-a',
      'a6080000-0000-4000-8000-000000000031',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '1 day'),
      date_trunc('minute', now() + interval '1 day') + interval '30 minutes',
      null,
      'line',
      true,
      '[]'::jsonb,
      null
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_CLAIM_CONFLICT',
  'a second claim of the same event is rejected'
);

select ok(
  (
    select count(*) = 1
    from public.reservations
    where clinic_id = 'a6080000-0000-4000-8000-000000000001'
      and customer_id = 'a6080000-0000-4000-8000-000000000021'
      and start_time = date_trunc('minute', now() + interval '1 day')
  )
  and (
    select count(*) = 1
    from public.reservation_rewards
    where metadata @> '{"availability_event_id":"a6080000-0000-4000-8000-000000000105"}'::jsonb
  ),
  'duplicate claim leaves one reservation and one reward'
);

select lives_ok(
  $$
    select * from public.create_staff_availability_event(
      'a6080000-0000-4000-8000-000000000106',
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '2 days'),
      'priority_booking',
      null,
      jsonb_build_array(jsonb_build_object(
        'customerId', 'a6080000-0000-4000-8000-000000000021',
        'lineUserId', 'U-crm-line-a',
        'text', 'second valid recipient',
        'bookingUrl', 'https://example.invalid/second'
      ))
    )
  $$,
  'a second independent event can be created'
);

select throws_ok(
  $$
    select * from public.create_staff_availability_reservation(
      'a6080000-0000-4000-8000-000000000001',
      'a6080000-0000-4000-8000-000000000106',
      'a6080000-0000-4000-8000-000000000021',
      'U-crm-line-a',
      'a6080000-0000-4000-8000-000000000031',
      'a6080000-0000-4000-8000-000000000011',
      date_trunc('minute', now() + interval '2 days') + interval '30 minutes',
      date_trunc('minute', now() + interval '2 days') + interval '60 minutes',
      null,
      'line',
      true,
      '[]'::jsonb,
      null
    )
  $$,
  'P0001',
  'STAFF_AVAILABILITY_CLAIM_CONFLICT',
  'a start-time mismatch is rejected'
);

select ok(
  not exists (
    select 1
    from public.reservations
    where clinic_id = 'a6080000-0000-4000-8000-000000000001'
      and customer_id = 'a6080000-0000-4000-8000-000000000021'
      and start_time = date_trunc('minute', now() + interval '2 days') + interval '30 minutes'
  )
  and not exists (
    select 1
    from public.reservation_rewards
    where metadata @> '{"availability_event_id":"a6080000-0000-4000-8000-000000000106"}'::jsonb
  ),
  'mismatched claim leaves no reservation or reward'
);

select lives_ok(
  $$
    select public.finalize_staff_availability_delivery(
      'a6080000-0000-4000-8000-000000000001',
      (
        select line_outbox_id
        from public.staff_availability_notifications
        where availability_event_id = 'a6080000-0000-4000-8000-000000000105'
      ),
      (
        select id
        from public.staff_availability_notifications
        where availability_event_id = 'a6080000-0000-4000-8000-000000000105'
      ),
      'sent',
      now(),
      null
    )
  $$,
  'delivery finalization updates the linked outbox and notification atomically'
);

select ok(
  (
    select outbox.status = 'sent'
    from public.line_message_outbox outbox
    join public.staff_availability_notifications notification
      on notification.line_outbox_id = outbox.id
     and notification.clinic_id = outbox.clinic_id
    where notification.availability_event_id = 'a6080000-0000-4000-8000-000000000105'
  )
  and (
    select status = 'booked'
    from public.staff_availability_notifications
    where availability_event_id = 'a6080000-0000-4000-8000-000000000105'
  ),
  'sent outbox state is committed without overwriting a booked notification'
);

select * from finish();

rollback;
