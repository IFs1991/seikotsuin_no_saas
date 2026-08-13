begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(141);

select has_table('public'::name, 'clinic_line_setup_sessions'::name);
select has_table('public'::name, 'clinic_line_credential_generations'::name);
select has_table('public'::name, 'clinic_line_chat_settings'::name);
select has_table('public'::name, 'line_contacts'::name);
select has_table('public'::name, 'line_conversations'::name);
select has_table('public'::name, 'line_webhook_events'::name);
select has_table('public'::name, 'line_messages'::name);
select has_table('public'::name, 'line_chat_outbox'::name);
select has_table('public'::name, 'line_job_heartbeats'::name);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'clinic_line_setup_sessions',
        'clinic_line_credential_generations',
        'clinic_line_chat_settings',
        'line_contacts',
        'line_conversations',
        'line_webhook_events',
        'line_messages',
        'line_chat_outbox',
        'line_job_heartbeats'
      ])
      and relation.relrowsecurity
  ),
  9::bigint,
  'all LINE integration tables have RLS enabled'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'clinic_line_setup_sessions',
        'clinic_line_credential_generations',
        'clinic_line_chat_settings',
        'line_contacts',
        'line_conversations',
        'line_webhook_events',
        'line_messages',
        'line_chat_outbox',
        'line_job_heartbeats'
      ])
      and pg_get_userbyid(relation.relowner) = 'postgres'
  ),
  9::bigint,
  'all LINE integration tables remain postgres owned'
);

select is(
  (
    select count(*)
    from unnest(array[
      'clinic_line_setup_sessions',
      'clinic_line_credential_generations',
      'clinic_line_chat_settings',
      'line_contacts',
      'line_conversations',
      'line_webhook_events',
      'line_messages',
      'line_chat_outbox',
      'line_job_heartbeats'
    ]) table_name
    cross join unnest(array['anon', 'authenticated']) role_name
    where has_table_privilege(role_name, format('public.%I', table_name), 'select')
      or has_table_privilege(role_name, format('public.%I', table_name), 'insert')
      or has_table_privilege(role_name, format('public.%I', table_name), 'update')
      or has_table_privilege(role_name, format('public.%I', table_name), 'delete')
  ),
  0::bigint,
  'client roles have no direct LINE integration table privileges'
);

select is(
  (
    select count(*)
    from unnest(array[
      'clinic_line_setup_sessions',
      'clinic_line_credential_generations',
      'clinic_line_chat_settings',
      'line_contacts',
      'line_conversations',
      'line_webhook_events',
      'line_messages',
      'line_chat_outbox',
      'line_job_heartbeats'
    ]) table_name
    where has_table_privilege('service_role', format('public.%I', table_name), 'select')
      and has_table_privilege('service_role', format('public.%I', table_name), 'insert')
      and has_table_privilege('service_role', format('public.%I', table_name), 'update')
      and has_table_privilege('service_role', format('public.%I', table_name), 'delete')
  ),
  9::bigint,
  'service role owns complete LINE integration table access'
);

select is(
  (
    select count(*)
    from unnest(array[
      'clinic_line_setup_sessions',
      'clinic_line_credential_generations',
      'clinic_line_chat_settings',
      'line_contacts',
      'line_conversations',
      'line_webhook_events',
      'line_messages',
      'line_chat_outbox',
      'line_job_heartbeats'
    ]) table_name
    where not exists (
      select 1
      from pg_class relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) acl_entry
      where relation.oid = format('public.%I', table_name)::regclass
        and acl_entry.grantee <> relation.relowner
        and (
          pg_get_userbyid(acl_entry.grantee) <> 'service_role'
          or acl_entry.is_grantable
        )
    )
  ),
  9::bigint,
  'LINE tables have exactly service_role ACLs without grant option'
);

select has_function(
  'public',
  'expire_line_setup_sessions',
  array['uuid']
);

select has_function(
  'public',
  'renew_line_notification_claim',
  array['uuid', 'uuid', 'uuid']
);

select has_function(
  'public',
  'sync_failed_line_notification_tracking',
  array[]::text[]
);

select has_function(
  'public',
  'quarantine_unverified_line_notification_history',
  array[]::text[]
);

select has_function(
  'public',
  'validate_line_chat_outbox_contract',
  array[]::text[]
);

select has_function(
  'public',
  'purge_expired_line_chat_data',
  array['uuid']
);

select has_function(
  'public',
  'enqueue_line_chat_message',
  array['uuid', 'uuid', 'text', 'uuid']
);

select has_function(
  'public',
  'rotate_line_credential_generation',
  array['uuid', 'uuid', 'uuid', 'jsonb', 'uuid']
);

select has_function(
  'public',
  'claim_line_chat_outbox',
  array['uuid', 'integer']
);

select has_function(
  'public',
  'finalize_line_chat_outbox',
  array['uuid', 'uuid', 'uuid', 'boolean', 'text', 'text']
);

select has_function(
  'public',
  'close_line_setup_session',
  array['uuid', 'uuid', 'text']
);

select has_function(
  'public',
  'enqueue_outreach_campaign',
  array['uuid', 'uuid', 'text', 'jsonb']
);

select has_function(
  'public',
  'claim_line_notification_outbox',
  array['uuid', 'uuid', 'integer']
);

select has_function(
  'public',
  'finalize_line_notification_outbox',
  array[
    'uuid', 'uuid', 'uuid', 'text',
    'timestamp with time zone', 'text', 'timestamp with time zone'
  ]
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.expire_line_setup_sessions(uuid)'::regprocedure,
      'public.purge_expired_line_chat_data(uuid)'::regprocedure,
      'public.validate_line_chat_outbox_contract()'::regprocedure,
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure,
      'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
      'public.validate_line_credential_rotation()'::regprocedure,
      'public.initialize_line_credential_generation()'::regprocedure,
      'public.initialize_customer_line_generation()'::regprocedure,
      'public.protect_customer_line_identity()'::regprocedure,
      'public.initialize_line_message_outbox_generation()'::regprocedure,
      'public.sync_failed_line_notification_tracking()'::regprocedure,
      'public.quarantine_unverified_line_notification_history()'::regprocedure,
      'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure,
      'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure,
      'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure,
      'public.validate_line_current_generation()'::regprocedure,
      'public.claim_line_chat_outbox(uuid,integer)'::regprocedure,
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure,
      'public.close_line_setup_session(uuid,uuid,text)'::regprocedure,
      'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure,
      'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure
    ]) function_oid
    cross join unnest(array['anon', 'authenticated']) role_name
    where has_function_privilege(role_name, function_oid, 'execute')
  ),
  0::bigint,
  'client roles cannot execute LINE maintenance functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.expire_line_setup_sessions(uuid)'::regprocedure,
      'public.purge_expired_line_chat_data(uuid)'::regprocedure,
      'public.validate_line_chat_outbox_contract()'::regprocedure,
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure,
      'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
      'public.validate_line_credential_rotation()'::regprocedure,
      'public.initialize_line_credential_generation()'::regprocedure,
      'public.initialize_customer_line_generation()'::regprocedure,
      'public.protect_customer_line_identity()'::regprocedure,
      'public.initialize_line_message_outbox_generation()'::regprocedure,
      'public.sync_failed_line_notification_tracking()'::regprocedure,
      'public.quarantine_unverified_line_notification_history()'::regprocedure,
      'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure,
      'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure,
      'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure,
      'public.validate_line_current_generation()'::regprocedure,
      'public.claim_line_chat_outbox(uuid,integer)'::regprocedure,
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure,
      'public.close_line_setup_session(uuid,uuid,text)'::regprocedure,
      'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure,
      'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure
    ]) function_oid
    where has_function_privilege('service_role', function_oid, 'execute')
  ),
  21::bigint,
  'service role can execute LINE maintenance functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.expire_line_setup_sessions(uuid)'::regprocedure,
      'public.purge_expired_line_chat_data(uuid)'::regprocedure,
      'public.validate_line_chat_outbox_contract()'::regprocedure,
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure,
      'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
      'public.validate_line_credential_rotation()'::regprocedure,
      'public.initialize_line_credential_generation()'::regprocedure,
      'public.initialize_customer_line_generation()'::regprocedure,
      'public.protect_customer_line_identity()'::regprocedure,
      'public.initialize_line_message_outbox_generation()'::regprocedure,
      'public.sync_failed_line_notification_tracking()'::regprocedure,
      'public.quarantine_unverified_line_notification_history()'::regprocedure,
      'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure,
      'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure,
      'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure,
      'public.validate_line_current_generation()'::regprocedure,
      'public.claim_line_chat_outbox(uuid,integer)'::regprocedure,
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure,
      'public.close_line_setup_session(uuid,uuid,text)'::regprocedure,
      'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure,
      'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure
    ]) function_oid
    where not exists (
      select 1
      from pg_proc function_data
      cross join lateral aclexplode(
        coalesce(function_data.proacl, acldefault('f', function_data.proowner))
      ) acl_entry
      where function_data.oid = function_oid
        and acl_entry.grantee <> function_data.proowner
        and (
          pg_get_userbyid(acl_entry.grantee) <> 'service_role'
          or acl_entry.is_grantable
        )
    )
  ),
  21::bigint,
  'LINE functions have exactly service_role EXECUTE without grant option'
);

select is(
  (
    select count(*)
    from pg_proc function_data
    where function_data.oid in (
      'public.expire_line_setup_sessions(uuid)'::regprocedure,
      'public.purge_expired_line_chat_data(uuid)'::regprocedure,
      'public.validate_line_chat_outbox_contract()'::regprocedure,
      'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure,
      'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
      'public.validate_line_credential_rotation()'::regprocedure,
      'public.initialize_line_credential_generation()'::regprocedure,
      'public.initialize_customer_line_generation()'::regprocedure,
      'public.protect_customer_line_identity()'::regprocedure,
      'public.initialize_line_message_outbox_generation()'::regprocedure,
      'public.sync_failed_line_notification_tracking()'::regprocedure,
      'public.quarantine_unverified_line_notification_history()'::regprocedure,
      'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure,
      'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure,
      'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure,
      'public.validate_line_current_generation()'::regprocedure,
      'public.claim_line_chat_outbox(uuid,integer)'::regprocedure,
      'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure,
      'public.close_line_setup_session(uuid,uuid,text)'::regprocedure,
      'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure,
      'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure
    )
      and function_data.prosecdef = (
        function_data.oid = 'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure::oid
      )
      and exists (
        select 1
        from unnest(coalesce(function_data.proconfig, array[]::text[])) setting
        where setting = 'search_path=pg_catalog, public'
      )
  ),
  21::bigint,
  'LINE functions use fixed search_path and only relink is definer-mode'
);

select has_index(
  'public'::name,
  'customers'::name,
  'customers_clinic_line_user_id_unique'::name
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conname = 'customers_line_user_id_key'
      and conrelid = 'public.customers'::regclass
  ),
  'unsafe global customers LINE ID constraint is absent'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'customers_clinic_line_user_id_unique'
      and indexdef ilike '%unique%clinic_id%line_user_id%where (line_user_id is not null)%'
  ),
  'customer LINE ID is unique only within clinic scope'
);

select col_default_is(
  'public'::name,
  'clinic_line_credentials'::name,
  'app_type'::name,
  'mini_app'::text,
  'new LINE credentials default to MINI App'
);

select col_default_is(
  'public'::name,
  'clinic_line_chat_settings'::name,
  'retention_days'::name,
  '90',
  'LINE chat retention defaults to 90 days'
);

select col_default_is(
  'public'::name,
  'clinic_feature_flags'::name,
  'line_notification_enabled'::name,
  'false',
  'LINE notification starts disabled'
);

select col_default_is(
  'public'::name,
  'clinic_feature_flags'::name,
  'line_chat_enabled'::name,
  'false',
  'LINE chat starts disabled'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_setup_sessions_max_lifetime'
      and conrelid = 'public.clinic_line_setup_sessions'::regclass
  ),
  'setup sessions enforce a maximum 24-hour lifetime'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_contacts_customer_identity_fkey'
      and conrelid = 'public.line_contacts'::regclass
  ),
  'LINE contacts use a composite clinic/customer foreign key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_conversations_assignee_clinic_fkey'
      and conrelid = 'public.line_conversations'::regclass
  ),
  'conversation assignments use a composite clinic/membership foreign key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_messages_conversation_contact_generation_fkey'
      and conrelid = 'public.line_messages'::regclass
  ),
  'messages use a composite clinic/conversation foreign key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_webhook_events_clinic_event_unique'
      and conrelid = 'public.line_webhook_events'::regclass
  ),
  'webhook event IDs are idempotent within each clinic'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_messages_text_contract'
      and conrelid = 'public.line_messages'::regclass
  ),
  'message storage enforces text-only and unsend clearing contract'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_chat_settings_retention_days_check'
      and conrelid = 'public.clinic_line_chat_settings'::regclass
  ),
  'retention days stay in the 1 to 365 day contract'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_chat_outbox_message_conversation_fkey'
      and conrelid = 'public.line_chat_outbox'::regclass
  ),
  'chat outbox message references are tenant-bound'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'line_chat_outbox_message_unique'
      and conrelid = 'public.line_chat_outbox'::regclass
  ),
  'each outbound message can be queued only once'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'clinic_line_setup_sessions_active_unique'
  ),
  'only one active setup session exists per clinic'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'line_messages_line_message_id_unique'
  ),
  'LINE message IDs deduplicate within the clinic boundary'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.line_chat_outbox'::regclass
      and trigger_data.tgname = 'validate_line_chat_outbox_contract_trigger'
      and not trigger_data.tgisinternal
  ),
  'outbox sendability is guarded by a database trigger'
);

insert into public.clinics (id, name)
values
  ('a8130000-0000-4000-8000-000000000001', '__line_foundation_clinic_a__'),
  ('a8130000-0000-4000-8000-000000000002', '__line_foundation_clinic_b__');

insert into public.clinic_feature_flags (clinic_id, line_chat_enabled)
values
  ('a8130000-0000-4000-8000-000000000001', false),
  ('a8130000-0000-4000-8000-000000000002', false)
on conflict (clinic_id) do update
set line_chat_enabled = excluded.line_chat_enabled;

insert into public.clinic_line_credentials (
  clinic_id, liff_id, login_channel_id, messaging_channel_id,
  channel_secret_encrypted, assertion_private_key_encrypted, assertion_kid,
  access_token_encrypted, token_expires_at, is_active, credential_generation_id
)
values
  (
    'a8130000-0000-4000-8000-000000000001', null, 'login-channel-a',
    'messaging-channel-a', 'encrypted-channel-secret', 'encrypted-private-jwk',
    'kid-a', 'encrypted-old-provider-token', now() + interval '20 days', true,
    'a8130000-0000-4000-8000-000000000070'
  ),
  (
    'a8130000-0000-4000-8000-000000000002', null, 'login-channel-b',
    'messaging-channel-b', 'encrypted-channel-secret-b', 'encrypted-private-jwk-b',
    'kid-b', null, null, true, 'a8130000-0000-4000-8000-000000000072'
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
values (
  'a8130000-0000-4000-8000-000000000010',
  'line-foundation@example.invalid',
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
  'a8130000-0000-4000-8000-000000000010',
  'a8130000-0000-4000-8000-000000000001',
  '__line_foundation_legacy_staff__',
  'staff',
  'line-foundation@example.invalid',
  'not-used'
);

insert into public.user_permissions (
  staff_id, username, hashed_password, role, clinic_id
)
values (
  'a8130000-0000-4000-8000-000000000010',
  'line-foundation-user',
  'not-used',
  'staff',
  'a8130000-0000-4000-8000-000000000001'
);

insert into public.customers (
  id, clinic_id, name, phone, line_user_id, is_deleted
)
values
  (
    'a8130000-0000-4000-8000-000000000021',
    'a8130000-0000-4000-8000-000000000001',
    '__line_customer_a__',
    '09000008131',
    'U-line-foundation-shared',
    false
  ),
  (
    'a8130000-0000-4000-8000-000000000022',
    'a8130000-0000-4000-8000-000000000002',
    '__line_customer_b__',
    '09000008132',
    'U-line-foundation-shared',
    false
  );

select pass('the same provider-scoped LINE user ID is allowed across clinics');

select throws_ok(
  $$
    insert into public.customers (
      id, clinic_id, name, phone, line_user_id, is_deleted
    ) values (
      'a8130000-0000-4000-8000-000000000023',
      'a8130000-0000-4000-8000-000000000001',
      '__line_customer_duplicate__',
      '09000008133',
      'U-line-foundation-shared',
      false
    )
  $$,
  '23505',
  null,
  'the same LINE user ID is rejected within one clinic'
);

alter table public.line_message_outbox
  disable trigger initialize_line_message_outbox_generation_trigger;

insert into public.line_message_outbox (
  id, clinic_id, customer_id, credential_generation_id, line_user_id,
  message_type, payload, status
) values
  (
    'a8130000-0000-4000-8000-000000000097',
    'a8130000-0000-4000-8000-000000000001',
    null,
    null,
    'U-line-foundation-shared',
    'received',
    '{"text":"pre-foundation pending","customerId":"a8130000-0000-4000-8000-000000000021"}'::jsonb,
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-000000000098',
    'a8130000-0000-4000-8000-000000000001',
    null,
    null,
    'U-unmatched-historical-line-id',
    'received',
    '{"text":"pre-foundation terminal history"}'::jsonb,
    'sent'
  );

select public.quarantine_unverified_line_notification_history();

alter table public.line_message_outbox
  enable trigger initialize_line_message_outbox_generation_trigger;

select ok(
  (select status = 'failed'
      and last_error = 'legacy_provider_identity_unverified'
      and customer_id = 'a8130000-0000-4000-8000-000000000021'
   from public.line_message_outbox
   where id = 'a8130000-0000-4000-8000-000000000097')
  and
  (select status = 'sent' and customer_id is null and credential_generation_id is null
   from public.line_message_outbox
   where id = 'a8130000-0000-4000-8000-000000000098'),
  'upgrade quarantine fails unverified pending work and preserves unresolved terminal history'
);

insert into public.customers (
  id, clinic_id, name, phone, line_user_id, is_deleted
) values (
  'a8130000-0000-4000-8000-000000000026',
  'a8130000-0000-4000-8000-000000000001',
  '__line_customer_quarantined__',
  '09000008134',
  'U-line-foundation-quarantined',
  false
);

update public.customers
set line_credential_generation_id = null
where id = 'a8130000-0000-4000-8000-000000000026'
  and clinic_id = 'a8130000-0000-4000-8000-000000000001';

update public.customers
set line_display_name = '__legacy_profile_refresh__'
where id = 'a8130000-0000-4000-8000-000000000026'
  and clinic_id = 'a8130000-0000-4000-8000-000000000001';

select is(
  (
    select line_credential_generation_id
    from public.customers
    where id = 'a8130000-0000-4000-8000-000000000026'
  ),
  null,
  'an unchanged quarantined LINE ID is not promoted by a profile refresh'
);

select throws_ok(
  $$
    update public.customers
    set line_credential_generation_id = 'a8130000-0000-4000-8000-000000000070'
    where id = 'a8130000-0000-4000-8000-000000000026'
      and clinic_id = 'a8130000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'LINE_CUSTOMER_RELINK_REQUIRED',
  'a quarantined LINE identity cannot be promoted by a generic service-role update'
);

select throws_ok(
  $$
    update public.customers
    set line_user_id = 'U-line-foundation-direct-relink'
    where id = 'a8130000-0000-4000-8000-000000000026'
      and clinic_id = 'a8130000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'LINE_CUSTOMER_RELINK_GENERATION_REQUIRED',
  'changing a LINE identity requires an explicit provider generation'
);

select throws_ok(
  $$
    set local role service_role;
    update public.customers
    set
      line_user_id = 'U-line-foundation-direct-relink',
      line_credential_generation_id = 'a8130000-0000-4000-8000-000000000070'
    where id = 'a8130000-0000-4000-8000-000000000026'
      and clinic_id = 'a8130000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'LINE_CUSTOMER_RELINK_RPC_REQUIRED',
  'generic service-role updates cannot bypass the explicit relink RPC'
);

select throws_ok(
  $$
    insert into public.customers (
      id, clinic_id, name, phone, line_user_id,
      line_credential_generation_id, is_deleted
    ) values (
      'a8130000-0000-4000-8000-000000000027',
      'a8130000-0000-4000-8000-000000000001',
      '__line_customer_stale_generation__',
      '09000008137',
      'U-line-foundation-stale-generation',
      'a8130000-0000-4000-8000-000000000071',
      false
    )
  $$,
  '23503',
  'LINE_CUSTOMER_GENERATION_NOT_CURRENT',
  'new LINE identities must use the clinic current credential generation'
);

select is(
  (
    select count(*)
    from public.customers
    where id = 'a8130000-0000-4000-8000-000000000027'
  ),
  0::bigint,
  'a stale provider-generation insert leaves no patient row'
);

update public.clinic_feature_flags
set line_notification_enabled = true
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

insert into public.resources (
  id, clinic_id, name, type, is_active, is_bookable, is_deleted
) values (
  'a8130000-0000-4000-8000-000000000081',
  'a8130000-0000-4000-8000-000000000001',
  '__line_foundation_staff__',
  'staff',
  true,
  true,
  false
);

insert into public.menus (
  id, clinic_id, name, price, duration_minutes, is_active, is_public, is_deleted
) values (
  'a8130000-0000-4000-8000-000000000082',
  'a8130000-0000-4000-8000-000000000001',
  '__line_foundation_menu__',
  1000,
  30,
  true,
  true,
  false
);

insert into public.reservations (
  id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time,
  status, channel, is_deleted
) values (
  'a8130000-0000-4000-8000-000000000083',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000021',
  'a8130000-0000-4000-8000-000000000082',
  'a8130000-0000-4000-8000-000000000081',
  now() + interval '1 day',
  now() + interval '1 day 30 minutes',
  'confirmed',
  'line',
  false
);

insert into public.line_message_outbox (
  id, clinic_id, customer_id, line_user_id, message_type, payload, status
) values
  (
    'a8130000-0000-4000-8000-000000000086',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-shared',
    'staff_availability',
    '{"text":"tracking availability","availability":{"eventId":"a8130000-0000-4000-8000-000000000084","notificationId":"a8130000-0000-4000-8000-000000000085","customerId":"a8130000-0000-4000-8000-000000000021"}}'::jsonb,
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-000000000089',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-shared',
    'received',
    '{"text":"tracking reservation","reservation":{"reservationId":"a8130000-0000-4000-8000-000000000083","notificationType":"received"}}'::jsonb,
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-000000000092',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-shared',
    'outreach',
    '{"text":"tracking outreach","outreach":{"campaignId":"a8130000-0000-4000-8000-000000000090","recipientId":"a8130000-0000-4000-8000-000000000091","customerId":"a8130000-0000-4000-8000-000000000021"}}'::jsonb,
    'pending'
  );

insert into public.staff_availability_events (
  id, clinic_id, staff_id, available_datetime, reward_type, status
) values (
  'a8130000-0000-4000-8000-000000000084',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000081',
  now() + interval '2 days',
  'priority_booking',
  'notified'
);

insert into public.staff_availability_notifications (
  id, clinic_id, availability_event_id, customer_id, line_user_id, status, line_outbox_id
) values (
  'a8130000-0000-4000-8000-000000000085',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000084',
  'a8130000-0000-4000-8000-000000000021',
  'U-line-foundation-shared',
  'pending',
  'a8130000-0000-4000-8000-000000000086'
);

insert into public.reservation_notifications (
  id, clinic_id, reservation_id, notification_type, channel, status, detail
) values
  (
    'a8130000-0000-4000-8000-000000000088',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000083',
    'received',
    'line',
    'enqueued',
    jsonb_build_object('line_outbox_id', 'a8130000-0000-4000-8000-000000000089')
  ),
  (
    'a8130000-0000-4000-8000-000000000094',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000083',
    'confirmed',
    'line',
    'enqueued',
    jsonb_build_object('line_outbox_id', 'a8130000-0000-4000-8000-000000000095')
  );

insert into public.patient_outreach_campaigns (
  id, clinic_id, name, status, message_body, segment_snapshot
) values (
  'a8130000-0000-4000-8000-000000000090',
  'a8130000-0000-4000-8000-000000000001',
  '__line_foundation_campaign__',
  'sent',
  'tracking outreach',
  '{}'::jsonb
);

insert into public.patient_outreach_recipients (
  id, campaign_id, clinic_id, customer_id, line_user_id, delivery_status
) values (
  'a8130000-0000-4000-8000-000000000091',
  'a8130000-0000-4000-8000-000000000090',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000021',
  'U-line-foundation-shared',
  'pending'
);

update public.line_message_outbox
set status = 'failed', last_error = 'forced_generation_failure'
where id in (
  'a8130000-0000-4000-8000-000000000086',
  'a8130000-0000-4000-8000-000000000089',
  'a8130000-0000-4000-8000-000000000092'
);

select is(
  (select status from public.staff_availability_notifications where id = 'a8130000-0000-4000-8000-000000000085'),
  'failed',
  'terminal outbox failure updates the availability notification tracker'
);

select is(
  (select status from public.reservation_notifications where id = 'a8130000-0000-4000-8000-000000000088'),
  'failed',
  'terminal outbox failure updates the reservation notification tracker'
);

insert into public.line_message_outbox (
  id, clinic_id, customer_id, line_user_id, message_type, payload, status
) values (
  'a8130000-0000-4000-8000-000000000095',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000021',
  'U-line-foundation-shared',
  'confirmed',
  '{"text":"legacy no-email reservation payload"}'::jsonb,
  'pending'
);

update public.line_message_outbox
set status = 'failed', last_error = 'forced_legacy_failure'
where id = 'a8130000-0000-4000-8000-000000000095';

select is(
  (select status from public.reservation_notifications where id = 'a8130000-0000-4000-8000-000000000094'),
  'failed',
  'terminal failure follows the persisted outbox link for legacy reservation payloads'
);

select is(
  (select delivery_status from public.patient_outreach_recipients where id = 'a8130000-0000-4000-8000-000000000091'),
  'failed',
  'terminal outbox failure updates the outreach recipient tracker'
);

insert into public.line_contacts (
  id, clinic_id, line_user_id, credential_generation_id, customer_id
)
values (
  'a8130000-0000-4000-8000-000000000031',
  'a8130000-0000-4000-8000-000000000001',
  'U-line-foundation-shared',
  'a8130000-0000-4000-8000-000000000070',
  'a8130000-0000-4000-8000-000000000021'
);

insert into public.customers (
  id, clinic_id, name, phone, is_deleted
)
values (
  'a8130000-0000-4000-8000-000000000024',
  'a8130000-0000-4000-8000-000000000001',
  '__line_customer_unlinked__',
  '09000008134',
  false
);

insert into public.line_conversations (
  id, clinic_id, contact_id, credential_generation_id
)
values (
  'a8130000-0000-4000-8000-000000000043',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000031',
  'a8130000-0000-4000-8000-000000000070'
);

insert into public.line_messages (
  id, clinic_id, conversation_id, contact_id, credential_generation_id,
  direction, message_type, text_content, status, occurred_at
)
values (
  'a8130000-0000-4000-8000-000000000064',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000043',
  'a8130000-0000-4000-8000-000000000031',
  'a8130000-0000-4000-8000-000000000070',
  'outbound',
  'text',
  'stale delivery before provider rotation',
  'queued',
  now()
);

insert into public.line_chat_outbox (
  id, clinic_id, conversation_id, message_id, credential_generation_id,
  status, claim_token, claimed_at
)
values (
  'a8130000-0000-4000-8000-000000000074',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000043',
  'a8130000-0000-4000-8000-000000000064',
  'a8130000-0000-4000-8000-000000000070',
  'processing',
  'a8130000-0000-4000-8000-000000000075',
  now() - interval '6 minutes'
);

update public.clinic_feature_flags
set line_notification_enabled = true
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

insert into public.line_message_outbox (
  id, clinic_id, customer_id, line_user_id, message_type, payload, status
)
values (
  'a8130000-0000-4000-8000-000000000076',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000021',
  'U-line-foundation-shared',
  'received',
  '{"text":"legacy notification before provider rotation"}'::jsonb,
  'pending'
);

select is(
  (
    select credential_generation_id
    from public.line_message_outbox
    where id = 'a8130000-0000-4000-8000-000000000076'
  ),
  'a8130000-0000-4000-8000-000000000070'::uuid,
  'reservation and CRM notification enqueue captures the current provider generation'
);

select is(
  (
    select customer_id
    from public.line_message_outbox
    where id = 'a8130000-0000-4000-8000-000000000076'
  ),
  'a8130000-0000-4000-8000-000000000021'::uuid,
  'reservation and CRM notification enqueue binds the patient identity'
);

select is(
  public.claim_line_notification_outbox(
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000076',
    0
  ) is not null,
  true,
  'current provider notification can be claimed with a short-lived token'
);

select is(
  public.renew_line_notification_claim(
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000076',
    (
      select claim_token
      from public.line_message_outbox
      where id = 'a8130000-0000-4000-8000-000000000076'
    )
  ),
  true,
  'delivery claim is fenced again immediately before the external push'
);

select lives_ok(
  $$
    select public.finalize_line_notification_outbox(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000076',
      (
        select claim_token
        from public.line_message_outbox
        where id = 'a8130000-0000-4000-8000-000000000076'
      ),
      'pending',
      null,
      'synthetic retry',
      now()
    )
  $$,
  'notification finalize validates and releases the matching claim token'
);

select ok(
  (
    select status = 'pending'
      and attempts = 1
      and claim_token is null
      and claimed_at is null
    from public.line_message_outbox
    where id = 'a8130000-0000-4000-8000-000000000076'
  ),
  'notification retry persists attempts and clears its delivery lease'
);

update public.line_message_outbox
set
  attempts = 3,
  claim_token = 'a8130000-0000-4000-8000-000000000096',
  claimed_at = now() - interval '3 minutes',
  next_attempt_at = now() - interval '1 minute'
where id = 'a8130000-0000-4000-8000-000000000076';

select is(
  public.claim_line_notification_outbox(
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000076',
    3
  ),
  null::uuid,
  'an expired final-attempt notification claim is not retried'
);

select ok(
  (
    select status = 'failed'
      and claim_token is null
      and claimed_at is null
      and last_error = 'claim_lease_expired_max_attempts'
    from public.line_message_outbox
    where id = 'a8130000-0000-4000-8000-000000000076'
  ),
  'an expired final-attempt claim becomes a terminal tracked failure'
);

-- Restore this synthetic row for the independent provider-rotation case below.
update public.line_message_outbox
set
  status = 'pending',
  attempts = 1,
  last_error = 'synthetic retry',
  next_attempt_at = now(),
  claim_token = null,
  claimed_at = null
where id = 'a8130000-0000-4000-8000-000000000076';

select throws_ok(
  $$
    insert into public.line_contacts (
      clinic_id, line_user_id, credential_generation_id, customer_id
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'U-line-foundation-wrong-clinic',
      'a8130000-0000-4000-8000-000000000070',
      'a8130000-0000-4000-8000-000000000022'
    )
  $$,
  '23503',
  null,
  'a contact cannot reference another clinic customer'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk, public_jwk,
  credential_fingerprint, public_key_kid, status, verified_at
)
values (
  'a8130000-0000-4000-8000-000000000052',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000010',
  'encrypted-rotation-private-jwk',
  '{"kty":"RSA"}'::jsonb,
  'fingerprint-rotated',
  'kid-a-rotated',
  'verified',
  now()
);

select is(
  public.rotate_line_credential_generation(
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000052',
    'a8130000-0000-4000-8000-000000000071',
    jsonb_build_object(
      'messaging_channel_id', 'messaging-channel-a-rotated',
      'login_channel_id', 'login-channel-a-rotated',
      'channel_secret_encrypted', 'encrypted-channel-secret-rotated',
      'app_type', 'mini_app'
    ),
    'a8130000-0000-4000-8000-000000000010'
  ),
  'a8130000-0000-4000-8000-000000000070'::uuid,
  'provider generation rotation returns the replaced generation'
);

select is(
  (
    select status
    from public.clinic_line_credential_generations
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
      and id = 'a8130000-0000-4000-8000-000000000070'
  ),
  'replaced',
  'provider generation rotation retains the historical generation'
);

select is(
  (
    select credential_generation_id
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  'a8130000-0000-4000-8000-000000000071'::uuid,
  'provider generation rotation advances the current credential generation'
);

select is(
  (
    select assertion_private_key_encrypted
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  'encrypted-rotation-private-jwk',
  'provider rotation atomically promotes the verified setup private key'
);

select is(
  (
    select credential_fingerprint
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  'fingerprint-rotated',
  'provider rotation atomically promotes the verified setup fingerprint'
);

select is(
  (
    select assertion_kid
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  'kid-a-rotated',
  'provider rotation promotes the KID bound to the verified setup key'
);

select is(
  (
    select access_token_encrypted
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  null,
  'provider rotation clears the cached token from the previous provider'
);

select is(
  (
    select token_expires_at
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  null,
  'provider rotation clears the cached token expiry from the previous provider'
);

select ok(
  (
    select status = 'failed'
      and last_error = 'credential_generation_replaced'
    from public.line_message_outbox
    where id = 'a8130000-0000-4000-8000-000000000076'
  ),
  'provider rotation terminally fails pending reservation and CRM notifications from the old generation'
);

select ok(
  (
    select liff_id is null
      and oa_basic_id is null
      and bot_user_id is null
      and bot_display_name is null
      and last_metadata_verified_at is null
    from public.clinic_line_credentials
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  ),
  'provider rotation clears public IDs and metadata verified for the previous provider'
);

select ok(
  (
    select status = 'consumed' and encrypted_private_jwk is null
    from public.clinic_line_setup_sessions
    where id = 'a8130000-0000-4000-8000-000000000052'
  ),
  'provider rotation consumes the setup session and wipes its private key'
);

select ok(
  (
    select message.status = 'failed'
      and outbox.status = 'failed'
      and outbox.last_error_code = 'credential_generation_replaced'
    from public.line_messages message
    join public.line_chat_outbox outbox on outbox.message_id = message.id
    where message.id = 'a8130000-0000-4000-8000-000000000064'
  ),
  'rotation recovers an expired claim and terminally fails both delivery rows'
);

select throws_ok(
  $$
    update public.clinic_line_credentials
    set messaging_channel_id = 'non-atomic-channel-change'
    where clinic_id = 'a8130000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'provider credentials cannot change without an atomic generation rotation'
);

select is(
  (
    select credential_generation_id
    from public.line_contacts
    where id = 'a8130000-0000-4000-8000-000000000031'
  ),
  'a8130000-0000-4000-8000-000000000070'::uuid,
  'provider generation rotation preserves existing contact history for explicit relinking'
);

select throws_ok(
  $$
    insert into public.line_message_outbox (
      clinic_id, customer_id, line_user_id, message_type, payload, status
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000021',
      'U-line-foundation-shared',
      'received',
      '{"text":"must wait for provider relink"}'::jsonb,
      'pending'
    )
  $$,
  '23503',
  'LINE_NOTIFICATION_PATIENT_GENERATION_MISMATCH',
  'an old-provider patient cannot be queued against the new provider'
);

select is(
  (
    select count(*)
    from public.line_message_outbox
    where payload->>'text' = 'must wait for provider relink'
  ),
  0::bigint,
  'a rejected provider mismatch leaves no partial notification row'
);

select throws_ok(
  $$
    update public.line_message_outbox
    set customer_id = 'a8130000-0000-4000-8000-000000000024'
    where id = 'a8130000-0000-4000-8000-000000000076'
  $$,
  '23514',
  'LINE_NOTIFICATION_IDENTITY_IMMUTABLE',
  'queued notification identity cannot be rewritten after enqueue'
);

-- New LINE integration tables have no client grants. Temporarily expose the
-- legacy customer mutation path so this transaction can exercise the trigger
-- that remains the final guard if a future grant or policy drifts.
grant select, insert, update on public.customers to authenticated;
create policy line_foundation_test_customer_select
on public.customers
for select
to authenticated
using (true);
create policy line_foundation_test_customer_update
on public.customers
for update
to authenticated
using (true)
with check (true);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"a8130000-0000-4000-8000-000000000010","role":"authenticated","user_role":"staff","clinic_scope_ids":["a8130000-0000-4000-8000-000000000001"]}',
  true
);

select throws_ok(
  $$
    update public.customers
    set line_credential_generation_id = 'a8130000-0000-4000-8000-000000000071'
    where id = 'a8130000-0000-4000-8000-000000000021'
      and clinic_id = 'a8130000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'LINE_CUSTOMER_IDENTITY_SERVICE_ROLE_REQUIRED',
  'authenticated staff cannot directly change the patient provider generation'
);

select throws_ok(
  $$
    insert into public.customers (
      id, clinic_id, name, phone, line_user_id, is_deleted
    ) values (
      'a8130000-0000-4000-8000-000000000025',
      'a8130000-0000-4000-8000-000000000001',
      '__line_customer_untrusted_identity__',
      '09000008135',
      'U-line-foundation-untrusted',
      false
    )
  $$,
  '42501',
  'LINE_CUSTOMER_IDENTITY_SERVICE_ROLE_REQUIRED',
  'authenticated staff cannot create a patient with a provider identity directly'
);

reset role;

drop policy line_foundation_test_customer_update on public.customers;
drop policy line_foundation_test_customer_select on public.customers;
revoke select, insert, update on public.customers from authenticated;

select throws_ok(
  $$
    insert into public.line_conversations (
      id, clinic_id, contact_id, credential_generation_id
    ) values (
      'a8130000-0000-4000-8000-000000000042',
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000031',
      'a8130000-0000-4000-8000-000000000070'
    )
  $$,
  '23503',
  null,
  'old provider contacts cannot open sendable conversations after rotation'
);

select throws_ok(
  $$
    select public.relink_line_contact_generation(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000031',
      'U-line-foundation-mismatched-customer',
      'a8130000-0000-4000-8000-000000000024'
    )
  $$,
  '42501',
  'LINE_PREVIOUS_CONTACT_CUSTOMER_MISMATCH',
  'relinking cannot detach another patient from the previous contact'
);

select public.relink_line_contact_generation(
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000031',
  'U-line-foundation-current',
  'a8130000-0000-4000-8000-000000000021'
);

update public.customers
set consent_marketing = true
where id = 'a8130000-0000-4000-8000-000000000021'
  and clinic_id = 'a8130000-0000-4000-8000-000000000001';

insert into public.patient_outreach_campaigns (
  id, clinic_id, name, status, message_body, segment_snapshot
) values
  (
    'a8130000-0000-4000-8000-0000000000a1',
    'a8130000-0000-4000-8000-000000000001',
    '__line_foundation_atomic_outreach__',
    'draft',
    'atomic outreach body',
    '{}'::jsonb
  ),
  (
    'a8130000-0000-4000-8000-0000000000a4',
    'a8130000-0000-4000-8000-000000000001',
    '__line_foundation_rejected_outreach__',
    'draft',
    'rejected outreach body',
    '{}'::jsonb
  ),
  (
    'a8130000-0000-4000-8000-0000000000a7',
    'a8130000-0000-4000-8000-000000000001',
    '__line_foundation_frequency_outreach__',
    'draft',
    'frequency outreach body',
    '{}'::jsonb
  );

insert into public.patient_outreach_recipients (
  id, campaign_id, clinic_id, customer_id, line_user_id, delivery_status
) values
  (
    'a8130000-0000-4000-8000-0000000000a2',
    'a8130000-0000-4000-8000-0000000000a1',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-current',
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-0000000000a3',
    'a8130000-0000-4000-8000-0000000000a1',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000026',
    'U-line-foundation-quarantined',
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-0000000000a5',
    'a8130000-0000-4000-8000-0000000000a4',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-current',
    'pending'
  ),
  (
    'a8130000-0000-4000-8000-0000000000a8',
    'a8130000-0000-4000-8000-0000000000a7',
    'a8130000-0000-4000-8000-000000000001',
    'a8130000-0000-4000-8000-000000000021',
    'U-line-foundation-current',
    'pending'
  );

select lives_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-0000000000a1',
      'atomic outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a2","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"atomic outreach","customerId":"a8130000-0000-4000-8000-000000000021","outreach":{"campaignId":"a8130000-0000-4000-8000-0000000000a1","recipientId":"a8130000-0000-4000-8000-0000000000a2","customerId":"a8130000-0000-4000-8000-000000000021"}}}]'::jsonb
    )
  $$,
  'outreach campaign, recipients, and outbox enqueue atomically'
);

select ok(
  (select status = 'sent' and sent_at is not null
   from public.patient_outreach_campaigns
   where id = 'a8130000-0000-4000-8000-0000000000a1')
  and
  (select delivery_status = 'pending' and sent_at is not null
   from public.patient_outreach_recipients
   where id = 'a8130000-0000-4000-8000-0000000000a2')
  and
  (select delivery_status = 'skipped' and sent_at is null
   from public.patient_outreach_recipients
   where id = 'a8130000-0000-4000-8000-0000000000a3'),
  'atomic outreach records sent and explicitly skips unrelinked patients'
);

select is(
  public.claim_line_notification_outbox(
    'a8130000-0000-4000-8000-000000000001',
    (
      select id from public.line_message_outbox
      where payload#>>'{outreach,campaignId}' = 'a8130000-0000-4000-8000-0000000000a1'
    ),
    0
  ) is not null,
  true,
  'atomic outreach delivery can be claimed with its bound identity'
);

select lives_ok(
  $$
    select public.finalize_line_notification_outbox(
      'a8130000-0000-4000-8000-000000000001',
      (
        select id from public.line_message_outbox
        where payload#>>'{outreach,campaignId}' = 'a8130000-0000-4000-8000-0000000000a1'
      ),
      (
        select claim_token from public.line_message_outbox
        where payload#>>'{outreach,campaignId}' = 'a8130000-0000-4000-8000-0000000000a1'
      ),
      'sent',
      now(),
      null,
      now()
    )
  $$,
  'outreach outbox and recipient finalize in one database transaction'
);

select is(
  (select delivery_status from public.patient_outreach_recipients
   where id = 'a8130000-0000-4000-8000-0000000000a2'),
  'sent',
  'outreach recipient cannot remain pending after outbox finalization'
);

select throws_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-0000000000a1',
      'atomic outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a2","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"duplicate"}}]'::jsonb
    )
  $$,
  'P0001',
  'LINE_OUTREACH_CAMPAIGN_NOT_SENDABLE',
  'a sent outreach campaign cannot enqueue a duplicate delivery'
);

select is(
  (select count(*) from public.line_message_outbox
   where payload#>>'{outreach,campaignId}' = 'a8130000-0000-4000-8000-0000000000a1'),
  1::bigint,
  'outreach retry leaves exactly one idempotent campaign delivery'
);

select throws_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-0000000000a4',
      'rejected outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a5","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"payload identity mismatch","customerId":"a8130000-0000-4000-8000-000000000021"}}]'::jsonb
    )
  $$,
  '22023',
  'LINE_OUTREACH_DELIVERY_CONTRACT_INVALID',
  'outreach rejects payload identity metadata that does not match the recipient'
);

select throws_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-0000000000a7',
      'frequency outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a8","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"frequency outreach","customerId":"a8130000-0000-4000-8000-000000000021","outreach":{"campaignId":"a8130000-0000-4000-8000-0000000000a7","recipientId":"a8130000-0000-4000-8000-0000000000a8","customerId":"a8130000-0000-4000-8000-000000000021"}}}]'::jsonb
    )
  $$,
  '23514',
  'LINE_OUTREACH_FREQUENCY_LIMIT',
  'atomic outreach rechecks the 30-day frequency limit after locking'
);

select ok(
  (select status = 'draft' and sent_at is null
   from public.patient_outreach_campaigns
   where id = 'a8130000-0000-4000-8000-0000000000a7')
  and
  (select delivery_status = 'pending' and sent_at is null
   from public.patient_outreach_recipients
   where id = 'a8130000-0000-4000-8000-0000000000a8')
  and not exists (
    select 1 from public.line_message_outbox
    where payload#>>'{outreach,campaignId}' = 'a8130000-0000-4000-8000-0000000000a7'
  ),
  'frequency-limit rejection leaves campaign, recipient, and outbox unchanged'
);

select throws_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-0000000000a4',
      'rejected outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a6","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"must rollback","customerId":"a8130000-0000-4000-8000-000000000021","outreach":{"campaignId":"a8130000-0000-4000-8000-0000000000a4","recipientId":"a8130000-0000-4000-8000-0000000000a6","customerId":"a8130000-0000-4000-8000-000000000021"}}}]'::jsonb
    )
  $$,
  '40001',
  'LINE_OUTREACH_RECIPIENT_SET_CHANGED',
  'outreach rejects a changed recipient snapshot'
);

select ok(
  (select status = 'draft' and sent_at is null
   from public.patient_outreach_campaigns
   where id = 'a8130000-0000-4000-8000-0000000000a4')
  and
  (select delivery_status = 'pending' and sent_at is null
   from public.patient_outreach_recipients
   where id = 'a8130000-0000-4000-8000-0000000000a5')
  and not exists (
    select 1 from public.line_message_outbox
    where payload->>'text' = 'must rollback'
  ),
  'rejected outreach leaves no partial campaign, recipient, or outbox change'
);

select throws_ok(
  $$
    select public.enqueue_outreach_campaign(
      'a8130000-0000-4000-8000-000000000002',
      'a8130000-0000-4000-8000-0000000000a4',
      'rejected outreach body',
      '[{"recipient_id":"a8130000-0000-4000-8000-0000000000a5","customer_id":"a8130000-0000-4000-8000-000000000021","line_user_id":"U-line-foundation-current","payload":{"text":"cross clinic outreach"}}]'::jsonb
    )
  $$,
  'P0001',
  'LINE_NOTIFICATION_DISABLED_OR_UNCONFIGURED',
  'outreach enqueue rejects a different clinic scope'
);

select is(
  (select count(*) from public.line_message_outbox
   where clinic_id = 'a8130000-0000-4000-8000-000000000002'
     and payload->>'text' = 'cross clinic outreach'),
  0::bigint,
  'cross-clinic outreach rejection leaves no outbox row'
);

insert into public.line_conversations (
  id, clinic_id, contact_id, credential_generation_id
)
select
  'a8130000-0000-4000-8000-000000000041',
  'a8130000-0000-4000-8000-000000000001',
  contact.id,
  'a8130000-0000-4000-8000-000000000071'
from public.line_contacts contact
where contact.clinic_id = 'a8130000-0000-4000-8000-000000000001'
  and contact.credential_generation_id = 'a8130000-0000-4000-8000-000000000071';

insert into public.staff_profiles (
  id, user_id, display_name, is_active
)
values (
  'a8130000-0000-4000-8000-000000000080',
  'a8130000-0000-4000-8000-000000000010',
  '__line_foundation_staff__',
  true
);

insert into public.staff_clinic_memberships (
  id, staff_profile_id, clinic_id, membership_type
)
values (
  'a8130000-0000-4000-8000-000000000081',
  'a8130000-0000-4000-8000-000000000080',
  'a8130000-0000-4000-8000-000000000001',
  'home'
);

select throws_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'disabled chat must not queue',
      'a8130000-0000-4000-8000-000000000010'
    )
  $$,
  'P0001',
  'LINE_CHAT_DISABLED',
  'chat cannot be enqueued while the clinic feature is disabled'
);

select is(
  (
    select count(*)
    from public.line_messages
    where text_content = 'disabled chat must not queue'
  ),
  0::bigint,
  'disabled chat enqueue leaves no partial message'
);

update public.clinic_feature_flags
set line_chat_enabled = true
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'feature disabled after enqueue',
      'a8130000-0000-4000-8000-000000000010'
    )
  $$,
  'a message can be queued before the clinic disables chat'
);

update public.clinic_feature_flags
set line_chat_enabled = false
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)
    from public.claim_line_chat_outbox(
      'a8130000-0000-4000-8000-000000000001',
      20
    )
  ),
  0::bigint,
  'claim returns no deliveries after the clinic disables chat'
);

select ok(
  (
    select message.status = 'failed'
      and outbox.status = 'failed'
      and outbox.last_error_code = 'line_chat_disabled'
    from public.line_messages message
    join public.line_chat_outbox outbox on outbox.message_id = message.id
    where message.text_content = 'feature disabled after enqueue'
  ),
  'disabling chat atomically terminates the pending message and delivery'
);

update public.clinic_feature_flags
set line_chat_enabled = true
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'message state drift before claim',
      'a8130000-0000-4000-8000-000000000010'
    )
  $$,
  'a message can be queued before sendability state changes'
);

update public.line_messages
set status = 'failed'
where text_content = 'message state drift before claim';

select is(
  (
    select count(*)
    from public.claim_line_chat_outbox(
      'a8130000-0000-4000-8000-000000000001',
      20
    )
  ),
  0::bigint,
  'claim skips a message that is no longer queued'
);

select is(
  (
    select outbox.last_error_code
    from public.line_messages message
    join public.line_chat_outbox outbox on outbox.message_id = message.id
    where message.text_content = 'message state drift before claim'
  ),
  'message_not_sendable',
  'a sendability mismatch is terminated fail-closed before delivery'
);

select is(
  (
    select status
    from public.line_messages
    where text_content = 'message state drift before claim'
  ),
  'failed',
  'a chat sendability mismatch terminally fails the message with its outbox'
);

update public.clinic_feature_flags
set line_notification_enabled = false
where clinic_id = 'a8130000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    insert into public.line_message_outbox (
      clinic_id, customer_id, line_user_id, message_type, payload, status
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000021',
      'U-line-foundation-current',
      'outreach',
      '{"text":"notification disabled"}'::jsonb,
      'pending'
    )
  $$,
  'P0001',
  'LINE_NOTIFICATION_DISABLED_OR_UNCONFIGURED',
  'reservation and CRM notifications cannot enqueue while the clinic feature is disabled'
);

select throws_ok(
  $$
    select public.claim_line_chat_outbox(
      'a8130000-0000-4000-8000-000000000001',
      null
    )
  $$,
  '22023',
  'LINE_CHAT_CLAIM_LIMIT_INVALID',
  'a null claim limit is rejected instead of claiming the full queue'
);

select throws_ok(
  $$
    insert into public.line_messages (
      clinic_id, conversation_id, contact_id, credential_generation_id, webhook_event_id, direction,
      message_type, text_content, status, occurred_at
    ) values (
      'a8130000-0000-4000-8000-000000000002',
      'a8130000-0000-4000-8000-000000000041',
      'a8130000-0000-4000-8000-000000000031',
      'a8130000-0000-4000-8000-000000000071',
      null,
      'system',
      'text',
      'cross clinic text',
      'received',
      now()
    )
  $$,
  '23503',
  null,
  'a message cannot reference another clinic conversation'
);

select throws_ok(
  $$
    insert into public.clinic_line_chat_settings (
      clinic_id, retention_days
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      366
    )
  $$,
  '23514',
  null,
  'retention above 365 days is rejected'
);

select throws_ok(
  $$
    insert into public.clinic_line_setup_sessions (
      clinic_id, created_by, encrypted_private_jwk, public_jwk,
      credential_fingerprint, expires_at
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000010',
      'encrypted-private-jwk',
      '{"kty":"RSA"}'::jsonb,
      'fingerprint-too-long',
      now() + interval '25 hours'
    )
  $$,
  '23514',
  null,
  'setup sessions longer than 24 hours are rejected'
);

select throws_ok(
  $$
    insert into public.clinic_line_setup_sessions (
      clinic_id, created_by, encrypted_private_jwk, public_jwk,
      credential_fingerprint, status, verified_at
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000010',
      'encrypted-private-jwk',
      '{"kty":"RSA"}'::jsonb,
      'fingerprint-unbound-kid',
      'verified',
      now()
    )
  $$,
  '23514',
  null,
  'a verified setup session requires the KID registered for its public key'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk, public_jwk,
  credential_fingerprint, created_at, expires_at
)
values (
  'a8130000-0000-4000-8000-000000000051',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000010',
  'encrypted-private-jwk',
  '{"kty":"RSA"}'::jsonb,
  'fingerprint-expiring',
  now() - interval '2 hours',
  now() - interval '1 hour'
);

select is(
  public.expire_line_setup_sessions(
    'a8130000-0000-4000-8000-000000000001'
  ),
  1,
  'expiry maintenance processes the targeted setup session'
);

select is(
  (
    select status
    from public.clinic_line_setup_sessions
    where id = 'a8130000-0000-4000-8000-000000000051'
  ),
  'expired',
  'expiry maintenance marks the setup session expired'
);

select is(
  (
    select encrypted_private_jwk
    from public.clinic_line_setup_sessions
    where id = 'a8130000-0000-4000-8000-000000000051'
  ),
  null,
  'expiry maintenance wipes the encrypted private JWK'
);

select throws_ok(
  $$
    insert into public.line_messages (
      clinic_id, conversation_id, contact_id, credential_generation_id, webhook_event_id, direction, message_type, text_content,
      status, occurred_at
    ) values (
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      (
        select contact_id from public.line_conversations
        where id = 'a8130000-0000-4000-8000-000000000041'
      ),
      'a8130000-0000-4000-8000-000000000071',
      null,
      'inbound',
      'unsupported',
      'binary content must not be stored',
      'received',
      now()
    )
  $$,
  '23514',
  null,
  'unsupported messages cannot store content'
);

insert into public.line_messages (
  id, clinic_id, conversation_id, contact_id, credential_generation_id, direction, message_type,
  text_content, status, occurred_at, created_at
)
values (
  'a8130000-0000-4000-8000-000000000061',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000041',
  (
    select contact_id from public.line_conversations
    where id = 'a8130000-0000-4000-8000-000000000041'
  ),
  'a8130000-0000-4000-8000-000000000071',
  'system',
  'text',
  'old text',
  'received',
  now() - interval '91 days',
  now() - interval '91 days'
);

select is(
  (
    select deleted_messages
    from public.purge_expired_line_chat_data(
      'a8130000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'missing clinic settings use the fail-closed 90-day retention default'
);

select is(
  (
    select count(*)
    from public.line_messages
    where id = 'a8130000-0000-4000-8000-000000000061'
  ),
  0::bigint,
  'retention maintenance removes the expired message'
);

insert into public.line_messages (
  id, clinic_id, conversation_id, contact_id, credential_generation_id, direction, message_type,
  text_content, status, occurred_at
)
values (
  'a8130000-0000-4000-8000-000000000062',
  'a8130000-0000-4000-8000-000000000001',
  'a8130000-0000-4000-8000-000000000041',
  (
    select contact_id from public.line_conversations
    where id = 'a8130000-0000-4000-8000-000000000041'
  ),
  'a8130000-0000-4000-8000-000000000071',
  'outbound',
  'text',
  'to be unsent',
  'queued',
  now()
);

update public.line_messages
set text_content = null, status = 'unsent', unsent_at = now()
where id = 'a8130000-0000-4000-8000-000000000062';

select is(
  (
    select text_content
    from public.line_messages
    where id = 'a8130000-0000-4000-8000-000000000062'
  ),
  null,
  'unsend clears the stored text content'
);

select throws_ok(
  $$
    insert into public.line_chat_outbox (
      clinic_id, conversation_id, message_id, credential_generation_id
    ) values (
      'a8130000-0000-4000-8000-000000000002',
      'a8130000-0000-4000-8000-000000000041',
      'a8130000-0000-4000-8000-000000000062',
      'a8130000-0000-4000-8000-000000000071'
    )
  $$,
  '23514',
  null,
  'chat outbox cannot cross the conversation clinic boundary'
);

update public.line_messages
set text_content = 'safe recipient is derived', status = 'queued', unsent_at = null
where id = 'a8130000-0000-4000-8000-000000000062';

select throws_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'must not be partially queued',
      'a8130000-0000-4000-8000-000000000099'
    )
  $$,
  '42501',
  null,
  'a sender without clinic membership cannot enqueue chat'
);

select is(
  (
    select count(*)
    from public.line_messages
    where text_content = 'must not be partially queued'
  ),
  0::bigint,
  'a rejected enqueue leaves no partial message'
);

select lives_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'atomically queued tenant-bound message',
      'a8130000-0000-4000-8000-000000000010'
    )
  $$,
  'a valid clinic member can atomically enqueue chat'
);

select is(
  (
    select count(*)
    from public.line_messages message
    join public.line_chat_outbox outbox
      on outbox.message_id = message.id
     and outbox.clinic_id = message.clinic_id
     and outbox.conversation_id = message.conversation_id
    where message.text_content = 'atomically queued tenant-bound message'
      and message.credential_generation_id = 'a8130000-0000-4000-8000-000000000071'
  ),
  1::bigint,
  'enqueue creates exactly one linked message and outbox row'
);

select is(
  (
    select contact.line_user_id
    from public.line_messages message
    join public.line_chat_outbox outbox
      on outbox.message_id = message.id
    join public.line_conversations conversation
      on conversation.id = outbox.conversation_id
     and conversation.clinic_id = outbox.clinic_id
    join public.line_contacts contact
      on contact.id = conversation.contact_id
     and contact.clinic_id = conversation.clinic_id
    where message.text_content = 'atomically queued tenant-bound message'
  ),
  'U-line-foundation-current',
  'outbox recipient is derived from the bound conversation contact'
);

create temporary table line_claim_result on commit drop as
select *
from public.claim_line_chat_outbox(
  'a8130000-0000-4000-8000-000000000001',
  20
);

select lives_ok(
  $$
    select public.finalize_line_chat_outbox(
      'a8130000-0000-4000-8000-000000000001',
      claim.outbox_id,
      claim.claim_token,
      true,
      'line-message-success',
      null
    )
    from line_claim_result claim
    where claim.text_content = 'atomically queued tenant-bound message'
  $$,
  'claimed delivery atomically finalizes message and outbox state'
);

select is(
  (
    select count(*)
    from public.line_chat_outbox outbox
    join public.line_messages message on message.id = outbox.message_id
    where message.text_content = 'atomically queued tenant-bound message'
      and message.status = 'sent'
      and outbox.status = 'sent'
      and outbox.attempts = 1
      and outbox.sent_at is not null
  ),
  1::bigint,
  'atomic delivery finalization persists message and outbox metadata'
);

select lives_ok(
  $$
    select public.enqueue_line_chat_message(
      'a8130000-0000-4000-8000-000000000001',
      'a8130000-0000-4000-8000-000000000041',
      'reclaim expired delivery lease',
      'a8130000-0000-4000-8000-000000000010'
    )
  $$,
  'a second message can be queued for lease recovery coverage'
);

create temporary table line_stale_claim_initial on commit drop as
select *
from public.claim_line_chat_outbox(
  'a8130000-0000-4000-8000-000000000001',
  20
)
where text_content = 'reclaim expired delivery lease';

update public.line_chat_outbox outbox
set claimed_at = statement_timestamp() - interval '6 minutes'
from line_stale_claim_initial initial_claim
where outbox.id = initial_claim.outbox_id;

create temporary table line_stale_claim_recovered on commit drop as
select *
from public.claim_line_chat_outbox(
  'a8130000-0000-4000-8000-000000000001',
  20
)
where text_content = 'reclaim expired delivery lease';

select ok(
  (
    select recovered.claim_token <> initial_claim.claim_token
      and outbox.status = 'processing'
      and outbox.attempts = 1
    from line_stale_claim_initial initial_claim
    join line_stale_claim_recovered recovered
      on recovered.outbox_id = initial_claim.outbox_id
    join public.line_chat_outbox outbox on outbox.id = recovered.outbox_id
  ),
  'an expired processing lease is retried with a new claim token'
);

select throws_ok(
  $$
    update public.line_chat_outbox outbox
    set clinic_id = 'a8130000-0000-4000-8000-000000000002'
    from public.line_messages message
    where outbox.message_id = message.id
      and message.text_content = 'atomically queued tenant-bound message'
  $$,
  '23514',
  null,
  'changing an outbox identity key revalidates the message contract'
);

select * from finish();

rollback;
