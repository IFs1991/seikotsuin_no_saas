-- PR-D: synthetic fixtures only。CIの使い捨てDB内で実行し、最後に全てrollbackする。
begin;
set local search_path = pg_catalog, extensions, public, auth;
select no_plan();

select has_function('app_private', 'persist_reservation_notification_outbox', array[]::text[], 'private durable handoff trigger exists');
select ok(not has_function_privilege('anon', 'app_private.persist_reservation_notification_outbox()', 'execute'), 'anon cannot execute the trigger function');
select ok(not has_function_privilege('authenticated', 'app_private.persist_reservation_notification_outbox()', 'execute'), 'authenticated cannot execute the trigger function');
select ok(has_function_privilege('service_role', 'app_private.persist_reservation_notification_outbox()', 'execute'), 'service role may execute the trigger function');
select ok(not (select prosecdef from pg_proc where oid = 'app_private.persist_reservation_notification_outbox()'::regprocedure), 'handoff is SECURITY INVOKER');
select ok(not has_table_privilege('authenticated', 'public.reservation_notifications', 'insert'), 'patient notification ledger stays internal');
select has_index('public', 'email_outbox', 'email_outbox_processing_lease_idx', 'expired processing scan has a partial index');

insert into public.clinics (id, name) values
('d6060000-0000-4000-8000-000000000001', '__pd_clinic_a__'),
('d6060000-0000-4000-8000-000000000002', '__pd_clinic_b__');
insert into public.clinic_feature_flags (clinic_id, line_notification_enabled)
values ('d6060000-0000-4000-8000-000000000001', true)
on conflict (clinic_id) do update set line_notification_enabled = true;
insert into public.clinic_line_credentials (
  clinic_id, login_channel_id, messaging_channel_id, channel_secret_encrypted,
  assertion_private_key_encrypted, assertion_kid, is_active, credential_generation_id, provider_identity_verified_at
) values (
  'd6060000-0000-4000-8000-000000000001', '__pd_login__', '__pd_messaging__', '__synthetic_encrypted_secret__',
  '__synthetic_encrypted_key__', '__pd_kid__', true, 'd6060000-0000-4000-8000-000000000051', now()
);
insert into public.customers (id, clinic_id, name, phone, line_user_id) values
('d6060000-0000-4000-8000-000000000011', 'd6060000-0000-4000-8000-000000000001', '__pd_customer_a__', '09000006061', 'U-pd-synthetic'),
('d6060000-0000-4000-8000-000000000012', 'd6060000-0000-4000-8000-000000000002', '__pd_customer_b__', '09000006062', null);
insert into public.resources (id, clinic_id, name, type, is_active, is_bookable, is_deleted) values
('d6060000-0000-4000-8000-000000000021', 'd6060000-0000-4000-8000-000000000001', '__pd_resource__', 'staff', true, true, false);
insert into public.menus (id, clinic_id, name, price, duration_minutes, is_active, is_deleted) values
('d6060000-0000-4000-8000-000000000031', 'd6060000-0000-4000-8000-000000000001', '__pd_menu__', 1000, 30, true, false);
insert into public.reservations (id, clinic_id, customer_id, staff_id, menu_id, start_time, end_time, status, channel) values
('d6060000-0000-4000-8000-000000000041', 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000011', 'd6060000-0000-4000-8000-000000000021', 'd6060000-0000-4000-8000-000000000031', '2030-01-01T01:00:00Z', '2030-01-01T01:30:00Z', 'confirmed', 'web');

create temporary table pd_intent as select jsonb_build_object('enqueue', jsonb_build_object(
  'version', 1, 'customer_id', 'd6060000-0000-4000-8000-000000000011',
  'template_type', 'reservation_created', 'to_email', 'synthetic@example.invalid',
  'payload', jsonb_build_object('customerName', '__pd_synthetic__'),
  'dedupe_key', '__pd_received_revision_1__', 'resend_idempotency_key', '__pd_key_1__'
)) as detail;
grant select on pd_intent to service_role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'received', 'email',
    jsonb_set(detail, '{enqueue,customer_id}', '"d6060000-0000-4000-8000-000000000012"') from pd_intent
$$, '23514', 'Reservation notification customer clinic mismatch', 'cross-clinic customer cannot be put into a reservation notification');
select is((select count(*) from public.reservation_notifications where reservation_id = 'd6060000-0000-4000-8000-000000000041'), 0::bigint, 'failed outbox validation rolls the claim back');
select throws_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'received', 'email',
    detail #- '{enqueue,to_email}' from pd_intent
$$, '23514', 'Incomplete reservation email intent', 'invalid durable insert fails the complete notification transaction');
select is((select count(*) from public.email_outbox where dedupe_key = '__pd_received_revision_1__'), 0::bigint, 'failed handoff has no partial outbox');

select lives_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'received', 'email', detail from pd_intent
$$, 'service role can retry and durably enqueue without a provider');
select is((select count(*) from public.email_outbox where dedupe_key = '__pd_received_revision_1__' and status = 'pending'), 1::bigint, 'one pending outbox remains even with no worker');
select is((select status from public.reservation_notifications where reservation_id = 'd6060000-0000-4000-8000-000000000041' and notification_type = 'received'), 'enqueued', 'claim and outbox are committed together');
select ok(not (select detail ? 'enqueue' from public.reservation_notifications where reservation_id = 'd6060000-0000-4000-8000-000000000041' and notification_type = 'received'), 'temporary PHI intent is removed from the ledger');

insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'received', 'email', detail from pd_intent
on conflict (reservation_id, notification_type) do nothing;
select is((select count(*) from public.email_outbox where dedupe_key = '__pd_received_revision_1__'), 1::bigint, 'duplicate handoff does not enqueue a second job');

-- 旧claimを復旧するときも、同じtemplateの別revisionを誤って再利用しない。
insert into public.email_outbox (clinic_id, reservation_id, customer_id, template_type, dedupe_key, resend_idempotency_key, to_email, payload, status)
values ('d6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'd6060000-0000-4000-8000-000000000011', 'reservation_confirmed', '__pd_old_confirmed_revision__', '__pd_old_confirmed_key__', 'synthetic@example.invalid', '{}', 'sent');
insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, status)
values ('d6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'confirmed', 'email', 'failed');
update public.reservation_notifications set status = 'claimed',
  detail = (select jsonb_set(jsonb_set(jsonb_set(detail, '{enqueue,dedupe_key}', '"__pd_revision_2__"'), '{enqueue,resend_idempotency_key}', '"__pd_key_2__"'), '{enqueue,template_type}', '"reservation_confirmed"') from pd_intent)
where reservation_id = 'd6060000-0000-4000-8000-000000000041' and notification_type = 'confirmed'
  and clinic_id = 'd6060000-0000-4000-8000-000000000001' and status in ('claimed', 'failed');
select is((select count(*) from public.email_outbox where dedupe_key = '__pd_revision_2__'), 1::bigint, 'different revision creates its own outbox');
select is((select email_outbox_id from public.reservation_notifications where reservation_id = 'd6060000-0000-4000-8000-000000000041' and notification_type = 'confirmed'), (select id from public.email_outbox where dedupe_key = '__pd_revision_2__'), 'repaired claim points at its own revision');

-- LINEも既存generation検証triggerを通し、同じtransactionで1件だけ保存する。
reset role;
create temporary table pd_line_intent as select jsonb_build_object('enqueue', jsonb_build_object(
  'version', 1, 'customer_id', 'd6060000-0000-4000-8000-000000000011',
  'line_user_id', 'U-pd-synthetic', 'dedupe_timestamp', '2030-01-01T00:00:00Z',
  'payload', jsonb_build_object('text', '__pd_synthetic_line__')
)) as detail;
grant select on pd_line_intent to service_role;
set local role service_role;
select lives_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'reminder_day_before', 'line', detail from pd_line_intent
$$, 'LINE handoff passes the existing current-generation trigger');
select is((select count(*) from public.line_message_outbox where clinic_id = 'd6060000-0000-4000-8000-000000000001' and message_type = 'reminder_day_before' and credential_generation_id = 'd6060000-0000-4000-8000-000000000051' and status = 'pending'), 1::bigint, 'LINE outbox remains pending with the verified generation');
select is((select payload #>> '{reservation,updatedAt}' from public.line_message_outbox where clinic_id = 'd6060000-0000-4000-8000-000000000001' and message_type = 'reminder_day_before'), '2030-01-01T00:00:00Z', 'LINE outbox retains the exact reservation revision');
insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'reminder_day_before', 'line', detail from pd_line_intent
on conflict (reservation_id, notification_type) do nothing;
select is((select count(*) from public.line_message_outbox where clinic_id = 'd6060000-0000-4000-8000-000000000001' and message_type = 'reminder_day_before'), 1::bigint, 'LINE duplicate handoff does not duplicate a delivery');
select throws_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'reminder_same_day', 'line', jsonb_set(detail, '{enqueue,line_user_id}', '"U-wrong-patient"') from pd_line_intent
$$, '23503', 'LINE_NOTIFICATION_PATIENT_GENERATION_MISMATCH', 'mismatched LINE patient identity rolls the notification claim back');
select is((select count(*) from public.reservation_notifications where reservation_id = 'd6060000-0000-4000-8000-000000000041' and notification_type = 'reminder_same_day'), 0::bigint, 'failed LINE handoff leaves no poisoned claim');

insert into public.line_message_outbox (clinic_id, customer_id, line_user_id, message_type, payload, status)
values ('d6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000011', 'U-pd-synthetic', 'cancelled',
  '{"text":"__pd_legacy__","reservation":{"reservationId":"d6060000-0000-4000-8000-000000000041","notificationType":"cancelled"}}', 'pending');
select throws_ok($$
  insert into public.reservation_notifications (clinic_id, reservation_id, notification_type, channel, detail)
  select 'd6060000-0000-4000-8000-000000000001', 'd6060000-0000-4000-8000-000000000041', 'cancelled', 'line', detail from pd_line_intent
$$, '23514', 'Legacy LINE notification delivery requires review', 'ambiguous revisionless legacy LINE is not replayed automatically');
select is((select count(*) from public.line_message_outbox where clinic_id = 'd6060000-0000-4000-8000-000000000001' and message_type = 'cancelled'), 1::bigint, 'legacy review does not produce a second LINE outbox');

-- 同一transaction内で二度claimしてもrevisionは異なる。古いworkerの完了は0行になる。
reset role;
create temporary table pd_old_claim (id uuid, updated_at timestamptz);
with claimed as (
  update public.email_outbox set status = 'processing', attempts = attempts + 1
  where dedupe_key = '__pd_received_revision_1__' and status = 'pending'
  returning id, updated_at
) insert into pd_old_claim select * from claimed;
select is((select attempts from public.email_outbox where dedupe_key = '__pd_received_revision_1__'), 1, 'attempt budget is consumed at claim time');
update public.email_outbox set status = 'pending', last_error = 'synthetic lease recovery'
where id = (select id from pd_old_claim) and status = 'processing' and updated_at = (select updated_at from pd_old_claim);
update public.email_outbox set status = 'processing', attempts = attempts + 1
where id = (select id from pd_old_claim) and status = 'pending';
select ok((select outbox.updated_at > old_claim.updated_at from public.email_outbox outbox join pd_old_claim old_claim using (id)), 'reclaim creates a strictly newer token');
create temporary table pd_stale_result (id uuid);
with stale as (
  update public.email_outbox set status = 'sent', provider_message_id = '__old_worker__'
  where id = (select id from pd_old_claim) and status = 'processing' and updated_at = (select updated_at from pd_old_claim)
  returning id
) insert into pd_stale_result select id from stale;
select is((select count(*) from pd_stale_result), 0::bigint, 'old worker cannot finalize a newer lease');
select is((select status from public.email_outbox where id = (select id from pd_old_claim)), 'processing', 'new owner retains its job');
select is((select attempts from public.email_outbox where id = (select id from pd_old_claim)), 2, 'new claim keeps bounded attempt accounting');

select * from finish();
rollback;
