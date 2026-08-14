begin;
select plan(94);

select has_function(
  'public', 'process_line_webhook_delivery', array['uuid', 'uuid', 'jsonb'],
  'webhook delivery RPC exists'
);
select has_function(
  'public', 'enqueue_line_chat_message', array['uuid', 'uuid', 'text', 'uuid'],
  'chat enqueue RPC keeps its public signature'
);
select has_function(
  'public', 'finalize_line_chat_outbox',
  array['uuid', 'uuid', 'uuid', 'boolean', 'text', 'text'],
  'chat finalize RPC keeps its public signature'
);
select has_function(
  'public', 'run_line_chat_cleanup_if_due', array[]::text[],
  'daily cleanup coordinator RPC exists'
);
select has_function(
  'public', 'list_line_chat_delivery_clinics', array['integer'],
  'fair queued-clinic discovery RPC exists'
);
select has_function(
  'public', 'renew_line_chat_outbox_claim', array['uuid', 'uuid', 'uuid'],
  'chat claim renew and revalidation RPC exists'
);
select has_function(
  'public', 'list_authorized_line_chat_messages', array['uuid', 'uuid', 'uuid'],
  'atomic authorized message reader exists'
);
select has_function(
  'public', 'assign_line_chat_conversation',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'atomic privileged assignment RPC exists'
);
select has_column(
  'public', 'line_webhook_events', 'unsend_message_id',
  'webhook metadata stores a content-free unsend tombstone target'
);
select col_has_check(
  'public', 'line_webhook_events', 'unsend_message_id',
  'unsend tombstone targets reject blank identifiers'
);
select has_table(
  'public', 'line_unsend_tombstones',
  'durable content-free unsend tombstone table exists'
);
select has_index(
  'public'::name, 'line_unsend_tombstones'::name,
  'line_unsend_tombstones_pkey'::name
);
select col_has_check(
  'public', 'line_unsend_tombstones', 'line_message_digest',
  'unsend tombstone digests have a fixed SHA-256 length'
);
select ok(
  exists (
    select 1
    from pg_class table_data
    where table_data.oid = 'public.line_unsend_tombstones'::regclass
      and table_data.relrowsecurity
      and pg_get_userbyid(table_data.relowner) = 'postgres'
  ),
  'unsend tombstones are postgres-owned with RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.line_unsend_tombstones'::regclass
      and constraint_data.contype = 'f'
      and constraint_data.confrelid = 'public.clinic_line_credential_generations'::regclass
  ),
  'unsend tombstones are bound to the clinic provider generation'
);
select ok(
  (
    select coalesce(
      array_agg(
        distinct (
          case when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text end
          || ':' || acl_entry.privilege_type
        ) collate "C"
        order by (
          case when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text end
          || ':' || acl_entry.privilege_type
        ) collate "C"
      ),
      array[]::text[]
    )
    from pg_class table_data
    cross join lateral aclexplode(
      coalesce(table_data.relacl, acldefault('r', table_data.relowner))
    ) acl_entry
    where table_data.oid = 'public.line_unsend_tombstones'::regclass
      and acl_entry.grantee <> table_data.relowner
  ) = array[
    'service_role:DELETE', 'service_role:INSERT',
    'service_role:SELECT', 'service_role:UPDATE'
  ]::text[]
  and not exists (
    select 1
    from pg_class table_data
    cross join lateral aclexplode(
      coalesce(table_data.relacl, acldefault('r', table_data.relowner))
    ) acl_entry
    where table_data.oid = 'public.line_unsend_tombstones'::regclass
      and acl_entry.grantee <> table_data.relowner
      and acl_entry.is_grantable
  ),
  'only service_role has non-grantable direct tombstone table privileges'
);

select function_privs_are(
  'public', 'process_line_webhook_delivery', array['uuid', 'uuid', 'jsonb'],
  'service_role', array['EXECUTE'], 'service role can process signed webhooks'
);
select function_privs_are(
  'public', 'process_line_webhook_delivery', array['uuid', 'uuid', 'jsonb'],
  'anon', array[]::text[], 'anon cannot process webhook deliveries'
);
select function_privs_are(
  'public', 'process_line_webhook_delivery', array['uuid', 'uuid', 'jsonb'],
  'authenticated', array[]::text[], 'authenticated cannot process webhook deliveries'
);
select function_privs_are(
  'public', 'run_line_chat_cleanup_if_due', array[]::text[],
  'service_role', array['EXECUTE'], 'service role can run retention cleanup'
);
select function_privs_are(
  'public', 'run_line_chat_cleanup_if_due', array[]::text[],
  'anon', array[]::text[], 'anon cannot run retention cleanup'
);
select function_privs_are(
  'public', 'run_line_chat_cleanup_if_due', array[]::text[],
  'authenticated', array[]::text[], 'authenticated cannot run retention cleanup'
);
select function_privs_are(
  'public', 'list_line_chat_delivery_clinics', array['integer'],
  'service_role', array['EXECUTE'], 'service role can discover due clinic queues'
);
select function_privs_are(
  'public', 'list_line_chat_delivery_clinics', array['integer'],
  'anon', array[]::text[], 'anon cannot discover clinic delivery queues'
);
select function_privs_are(
  'public', 'renew_line_chat_outbox_claim', array['uuid', 'uuid', 'uuid'],
  'service_role', array['EXECUTE'], 'service role can renew chat claims'
);
select function_privs_are(
  'public', 'renew_line_chat_outbox_claim', array['uuid', 'uuid', 'uuid'],
  'authenticated', array[]::text[], 'authenticated cannot renew chat claims'
);
select function_privs_are(
  'public', 'list_authorized_line_chat_messages', array['uuid', 'uuid', 'uuid'],
  'service_role', array['EXECUTE'], 'service role can call the authorized reader'
);
select function_privs_are(
  'public', 'list_authorized_line_chat_messages', array['uuid', 'uuid', 'uuid'],
  'anon', array[]::text[], 'anon cannot read chat bodies through the RPC'
);
select function_privs_are(
  'public', 'assign_line_chat_conversation',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'service_role', array['EXECUTE'], 'service role can call atomic assignment'
);
select function_privs_are(
  'public', 'assign_line_chat_conversation',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'authenticated', array[]::text[], 'authenticated cannot assign through the RPC'
);

select ok(
  not exists (
    select 1
    from pg_proc function_data
    where function_data.oid = any (array[
      'public.process_line_webhook_delivery(uuid,uuid,jsonb)'::regprocedure::oid,
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure::oid,
      'public.list_authorized_line_chat_messages(uuid,uuid,uuid)'::regprocedure::oid,
      'public.assign_line_chat_conversation(uuid,uuid,uuid,uuid)'::regprocedure::oid,
      'public.claim_line_chat_outbox(uuid,integer)'::regprocedure::oid,
      'public.renew_line_chat_outbox_claim(uuid,uuid,uuid)'::regprocedure::oid,
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure::oid,
      'public.purge_expired_line_chat_data(uuid)'::regprocedure::oid,
      'public.run_line_chat_cleanup_if_due()'::regprocedure::oid,
      'public.list_line_chat_delivery_clinics(integer)'::regprocedure::oid
    ])
      and (
        function_data.prosecdef
        or pg_get_userbyid(function_data.proowner) <> 'postgres'
        or not coalesce(function_data.proconfig, array[]::text[])
          @> array['search_path=pg_catalog, public']::text[]
      )
  ),
  'runtime functions are invoker, postgres-owned, and use a fixed search path'
);

insert into public.clinics (id, name, parent_id)
values
  ('a8140000-0000-4000-8000-000000000002', '__line_chat_runtime_parent__', null),
  (
    'a8140000-0000-4000-8000-000000000001',
    '__line_chat_runtime_a__',
    'a8140000-0000-4000-8000-000000000002'
  ),
  ('a8140000-0000-4000-8000-000000000003', '__line_chat_runtime_unrelated__', null);

insert into public.clinic_feature_flags (clinic_id, line_chat_enabled)
values
  ('a8140000-0000-4000-8000-000000000001', false),
  ('a8140000-0000-4000-8000-000000000002', true)
on conflict (clinic_id) do update
set line_chat_enabled = excluded.line_chat_enabled;

insert into public.clinic_line_credentials (
  clinic_id, login_channel_id, messaging_channel_id,
  channel_secret_encrypted, assertion_private_key_encrypted, assertion_kid,
  is_active, credential_generation_id, bot_user_id
)
values
  (
    'a8140000-0000-4000-8000-000000000001', 'login-a', 'messaging-a',
    'encrypted-secret-a', 'encrypted-key-a', 'kid-a', true,
    'a8140000-0000-4000-8000-000000000070', 'U-bot-a'
  ),
  (
    'a8140000-0000-4000-8000-000000000002', 'login-b', 'messaging-b',
    'encrypted-secret-b', 'encrypted-key-b', 'kid-b', true,
    'a8140000-0000-4000-8000-000000000071', 'U-bot-b'
  );

insert into public.clinic_line_chat_settings (
  clinic_id, auto_reply_enabled, auto_reply_message, retention_days
) values (
  'a8140000-0000-4000-8000-000000000001', true,
  '受付しました。担当者から返信します。', 1
);

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, aud, role
) values
(
  'a8140000-0000-4000-8000-000000000010',
  'line-chat-runtime@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), 'authenticated', 'authenticated'
),
(
  'a8140000-0000-4000-8000-000000000011',
  'line-chat-other@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), 'authenticated', 'authenticated'
);

insert into public.staff_profiles (id, user_id, display_name, is_active)
values
(
  'a8140000-0000-4000-8000-000000000080',
  'a8140000-0000-4000-8000-000000000010',
  '__line_chat_staff__', true
),
(
  'a8140000-0000-4000-8000-000000000082',
  'a8140000-0000-4000-8000-000000000011',
  '__line_chat_other_staff__', true
);
insert into public.staff_clinic_memberships (
  id, staff_profile_id, clinic_id, membership_type
) values
(
  'a8140000-0000-4000-8000-000000000081',
  'a8140000-0000-4000-8000-000000000080',
  'a8140000-0000-4000-8000-000000000001', 'home'
),
(
  'a8140000-0000-4000-8000-000000000083',
  'a8140000-0000-4000-8000-000000000082',
  'a8140000-0000-4000-8000-000000000001', 'regular'
);

insert into public.staff (
  id, clinic_id, name, role, email, password_hash
) values
(
  'a8140000-0000-4000-8000-000000000010',
  'a8140000-0000-4000-8000-000000000001',
  '__line_chat_staff__', 'staff', 'line-chat-runtime@example.invalid',
  'managed_by_supabase'
),
(
  'a8140000-0000-4000-8000-000000000011',
  'a8140000-0000-4000-8000-000000000001',
  '__line_chat_other_staff__', 'staff', 'line-chat-other@example.invalid',
  'managed_by_supabase'
);

insert into public.user_permissions (
  staff_id, username, hashed_password, role, clinic_id
) values
(
  'a8140000-0000-4000-8000-000000000010',
  'line-chat-runtime@example.invalid', 'managed_by_supabase', 'staff',
  'a8140000-0000-4000-8000-000000000001'
),
(
  'a8140000-0000-4000-8000-000000000011',
  'line-chat-other@example.invalid', 'managed_by_supabase', 'staff',
  'a8140000-0000-4000-8000-000000000001'
);

create temporary table webhook_results (result jsonb) on commit drop;
insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-disabled","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-disabled","messageType":"text","textContent":"disabled","occurredAt":"2026-08-14T00:00:00Z","payloadDigest":"digest-disabled","isRedelivery":false}]'::jsonb
);

select is(
  (select (result->>'ignored')::integer from webhook_results order by ctid desc limit 1),
  1, 'disabled chat records the delivery as ignored'
);
select is(
  (select count(*) from public.line_contacts where clinic_id = 'a8140000-0000-4000-8000-000000000001'),
  0::bigint, 'disabled chat does not persist a contact identity'
);
select ok(
  (select webhook_verified_at is not null and last_webhook_received_at is not null
   from public.clinic_line_credentials
   where clinic_id = 'a8140000-0000-4000-8000-000000000001'),
  'a valid signed delivery records webhook verification independently of chat enablement'
);

update public.clinic_feature_flags
set line_chat_enabled = true
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-1","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-1","messageType":"text","textContent":"予約について質問です","occurredAt":"2026-08-14T01:00:00Z","payloadDigest":"digest-1","isRedelivery":false}]'::jsonb
);

select is(
  (select (result->>'processed')::integer from webhook_results order by ctid desc limit 1),
  1, 'enabled chat processes an inbound event'
);
select is(
  (select count(*) from public.line_contacts where clinic_id = 'a8140000-0000-4000-8000-000000000001' and line_user_id = 'U-chat-user'),
  1::bigint, 'inbound webhook creates one provider-bound contact'
);
select is(
  (select unread_count from public.line_conversations where clinic_id = 'a8140000-0000-4000-8000-000000000001'),
  1, 'inbound webhook increments unread count once'
);
select is(
  (select text_content from public.line_messages where line_message_id = 'm-1'),
  '予約について質問です', 'text webhook stores the text body'
);
select is(
  (select count(*) from public.line_messages where direction = 'outbound' and sent_by is null),
  1::bigint, 'first inbound message queues one fixed auto reply'
);
select is(
  (select count(*) from public.line_chat_outbox where clinic_id = 'a8140000-0000-4000-8000-000000000001'),
  1::bigint, 'auto reply and its outbox row are created atomically'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-1","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-1","messageType":"text","textContent":"予約について質問です","occurredAt":"2026-08-14T01:00:00Z","payloadDigest":"digest-1","isRedelivery":true}]'::jsonb
);
select is(
  (select (result->>'duplicates')::integer from webhook_results order by ctid desc limit 1),
  1, 'redelivery is deduplicated by webhook event ID'
);
select ok(
  (select unread_count = 1 from public.line_conversations where clinic_id = 'a8140000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.line_messages where line_message_id = 'm-1'),
  'redelivery creates neither a second body nor a second unread increment'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-2","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-2","messageType":"text","textContent":"二通目です","occurredAt":"2026-08-14T01:05:00Z","payloadDigest":"digest-2","isRedelivery":false}]'::jsonb
);
select is(
  (select (result->>'processed')::integer from webhook_results order by ctid desc limit 1),
  1, 'a second distinct inbound message is processed'
);
select is(
  (select count(*) from public.line_messages where direction = 'outbound' and sent_by is null),
  1::bigint, 'auto reply is limited to once per conversation in 24 hours'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-image","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-image","messageType":"image","textContent":null,"occurredAt":"2026-08-14T01:06:00Z","payloadDigest":"digest-image","isRedelivery":false}]'::jsonb
);
select ok(
  (select message_type = 'unsupported' and text_content is null
   from public.line_messages where line_message_id = 'm-image'),
  'non-text events retain only unsupported metadata without content'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-group","eventType":"message","sourceType":"group","lineUserId":"U-group-member","lineMessageId":"m-group","messageType":"text","textContent":"group body","occurredAt":"2026-08-14T01:06:30Z","payloadDigest":"digest-group","isRedelivery":false}]'::jsonb
);
select ok(
  (select status = 'ignored' and error_code = 'source_not_supported'
   from public.line_webhook_events where webhook_event_id = 'evt-group')
  and not exists (
    select 1 from public.line_contacts
    where clinic_id = 'a8140000-0000-4000-8000-000000000001'
      and line_user_id = 'U-group-member'
  )
  and not exists (
    select 1 from public.line_messages where line_message_id = 'm-group'
  ),
  'group and room identities are ignored without contact, body, or outbox persistence'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-unsend","eventType":"unsend","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":null,"messageType":null,"textContent":null,"unsendMessageId":"m-1","occurredAt":"2026-08-14T01:07:00Z","payloadDigest":"digest-unsend","isRedelivery":false}]'::jsonb
);
select ok(
  (select status = 'unsent' and text_content is null and unsent_at is not null
   from public.line_messages where line_message_id = 'm-1'),
  'unsend clears the stored body and marks it unsent'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-before-disable","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-off-unsend","messageType":"text","textContent":"OFF中にも削除される本文","occurredAt":"2026-08-14T01:07:10Z","payloadDigest":"digest-before-disable","isRedelivery":false}]'::jsonb
);
update public.clinic_feature_flags
set line_chat_enabled = false
where clinic_id = 'a8140000-0000-4000-8000-000000000001';
insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-unsend-disabled","eventType":"unsend","sourceType":"user","lineUserId":"U-chat-user","unsendMessageId":"m-off-unsend","occurredAt":"2026-08-14T01:07:20Z","payloadDigest":"digest-unsend-disabled","isRedelivery":false}]'::jsonb
);
insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-follow-disabled","eventType":"follow","sourceType":"user","lineUserId":"U-off-lifecycle","occurredAt":"2026-08-14T01:07:30Z","payloadDigest":"digest-follow-disabled","isRedelivery":false},{"webhookEventId":"evt-unfollow-disabled","eventType":"unfollow","sourceType":"user","lineUserId":"U-off-lifecycle","occurredAt":"2026-08-14T01:07:40Z","payloadDigest":"digest-unfollow-disabled","isRedelivery":false}]'::jsonb
);
select ok(
  (select status = 'unsent' and text_content is null
   from public.line_messages where line_message_id = 'm-off-unsend'),
  'chat OFF still applies an authenticated unsend erasure request'
);
select ok(
  (select blocked_at = '2026-08-14T01:07:40Z'::timestamptz
      and unfollowed_at = '2026-08-14T01:07:40Z'::timestamptz
   from public.line_contacts
   where clinic_id = 'a8140000-0000-4000-8000-000000000001'
     and line_user_id = 'U-off-lifecycle'),
  'chat OFF still applies follow and unfollow lifecycle state'
);
update public.clinic_feature_flags
set line_chat_enabled = true
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-unsend-first","eventType":"unsend","sourceType":"user","lineUserId":"U-chat-user","unsendMessageId":"m-unsend-first","occurredAt":"2026-08-14T01:08:00Z","payloadDigest":"digest-unsend-first","isRedelivery":true}]'::jsonb
);
insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-message-after-unsend","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-unsend-first","messageType":"text","textContent":"保存してはいけない本文","occurredAt":"2026-08-14T01:07:00Z","payloadDigest":"digest-message-after-unsend","isRedelivery":true}]'::jsonb
);
select ok(
  (select status = 'unsent' and text_content is null and unsent_at is not null
   from public.line_messages where line_message_id = 'm-unsend-first')
  and (select unsend_message_id = 'm-unsend-first'
       from public.line_webhook_events where webhook_event_id = 'evt-unsend-first'),
  'an out-of-order unsend tombstone prevents a later redelivery from restoring text'
);
select is(
  (select unread_count from public.line_conversations
   where clinic_id = 'a8140000-0000-4000-8000-000000000001'
     and contact_id = (
       select id from public.line_contacts
       where clinic_id = 'a8140000-0000-4000-8000-000000000001'
         and line_user_id = 'U-chat-user'
     )),
  4,
  'withdrawn out-of-order content does not increment the unread count'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-follow-blocked","eventType":"follow","sourceType":"user","lineUserId":"U-blocked","occurredAt":"2026-08-14T02:00:00Z","payloadDigest":"digest-follow-blocked","isRedelivery":false},{"webhookEventId":"evt-message-blocked","eventType":"message","sourceType":"user","lineUserId":"U-blocked","lineMessageId":"m-blocked","messageType":"text","textContent":"一時的な本文","occurredAt":"2026-08-14T02:01:00Z","payloadDigest":"digest-message-blocked","isRedelivery":false},{"webhookEventId":"evt-unfollow-blocked","eventType":"unfollow","sourceType":"user","lineUserId":"U-blocked","occurredAt":"2026-08-14T02:02:00Z","payloadDigest":"digest-unfollow-blocked","isRedelivery":false}]'::jsonb
);
select ok(
  (select blocked_at is not null and unfollowed_at is not null
   from public.line_contacts
   where clinic_id = 'a8140000-0000-4000-8000-000000000001'
     and line_user_id = 'U-blocked')
  and not exists (
    select 1
    from public.line_chat_outbox outbox
    join public.line_conversations conversation on conversation.id = outbox.conversation_id
    join public.line_contacts contact on contact.id = conversation.contact_id
    where contact.line_user_id = 'U-blocked'
      and outbox.status in ('pending', 'processing')
  ),
  'effective unfollow closes the contact and terminalizes its pending delivery'
);

insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-stale-follow","eventType":"follow","sourceType":"user","lineUserId":"U-blocked","occurredAt":"2026-08-14T02:00:30Z","payloadDigest":"digest-stale-follow","isRedelivery":true}]'::jsonb
);
select ok(
  (select blocked_at = '2026-08-14T02:02:00Z'::timestamptz
      and unfollowed_at = '2026-08-14T02:02:00Z'::timestamptz
   from public.line_contacts
   where clinic_id = 'a8140000-0000-4000-8000-000000000001'
     and line_user_id = 'U-blocked'),
  'a stale reordered follow event cannot reverse a newer unfollow state'
);

select throws_ok(
  $$select public.process_line_webhook_delivery(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000071', '[]'::jsonb
  )$$,
  '23503', 'LINE_WEBHOOK_CREDENTIAL_GENERATION_INVALID',
  'another clinic provider generation cannot process this clinic webhook'
);
select is(
  (select count(*) from public.line_webhook_events where clinic_id = 'a8140000-0000-4000-8000-000000000002'),
  0::bigint, 'cross-clinic generation rejection leaves no webhook rows'
);

update public.line_conversations conversation
set assigned_membership_id = 'a8140000-0000-4000-8000-000000000081'
where conversation.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  and conversation.contact_id = (
    select contact.id
    from public.line_contacts contact
    where contact.clinic_id = 'a8140000-0000-4000-8000-000000000001'
      and contact.line_user_id = 'U-chat-user'
  );

select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    '別担当からの返信', 'a8140000-0000-4000-8000-000000000011'
  )$$,
  'P0001', 'LINE_CHAT_CONVERSATION_NOT_SENDABLE',
  'an active but unassigned staff member cannot enqueue a reply'
);
select throws_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000011'
  )$$,
  '42501', 'LINE_CHAT_CONVERSATION_ACCESS_DENIED',
  'an unassigned staff member cannot read message bodies'
);
select lives_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'the current assignee can read message bodies atomically'
);

select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    '   ', 'a8140000-0000-4000-8000-000000000010'
  )$$,
  '22023', 'LINE_CHAT_TEXT_INVALID', 'blank staff replies are rejected'
);

select lives_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    '店舗からの返信です', 'a8140000-0000-4000-8000-000000000010'
  )$$,
  'an active clinic staff member can atomically enqueue a reply'
);
select is(
  (select count(*)
   from public.line_chat_outbox outbox
   join public.line_conversations conversation on conversation.id = outbox.conversation_id
   join public.line_contacts contact on contact.id = conversation.contact_id
   where outbox.clinic_id = 'a8140000-0000-4000-8000-000000000001'
     and contact.line_user_id = 'U-chat-user'
     and outbox.status = 'pending'),
  2::bigint, 'manual reply adds exactly one additional outbox row'
);

update public.user_permissions
set role = 'manager'
where staff_id = 'a8140000-0000-4000-8000-000000000010';
select throws_ok(
  $$select public.assign_line_chat_conversation(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010',
    'a8140000-0000-4000-8000-000000000083'
  )$$,
  '42501', 'LINE_CHAT_ASSIGNMENT_ACCESS_DENIED',
  'a manager role without an active clinic assignment is not privileged'
);
select throws_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_ACTOR_NOT_IN_CLINIC',
  'an unassigned manager cannot fall back to its staff membership for reading'
);
select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'unassigned manager fallback reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_SENDER_NOT_IN_CLINIC',
  'an unassigned manager cannot fall back to its staff membership for replying'
);
insert into public.manager_clinic_assignments (
  id, manager_user_id, clinic_id, assigned_by
) values (
  'a8140000-0000-4000-8000-000000000090',
  'a8140000-0000-4000-8000-000000000010',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010'
);
update public.staff_clinic_memberships
set membership_type = 'blocked'
where id = 'a8140000-0000-4000-8000-000000000081';
select lives_ok(
  $$select public.assign_line_chat_conversation(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010',
    'a8140000-0000-4000-8000-000000000083'
  )$$,
  'an assigned manager remains privileged without a staff membership'
);
select lives_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'an assigned manager can read atomically without a staff membership'
);
select lives_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'manager clinic assignment reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'an assigned manager can enqueue atomically without a staff membership'
);
update public.staff_clinic_memberships
set membership_type = 'home'
where id = 'a8140000-0000-4000-8000-000000000081';
select lives_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000011'
  )$$,
  'the new assignee can read after the atomic reassignment commits'
);
update public.manager_clinic_assignments
set
  revoked_at = statement_timestamp(),
  revoked_by = 'a8140000-0000-4000-8000-000000000010',
  revoke_reason = 'pgTAP authority revocation'
where id = 'a8140000-0000-4000-8000-000000000090';
update public.line_conversations conversation
set assigned_membership_id = 'a8140000-0000-4000-8000-000000000081'
where conversation.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  and conversation.contact_id = (
    select contact.id
    from public.line_contacts contact
    where contact.clinic_id = conversation.clinic_id
      and contact.line_user_id = 'U-chat-user'
  );
select throws_ok(
  $$select public.assign_line_chat_conversation(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010',
    'a8140000-0000-4000-8000-000000000081'
  )$$,
  '42501', 'LINE_CHAT_ASSIGNMENT_ACCESS_DENIED',
  'a revoked manager assignment is rejected inside the atomic RPC'
);
select throws_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_ACTOR_NOT_IN_CLINIC',
  'a revoked manager cannot read through its remaining assigned membership'
);
select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'revoked manager reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_SENDER_NOT_IN_CLINIC',
  'a revoked manager cannot reply through its remaining assigned membership'
);
update public.user_permissions
set role = 'clinic_admin', clinic_id = 'a8140000-0000-4000-8000-000000000003'
where staff_id = 'a8140000-0000-4000-8000-000000000010';
select throws_ok(
  $$select public.assign_line_chat_conversation(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010',
    'a8140000-0000-4000-8000-000000000081'
  )$$,
  '42501', 'LINE_CHAT_ASSIGNMENT_ACCESS_DENIED',
  'a clinic admin from an unrelated clinic hierarchy is rejected'
);
select throws_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_ACTOR_NOT_IN_CLINIC',
  'an unrelated clinic admin cannot read through its staff membership'
);
select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'unrelated clinic admin fallback reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_SENDER_NOT_IN_CLINIC',
  'an unrelated clinic admin cannot reply through its staff membership'
);
update public.user_permissions
set clinic_id = 'a8140000-0000-4000-8000-000000000001'
where staff_id = 'a8140000-0000-4000-8000-000000000010';
select lives_ok(
  $$select public.assign_line_chat_conversation(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010',
    'a8140000-0000-4000-8000-000000000081'
  )$$,
  'a clinic admin can reassign only within the canonical clinic hierarchy'
);
select lives_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'a clinic admin can read within the canonical clinic hierarchy'
);
select lives_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'canonical clinic admin reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'a clinic admin can reply within the canonical clinic hierarchy'
);
update public.user_permissions
set role = 'admin'
where staff_id = 'a8140000-0000-4000-8000-000000000010';
select throws_ok(
  $$select * from public.list_authorized_line_chat_messages(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_ACTOR_NOT_IN_CLINIC',
  'an HQ admin cannot read patient chat through a residual staff membership'
);
select throws_ok(
  $$select public.enqueue_line_chat_message(
    'a8140000-0000-4000-8000-000000000001',
    (select conversation.id
     from public.line_conversations conversation
     join public.line_contacts contact on contact.id = conversation.contact_id
     where contact.line_user_id = 'U-chat-user'),
    'HQ admin fallback reply',
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  '42501', 'LINE_CHAT_SENDER_NOT_IN_CLINIC',
  'an HQ admin cannot reply through a residual staff membership'
);
update public.user_permissions
set role = 'staff'
where staff_id = 'a8140000-0000-4000-8000-000000000010';
select is(
  (select clinic_id from public.list_line_chat_delivery_clinics(100) limit 1),
  'a8140000-0000-4000-8000-000000000001'::uuid,
  'queued-clinic discovery returns the due tenant without queue-volume starvation'
);
select throws_ok(
  $$select * from public.list_line_chat_delivery_clinics(null)$$,
  '22023', 'LINE_CHAT_CLINIC_LIMIT_INVALID',
  'queued-clinic discovery rejects an unbounded null limit'
);

create temporary table claimed_chat as
select * from public.claim_line_chat_outbox(
  'a8140000-0000-4000-8000-000000000001', 1
);
select ok(
  (select count(*) = 1 and min(line_user_id) = 'U-chat-user' and min(length(text_content)) > 0
   from claimed_chat),
  'claim derives one recipient and body through the tenant-bound relation chain'
);
create temporary table renewed_chat as
select * from public.renew_line_chat_outbox_claim(
  'a8140000-0000-4000-8000-000000000001',
  (select outbox_id from claimed_chat),
  (select claim_token from claimed_chat)
);
select ok(
  (select count(*) = 1
      and bool_and(credential_generation_id = 'a8140000-0000-4000-8000-000000000070'::uuid)
      and min(line_user_id) = 'U-chat-user'
      and min(length(text_content)) > 0
   from renewed_chat),
  'claim renewal revalidates feature, provider generation, recipient, and body'
);
select throws_ok(
  $$select public.finalize_line_chat_outbox(
    'a8140000-0000-4000-8000-000000000001',
    (select outbox_id from claimed_chat), gen_random_uuid(), true,
    'line-message-wrong-claim', null
  )$$,
  'P0001', 'LINE_CHAT_OUTBOX_CLAIM_INVALID',
  'finalize rejects a mismatched delivery claim token'
);
select lives_ok(
  $$select public.finalize_line_chat_outbox(
    'a8140000-0000-4000-8000-000000000001',
    (select outbox_id from claimed_chat), (select claim_token from claimed_chat), true,
    'line-message-sent', null
  )$$,
  'matching claim finalizes message, outbox, and conversation atomically'
);
select ok(
  (select status = 'sent' and sent_at is not null
   from public.line_chat_outbox where id = (select outbox_id from claimed_chat))
  and (select last_outbound_at is not null
       from public.line_conversations
       where id = (
         select conversation_id
         from public.line_chat_outbox
         where id = (select outbox_id from claimed_chat)
       )),
  'successful finalize records the delivery and conversation outbound time'
);

create temporary table disabled_claim as
select * from public.claim_line_chat_outbox(
  'a8140000-0000-4000-8000-000000000001', 1
);
update public.clinic_feature_flags
set line_chat_enabled = false
where clinic_id = 'a8140000-0000-4000-8000-000000000001';
create temporary table disabled_renewal as
select * from public.renew_line_chat_outbox_claim(
  'a8140000-0000-4000-8000-000000000001',
  (select outbox_id from disabled_claim),
  (select claim_token from disabled_claim)
);
select ok(
  (select count(*) = 0 from disabled_renewal)
  and (select status = 'failed' and claim_token is null
       from public.line_chat_outbox where id = (select outbox_id from disabled_claim)),
  'renewal fail-closes a claimed delivery when chat is disabled before push'
);
update public.clinic_feature_flags
set line_chat_enabled = true
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

create temporary table retention_message as
select public.enqueue_line_chat_message(
  'a8140000-0000-4000-8000-000000000001',
  (select conversation.id
   from public.line_conversations conversation
   join public.line_contacts contact on contact.id = conversation.contact_id
   where contact.line_user_id = 'U-chat-user'),
  '保持期間境界の送信中メッセージ',
  'a8140000-0000-4000-8000-000000000010'
) as message_id;
update public.line_chat_outbox
set created_at = statement_timestamp() - interval '100 years'
where message_id = (select message_id from retention_message);
create temporary table retention_claim as
select * from public.claim_line_chat_outbox(
  'a8140000-0000-4000-8000-000000000001', 1
);
update public.line_messages message
set created_at = statement_timestamp() - interval '2 days'
from public.line_chat_outbox outbox
where outbox.id = (select outbox_id from retention_claim)
  and message.id = outbox.message_id;

update public.line_messages
set created_at = statement_timestamp() - interval '2 days'
where clinic_id = 'a8140000-0000-4000-8000-000000000001'
  and line_message_id in ('m-1', 'm-unsend-first');
update public.line_webhook_events
set created_at = statement_timestamp() - interval '2 days'
where clinic_id = 'a8140000-0000-4000-8000-000000000001'
  and webhook_event_id in (
    'evt-1', 'evt-unsend', 'evt-unsend-first', 'evt-message-after-unsend'
  );

create temporary table cleanup_first as
select * from public.run_line_chat_cleanup_if_due();
select ok(
  (select not skipped and deleted_messages >= 1 and deleted_webhook_events >= 1
   from cleanup_first),
  'daily coordinator applies tenant retention to messages and unreferenced webhook metadata'
);
select is(
  (select count(*) from public.line_messages where clinic_id = 'a8140000-0000-4000-8000-000000000001' and line_message_id = 'm-1'),
  0::bigint, 'retention cleanup removes the expired message body'
);
select is(
  (
    select count(*)
    from public.line_unsend_tombstones tombstone
    where tombstone.clinic_id = 'a8140000-0000-4000-8000-000000000001'
      and tombstone.credential_generation_id = 'a8140000-0000-4000-8000-000000000070'
      and tombstone.line_message_digest = extensions.digest(
        convert_to('m-unsend-first', 'UTF8'), 'sha256'
      )
  ),
  1::bigint,
  'retention cleanup preserves the permanent content-free unsend tombstone'
);
insert into webhook_results
select public.process_line_webhook_delivery(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000070',
  '[{"webhookEventId":"evt-redelivery-after-cleanup","eventType":"message","sourceType":"user","lineUserId":"U-chat-user","lineMessageId":"m-unsend-first","messageType":"text","textContent":"cleanup後も復元禁止","occurredAt":"2026-08-14T01:07:00Z","payloadDigest":"digest-redelivery-after-cleanup","isRedelivery":true}]'::jsonb
);
select ok(
  (select status = 'unsent' and text_content is null
   from public.line_messages where line_message_id = 'm-unsend-first'),
  'a redelivery after ordinary retention cleanup cannot restore withdrawn text'
);
select ok(
  exists (
    select 1
    from public.line_chat_outbox outbox
    join public.line_messages message on message.id = outbox.message_id
    where outbox.id = (select outbox_id from retention_claim)
      and outbox.status = 'processing'
      and message.text_content = '保持期間境界の送信中メッセージ'
  ),
  'retention cleanup preserves a processing delivery and its durable body'
);
select ok(
  (select last_status = 'succeeded' and last_completed_at is not null
   from public.line_job_heartbeats
   where job_name = 'line-chat-cleanup' and clinic_id is null),
  'cleanup stores body-free operational heartbeat metadata'
);
select ok(
  (select skipped from public.run_line_chat_cleanup_if_due()),
  'cleanup is skipped after a successful run within 24 hours'
);

select * from finish();
rollback;
