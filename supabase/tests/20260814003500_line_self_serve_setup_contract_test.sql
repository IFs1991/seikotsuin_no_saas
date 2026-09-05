begin;
select plan(68);

select has_column(
  'public',
  'clinic_line_setup_sessions',
  'encrypted_verification_payload',
  'verified setup draft has encrypted short-term storage'
);

select has_column(
  'public',
  'clinic_line_setup_sessions',
  'verification_request_digest',
  'setup session binds retries to one verification request digest'
);

select has_column(
  'public',
  'clinic_line_setup_sessions',
  'provider_identity_verified',
  'setup session records provider-bound identity verification'
);

select has_column(
  'public',
  'clinic_line_credentials',
  'provider_identity_verified_at',
  'active credentials record provider-bound identity verification time'
);

select has_function(
  'public',
  'claim_line_setup_verification',
  array['uuid', 'uuid'],
  'verification claim RPC exists'
);

select has_function(
  'public',
  'bind_line_setup_push_request',
  array['uuid', 'uuid', 'uuid', 'text'],
  'push request binding RPC exists'
);

select has_function(
  'public',
  'finalize_line_setup_verification',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'boolean'],
  'verification finalize RPC exists'
);

select has_function(
  'public',
  'update_line_feature_settings',
  array['uuid', 'boolean', 'boolean', 'uuid'],
  'clinic feature update RPC exists'
);

select has_function(
  'public',
  'complete_line_self_serve_setup',
  array['uuid', 'uuid', 'uuid', 'jsonb', 'uuid', 'boolean', 'boolean'],
  'atomic setup completion RPC exists'
);

select has_function(
  'public',
  'update_line_chat_settings',
  array['uuid', 'boolean', 'text', 'integer', 'boolean', 'uuid'],
  'atomic LINE chat settings RPC exists'
);

select has_function(
  'public',
  'get_line_public_booking_context',
  array['uuid'],
  'atomic public LINE booking context RPC exists'
);

select function_privs_are(
  'public',
  'complete_line_self_serve_setup',
  array['uuid', 'uuid', 'uuid', 'jsonb', 'uuid', 'boolean', 'boolean'],
  'service_role',
  array['EXECUTE'],
  'service_role can complete setup'
);

select function_privs_are(
  'public',
  'complete_line_self_serve_setup',
  array['uuid', 'uuid', 'uuid', 'jsonb', 'uuid', 'boolean', 'boolean'],
  'anon',
  array[]::text[],
  'anon cannot complete setup'
);

select function_privs_are(
  'public',
  'complete_line_self_serve_setup',
  array['uuid', 'uuid', 'uuid', 'jsonb', 'uuid', 'boolean', 'boolean'],
  'authenticated',
  array[]::text[],
  'authenticated cannot complete setup'
);

select function_privs_are(
  'public',
  'update_line_chat_settings',
  array['uuid', 'boolean', 'text', 'integer', 'boolean', 'uuid'],
  'service_role',
  array['EXECUTE'],
  'service_role can update chat settings'
);

select function_privs_are(
  'public',
  'update_line_chat_settings',
  array['uuid', 'boolean', 'text', 'integer', 'boolean', 'uuid'],
  'anon',
  array[]::text[],
  'anon cannot update chat settings'
);

select function_privs_are(
  'public',
  'update_line_chat_settings',
  array['uuid', 'boolean', 'text', 'integer', 'boolean', 'uuid'],
  'authenticated',
  array[]::text[],
  'authenticated cannot update chat settings'
);

select function_privs_are(
  'public',
  'get_line_public_booking_context',
  array['uuid'],
  'service_role',
  array['EXECUTE'],
  'service_role can read the atomic public booking context'
);

select function_privs_are(
  'public',
  'get_line_public_booking_context',
  array['uuid'],
  'anon',
  array[]::text[],
  'anon cannot read the internal public booking context RPC'
);

select function_privs_are(
  'public',
  'get_line_public_booking_context',
  array['uuid'],
  'authenticated',
  array[]::text[],
  'authenticated cannot read the internal public booking context RPC'
);

select is(
  (
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = 'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'::regprocedure
  ),
  false,
  'setup completion remains security invoker'
);

select is(
  (
    select config
    from pg_proc procedure,
      unnest(procedure.proconfig) config
    where procedure.oid = 'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'::regprocedure
      and config like 'search_path=%'
  ),
  'search_path=pg_catalog, public',
  'setup completion fixes its search path'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.clinic_line_setup_sessions'::regclass
      and trigger_data.tgname = 'wipe_line_setup_session_secrets_trigger'
      and not trigger_data.tgisinternal
  ),
  'terminal setup sessions wipe short-term secrets'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_payload_lifecycle'
  ),
  'verified setup sessions require the encrypted verification draft'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_claim_lifecycle'
  ),
  'verification claim token and timestamp have an exact lifecycle constraint'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_request_digest_format'
  ),
  'verification request digest has an exact SHA-256 format constraint'
);

select ok(
  not exists (
    select 1
    from pg_proc function_data
    cross join lateral aclexplode(
      coalesce(function_data.proacl, acldefault('f', function_data.proowner))
    ) acl_entry
    where function_data.oid = any (array[
      'public.wipe_line_setup_session_secrets()'::regprocedure::oid,
      'public.claim_line_setup_verification(uuid,uuid)'::regprocedure::oid,
      'public.bind_line_setup_push_request(uuid,uuid,uuid,text)'::regprocedure::oid,
      'public.release_line_setup_verification_claim(uuid,uuid,uuid)'::regprocedure::oid,
      'public.finalize_line_setup_verification(uuid,uuid,uuid,text,text,boolean)'::regprocedure::oid,
      'public.update_line_feature_settings(uuid,boolean,boolean,uuid)'::regprocedure::oid,
      'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'::regprocedure::oid,
      'public.update_line_chat_settings(uuid,boolean,text,integer,boolean,uuid)'::regprocedure::oid,
      'public.get_line_public_booking_context(uuid)'::regprocedure::oid
    ])
      and acl_entry.privilege_type = 'EXECUTE'
      and acl_entry.grantee <> function_data.proowner
      and (
        pg_get_userbyid(acl_entry.grantee) <> 'service_role'
        or acl_entry.is_grantable
      )
  ),
  'setup functions have only non-grantable service_role EXECUTE'
);

insert into public.clinics (id, name)
values ('a8140000-0000-4000-8000-000000000001', '__line_setup_clinic__');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, aud, role
)
values (
  'a8140000-0000-4000-8000-000000000010',
  'line-setup@example.invalid',
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  encrypted_verification_payload, public_jwk, credential_fingerprint,
  provider_identity_verified, public_key_kid, status, verified_at
)
values (
  'a8140000-0000-4000-8000-000000000020',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk',
  'encrypted-verification-draft',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture"}'::jsonb,
  'setup-fingerprint-a814',
  true,
  'setup-kid-a814',
  'verified',
  now()
);

set local role service_role;

select lives_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000020',
    'a8140000-0000-4000-8000-000000000030',
    '{
      "messaging_channel_id":"messaging-a814",
      "channel_secret_encrypted":"encrypted-channel-secret",
      "access_token_encrypted":"encrypted-access-token",
      "token_expires_at":"2026-09-01T00:00:00Z",
      "access_token_key_id":"token-key-a814",
      "bot_user_id":"U00000000000000000000000000000001",
      "bot_display_name":"Setup Bot",
      "oa_basic_id":"@setupbot",
      "app_type":"mini_app",
      "app_endpoint_id":"endpoint-a814",
      "liff_id":"2000000000-AbCdEfGh",
      "login_channel_id":"login-a814"
    }'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    true,
    true
  )$$,
  'first-time setup completes atomically'
);

select is(
  (
    select credentials.credential_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'a8140000-0000-4000-8000-000000000030'::uuid,
  'credential uses the verified setup generation'
);

select is(
  (
    select credentials.bot_display_name
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'Setup Bot',
  'verified bot metadata is stored'
);

select ok(
  (
    select credentials.provider_identity_verified_at is not null
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'provider-bound identity verification is promoted to active credentials'
);

select is(
  (
    select setup_session.status
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000020'
  ),
  'consumed',
  'completed setup session is consumed'
);

select ok(
  (
    select setup_session.encrypted_private_jwk is null
      and setup_session.encrypted_verification_payload is null
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000020'
  ),
  'completed setup wipes both short-term secrets'
);

select ok(
  (
    select feature_flags.line_booking_enabled
      and feature_flags.line_notification_enabled
      and not feature_flags.line_chat_enabled
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'requested booking and notification flags enable while chat stays off'
);

select is(
  (
    select row_to_json(public_context)::jsonb
    from public.get_line_public_booking_context(
      'a8140000-0000-4000-8000-000000000001'
    ) public_context
  ),
  jsonb_build_object(
    'line_booking_enabled', true,
    'credential_generation_id', 'a8140000-0000-4000-8000-000000000030',
    'is_active', true,
    'liff_id', '2000000000-AbCdEfGh',
    'login_channel_id', 'login-a814',
    'oa_basic_id', '@setupbot',
    'provider_identity_verified_at', (
      select to_jsonb(credentials.provider_identity_verified_at)
      from public.clinic_line_credentials credentials
      where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
    )
  ),
  'public booking context returns feature and credential state from one snapshot'
);

select is(
  (
    select settings.retention_days
    from public.clinic_line_chat_settings settings
    where settings.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  90,
  'completion creates default chat settings'
);

select throws_ok(
  $$select public.update_line_chat_settings(
    'a8140000-0000-4000-8000-000000000001',
    true,
    '受付しました',
    60,
    true,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'P0001',
  'LINE_CHAT_WEBHOOK_NOT_VERIFIED',
  'chat cannot enable before webhook verification'
);

select is(
  (
    select settings.retention_days
    from public.clinic_line_chat_settings settings
    where settings.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  90,
  'failed enable keeps chat settings unchanged'
);

select lives_ok(
  $$select public.update_line_chat_settings(
    'a8140000-0000-4000-8000-000000000001',
    true,
    '受付しました',
    60,
    false,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'chat settings save while chat remains disabled'
);

select is(
  (
    select settings.retention_days
    from public.clinic_line_chat_settings settings
    where settings.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  60,
  'chat retention updates within the clinic scope'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  public_jwk, credential_fingerprint
)
values (
  'a8140000-0000-4000-8000-000000000060',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-claim',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-claim"}'::jsonb,
  'setup-fingerprint-a814-claim'
);

create temporary table first_verification_claim on commit drop as
select *
from public.claim_line_setup_verification(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000060'
);

select throws_ok(
  $$select public.claim_line_setup_verification(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000060'
  )$$,
  'P0001',
  'LINE_SETUP_VERIFICATION_IN_PROGRESS',
  'a concurrent setup verification cannot start before the claim lease expires'
);

select lives_ok(
  $$select public.release_line_setup_verification_claim(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000060',
    (select claim_token from first_verification_claim)
  )$$,
  'failed external verification can release its exact claim'
);

create temporary table second_verification_claim on commit drop as
select *
from public.claim_line_setup_verification(
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000060'
);

select lives_ok(
  $$select public.bind_line_setup_push_request(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000060',
    (select claim_token from second_verification_claim),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )$$,
  'the verified push recipient and message are bound immediately before push'
);

select throws_ok(
  $$select public.bind_line_setup_push_request(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000060',
    (select claim_token from second_verification_claim),
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )$$,
  'P0001',
  'LINE_SETUP_PUSH_REQUEST_CHANGED',
  'a stable retry key cannot be reused for another push recipient or message'
);

select is(
  (select push_test_retry_key from second_verification_claim),
  (select push_test_retry_key from first_verification_claim),
  'verification retry reuses the stable LINE retry key'
);

select lives_ok(
  $$select public.finalize_line_setup_verification(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000060',
    (select claim_token from second_verification_claim),
    'setup-kid-a814-claim',
    'encrypted-verification-draft-claim',
    true
  )$$,
  'the current claim atomically finalizes provider-bound verification'
);

select ok(
  (
    select setup_session.status = 'verified'
      and setup_session.provider_identity_verified
      and setup_session.verification_claim_token is null
      and setup_session.verification_claimed_at is null
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000060'
  ),
  'verification finalize records identity and clears its claim lease'
);

update public.clinic_line_setup_sessions
set status = 'revoked'
where id = 'a8140000-0000-4000-8000-000000000060';

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk, public_jwk,
  credential_fingerprint, verification_claim_token, verification_claimed_at,
  created_at, expires_at
)
values (
  'a8140000-0000-4000-8000-000000000061',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-expired',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-expired"}'::jsonb,
  'setup-fingerprint-a814-expired',
  'a8140000-0000-4000-8000-000000000062',
  now() - interval '2 hours',
  now() - interval '25 hours',
  now() - interval '1 hour'
);

select lives_ok(
  $$select public.expire_line_setup_sessions(null)$$,
  'global maintenance expires abandoned setup sessions'
);

select ok(
  (
    select setup_session.status = 'expired'
      and setup_session.encrypted_private_jwk is null
      and setup_session.encrypted_verification_payload is null
      and setup_session.verification_claim_token is null
      and setup_session.verification_claimed_at is null
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000061'
  ),
  'expiry wipes all setup secrets and claim material'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  encrypted_verification_payload, public_jwk, credential_fingerprint,
  public_key_kid, status, verified_at
)
values (
  'a8140000-0000-4000-8000-000000000063',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-unbound',
  'encrypted-verification-draft-unbound',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-unbound"}'::jsonb,
  'setup-fingerprint-a814-unbound',
  'setup-kid-a814-unbound',
  'verified',
  now()
);

select throws_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000063',
    'a8140000-0000-4000-8000-000000000064',
    '{"messaging_channel_id":"unbound","login_channel_id":"login-unbound","app_type":"mini_app","app_endpoint_id":"endpoint-unbound","liff_id":"2000000000-Unbound","channel_secret_encrypted":"secret","access_token_encrypted":"token","token_expires_at":"2026-09-02T00:00:00Z","bot_user_id":"U00000000000000000000000000000006","bot_display_name":"Unbound"}'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    true,
    false
  )$$,
  'P0001',
  'LINE_BOOKING_IDENTITY_NOT_VERIFIED',
  'booking activation fails closed without provider-bound identity verification'
);

select is(
  (
    select credentials.credential_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'a8140000-0000-4000-8000-000000000030'::uuid,
  'failed booking activation leaves the active provider generation unchanged'
);

update public.clinic_line_setup_sessions
set status = 'revoked'
where id = 'a8140000-0000-4000-8000-000000000063';

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  encrypted_verification_payload, public_jwk, credential_fingerprint,
  public_key_kid, status, verified_at
)
values (
  'a8140000-0000-4000-8000-000000000040',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-rotation',
  'encrypted-verification-draft-rotation',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-rotation"}'::jsonb,
  'setup-fingerprint-a814-rotation',
  'setup-kid-a814-rotation',
  'verified',
  now()
);

select lives_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000040',
    'a8140000-0000-4000-8000-000000000031',
    '{
      "messaging_channel_id":"messaging-a814-rotated",
      "channel_secret_encrypted":"encrypted-channel-secret-rotated",
      "access_token_encrypted":"encrypted-access-token-rotated",
      "token_expires_at":"2026-09-02T00:00:00Z",
      "access_token_key_id":"token-key-a814-rotated",
      "bot_user_id":"U00000000000000000000000000000002",
      "bot_display_name":"Rotated Setup Bot",
      "oa_basic_id":"@rotatedbot",
      "app_type":"mini_app",
      "app_endpoint_id":"endpoint-a814-rotated",
      "login_channel_id":"login-a814-rotated"
    }'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    false,
    true
  )$$,
  'verified setup rotates an existing provider generation atomically'
);

select is(
  (
    select credentials.credential_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'a8140000-0000-4000-8000-000000000031'::uuid,
  'rotation installs the new verified generation'
);

select is(
  (
    select generation.status
    from public.clinic_line_credential_generations generation
    where generation.clinic_id = 'a8140000-0000-4000-8000-000000000001'
      and generation.id = 'a8140000-0000-4000-8000-000000000030'
  ),
  'replaced',
  'rotation marks the previous generation replaced'
);

select is(
  (
    select setup_session.status
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000040'
  ),
  'consumed',
  'rotation consumes its verified setup session'
);

select throws_ok(
  $$select public.update_line_feature_settings(
    'a8140000-0000-4000-8000-000000000001',
    true,
    true,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'P0001',
  'LINE_BOOKING_IDENTITY_NOT_VERIFIED',
  'feature settings cannot bypass provider-bound booking verification'
);

update public.clinic_line_credentials
set provider_identity_verified_at = now()
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.update_line_feature_settings(
    'a8140000-0000-4000-8000-000000000001',
    true,
    true,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'P0001',
  'LINE_BOOKING_IDENTITY_NOT_VERIFIED',
  'booking activation also requires execution LIFF and Login metadata'
);

update public.clinic_line_credentials
set is_active = false
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.update_line_feature_settings(
    'a8140000-0000-4000-8000-000000000001',
    false,
    false,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'both LINE features can always be safely disabled without active credentials'
);

select ok(
  (
    select not feature_flags.line_booking_enabled
      and not feature_flags.line_notification_enabled
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'safe disable atomically clears both LINE feature flags'
);

update public.clinic_line_credentials
set
  is_active = true,
  provider_identity_verified_at = null
where clinic_id = 'a8140000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000040',
    'a8140000-0000-4000-8000-000000000032',
    '{"messaging_channel_id":"retry","channel_secret_encrypted":"secret","access_token_encrypted":"token","token_expires_at":"2026-09-02T00:00:00Z","bot_user_id":"U00000000000000000000000000000003","bot_display_name":"Retry"}'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    false,
    false
  )$$,
  'P0001',
  'LINE_SETUP_SESSION_NOT_VERIFIED',
  'consumed setup cannot be completed again'
);

insert into public.clinics (id, name)
values ('a8140000-0000-4000-8000-000000000002', '__line_setup_other_clinic__');

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  encrypted_verification_payload, public_jwk, credential_fingerprint,
  public_key_kid, status, verified_at
)
values (
  'a8140000-0000-4000-8000-000000000042',
  'a8140000-0000-4000-8000-000000000002',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-other',
  'encrypted-verification-draft-other',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-other"}'::jsonb,
  'setup-fingerprint-a814-other',
  'setup-kid-a814-other',
  'verified',
  now()
);

select throws_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000042',
    'a8140000-0000-4000-8000-000000000043',
    '{"messaging_channel_id":"other","channel_secret_encrypted":"secret","access_token_encrypted":"token","token_expires_at":"2026-09-02T00:00:00Z","bot_user_id":"U00000000000000000000000000000004","bot_display_name":"Other"}'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    false,
    false
  )$$,
  'P0001',
  'LINE_SETUP_SESSION_NOT_VERIFIED',
  'another clinic setup session cannot complete this clinic'
);

select is(
  (
    select count(*)::integer
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000002'
  ),
  0,
  'cross-clinic completion leaves the other clinic without partial credentials'
);

insert into public.clinic_line_setup_sessions (
  id, clinic_id, created_by, encrypted_private_jwk,
  encrypted_verification_payload, public_jwk, credential_fingerprint,
  public_key_kid, status, verified_at
)
values (
  'a8140000-0000-4000-8000-000000000050',
  'a8140000-0000-4000-8000-000000000001',
  'a8140000-0000-4000-8000-000000000010',
  'encrypted-private-jwk-failure',
  'encrypted-verification-draft-failure',
  '{"kty":"RSA","alg":"RS256","use":"sig","e":"AQAB","n":"fixture-failure"}'::jsonb,
  'setup-fingerprint-a814-failure',
  'setup-kid-a814-failure',
  'verified',
  now()
);

select throws_ok(
  $$select public.complete_line_self_serve_setup(
    'a8140000-0000-4000-8000-000000000001',
    'a8140000-0000-4000-8000-000000000050',
    'a8140000-0000-4000-8000-000000000051',
    '{"messaging_channel_id":"failure","channel_secret_encrypted":"secret","access_token_encrypted":"token","token_expires_at":"not-a-timestamp","bot_user_id":"U00000000000000000000000000000005","bot_display_name":"Failure"}'::jsonb,
    'a8140000-0000-4000-8000-000000000010',
    false,
    false
  )$$,
  '22007',
  null,
  'a late credential write failure rolls the provider rotation back'
);

select is(
  (
    select credentials.credential_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'a8140000-0000-4000-8000-000000000031'::uuid,
  'failed completion retains the previously active generation'
);

select is(
  (
    select setup_session.status
    from public.clinic_line_setup_sessions setup_session
    where setup_session.id = 'a8140000-0000-4000-8000-000000000050'
  ),
  'verified',
  'failed completion retains the verified session for correction'
);

update public.clinic_line_setup_sessions setup_session
set status = 'revoked'
where setup_session.id = 'a8140000-0000-4000-8000-000000000050';

update public.clinic_line_credentials credentials
set webhook_verified_at = now()
where credentials.clinic_id = 'a8140000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.update_line_chat_settings(
    'a8140000-0000-4000-8000-000000000001',
    true,
    'Webhook確認済みです',
    45,
    true,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'verified current generation can enable chat'
);

select ok(
  (
    select feature_flags.line_chat_enabled
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = 'a8140000-0000-4000-8000-000000000001'
  ),
  'verified current generation enables the clinic chat flag'
);

select throws_ok(
  $$select public.update_line_chat_settings(
    'a8140000-0000-4000-8000-000000000002',
    true,
    '別店舗',
    45,
    true,
    'a8140000-0000-4000-8000-000000000010'
  )$$,
  'P0001',
  'LINE_CHAT_WEBHOOK_NOT_VERIFIED',
  'a clinic without verified current credentials cannot enable chat'
);

reset role;
select * from finish();
rollback;
