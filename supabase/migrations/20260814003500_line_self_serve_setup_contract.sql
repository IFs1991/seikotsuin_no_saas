-- Spec: docs/stabilization/spec-line-self-serve-integration-v0.4.md
-- PR2: atomically complete a verified clinic-scoped LINE setup session.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local search_path = pg_catalog, public, auth, extensions;

alter table public.clinic_line_setup_sessions
  add column if not exists encrypted_verification_payload text,
  add column if not exists provider_identity_verified boolean not null default false,
  add column if not exists verification_claim_token uuid,
  add column if not exists verification_claimed_at timestamptz,
  add column if not exists verification_request_digest text,
  add column if not exists push_test_retry_key uuid not null default gen_random_uuid();

alter table public.clinic_line_credentials
  add column if not exists provider_identity_verified_at timestamptz;

update public.clinic_feature_flags feature_flags
set line_booking_enabled = false
from public.clinic_line_credentials credentials
where credentials.clinic_id = feature_flags.clinic_id
  and credentials.provider_identity_verified_at is null;

-- PR1/CRM added clinic-scoped FKs after the commercial FK-index inventory was
-- frozen. Cover every new referencing key so deletes/rotations cannot require
-- tenant-wide table scans.
create index if not exists customers_line_generation_idx
  on public.customers (clinic_id, line_credential_generation_id);
create index if not exists line_message_outbox_customer_clinic_idx
  on public.line_message_outbox (customer_id, clinic_id);
create index if not exists line_message_outbox_generation_idx
  on public.line_message_outbox (clinic_id, credential_generation_id);
create index if not exists patient_identity_aliases_customer_clinic_idx
  on public.patient_identity_aliases (customer_id, clinic_id);
create index if not exists patient_staff_preferences_customer_clinic_idx
  on public.patient_staff_preferences (customer_id, clinic_id);
create index if not exists patient_staff_preferences_staff_clinic_idx
  on public.patient_staff_preferences (staff_id, clinic_id);
create index if not exists reservation_rewards_reservation_clinic_idx
  on public.reservation_rewards (reservation_id, clinic_id);
create index if not exists staff_availability_events_created_by_idx
  on public.staff_availability_events (created_by);
create index if not exists staff_availability_events_staff_clinic_idx
  on public.staff_availability_events (staff_id, clinic_id);
create index if not exists staff_availability_notifications_customer_clinic_idx
  on public.staff_availability_notifications (customer_id, clinic_id);
create index if not exists staff_availability_notifications_event_clinic_idx
  on public.staff_availability_notifications (availability_event_id, clinic_id);
create index if not exists staff_availability_notifications_outbox_clinic_idx
  on public.staff_availability_notifications (line_outbox_id, clinic_id);
create index if not exists staff_availability_notifications_reservation_clinic_idx
  on public.staff_availability_notifications (booked_reservation_id, clinic_id);
create index if not exists clinic_line_chat_settings_updated_by_idx
  on public.clinic_line_chat_settings (updated_by);
create index if not exists clinic_line_setup_sessions_created_by_idx
  on public.clinic_line_setup_sessions (created_by);
create index if not exists line_chat_outbox_clinic_idx
  on public.line_chat_outbox (clinic_id);
create index if not exists line_chat_outbox_conversation_clinic_idx
  on public.line_chat_outbox (
    conversation_id, clinic_id, credential_generation_id
  );
create index if not exists line_chat_outbox_message_conversation_idx
  on public.line_chat_outbox (
    message_id, clinic_id, conversation_id, credential_generation_id
  );
create index if not exists line_conversations_assignee_clinic_idx
  on public.line_conversations (assigned_membership_id, clinic_id);
create index if not exists line_conversations_contact_generation_idx
  on public.line_conversations (contact_id, clinic_id, credential_generation_id);
create index if not exists line_job_heartbeats_clinic_idx
  on public.line_job_heartbeats (clinic_id);
create index if not exists line_messages_conversation_contact_generation_idx
  on public.line_messages (
    conversation_id, clinic_id, contact_id, credential_generation_id
  );
create index if not exists line_messages_sent_by_idx
  on public.line_messages (sent_by);
create index if not exists line_messages_webhook_event_contact_idx
  on public.line_messages (
    webhook_event_id, clinic_id, contact_id, credential_generation_id
  );
create index if not exists line_webhook_events_contact_identity_idx
  on public.line_webhook_events (
    contact_id, clinic_id, credential_generation_id, line_user_id
  );
create index if not exists line_webhook_events_generation_idx
  on public.line_webhook_events (clinic_id, credential_generation_id);

-- PR1 could leave a verified-but-not-completed setup session. It cannot have
-- the newly encrypted verification draft, so fail closed instead of guessing
-- or retaining the private key beyond this upgrade.
update public.clinic_line_setup_sessions setup_session
set
  encrypted_private_jwk = null,
  encrypted_verification_payload = null,
  status = 'revoked'
where setup_session.status = 'verified'
  and setup_session.encrypted_verification_payload is null;

create or replace function public.wipe_line_setup_session_secrets()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.status in ('consumed', 'expired', 'revoked') then
    new.encrypted_private_jwk := null;
    new.encrypted_verification_payload := null;
    new.verification_claim_token := null;
    new.verification_claimed_at := null;
    new.verification_request_digest := null;
  end if;

  return new;
end
$function$;

create or replace function public.update_line_chat_settings(
  p_clinic_id uuid,
  p_auto_reply_enabled boolean,
  p_auto_reply_message text,
  p_retention_days integer,
  p_line_chat_enabled boolean,
  p_updated_by uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_clinic_id is null
    or p_updated_by is null
    or p_retention_days is null
    or p_retention_days not between 1 and 365
    or length(btrim(coalesce(p_auto_reply_message, ''))) not between 1 and 1000
  then
    raise exception 'LINE_CHAT_SETTINGS_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  if coalesce(p_line_chat_enabled, false) then
    perform 1
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = p_clinic_id
      and credentials.is_active
      and credentials.credentials_verified_at is not null
      and credentials.webhook_verified_at is not null
    for update;

    if not found then
      raise exception 'LINE_CHAT_WEBHOOK_NOT_VERIFIED'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.clinic_line_chat_settings (
    clinic_id,
    auto_reply_enabled,
    auto_reply_message,
    retention_days,
    updated_by
  ) values (
    p_clinic_id,
    coalesce(p_auto_reply_enabled, false),
    btrim(p_auto_reply_message),
    p_retention_days,
    p_updated_by
  )
  on conflict (clinic_id) do update
  set
    auto_reply_enabled = excluded.auto_reply_enabled,
    auto_reply_message = excluded.auto_reply_message,
    retention_days = excluded.retention_days,
    updated_by = excluded.updated_by;

  insert into public.clinic_feature_flags (
    clinic_id,
    line_chat_enabled,
    updated_by
  ) values (
    p_clinic_id,
    coalesce(p_line_chat_enabled, false),
    p_updated_by
  )
  on conflict (clinic_id) do update
  set
    line_chat_enabled = excluded.line_chat_enabled,
    updated_by = excluded.updated_by;
end
$function$;

drop trigger if exists wipe_line_setup_session_secrets_trigger
on public.clinic_line_setup_sessions;
create trigger wipe_line_setup_session_secrets_trigger
before insert or update of status
on public.clinic_line_setup_sessions
for each row execute function public.wipe_line_setup_session_secrets();

alter table public.clinic_line_setup_sessions
  drop constraint if exists clinic_line_setup_sessions_verification_payload_lifecycle;
alter table public.clinic_line_setup_sessions
  add constraint clinic_line_setup_sessions_verification_payload_lifecycle check (
    (
      status = 'prepared'
      and encrypted_verification_payload is null
    )
    or (
      status = 'verified'
      and encrypted_verification_payload is not null
      and length(btrim(encrypted_verification_payload)) > 0
    )
    or (
      status in ('consumed', 'expired', 'revoked')
      and encrypted_verification_payload is null
    )
  );

alter table public.clinic_line_setup_sessions
  drop constraint if exists clinic_line_setup_sessions_verification_claim_lifecycle;
alter table public.clinic_line_setup_sessions
  add constraint clinic_line_setup_sessions_verification_claim_lifecycle check (
    (verification_claim_token is null) = (verification_claimed_at is null)
    and (
      status = 'prepared'
      or (verification_claim_token is null and verification_claimed_at is null)
    )
  );

alter table public.clinic_line_setup_sessions
  drop constraint if exists clinic_line_setup_sessions_verification_request_digest_format;
alter table public.clinic_line_setup_sessions
  add constraint clinic_line_setup_sessions_verification_request_digest_format check (
    verification_request_digest is null
    or verification_request_digest ~ '^[0-9a-f]{64}$'
  );

comment on column public.clinic_line_setup_sessions.encrypted_verification_payload is
  'AES-256-GCM encrypted verified setup draft. Cleared when the session is consumed, expired, or revoked.';
comment on column public.clinic_line_setup_sessions.provider_identity_verified is
  'True only after a LINE Login ID token subject matches the Messaging API push-test recipient.';
comment on column public.clinic_line_setup_sessions.push_test_retry_key is
  'Stable LINE X-Line-Retry-Key used for every retry of this setup session push test.';
comment on column public.clinic_line_setup_sessions.verification_request_digest is
  'SHA-256 digest binding the stable retry key to one verified Provider/channel identity, recipient, and test message.';
comment on column public.clinic_line_credentials.provider_identity_verified_at is
  'Provider-bound LINE Login identity and Messaging API recipient were verified together before booking activation.';

create or replace function public.claim_line_setup_verification(
  p_clinic_id uuid,
  p_setup_session_id uuid
)
returns table (
  claim_token uuid,
  encrypted_private_jwk text,
  push_test_retry_key uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_session public.clinic_line_setup_sessions%rowtype;
  v_claim_token uuid := gen_random_uuid();
begin
  if p_clinic_id is null
    or p_setup_session_id is null
  then
    raise exception 'LINE_SETUP_VERIFICATION_CLAIM_INVALID'
      using errcode = '22023';
  end if;

  select setup_session.*
  into v_session
  from public.clinic_line_setup_sessions setup_session
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'prepared'
    and setup_session.expires_at > statement_timestamp()
  for update;

  if not found or v_session.encrypted_private_jwk is null then
    raise exception 'LINE_SETUP_SESSION_NOT_PREPARED'
      using errcode = 'P0001';
  end if;

  if v_session.verification_claim_token is not null
    and v_session.verification_claimed_at > statement_timestamp() - interval '5 minutes'
  then
    raise exception 'LINE_SETUP_VERIFICATION_IN_PROGRESS'
      using errcode = 'P0001';
  end if;

  update public.clinic_line_setup_sessions setup_session
  set
    verification_claim_token = v_claim_token,
    verification_claimed_at = statement_timestamp()
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id;

  return query select
    v_claim_token,
    v_session.encrypted_private_jwk,
    v_session.push_test_retry_key;
end
$function$;

create or replace function public.bind_line_setup_push_request(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_claim_token uuid,
  p_verification_request_digest text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_existing_digest text;
begin
  if p_clinic_id is null
    or p_setup_session_id is null
    or p_claim_token is null
    or p_verification_request_digest is null
    or p_verification_request_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception 'LINE_SETUP_PUSH_BIND_INVALID'
      using errcode = '22023';
  end if;

  select setup_session.verification_request_digest
  into v_existing_digest
  from public.clinic_line_setup_sessions setup_session
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'prepared'
    and setup_session.expires_at > statement_timestamp()
    and setup_session.verification_claim_token = p_claim_token
  for update;

  if not found then
    raise exception 'LINE_SETUP_VERIFICATION_CLAIM_LOST'
      using errcode = 'P0001';
  end if;

  if v_existing_digest is not null
    and v_existing_digest <> p_verification_request_digest
  then
    raise exception 'LINE_SETUP_PUSH_REQUEST_CHANGED'
      using errcode = 'P0001';
  end if;

  update public.clinic_line_setup_sessions setup_session
  set verification_request_digest = coalesce(
    setup_session.verification_request_digest,
    p_verification_request_digest
  )
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.verification_claim_token = p_claim_token;
end
$function$;

create or replace function public.release_line_setup_verification_claim(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_claim_token uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  update public.clinic_line_setup_sessions setup_session
  set
    verification_claim_token = null,
    verification_claimed_at = null
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'prepared'
    and setup_session.verification_claim_token = p_claim_token;
end
$function$;

create or replace function public.finalize_line_setup_verification(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_claim_token uuid,
  p_public_key_kid text,
  p_encrypted_verification_payload text,
  p_provider_identity_verified boolean
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_clinic_id is null
    or p_setup_session_id is null
    or p_claim_token is null
    or length(btrim(coalesce(p_public_key_kid, ''))) = 0
    or length(btrim(coalesce(p_encrypted_verification_payload, ''))) = 0
    or p_provider_identity_verified is null
  then
    raise exception 'LINE_SETUP_VERIFICATION_FINALIZE_INVALID'
      using errcode = '22023';
  end if;

  update public.clinic_line_setup_sessions setup_session
  set
    encrypted_verification_payload = p_encrypted_verification_payload,
    provider_identity_verified = p_provider_identity_verified,
    public_key_kid = btrim(p_public_key_kid),
    status = 'verified',
    verification_claim_token = null,
    verification_claimed_at = null,
    verified_at = statement_timestamp()
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'prepared'
    and setup_session.expires_at > statement_timestamp()
    and setup_session.verification_claim_token = p_claim_token;

  if not found then
    raise exception 'LINE_SETUP_VERIFICATION_CLAIM_LOST'
      using errcode = 'P0001';
  end if;
end
$function$;

create or replace function public.update_line_feature_settings(
  p_clinic_id uuid,
  p_enable_booking boolean,
  p_enable_notifications boolean,
  p_updated_by uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_provider_identity_verified_at timestamptz;
  v_liff_id text;
  v_login_channel_id text;
begin
  if p_clinic_id is null or p_updated_by is null then
    raise exception 'LINE_FEATURE_SETTINGS_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  if not coalesce(p_enable_booking, false)
    and not coalesce(p_enable_notifications, false)
  then
    insert into public.clinic_feature_flags (
      clinic_id,
      line_booking_enabled,
      line_notification_enabled,
      updated_by
    ) values (
      p_clinic_id,
      false,
      false,
      p_updated_by
    )
    on conflict (clinic_id) do update
    set
      line_booking_enabled = false,
      line_notification_enabled = false,
      updated_by = excluded.updated_by;
    return;
  end if;

  select
    credentials.provider_identity_verified_at,
    credentials.liff_id,
    credentials.login_channel_id
  into
    v_provider_identity_verified_at,
    v_liff_id,
    v_login_channel_id
  from public.clinic_line_credentials credentials
  where credentials.clinic_id = p_clinic_id
    and credentials.is_active
    and credentials.credentials_verified_at is not null
    and credentials.setup_completed_at is not null
  for update;

  if not found then
    raise exception 'LINE_CREDENTIALS_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  if coalesce(p_enable_booking, false)
    and (
      v_provider_identity_verified_at is null
      or length(btrim(coalesce(v_liff_id, ''))) = 0
      or length(btrim(coalesce(v_login_channel_id, ''))) = 0
    )
  then
    raise exception 'LINE_BOOKING_IDENTITY_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  insert into public.clinic_feature_flags (
    clinic_id,
    line_booking_enabled,
    line_notification_enabled,
    updated_by
  ) values (
    p_clinic_id,
    coalesce(p_enable_booking, false),
    coalesce(p_enable_notifications, false),
    p_updated_by
  )
  on conflict (clinic_id) do update
  set
    line_booking_enabled = excluded.line_booking_enabled,
    line_notification_enabled = excluded.line_notification_enabled,
    updated_by = excluded.updated_by;
end
$function$;

create or replace function public.complete_line_self_serve_setup(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_new_generation_id uuid,
  p_credentials jsonb,
  p_updated_by uuid,
  p_enable_booking boolean,
  p_enable_notifications boolean
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_existing_generation_id uuid;
  v_previous_generation_id uuid;
  v_session_fingerprint text;
  v_session_private_jwk text;
  v_session_kid text;
  v_provider_identity_verified boolean;
begin
  if p_clinic_id is null
    or p_setup_session_id is null
    or p_new_generation_id is null
    or p_updated_by is null
    or p_credentials is null
    or jsonb_typeof(p_credentials) <> 'object'
    or length(btrim(coalesce(p_credentials->>'messaging_channel_id', ''))) = 0
    or length(btrim(coalesce(p_credentials->>'channel_secret_encrypted', ''))) = 0
    or length(btrim(coalesce(p_credentials->>'access_token_encrypted', ''))) = 0
    or length(btrim(coalesce(p_credentials->>'bot_user_id', ''))) = 0
    or length(btrim(coalesce(p_credentials->>'bot_display_name', ''))) = 0
    or (
      coalesce(p_enable_booking, false)
      and (
        length(btrim(coalesce(p_credentials->>'login_channel_id', ''))) = 0
        or (
          coalesce(nullif(btrim(p_credentials->>'app_type'), ''), 'mini_app') = 'mini_app'
          and length(btrim(coalesce(p_credentials->>'app_endpoint_id', ''))) = 0
        )
        or length(btrim(coalesce(p_credentials->>'liff_id', ''))) = 0
      )
    )
  then
    raise exception 'LINE_SETUP_COMPLETION_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  select
    setup_session.credential_fingerprint,
    setup_session.encrypted_private_jwk,
    setup_session.public_key_kid,
    setup_session.provider_identity_verified
  into
    v_session_fingerprint,
    v_session_private_jwk,
    v_session_kid,
    v_provider_identity_verified
  from public.clinic_line_setup_sessions setup_session
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'verified'
    and setup_session.expires_at > statement_timestamp()
    and setup_session.encrypted_verification_payload is not null
  for update;

  if not found
    or length(btrim(coalesce(v_session_private_jwk, ''))) = 0
    or length(btrim(coalesce(v_session_kid, ''))) = 0
  then
    raise exception 'LINE_SETUP_SESSION_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  if coalesce(p_enable_booking, false)
    and not coalesce(v_provider_identity_verified, false)
  then
    raise exception 'LINE_BOOKING_IDENTITY_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  select credentials.credential_generation_id
  into v_existing_generation_id
  from public.clinic_line_credentials credentials
  where credentials.clinic_id = p_clinic_id
  for update;

  if v_existing_generation_id is not null then
    v_previous_generation_id := public.rotate_line_credential_generation(
      p_clinic_id,
      p_setup_session_id,
      p_new_generation_id,
      p_credentials,
      p_updated_by
    );
  else
    insert into public.clinic_line_credentials (
      clinic_id,
      credential_generation_id,
      liff_id,
      oa_basic_id,
      messaging_channel_id,
      login_channel_id,
      channel_secret_encrypted,
      assertion_private_key_encrypted,
      assertion_kid,
      credential_fingerprint,
      app_type,
      app_endpoint_id,
      provider_identity_verified_at,
      is_active,
      credentials_verified_at,
      setup_completed_at,
      updated_by
    ) values (
      p_clinic_id,
      p_new_generation_id,
      nullif(btrim(p_credentials->>'liff_id'), ''),
      nullif(btrim(p_credentials->>'oa_basic_id'), ''),
      p_credentials->>'messaging_channel_id',
      nullif(btrim(p_credentials->>'login_channel_id'), ''),
      p_credentials->>'channel_secret_encrypted',
      v_session_private_jwk,
      v_session_kid,
      v_session_fingerprint,
      coalesce(nullif(btrim(p_credentials->>'app_type'), ''), 'mini_app'),
      nullif(btrim(p_credentials->>'app_endpoint_id'), ''),
      case
        when v_provider_identity_verified then statement_timestamp()
        else null
      end,
      true,
      statement_timestamp(),
      statement_timestamp(),
      p_updated_by
    );

    update public.clinic_line_setup_sessions setup_session
    set
      encrypted_private_jwk = null,
      encrypted_verification_payload = null,
      status = 'consumed',
      consumed_at = statement_timestamp()
    where setup_session.id = p_setup_session_id
      and setup_session.clinic_id = p_clinic_id;

    v_previous_generation_id := null;
  end if;

  update public.clinic_line_credentials credentials
  set
    access_token_encrypted = p_credentials->>'access_token_encrypted',
    token_expires_at = (p_credentials->>'token_expires_at')::timestamptz,
    access_token_key_id = nullif(btrim(p_credentials->>'access_token_key_id'), ''),
    bot_user_id = p_credentials->>'bot_user_id',
    bot_display_name = p_credentials->>'bot_display_name',
    bot_picture_url = nullif(btrim(p_credentials->>'bot_picture_url'), ''),
    provider_identity_verified_at = case
      when v_provider_identity_verified then statement_timestamp()
      else null
    end,
    last_metadata_verified_at = statement_timestamp(),
    last_token_verified_at = statement_timestamp(),
    last_token_test_error = null,
    credentials_verified_at = statement_timestamp(),
    setup_completed_at = statement_timestamp(),
    is_active = true,
    updated_by = p_updated_by
  where credentials.clinic_id = p_clinic_id
    and credentials.credential_generation_id = p_new_generation_id;

  if not found then
    raise exception 'LINE_SETUP_CREDENTIAL_WRITE_FAILED'
      using errcode = 'P0001';
  end if;

  insert into public.clinic_feature_flags (
    clinic_id,
    line_booking_enabled,
    line_notification_enabled,
    line_chat_enabled,
    updated_by
  ) values (
    p_clinic_id,
    coalesce(p_enable_booking, false),
    coalesce(p_enable_notifications, false),
    false,
    p_updated_by
  )
  on conflict (clinic_id) do update
  set
    line_booking_enabled = excluded.line_booking_enabled,
    line_notification_enabled = excluded.line_notification_enabled,
    line_chat_enabled = false,
    updated_by = excluded.updated_by;

  insert into public.clinic_line_chat_settings (
    clinic_id,
    updated_by
  ) values (
    p_clinic_id,
    p_updated_by
  )
  on conflict (clinic_id) do nothing;

  return v_previous_generation_id;
end
$function$;

create or replace function public.get_line_public_booking_context(
  p_clinic_id uuid
)
returns table (
  line_booking_enabled boolean,
  credential_generation_id uuid,
  is_active boolean,
  liff_id text,
  login_channel_id text,
  oa_basic_id text,
  provider_identity_verified_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select
    coalesce(feature_flags.line_booking_enabled, false),
    credentials.credential_generation_id,
    coalesce(credentials.is_active, false),
    credentials.liff_id::text,
    credentials.login_channel_id::text,
    credentials.oa_basic_id::text,
    credentials.provider_identity_verified_at
  from public.clinics clinic
  left join public.clinic_feature_flags feature_flags
    on feature_flags.clinic_id = clinic.id
  left join public.clinic_line_credentials credentials
    on credentials.clinic_id = clinic.id
  where clinic.id = p_clinic_id;
$function$;

revoke all on function public.wipe_line_setup_session_secrets()
  from public, anon, authenticated, service_role;
grant execute on function public.wipe_line_setup_session_secrets() to service_role;

revoke all on function public.claim_line_setup_verification(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_setup_verification(uuid, uuid)
  to service_role;

revoke all on function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  to service_role;

revoke all on function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  to service_role;

revoke all on function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) to service_role;

revoke all on function public.update_line_feature_settings(
  uuid, boolean, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_line_feature_settings(
  uuid, boolean, boolean, uuid
) to service_role;

revoke all on function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) to service_role;

revoke all on function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) to service_role;

revoke all on function public.get_line_public_booking_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_line_public_booking_context(uuid)
  to service_role;

alter function public.wipe_line_setup_session_secrets() owner to postgres;
alter function public.claim_line_setup_verification(uuid, uuid)
  owner to postgres;
alter function public.bind_line_setup_push_request(uuid, uuid, uuid, text)
  owner to postgres;
alter function public.release_line_setup_verification_claim(uuid, uuid, uuid)
  owner to postgres;
alter function public.finalize_line_setup_verification(
  uuid, uuid, uuid, text, text, boolean
) owner to postgres;
alter function public.update_line_feature_settings(uuid, boolean, boolean, uuid)
  owner to postgres;
alter function public.complete_line_self_serve_setup(
  uuid, uuid, uuid, jsonb, uuid, boolean, boolean
) owner to postgres;
alter function public.update_line_chat_settings(
  uuid, boolean, text, integer, boolean, uuid
) owner to postgres;
alter function public.get_line_public_booking_context(uuid) owner to postgres;

do $verify$
declare
  function_oid oid;
  index_name text;
  actual_execute_roles text[];
  has_execute_grant_option boolean;
begin
  if to_regprocedure(
    'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'
  ) is null then
    raise exception 'complete_line_self_serve_setup was not created';
  end if;

  if has_function_privilege(
    'anon',
    'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)',
    'execute'
  ) then
    raise exception 'LINE setup completion RPC is exposed to browser roles';
  end if;

  if has_function_privilege(
    'anon',
    'public.update_line_chat_settings(uuid,boolean,text,integer,boolean,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.update_line_chat_settings(uuid,boolean,text,integer,boolean,uuid)',
    'execute'
  ) then
    raise exception 'LINE chat settings RPC is exposed to browser roles';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.clinic_line_setup_sessions'::regclass
      and trigger_data.tgname = 'wipe_line_setup_session_secrets_trigger'
      and not trigger_data.tgisinternal
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_payload_lifecycle'
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_claim_lifecycle'
  ) or not exists (
    select 1
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.clinic_line_setup_sessions'::regclass
      and constraint_data.conname = 'clinic_line_setup_sessions_verification_request_digest_format'
  ) then
    raise exception 'LINE setup secret lifecycle contract is missing';
  end if;

  foreach index_name in array array[
    'customers_line_generation_idx',
    'line_message_outbox_customer_clinic_idx',
    'line_message_outbox_generation_idx',
    'patient_identity_aliases_customer_clinic_idx',
    'patient_staff_preferences_customer_clinic_idx',
    'patient_staff_preferences_staff_clinic_idx',
    'reservation_rewards_reservation_clinic_idx',
    'staff_availability_events_created_by_idx',
    'staff_availability_events_staff_clinic_idx',
    'staff_availability_notifications_customer_clinic_idx',
    'staff_availability_notifications_event_clinic_idx',
    'staff_availability_notifications_outbox_clinic_idx',
    'staff_availability_notifications_reservation_clinic_idx',
    'clinic_line_chat_settings_updated_by_idx',
    'clinic_line_setup_sessions_created_by_idx',
    'line_chat_outbox_clinic_idx',
    'line_chat_outbox_conversation_clinic_idx',
    'line_chat_outbox_message_conversation_idx',
    'line_conversations_assignee_clinic_idx',
    'line_conversations_contact_generation_idx',
    'line_job_heartbeats_clinic_idx',
    'line_messages_conversation_contact_generation_idx',
    'line_messages_sent_by_idx',
    'line_messages_webhook_event_contact_idx',
    'line_webhook_events_contact_identity_idx',
    'line_webhook_events_generation_idx'
  ]
  loop
    if to_regclass('public.' || index_name) is null then
      raise exception 'LINE_SETUP_FK_INDEX_MISSING:%', index_name;
    end if;
  end loop;

  foreach function_oid in array array[
    'public.wipe_line_setup_session_secrets()'::regprocedure::oid,
    'public.claim_line_setup_verification(uuid,uuid)'::regprocedure::oid,
    'public.bind_line_setup_push_request(uuid,uuid,uuid,text)'::regprocedure::oid,
    'public.release_line_setup_verification_claim(uuid,uuid,uuid)'::regprocedure::oid,
    'public.finalize_line_setup_verification(uuid,uuid,uuid,text,text,boolean)'::regprocedure::oid,
    'public.update_line_feature_settings(uuid,boolean,boolean,uuid)'::regprocedure::oid,
    'public.complete_line_self_serve_setup(uuid,uuid,uuid,jsonb,uuid,boolean,boolean)'::regprocedure::oid,
    'public.update_line_chat_settings(uuid,boolean,text,integer,boolean,uuid)'::regprocedure::oid,
    'public.get_line_public_booking_context(uuid)'::regprocedure::oid
  ]
  loop
    select
      coalesce(
        array_agg(
          distinct actual_grant.role_name collate "C"
          order by actual_grant.role_name collate "C"
        ),
        array[]::text[]
      ),
      coalesce(bool_or(actual_grant.is_grantable), false)
    into actual_execute_roles, has_execute_grant_option
    from (
      select case
        when acl_entry.grantee = 0 then 'PUBLIC'
        else pg_get_userbyid(acl_entry.grantee)::text
      end as role_name,
      acl_entry.is_grantable
      from pg_proc function_data
      cross join lateral aclexplode(
        coalesce(function_data.proacl, acldefault('f', function_data.proowner))
      ) acl_entry
      where function_data.oid = function_oid
        and acl_entry.privilege_type = 'EXECUTE'
        and acl_entry.grantee <> function_data.proowner
    ) actual_grant;

    if actual_execute_roles is distinct from array['service_role']::text[]
      or has_execute_grant_option
    then
      raise exception 'LINE_SETUP_EXACT_FUNCTION_ACL_DRIFT:%', function_oid;
    end if;

    if exists (
      select 1
      from pg_proc function_data
      where function_data.oid = function_oid
        and (
          function_data.prosecdef
          or pg_get_userbyid(function_data.proowner) <> 'postgres'
          or not coalesce(function_data.proconfig, array[]::text[])
            @> array['search_path=pg_catalog, public']::text[]
        )
    ) then
      raise exception 'LINE_SETUP_FUNCTION_CONTRACT_DRIFT:%', function_oid;
    end if;
  end loop;
end
$verify$;

commit;
