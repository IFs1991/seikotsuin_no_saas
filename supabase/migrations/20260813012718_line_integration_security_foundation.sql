-- LINE official account self-serve integration security foundation v0.4
-- @spec docs/stabilization/spec-line-self-serve-integration-v0.4.md
-- @rollback supabase/rollbacks/20260813012718_line_integration_security_foundation_rollback.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local search_path = pg_catalog, public, auth, extensions;

-- A LINE user ID is scoped to a LINE provider. Each clinic owns its provider
-- and credentials, so the same LINE user may legitimately exist in two clinics.
do $migration$
begin
  if exists (
    select 1
    from public.customers customer
    where customer.line_user_id is not null
    group by customer.clinic_id, customer.line_user_id
    having count(*) > 1
  ) then
    raise exception 'LINE_FOUNDATION_DUPLICATE_CLINIC_LINE_USER_ID';
  end if;
end
$migration$;

alter table public.customers
  drop constraint if exists customers_line_user_id_key,
  add column if not exists line_credential_generation_id uuid;

drop index if exists public.idx_customers_line_user_id;

create unique index if not exists customers_clinic_line_user_id_unique
  on public.customers (clinic_id, line_user_id)
  where line_user_id is not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_clinic_id_id_line_user_id_unique'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_clinic_id_id_line_user_id_unique
      unique (clinic_id, id, line_user_id);
  end if;
end
$migration$;

comment on index public.customers_clinic_line_user_id_unique is
  'LINE user identity is unique within a clinic/provider boundary, not globally across tenants.';

-- Preserve existing LIFF rows accurately, while defaulting newly created
-- integrations to the current LINE MINI App recommendation.
alter table public.clinic_line_credentials
  add column if not exists app_type text,
  add column if not exists credential_generation_id uuid,
  add column if not exists app_endpoint_id text,
  add column if not exists bot_user_id text,
  add column if not exists bot_display_name text,
  add column if not exists bot_picture_url text,
  add column if not exists access_token_key_id text,
  add column if not exists credential_fingerprint text,
  add column if not exists last_metadata_verified_at timestamptz,
  add column if not exists last_token_verified_at timestamptz,
  add column if not exists last_token_test_error text,
  add column if not exists last_push_test_sent_at timestamptz,
  add column if not exists last_push_test_error text,
  add column if not exists credentials_verified_at timestamptz,
  add column if not exists setup_completed_at timestamptz,
  add column if not exists webhook_verified_at timestamptz,
  add column if not exists last_webhook_received_at timestamptz;

update public.clinic_line_credentials
set app_type = case
  when liff_id is not null then 'liff'
  else 'mini_app'
end
where app_type is null;

update public.clinic_line_credentials
set credential_generation_id = gen_random_uuid()
where credential_generation_id is null;

alter table public.clinic_line_credentials
  alter column app_type set default 'mini_app',
  alter column app_type set not null,
  alter column credential_generation_id set default gen_random_uuid(),
  alter column credential_generation_id set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_credentials_app_type_check'
      and conrelid = 'public.clinic_line_credentials'::regclass
  ) then
    alter table public.clinic_line_credentials
      add constraint clinic_line_credentials_app_type_check
      check (app_type in ('mini_app', 'liff'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_clinic_memberships_id_clinic_unique'
      and conrelid = 'public.staff_clinic_memberships'::regclass
  ) then
    alter table public.staff_clinic_memberships
      add constraint staff_clinic_memberships_id_clinic_unique
      unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_credentials_clinic_generation_unique'
      and conrelid = 'public.clinic_line_credentials'::regclass
  ) then
    alter table public.clinic_line_credentials
      add constraint clinic_line_credentials_clinic_generation_unique
      unique (clinic_id, credential_generation_id);
  end if;
end
$migration$;

create unique index if not exists clinic_line_credentials_fingerprint_unique
  on public.clinic_line_credentials (credential_fingerprint)
  where credential_fingerprint is not null;

comment on column public.clinic_line_credentials.app_type is
  'LINE application surface. New setup defaults to mini_app; existing LIFF integrations remain supported.';
comment on column public.clinic_line_credentials.app_endpoint_id is
  'LINE MINI App or LIFF endpoint ID shown in the LINE Developers Console.';
comment on column public.clinic_line_credentials.credential_fingerprint is
  'One-way fingerprint used to detect credential changes without decrypting or logging secrets.';
comment on column public.clinic_line_credentials.credential_generation_id is
  'Stable verified-provider generation. Provider replacement must create a new generation and explicitly relink contacts.';
comment on column public.clinic_line_credentials.access_token_key_id is
  'Public-key KID registered manually in the LINE Developers Console.';

alter table public.clinic_feature_flags
  add column if not exists line_notification_enabled boolean not null default false,
  add column if not exists line_chat_enabled boolean not null default false;

update public.clinic_feature_flags feature_flags
set
  line_notification_enabled = false,
  line_chat_enabled = false
from public.clinic_line_credentials credentials
where credentials.clinic_id = feature_flags.clinic_id
  and (
    credentials.credentials_verified_at is null
    or credentials.setup_completed_at is null
  );

comment on column public.clinic_feature_flags.line_notification_enabled is
  'Clinic-scoped LINE push notification entitlement. Existing integrations remain disabled until provider continuity is verified.';
comment on column public.clinic_feature_flags.line_chat_enabled is
  'Clinic-scoped staff-to-patient LINE text chat entitlement.';

create table if not exists public.clinic_line_credential_generations (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'replaced', 'revoked')),
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  primary key (clinic_id, id),
  constraint clinic_line_credential_generations_lifecycle check (
    (status = 'active' and replaced_at is null)
    or (status in ('replaced', 'revoked') and replaced_at is not null)
  )
);

create unique index if not exists clinic_line_credential_generations_active_unique
  on public.clinic_line_credential_generations (clinic_id)
  where status = 'active';

insert into public.clinic_line_credential_generations (clinic_id, id, status)
select credentials.clinic_id, credentials.credential_generation_id, 'active'
from public.clinic_line_credentials credentials
on conflict (clinic_id, id) do nothing;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_credentials_current_generation_fkey'
      and conrelid = 'public.clinic_line_credentials'::regclass
  ) then
    alter table public.clinic_line_credentials
      add constraint clinic_line_credentials_current_generation_fkey
      foreign key (clinic_id, credential_generation_id)
      references public.clinic_line_credential_generations(clinic_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_line_generation_fkey'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_line_generation_fkey
      foreign key (clinic_id, line_credential_generation_id)
      references public.clinic_line_credential_generations(clinic_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_clinic_id_id_generation_line_user_unique'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_clinic_id_id_generation_line_user_unique
      unique (clinic_id, id, line_credential_generation_id, line_user_id);
  end if;
end
$migration$;

alter table public.customers
  drop constraint if exists customers_line_identity_presence,
  add constraint customers_line_identity_presence check (
    (line_user_id is null and line_credential_generation_id is null)
    or line_user_id is not null
  );

comment on table public.clinic_line_credential_generations is
  'Secret-free provider-generation history. Replaced generations remain referenced by historical LINE contacts.';
comment on column public.customers.line_credential_generation_id is
  'Verified provider generation. NULL with a legacy LINE user ID means the identity must be explicitly relinked before sending.';

alter table public.line_message_outbox
  add column if not exists customer_id uuid,
  add column if not exists credential_generation_id uuid,
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz;

alter table public.line_message_outbox
  alter column customer_id drop not null,
  alter column credential_generation_id drop not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_message_outbox_customer_clinic_fkey'
      and conrelid = 'public.line_message_outbox'::regclass
  ) then
    alter table public.line_message_outbox
      add constraint line_message_outbox_customer_clinic_fkey
      foreign key (customer_id, clinic_id)
      references public.customers (id, clinic_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_message_outbox_generation_fkey'
      and conrelid = 'public.line_message_outbox'::regclass
  ) then
    alter table public.line_message_outbox
      add constraint line_message_outbox_generation_fkey
      foreign key (clinic_id, credential_generation_id)
      references public.clinic_line_credential_generations(clinic_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_message_outbox_claim_lifecycle'
      and conrelid = 'public.line_message_outbox'::regclass
  ) then
    alter table public.line_message_outbox
      add constraint line_message_outbox_claim_lifecycle check (
        (claim_token is null and claimed_at is null)
        or (
          status = 'pending'
          and claim_token is not null
          and claimed_at is not null
        )
      );
  end if;
end
$migration$;

create or replace function public.initialize_line_message_outbox_generation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id
      or new.customer_id is distinct from old.customer_id
      or new.line_user_id is distinct from old.line_user_id
      or new.credential_generation_id is distinct from old.credential_generation_id
    then
      raise exception 'LINE_NOTIFICATION_IDENTITY_IMMUTABLE'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.customer_id is null
    and jsonb_typeof(new.payload) = 'object'
    and length(btrim(coalesce(new.payload->>'customerId', ''))) > 0
  then
    begin
      new.customer_id := (new.payload->>'customerId')::uuid;
    exception when invalid_text_representation then
      raise exception 'LINE_NOTIFICATION_CUSTOMER_INVALID'
        using errcode = '22023';
    end;
  end if;

  if new.customer_id is null and jsonb_typeof(new.payload) = 'object' then
    begin
      new.customer_id := coalesce(
        nullif(new.payload#>>'{fallbackEmail,customerId}', '')::uuid,
        nullif(new.payload#>>'{outreach,customerId}', '')::uuid,
        nullif(new.payload#>>'{availability,customerId}', '')::uuid
      );
    exception when invalid_text_representation then
      raise exception 'LINE_NOTIFICATION_CUSTOMER_INVALID'
        using errcode = '22023';
    end;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || new.clinic_id::text, 0)
  );

  select credentials.credential_generation_id
  into new.credential_generation_id
  from public.clinic_line_credentials credentials
  join public.clinic_feature_flags feature_flags
    on feature_flags.clinic_id = credentials.clinic_id
   and feature_flags.line_notification_enabled
  where credentials.clinic_id = new.clinic_id
    and credentials.is_active;

  if not found then
    raise exception 'LINE_NOTIFICATION_DISABLED_OR_UNCONFIGURED'
      using errcode = 'P0001';
  end if;

  if new.customer_id is null or not exists (
    select 1
    from public.customers customer
    where customer.id = new.customer_id
      and customer.clinic_id = new.clinic_id
      and customer.line_user_id = new.line_user_id
      and customer.line_credential_generation_id = new.credential_generation_id
      and customer.is_deleted = false
  ) then
    raise exception 'LINE_NOTIFICATION_PATIENT_GENERATION_MISMATCH'
      using errcode = '23503';
  end if;

  return new;
end
$function$;

comment on column public.line_message_outbox.credential_generation_id is
  'Verified provider generation captured at enqueue. NULL is retained only for terminal pre-foundation history.';
comment on column public.line_message_outbox.customer_id is
  'Patient identity bound at enqueue. NULL is retained only when pre-foundation terminal history cannot be reconciled.';
comment on column public.line_message_outbox.claim_token is
  'Short-lived ownership token for the legacy reservation/CRM notification processor.';

create or replace function public.sync_failed_line_notification_tracking()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.status <> 'failed' or old.status = 'failed' then
    return new;
  end if;

  update public.staff_availability_notifications notification
  set status = 'failed'
  where notification.line_outbox_id = new.id
    and notification.clinic_id = new.clinic_id
    and notification.status <> 'booked';

  update public.reservation_notifications notification
  set
    status = 'failed',
    detail = notification.detail || jsonb_build_object(
      'line_outbox_id', new.id,
      'line_failure_reason', coalesce(new.last_error, 'line_delivery_failed')
    )
  where notification.clinic_id = new.clinic_id
    and (
      notification.detail->>'line_outbox_id' = new.id::text
      or (
        notification.reservation_id::text = coalesce(
          new.payload#>>'{reservation,reservationId}',
          new.payload#>>'{fallbackEmail,reservationId}'
        )
        and notification.notification_type = coalesce(
          new.payload#>>'{reservation,notificationType}',
          new.payload#>>'{fallbackEmail,notificationType}'
        )
      )
    );

  update public.patient_outreach_recipients recipient
  set delivery_status = 'failed'
  where recipient.clinic_id = new.clinic_id
    and recipient.id::text = new.payload#>>'{outreach,recipientId}'
    and recipient.campaign_id::text = new.payload#>>'{outreach,campaignId}'
    and recipient.customer_id = new.customer_id;

  return new;
end
$function$;

drop trigger if exists sync_failed_line_notification_tracking_trigger
on public.line_message_outbox;
create trigger sync_failed_line_notification_tracking_trigger
after update of status on public.line_message_outbox
for each row execute function public.sync_failed_line_notification_tracking();

-- Provider continuity cannot be proven for rows created before this
-- foundation. Preserve terminal history, but never send pre-foundation work.
create or replace function public.quarantine_unverified_line_notification_history()
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  with candidates as (
    select outbox.id as outbox_id, coalesce(
      case
        when coalesce(outbox.payload->>'customerId', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (outbox.payload->>'customerId')::uuid
      end,
      case
        when coalesce(outbox.payload#>>'{fallbackEmail,customerId}', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (outbox.payload#>>'{fallbackEmail,customerId}')::uuid
      end,
      case
        when coalesce(outbox.payload#>>'{outreach,customerId}', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (outbox.payload#>>'{outreach,customerId}')::uuid
      end,
      case
        when coalesce(outbox.payload#>>'{availability,customerId}', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (outbox.payload#>>'{availability,customerId}')::uuid
      end,
      (
        select reservation.customer_id
        from public.reservation_notifications notification
        join public.reservations reservation
          on reservation.id = notification.reservation_id
         and reservation.clinic_id = notification.clinic_id
        where notification.clinic_id = outbox.clinic_id
          and notification.detail->>'line_outbox_id' = outbox.id::text
        limit 1
      ),
      (
        select notification.customer_id
        from public.staff_availability_notifications notification
        where notification.clinic_id = outbox.clinic_id
          and notification.line_outbox_id = outbox.id
        limit 1
      ),
      (
        select customer.id
        from public.customers customer
        where customer.clinic_id = outbox.clinic_id
          and customer.line_user_id = outbox.line_user_id
        limit 1
      )
    ) as customer_id
    from public.line_message_outbox outbox
    where outbox.customer_id is null
  ), scoped_candidates as (
    select candidates.outbox_id, candidates.customer_id
    from candidates
    join public.line_message_outbox outbox
      on outbox.id = candidates.outbox_id
    join public.customers customer
      on customer.id = candidates.customer_id
     and customer.clinic_id = outbox.clinic_id
     and customer.line_user_id = outbox.line_user_id
  )
  update public.line_message_outbox outbox
  set customer_id = scoped_candidates.customer_id
  from scoped_candidates
  where outbox.id = scoped_candidates.outbox_id;

  update public.line_message_outbox outbox
  set
    status = 'failed',
    last_error = 'legacy_provider_identity_unverified',
    next_attempt_at = statement_timestamp(),
    claim_token = null,
    claimed_at = null
  where outbox.status = 'pending'
    and outbox.credential_generation_id is null;

  if exists (
    select 1
    from public.line_message_outbox outbox
    where outbox.status = 'pending'
      and (
        outbox.customer_id is null
        or outbox.credential_generation_id is null
      )
  ) then
    raise exception 'LINE_FOUNDATION_UNVERIFIED_NOTIFICATION_REMAINS_SENDABLE';
  end if;

end
$function$;

select public.quarantine_unverified_line_notification_history();

-- The one-time legacy identity recovery above must complete before identity
-- columns become immutable. Otherwise a recoverable NULL customer_id would
-- make the migration fail while the quarantine is doing its intended work.
drop trigger if exists initialize_line_message_outbox_generation_trigger
on public.line_message_outbox;
create trigger initialize_line_message_outbox_generation_trigger
before insert or update of clinic_id, customer_id, line_user_id, credential_generation_id
on public.line_message_outbox
for each row execute function public.initialize_line_message_outbox_generation();

create or replace function public.claim_line_notification_outbox(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_expected_attempts integer
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_claim_token uuid := gen_random_uuid();
begin
  if p_expected_attempts is null or p_expected_attempts not between 0 and 3 then
    raise exception 'LINE_NOTIFICATION_CLAIM_ATTEMPTS_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  update public.line_message_outbox outbox
  set
    status = 'failed',
    claim_token = null,
    claimed_at = null,
    last_error = 'claim_lease_expired_max_attempts',
    next_attempt_at = statement_timestamp()
  where outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.attempts >= 3
    and (
      outbox.claim_token is null
      or outbox.claimed_at < statement_timestamp() - interval '2 minutes'
    );

  update public.line_message_outbox outbox
  set
    claim_token = null,
    claimed_at = null,
    last_error = 'claim_lease_expired'
  where outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.attempts < 3
    and outbox.claim_token is not null
    and outbox.claimed_at < statement_timestamp() - interval '2 minutes';

  if not exists (
    select 1
    from public.line_message_outbox outbox
    where outbox.id = p_outbox_id
      and outbox.clinic_id = p_clinic_id
      and outbox.status = 'pending'
      and outbox.attempts = p_expected_attempts
      and outbox.next_attempt_at <= statement_timestamp()
      and outbox.claim_token is null
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.line_message_outbox outbox
    join public.clinic_line_credentials credentials
      on credentials.clinic_id = outbox.clinic_id
     and credentials.credential_generation_id = outbox.credential_generation_id
     and credentials.is_active
    join public.clinic_feature_flags feature_flags
      on feature_flags.clinic_id = outbox.clinic_id
     and feature_flags.line_notification_enabled
    where outbox.id = p_outbox_id
      and outbox.clinic_id = p_clinic_id
      and exists (
        select 1
        from public.customers customer
        where customer.id = outbox.customer_id
          and customer.clinic_id = outbox.clinic_id
          and customer.line_user_id = outbox.line_user_id
          and customer.line_credential_generation_id = outbox.credential_generation_id
          and customer.is_deleted = false
      )
  ) then
    update public.line_message_outbox outbox
    set
      status = 'failed',
      last_error = 'notification_generation_or_feature_disabled',
      claim_token = null,
      claimed_at = null,
      next_attempt_at = statement_timestamp()
    where outbox.id = p_outbox_id
      and outbox.clinic_id = p_clinic_id
      and outbox.status = 'pending';

    return null;
  end if;

  update public.line_message_outbox outbox
  set
    attempts = outbox.attempts + 1,
    next_attempt_at = statement_timestamp() + interval '2 minutes',
    last_error = null,
    claim_token = v_claim_token,
    claimed_at = statement_timestamp()
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.attempts = p_expected_attempts
    and outbox.claim_token is null;

  if not found then
    return null;
  end if;

  return v_claim_token;
end
$function$;

create or replace function public.finalize_line_notification_outbox(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_claim_token uuid,
  p_status text,
  p_sent_at timestamptz,
  p_last_error text,
  p_next_attempt_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_status not in ('pending', 'sent', 'failed')
    or p_claim_token is null
    or p_next_attempt_at is null
  then
    raise exception 'LINE_NOTIFICATION_FINALIZE_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  update public.line_message_outbox outbox
  set
    status = p_status,
    sent_at = case when p_status = 'sent' then coalesce(p_sent_at, statement_timestamp()) else null end,
    last_error = case when p_status = 'sent' then null else left(p_last_error, 1000) end,
    next_attempt_at = p_next_attempt_at,
    claim_token = null,
    claimed_at = null
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.claim_token = p_claim_token;

  if not found then
    raise exception 'LINE_NOTIFICATION_CLAIM_INVALID'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.staff_availability_notifications notification
    where notification.line_outbox_id = p_outbox_id
      and notification.clinic_id = p_clinic_id
      and notification.status <> 'booked'
  ) then
    update public.staff_availability_notifications notification
    set
      status = case when p_status = 'pending' then notification.status else p_status end,
      sent_at = case
        when p_status = 'sent' then coalesce(p_sent_at, statement_timestamp())
        else notification.sent_at
      end
    where notification.line_outbox_id = p_outbox_id
      and notification.clinic_id = p_clinic_id
      and notification.status <> 'booked';
  end if;

  update public.patient_outreach_recipients recipient
  set
    delivery_status = case
      when p_status = 'pending' then recipient.delivery_status
      else p_status
    end,
    sent_at = case
      when p_status = 'sent' then coalesce(p_sent_at, statement_timestamp())
      else recipient.sent_at
    end
  from public.line_message_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
    and outbox.clinic_id = recipient.clinic_id
    and outbox.customer_id = recipient.customer_id
    and outbox.payload#>>'{outreach,campaignId}' = recipient.campaign_id::text
    and outbox.payload#>>'{outreach,recipientId}' = recipient.id::text
    and outbox.payload#>>'{outreach,customerId}' = recipient.customer_id::text
    and recipient.delivery_status <> 'skipped';
end
$function$;

create or replace function public.renew_line_notification_claim(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_claim_token is null then
    raise exception 'LINE_NOTIFICATION_CLAIM_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  update public.line_message_outbox outbox
  set
    claimed_at = statement_timestamp(),
    next_attempt_at = statement_timestamp() + interval '5 minutes'
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.claim_token = p_claim_token
    and exists (
      select 1
      from public.clinic_line_credentials credentials
      join public.clinic_feature_flags feature_flags
        on feature_flags.clinic_id = credentials.clinic_id
       and feature_flags.line_notification_enabled
      where credentials.clinic_id = outbox.clinic_id
        and credentials.credential_generation_id = outbox.credential_generation_id
        and credentials.is_active
    )
    and exists (
      select 1
      from public.customers customer
      where customer.id = outbox.customer_id
        and customer.clinic_id = outbox.clinic_id
        and customer.line_user_id = outbox.line_user_id
        and customer.line_credential_generation_id = outbox.credential_generation_id
        and customer.is_deleted = false
    );

  return found;
end
$function$;

create or replace function public.initialize_line_credential_generation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_existing_generation_id uuid;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended('line-credential:' || new.clinic_id::text, 0)
    );

    select credentials.credential_generation_id
    into v_existing_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = new.clinic_id;

    if found then
      new.credential_generation_id := v_existing_generation_id;
    else
      new.credential_generation_id := coalesce(new.credential_generation_id, gen_random_uuid());

      insert into public.clinic_line_credential_generations (
        clinic_id,
        id,
        status
      )
      values (
        new.clinic_id,
        new.credential_generation_id,
        'active'
      );
    end if;
  elsif new.credential_generation_id <> old.credential_generation_id
    and not exists (
      select 1
      from public.clinic_line_credential_generations generation
      where generation.clinic_id = new.clinic_id
        and generation.id = new.credential_generation_id
        and generation.status = 'active'
    )
  then
    raise exception 'LINE_CREDENTIAL_GENERATION_NOT_ACTIVE'
      using errcode = '23503';
  end if;

  return new;
end
$function$;

drop trigger if exists initialize_line_credential_generation_trigger
on public.clinic_line_credentials;
create trigger initialize_line_credential_generation_trigger
before insert or update of credential_generation_id
on public.clinic_line_credentials
for each row execute function public.initialize_line_credential_generation();

create or replace function public.validate_line_credential_rotation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_provider_credentials_changed boolean;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  v_provider_credentials_changed :=
    new.messaging_channel_id is distinct from old.messaging_channel_id
    or new.login_channel_id is distinct from old.login_channel_id
    or new.channel_secret_encrypted is distinct from old.channel_secret_encrypted
    or new.assertion_private_key_encrypted is distinct from old.assertion_private_key_encrypted
    or new.assertion_kid is distinct from old.assertion_kid
    or new.credential_fingerprint is distinct from old.credential_fingerprint;

  if v_provider_credentials_changed
    <> (new.credential_generation_id is distinct from old.credential_generation_id)
  then
    raise exception 'LINE_PROVIDER_CREDENTIAL_ROTATION_MUST_BE_ATOMIC'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

drop trigger if exists validate_line_credential_rotation_trigger
on public.clinic_line_credentials;
create trigger validate_line_credential_rotation_trigger
before update on public.clinic_line_credentials
for each row execute function public.validate_line_credential_rotation();

create or replace function public.initialize_customer_line_generation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.line_user_id is null then
    new.line_credential_generation_id := null;
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || new.clinic_id::text, 0)
  );

  if tg_op = 'UPDATE' then
    if new.line_user_id is not distinct from old.line_user_id then
      if old.line_credential_generation_id is null
        and new.line_credential_generation_id is not null
      then
        raise exception 'LINE_CUSTOMER_RELINK_REQUIRED'
          using errcode = '42501';
      end if;

      -- An unchanged legacy LINE ID must remain unverified. Generic profile
      -- refreshes may update display data, but only the explicit relink RPC is
      -- allowed to promote a quarantined identity into the current provider.
      if old.line_credential_generation_id is null then
        new.line_credential_generation_id := null;
      end if;

      return new;
    end if;

    if new.line_user_id is not null
      and new.line_credential_generation_id is null
    then
      raise exception 'LINE_CUSTOMER_RELINK_GENERATION_REQUIRED'
        using errcode = '23514';
    end if;
  end if;

  if new.line_credential_generation_id is null then
    select credentials.credential_generation_id
    into new.line_credential_generation_id
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = new.clinic_id
      and credentials.is_active;

    if not found then
      raise exception 'LINE_CREDENTIALS_NOT_ACTIVE'
        using errcode = '23503';
    end if;
  end if;

  if not exists (
    select 1
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = new.clinic_id
      and credentials.credential_generation_id = new.line_credential_generation_id
      and credentials.is_active
  ) then
    raise exception 'LINE_CUSTOMER_GENERATION_NOT_CURRENT'
      using errcode = '23503';
  end if;

  return new;
end
$function$;

create or replace function public.protect_customer_line_identity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if (
      (
        tg_op = 'INSERT'
        and (
          new.line_user_id is not null
          or new.line_credential_generation_id is not null
        )
      )
      or (
        tg_op = 'UPDATE'
        and (
          new.line_user_id is distinct from old.line_user_id
          or new.line_credential_generation_id is distinct from old.line_credential_generation_id
        )
      )
    )
  then
    if current_user not in ('postgres', 'service_role') then
      raise exception 'LINE_CUSTOMER_IDENTITY_SERVICE_ROLE_REQUIRED'
        using errcode = '42501';
    end if;

    if tg_op = 'UPDATE' and current_user <> 'postgres' then
      raise exception 'LINE_CUSTOMER_RELINK_RPC_REQUIRED'
        using errcode = '42501';
    end if;
  end if;

  return new;
end
$function$;

drop trigger if exists initialize_customer_line_generation_trigger
on public.customers;
create trigger initialize_customer_line_generation_trigger
before insert or update of line_user_id, line_credential_generation_id
on public.customers
for each row execute function public.initialize_customer_line_generation();

drop trigger if exists protect_customer_line_identity_trigger
on public.customers;
drop trigger if exists guard_customer_line_identity_trigger
on public.customers;
-- PostgreSQL runs same-kind triggers alphabetically. The guard must execute
-- before generation initialization reads service-only credential rows.
create trigger guard_customer_line_identity_trigger
before insert or update of line_user_id, line_credential_generation_id
on public.customers
for each row execute function public.protect_customer_line_identity();

create table if not exists public.clinic_line_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  encrypted_private_jwk text,
  public_jwk jsonb not null,
  credential_fingerprint text not null,
  public_key_kid text,
  status text not null default 'prepared'
    check (status in ('prepared', 'verified', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_line_setup_sessions_private_key_lifecycle check (
    (
      status in ('prepared', 'verified')
      and encrypted_private_jwk is not null
      and length(btrim(encrypted_private_jwk)) > 0
    )
    or (
      status in ('consumed', 'expired', 'revoked')
      and encrypted_private_jwk is null
    )
  ),
  constraint clinic_line_setup_sessions_verification_lifecycle check (
    (
      status = 'prepared'
      and public_key_kid is null
      and verified_at is null
    )
    or (
      status = 'verified'
      and public_key_kid is not null
      and length(btrim(public_key_kid)) > 0
      and verified_at is not null
    )
    or status in ('consumed', 'expired', 'revoked')
  ),
  constraint clinic_line_setup_sessions_fingerprint_not_blank
    check (length(btrim(credential_fingerprint)) > 0),
  constraint clinic_line_setup_sessions_public_jwk_object
    check (jsonb_typeof(public_jwk) = 'object'),
  constraint clinic_line_setup_sessions_max_lifetime
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint clinic_line_setup_sessions_id_clinic_unique
    unique (id, clinic_id)
);

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_line_setup_sessions_verification_lifecycle'
      and conrelid = 'public.clinic_line_setup_sessions'::regclass
  ) then
    alter table public.clinic_line_setup_sessions
      add constraint clinic_line_setup_sessions_verification_lifecycle check (
        (
          status = 'prepared'
          and public_key_kid is null
          and verified_at is null
        )
        or (
          status = 'verified'
          and public_key_kid is not null
          and length(btrim(public_key_kid)) > 0
          and verified_at is not null
        )
        or status in ('consumed', 'expired', 'revoked')
      );
  end if;
end
$migration$;

create unique index if not exists clinic_line_setup_sessions_active_unique
  on public.clinic_line_setup_sessions (clinic_id)
  where status in ('prepared', 'verified');

create index if not exists clinic_line_setup_sessions_expiry_idx
  on public.clinic_line_setup_sessions (expires_at)
  where status in ('prepared', 'verified');

comment on table public.clinic_line_setup_sessions is
  'Short-lived clinic-scoped setup material. Private JWKs are encrypted and expire within 24 hours.';

create table if not exists public.clinic_line_chat_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  auto_reply_enabled boolean not null default false,
  auto_reply_message text not null default 'お問い合わせありがとうございます。受付時間内に担当者より返信いたします。',
  retention_days integer not null default 90 check (retention_days between 1 and 365),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_line_chat_settings_auto_reply_not_blank
    check (length(btrim(auto_reply_message)) between 1 and 1000)
);

comment on table public.clinic_line_chat_settings is
  'Clinic-scoped LINE chat retention and fixed reception auto-reply settings.';

create table if not exists public.line_contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  line_user_id text not null,
  credential_generation_id uuid not null,
  customer_id uuid,
  display_name text,
  picture_url text,
  followed_at timestamptz,
  unfollowed_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_contacts_line_user_id_not_blank
    check (length(btrim(line_user_id)) > 0),
  constraint line_contacts_credential_generation_fkey
    foreign key (clinic_id, credential_generation_id)
    references public.clinic_line_credential_generations(clinic_id, id)
    on delete restrict,
  constraint line_contacts_customer_identity_fkey
    foreign key (clinic_id, customer_id, credential_generation_id, line_user_id)
    references public.customers(clinic_id, id, line_credential_generation_id, line_user_id)
    on delete set null (customer_id),
  constraint line_contacts_clinic_user_unique
    unique (clinic_id, credential_generation_id, line_user_id),
  constraint line_contacts_customer_identity_unique
    unique (clinic_id, customer_id, credential_generation_id, line_user_id),
  constraint line_contacts_id_clinic_unique
    unique (id, clinic_id),
  constraint line_contacts_id_clinic_user_unique
    unique (id, clinic_id, line_user_id),
  constraint line_contacts_id_clinic_generation_unique
    unique (id, clinic_id, credential_generation_id),
  constraint line_contacts_id_clinic_generation_user_unique
    unique (id, clinic_id, credential_generation_id, line_user_id)
);

create index if not exists line_contacts_customer_idx
  on public.line_contacts (clinic_id, customer_id)
  where customer_id is not null;

comment on table public.line_contacts is
  'Clinic/provider-scoped LINE contacts. line_user_id is never treated as a global identity.';

create table if not exists public.line_conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null,
  credential_generation_id uuid not null,
  assigned_membership_id uuid,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_conversations_contact_generation_fkey
    foreign key (contact_id, clinic_id, credential_generation_id)
    references public.line_contacts(id, clinic_id, credential_generation_id)
    on delete cascade,
  constraint line_conversations_assignee_clinic_fkey
    foreign key (assigned_membership_id, clinic_id)
    references public.staff_clinic_memberships(id, clinic_id)
    on delete set null (assigned_membership_id),
  constraint line_conversations_contact_unique unique (contact_id),
  constraint line_conversations_id_clinic_unique unique (id, clinic_id),
  constraint line_conversations_id_clinic_generation_unique
    unique (id, clinic_id, credential_generation_id),
  constraint line_conversations_id_clinic_contact_unique
    unique (id, clinic_id, contact_id),
  constraint line_conversations_id_clinic_contact_generation_unique
    unique (id, clinic_id, contact_id, credential_generation_id)
);

create index if not exists line_conversations_inbox_idx
  on public.line_conversations (clinic_id, status, last_message_at desc nulls last);

create index if not exists line_conversations_assignee_idx
  on public.line_conversations (clinic_id, assigned_membership_id, status)
  where assigned_membership_id is not null;

comment on table public.line_conversations is
  'Clinic-scoped LINE text conversations. Therapist/staff access requires assignment in the API authorization layer.';

create or replace function public.validate_line_current_generation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if not exists (
    select 1
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = new.clinic_id
      and credentials.credential_generation_id = new.credential_generation_id
      and credentials.is_active
  ) then
    raise exception 'LINE_CREDENTIAL_GENERATION_NOT_CURRENT'
      using errcode = '23503';
  end if;

  return new;
end
$function$;

drop trigger if exists validate_line_conversation_generation_trigger
on public.line_conversations;
create trigger validate_line_conversation_generation_trigger
before insert or update of clinic_id, credential_generation_id
on public.line_conversations
for each row execute function public.validate_line_current_generation();

create table if not exists public.line_webhook_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  webhook_event_id text not null,
  event_type text not null,
  contact_id uuid,
  line_user_id text,
  credential_generation_id uuid not null,
  is_redelivery boolean not null default false,
  payload_digest text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error_code text,
  occurred_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_webhook_events_event_id_not_blank
    check (length(btrim(webhook_event_id)) > 0),
  constraint line_webhook_events_payload_digest_not_blank
    check (length(btrim(payload_digest)) > 0),
  constraint line_webhook_events_contact_identity_presence check (
    (contact_id is null and line_user_id is null)
    or (contact_id is not null and line_user_id is not null)
  ),
  constraint line_webhook_events_generation_fkey
    foreign key (clinic_id, credential_generation_id)
    references public.clinic_line_credential_generations(clinic_id, id)
    on delete restrict,
  constraint line_webhook_events_contact_identity_fkey
    foreign key (contact_id, clinic_id, credential_generation_id, line_user_id)
    references public.line_contacts(id, clinic_id, credential_generation_id, line_user_id)
    on delete set null (contact_id, line_user_id),
  constraint line_webhook_events_clinic_event_unique
    unique (clinic_id, webhook_event_id),
  constraint line_webhook_events_id_clinic_unique
    unique (id, clinic_id),
  constraint line_webhook_events_id_clinic_contact_unique
    unique (id, clinic_id, contact_id),
  constraint line_webhook_events_id_clinic_contact_generation_unique
    unique (id, clinic_id, contact_id, credential_generation_id)
);

create index if not exists line_webhook_events_retention_idx
  on public.line_webhook_events (clinic_id, created_at);

comment on table public.line_webhook_events is
  'Deduplication and processing metadata for signature-verified LINE webhooks. Raw request bodies are not retained.';

drop trigger if exists validate_line_webhook_generation_trigger
on public.line_webhook_events;
create trigger validate_line_webhook_generation_trigger
before insert or update of clinic_id, credential_generation_id
on public.line_webhook_events
for each row execute function public.validate_line_current_generation();

create table if not exists public.line_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null,
  contact_id uuid not null,
  credential_generation_id uuid not null,
  webhook_event_id uuid,
  line_message_id text,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  message_type text not null default 'text' check (message_type in ('text', 'unsupported')),
  text_content text,
  status text not null default 'received'
    check (status in ('received', 'queued', 'sent', 'failed', 'unsent')),
  sent_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unsent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_messages_conversation_contact_generation_fkey
    foreign key (conversation_id, clinic_id, contact_id, credential_generation_id)
    references public.line_conversations(id, clinic_id, contact_id, credential_generation_id)
    on delete cascade,
  constraint line_messages_webhook_event_contact_fkey
    foreign key (webhook_event_id, clinic_id, contact_id, credential_generation_id)
    references public.line_webhook_events(id, clinic_id, contact_id, credential_generation_id)
    on delete set null (webhook_event_id),
  constraint line_messages_webhook_contact_matches_conversation check (
    direction <> 'inbound'
    or webhook_event_id is not null
  ),
  constraint line_messages_text_contract check (
    (message_type = 'text' and text_content is not null and length(btrim(text_content)) between 1 and 5000)
    or (message_type = 'unsupported' and text_content is null)
    or (status = 'unsent' and text_content is null)
  ),
  constraint line_messages_id_clinic_unique unique (id, clinic_id),
  constraint line_messages_id_clinic_conversation_unique
    unique (id, clinic_id, conversation_id),
  constraint line_messages_id_clinic_conversation_generation_unique
    unique (id, clinic_id, conversation_id, credential_generation_id)
);

create unique index if not exists line_messages_line_message_id_unique
  on public.line_messages (clinic_id, line_message_id)
  where line_message_id is not null;

create index if not exists line_messages_timeline_idx
  on public.line_messages (clinic_id, conversation_id, occurred_at, id);

create index if not exists line_messages_retention_idx
  on public.line_messages (clinic_id, created_at);

comment on table public.line_messages is
  'Text-only LINE message history. Unsend processing clears text_content and marks the row unsent.';

create table if not exists public.line_chat_outbox (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  credential_generation_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  sent_at timestamptz,
  claim_token uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint line_chat_outbox_conversation_clinic_fkey
    foreign key (conversation_id, clinic_id, credential_generation_id)
    references public.line_conversations(id, clinic_id, credential_generation_id)
    on delete cascade,
  constraint line_chat_outbox_message_conversation_fkey
    foreign key (message_id, clinic_id, conversation_id, credential_generation_id)
    references public.line_messages(id, clinic_id, conversation_id, credential_generation_id)
    on delete cascade,
  constraint line_chat_outbox_message_unique unique (message_id),
  constraint line_chat_outbox_delivery_state check (
    (status = 'pending' and claim_token is null and claimed_at is null and sent_at is null)
    or (status = 'processing' and claim_token is not null and claimed_at is not null and sent_at is null)
    or (status = 'sent' and claim_token is null and claimed_at is null and sent_at is not null)
    or (status = 'failed' and claim_token is null and claimed_at is null and sent_at is null)
  )
);

create index if not exists line_chat_outbox_pending_idx
  on public.line_chat_outbox (status, next_attempt_at, created_at)
  where status = 'pending';

comment on table public.line_chat_outbox is
  'Service-role-only LINE chat push queue. Recipient and payload are derived from the tenant-bound conversation/contact/message chain.';

create or replace function public.validate_line_chat_outbox_contract()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_message public.line_messages%rowtype;
begin
  if tg_op = 'UPDATE'
    and new.message_id = old.message_id
    and new.clinic_id = old.clinic_id
    and new.conversation_id = old.conversation_id
    and new.credential_generation_id = old.credential_generation_id
  then
    return new;
  end if;

  select message.*
  into v_message
  from public.line_messages message
  where message.id = new.message_id
    and message.clinic_id = new.clinic_id
    and message.conversation_id = new.conversation_id
    and message.credential_generation_id = new.credential_generation_id;

  if not found
    or v_message.direction <> 'outbound'
    or v_message.message_type <> 'text'
    or v_message.status <> 'queued'
    or v_message.text_content is null
  then
    raise exception 'LINE_CHAT_OUTBOX_MESSAGE_NOT_SENDABLE'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

drop trigger if exists validate_line_chat_outbox_contract_trigger
on public.line_chat_outbox;
create trigger validate_line_chat_outbox_contract_trigger
before insert or update on public.line_chat_outbox
for each row execute function public.validate_line_chat_outbox_contract();

create or replace function public.enqueue_line_chat_message(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_text text,
  p_sent_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_contact_id uuid;
  v_credential_generation_id uuid;
  v_message_id uuid := gen_random_uuid();
begin
  if p_text is null or length(btrim(p_text)) not between 1 and 5000 then
    raise exception 'LINE_CHAT_TEXT_INVALID'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = p_clinic_id
      and feature_flags.line_chat_enabled
  ) then
    raise exception 'LINE_CHAT_DISABLED'
      using errcode = 'P0001';
  end if;

  if p_sent_by is null or not exists (
    select 1
    from public.staff_profiles staff_profile
    join public.staff_clinic_memberships membership
      on membership.staff_profile_id = staff_profile.id
    where staff_profile.user_id = p_sent_by
      and staff_profile.is_active
      and membership.clinic_id = p_clinic_id
      and membership.membership_type <> 'blocked'
  ) then
    raise exception 'LINE_CHAT_SENDER_NOT_IN_CLINIC'
      using errcode = '42501';
  end if;

  select conversation.contact_id, conversation.credential_generation_id
  into v_contact_id, v_credential_generation_id
  from public.line_conversations conversation
  join public.line_contacts contact
    on contact.id = conversation.contact_id
   and contact.clinic_id = conversation.clinic_id
  join public.clinic_line_credentials credentials
    on credentials.clinic_id = conversation.clinic_id
   and credentials.credential_generation_id = contact.credential_generation_id
   and credentials.is_active
  where conversation.id = p_conversation_id
    and conversation.clinic_id = p_clinic_id
    and conversation.status = 'open'
    and contact.blocked_at is null
    and contact.unfollowed_at is null
  for update of conversation, contact;

  if not found then
    raise exception 'LINE_CHAT_CONVERSATION_NOT_SENDABLE'
      using errcode = 'P0001';
  end if;

  insert into public.line_messages (
    id,
    clinic_id,
    conversation_id,
    contact_id,
    credential_generation_id,
    direction,
    message_type,
    text_content,
    status,
    sent_by,
    occurred_at
  )
  values (
    v_message_id,
    p_clinic_id,
    p_conversation_id,
    v_contact_id,
    v_credential_generation_id,
    'outbound',
    'text',
    p_text,
    'queued',
    p_sent_by,
    statement_timestamp()
  );

  insert into public.line_chat_outbox (
    clinic_id,
    conversation_id,
    message_id,
    credential_generation_id
  )
  values (
    p_clinic_id,
    p_conversation_id,
    v_message_id,
    v_credential_generation_id
  );

  return v_message_id;
end
$function$;

create table if not exists public.line_job_heartbeats (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  job_name text not null,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text not null default 'never'
    check (last_status in ('never', 'running', 'succeeded', 'failed')),
  last_error_code text,
  updated_at timestamptz not null default now(),
  constraint line_job_heartbeats_job_name_not_blank
    check (length(btrim(job_name)) > 0)
);

create unique index if not exists line_job_heartbeats_scope_unique
  on public.line_job_heartbeats (job_name, coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.line_job_heartbeats is
  'Operational heartbeat metadata only. It does not contain message bodies, LINE IDs, or secrets.';

drop trigger if exists update_clinic_line_setup_sessions_updated_at
on public.clinic_line_setup_sessions;
create trigger update_clinic_line_setup_sessions_updated_at
before update on public.clinic_line_setup_sessions
for each row execute function public.update_updated_at_column();

drop trigger if exists update_clinic_line_chat_settings_updated_at
on public.clinic_line_chat_settings;
create trigger update_clinic_line_chat_settings_updated_at
before update on public.clinic_line_chat_settings
for each row execute function public.update_updated_at_column();

drop trigger if exists update_line_contacts_updated_at
on public.line_contacts;
create trigger update_line_contacts_updated_at
before update on public.line_contacts
for each row execute function public.update_updated_at_column();

drop trigger if exists update_line_conversations_updated_at
on public.line_conversations;
create trigger update_line_conversations_updated_at
before update on public.line_conversations
for each row execute function public.update_updated_at_column();

drop trigger if exists update_line_messages_updated_at
on public.line_messages;
create trigger update_line_messages_updated_at
before update on public.line_messages
for each row execute function public.update_updated_at_column();

-- Every LINE integration relation is internal-only. Application routes use a
-- server-side service client after authenticating and authorizing the actor.
do $privileges$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clinic_line_setup_sessions',
    'clinic_line_credential_generations',
    'clinic_line_chat_settings',
    'line_contacts',
    'line_conversations',
    'line_webhook_events',
    'line_messages',
    'line_chat_outbox',
    'line_job_heartbeats'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('revoke all on table public.%I from service_role', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end
$privileges$;

create or replace function public.expire_line_setup_sessions(
  p_clinic_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_count integer;
begin
  update public.clinic_line_setup_sessions setup_session
  set
    encrypted_private_jwk = null,
    status = 'expired'
  where setup_session.status in ('prepared', 'verified')
    and setup_session.expires_at <= statement_timestamp()
    and (p_clinic_id is null or setup_session.clinic_id = p_clinic_id);

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

create or replace function public.rotate_line_credential_generation(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_new_generation_id uuid,
  p_credentials jsonb,
  p_updated_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_previous_generation_id uuid;
  v_credential_fingerprint text;
  v_encrypted_private_jwk text;
  v_public_key_kid text;
  v_stale_message_ids uuid[];
begin
  if p_new_generation_id is null then
    raise exception 'LINE_CREDENTIAL_GENERATION_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  select
    setup_session.credential_fingerprint,
    setup_session.encrypted_private_jwk,
    setup_session.public_key_kid
  into
    v_credential_fingerprint,
    v_encrypted_private_jwk,
    v_public_key_kid
  from public.clinic_line_setup_sessions setup_session
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status = 'verified'
    and setup_session.expires_at > statement_timestamp()
  for update;

  if not found then
    raise exception 'LINE_SETUP_SESSION_NOT_VERIFIED'
      using errcode = 'P0001';
  end if;

  if p_credentials is null
    or jsonb_typeof(p_credentials) <> 'object'
    or length(btrim(coalesce(p_credentials->>'messaging_channel_id', ''))) = 0
    or length(btrim(coalesce(p_credentials->>'channel_secret_encrypted', ''))) = 0
    or length(btrim(coalesce(v_encrypted_private_jwk, ''))) = 0
    or length(btrim(coalesce(v_public_key_kid, ''))) = 0
  then
    raise exception 'LINE_ROTATION_CREDENTIALS_INVALID'
      using errcode = '22023';
  end if;

  select credentials.credential_generation_id
  into v_previous_generation_id
  from public.clinic_line_credentials credentials
  where credentials.clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'LINE_CREDENTIALS_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_previous_generation_id = p_new_generation_id then
    raise exception 'LINE_CREDENTIAL_GENERATION_UNCHANGED'
      using errcode = '22023';
  end if;

  update public.line_message_outbox outbox
  set
    claim_token = null,
    claimed_at = null,
    last_error = 'claim_lease_expired'
  where outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and outbox.claim_token is not null
    and outbox.claimed_at < statement_timestamp() - interval '2 minutes';

  if exists (
    select 1
    from public.line_message_outbox outbox
    where outbox.clinic_id = p_clinic_id
      and outbox.status = 'pending'
      and outbox.claim_token is not null
  ) then
    raise exception 'LINE_CREDENTIAL_ROTATION_DELIVERY_IN_PROGRESS'
      using errcode = '55006';
  end if;

  select coalesce(array_agg(stale.message_id), array[]::uuid[])
  into v_stale_message_ids
  from (
    select outbox.message_id
    from public.line_chat_outbox outbox
    where outbox.clinic_id = p_clinic_id
      and outbox.status = 'processing'
      and outbox.claimed_at < statement_timestamp() - interval '5 minutes'
    for update
  ) stale;

  update public.line_chat_outbox outbox
  set
    attempts = outbox.attempts + 1,
    status = case when outbox.attempts + 1 >= 3 then 'failed' else 'pending' end,
    next_attempt_at = statement_timestamp(),
    claim_token = null,
    claimed_at = null,
    last_error_code = 'claim_lease_expired'
  where outbox.message_id = any (v_stale_message_ids);

  update public.line_messages message
  set status = 'failed'
  where message.id = any (v_stale_message_ids)
    and exists (
      select 1
      from public.line_chat_outbox outbox
      where outbox.message_id = message.id
        and outbox.status = 'failed'
    );

  if exists (
    select 1
    from public.line_chat_outbox outbox
    where outbox.clinic_id = p_clinic_id
      and outbox.status = 'processing'
  ) then
    raise exception 'LINE_CREDENTIAL_ROTATION_DELIVERY_IN_PROGRESS'
      using errcode = '55006';
  end if;

  update public.clinic_line_credential_generations generation
  set status = 'replaced', replaced_at = statement_timestamp()
  where generation.clinic_id = p_clinic_id
    and generation.id = v_previous_generation_id
    and generation.status = 'active';

  if not found then
    raise exception 'LINE_CREDENTIAL_GENERATION_STATE_INVALID'
      using errcode = 'P0001';
  end if;

  insert into public.clinic_line_credential_generations (
    clinic_id,
    id,
    status
  )
  values (
    p_clinic_id,
    p_new_generation_id,
    'active'
  );

  update public.clinic_line_credentials credentials
  set
    credential_generation_id = p_new_generation_id,
    liff_id = nullif(btrim(p_credentials->>'liff_id'), ''),
    oa_basic_id = nullif(btrim(p_credentials->>'oa_basic_id'), ''),
    messaging_channel_id = p_credentials->>'messaging_channel_id',
    login_channel_id = nullif(btrim(p_credentials->>'login_channel_id'), ''),
    channel_secret_encrypted = p_credentials->>'channel_secret_encrypted',
    assertion_private_key_encrypted = v_encrypted_private_jwk,
    assertion_kid = v_public_key_kid,
    credential_fingerprint = v_credential_fingerprint,
    app_type = coalesce(nullif(btrim(p_credentials->>'app_type'), ''), credentials.app_type),
    app_endpoint_id = nullif(btrim(p_credentials->>'app_endpoint_id'), ''),
    access_token_encrypted = null,
    token_expires_at = null,
    access_token_key_id = null,
    bot_user_id = null,
    bot_display_name = null,
    bot_picture_url = null,
    last_metadata_verified_at = null,
    last_token_verified_at = null,
    last_token_test_error = null,
    last_push_test_sent_at = null,
    last_push_test_error = null,
    webhook_verified_at = null,
    last_webhook_received_at = null,
    credentials_verified_at = statement_timestamp(),
    setup_completed_at = statement_timestamp(),
    updated_by = p_updated_by
  where credentials.clinic_id = p_clinic_id;

  update public.line_conversations conversation
  set status = 'closed', closed_at = statement_timestamp()
  from public.line_contacts contact
  where conversation.clinic_id = p_clinic_id
    and contact.id = conversation.contact_id
    and contact.clinic_id = conversation.clinic_id
    and contact.credential_generation_id = v_previous_generation_id
    and conversation.status = 'open';

  update public.line_chat_outbox outbox
  set
    status = 'failed',
    last_error_code = 'credential_generation_replaced',
    claim_token = null,
    claimed_at = null
  from public.line_conversations conversation
  join public.line_contacts contact
    on contact.id = conversation.contact_id
   and contact.clinic_id = conversation.clinic_id
  where outbox.conversation_id = conversation.id
    and outbox.clinic_id = conversation.clinic_id
    and outbox.status = 'pending'
    and contact.credential_generation_id = v_previous_generation_id;

  update public.line_messages message
  set status = 'failed'
  from public.line_chat_outbox outbox
  where outbox.message_id = message.id
    and outbox.clinic_id = message.clinic_id
    and outbox.credential_generation_id = v_previous_generation_id
    and outbox.status = 'failed'
    and outbox.last_error_code = 'credential_generation_replaced';

  update public.line_message_outbox outbox
  set
    status = 'failed',
    last_error = 'credential_generation_replaced',
    sent_at = null,
    next_attempt_at = statement_timestamp()
  where outbox.clinic_id = p_clinic_id
    and outbox.credential_generation_id = v_previous_generation_id
    and outbox.status = 'pending';

  update public.clinic_line_setup_sessions setup_session
  set
    encrypted_private_jwk = null,
    status = 'consumed',
    consumed_at = statement_timestamp()
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id;

  return v_previous_generation_id;
end
$function$;

create or replace function public.claim_line_chat_outbox(
  p_clinic_id uuid,
  p_limit integer default 20
)
returns table (
  outbox_id uuid,
  claim_token uuid,
  line_user_id text,
  text_content text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_stale_message_ids uuid[];
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'LINE_CHAT_CLAIM_LIMIT_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  if not exists (
    select 1
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = p_clinic_id
      and feature_flags.line_chat_enabled
  ) then
    update public.line_chat_outbox outbox
    set
      status = 'failed',
      claim_token = null,
      claimed_at = null,
      last_error_code = 'line_chat_disabled'
    where outbox.clinic_id = p_clinic_id
      and (
        outbox.status = 'pending'
        or (
          outbox.status = 'processing'
          and outbox.claimed_at < statement_timestamp() - interval '5 minutes'
        )
      );

    update public.line_messages message
    set status = 'failed'
    from public.line_chat_outbox outbox
    where outbox.message_id = message.id
      and outbox.clinic_id = p_clinic_id
      and outbox.status = 'failed'
      and outbox.last_error_code = 'line_chat_disabled'
      and message.status = 'queued';

    return;
  end if;

  select coalesce(array_agg(stale.message_id), array[]::uuid[])
  into v_stale_message_ids
  from (
    select outbox.message_id
    from public.line_chat_outbox outbox
    where outbox.clinic_id = p_clinic_id
      and outbox.status = 'processing'
      and outbox.claimed_at < statement_timestamp() - interval '5 minutes'
    for update
  ) stale;

  update public.line_chat_outbox outbox
  set
    attempts = outbox.attempts + 1,
    status = case when outbox.attempts + 1 >= 3 then 'failed' else 'pending' end,
    next_attempt_at = statement_timestamp(),
    claim_token = null,
    claimed_at = null,
    last_error_code = 'claim_lease_expired'
  where outbox.message_id = any (v_stale_message_ids);

  update public.line_messages message
  set status = case
    when outbox.status = 'failed' then 'failed'
    else 'queued'
  end
  from public.line_chat_outbox outbox
  where message.id = any (v_stale_message_ids)
    and outbox.message_id = message.id;

  update public.line_chat_outbox outbox
  set
    status = 'failed',
    last_error_code = 'message_not_sendable'
  from public.line_messages message
  where outbox.message_id = message.id
    and outbox.clinic_id = p_clinic_id
    and outbox.status = 'pending'
    and (
      message.direction <> 'outbound'
      or message.message_type <> 'text'
      or message.status <> 'queued'
      or message.text_content is null
    );

  update public.line_messages message
  set status = 'failed'
  from public.line_chat_outbox outbox
  where outbox.message_id = message.id
    and outbox.clinic_id = p_clinic_id
    and outbox.status = 'failed'
    and outbox.last_error_code = 'message_not_sendable';

  return query
  with claimable as (
    select outbox.id
    from public.line_chat_outbox outbox
    join public.line_conversations conversation
      on conversation.id = outbox.conversation_id
     and conversation.clinic_id = outbox.clinic_id
     and conversation.credential_generation_id = outbox.credential_generation_id
    join public.line_contacts contact
      on contact.id = conversation.contact_id
     and contact.clinic_id = conversation.clinic_id
     and contact.credential_generation_id = conversation.credential_generation_id
    join public.clinic_line_credentials credentials
      on credentials.clinic_id = outbox.clinic_id
     and credentials.credential_generation_id = outbox.credential_generation_id
     and credentials.is_active
    join public.line_messages message
      on message.id = outbox.message_id
     and message.clinic_id = outbox.clinic_id
     and message.conversation_id = outbox.conversation_id
     and message.credential_generation_id = outbox.credential_generation_id
    where outbox.clinic_id = p_clinic_id
      and outbox.status = 'pending'
      and outbox.next_attempt_at <= statement_timestamp()
      and outbox.attempts < 3
      and conversation.status = 'open'
      and contact.blocked_at is null
      and contact.unfollowed_at is null
      and message.direction = 'outbound'
      and message.message_type = 'text'
      and message.status = 'queued'
      and message.text_content is not null
    order by outbox.created_at, outbox.id
    for update of outbox skip locked
    limit p_limit
  ), claimed as (
    update public.line_chat_outbox outbox
    set
      status = 'processing',
      claim_token = gen_random_uuid(),
      claimed_at = statement_timestamp()
    from claimable
    where outbox.id = claimable.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.claim_token,
    contact.line_user_id,
    message.text_content
  from claimed
  join public.line_messages message
    on message.id = claimed.message_id
   and message.clinic_id = claimed.clinic_id
   and message.credential_generation_id = claimed.credential_generation_id
  join public.line_conversations conversation
    on conversation.id = claimed.conversation_id
   and conversation.clinic_id = claimed.clinic_id
  join public.line_contacts contact
    on contact.id = conversation.contact_id
   and contact.clinic_id = conversation.clinic_id;
end
$function$;

create or replace function public.finalize_line_chat_outbox(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_line_message_id text default null,
  p_error_code text default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_outbox public.line_chat_outbox%rowtype;
begin
  select outbox.*
  into v_outbox
  from public.line_chat_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
  for update;

  if not found
    or v_outbox.status <> 'processing'
    or v_outbox.claim_token is distinct from p_claim_token
  then
    raise exception 'LINE_CHAT_OUTBOX_CLAIM_INVALID'
      using errcode = 'P0001';
  end if;

  if p_succeeded then
    if p_line_message_id is null or length(btrim(p_line_message_id)) = 0 then
      raise exception 'LINE_CHAT_MESSAGE_ID_REQUIRED'
        using errcode = '22023';
    end if;

    update public.line_messages
    set status = 'sent', line_message_id = p_line_message_id
    where id = v_outbox.message_id and clinic_id = p_clinic_id;

    update public.line_chat_outbox
    set
      status = 'sent',
      attempts = attempts + 1,
      sent_at = statement_timestamp(),
      claim_token = null,
      claimed_at = null,
      last_error_code = null
    where id = p_outbox_id;
  else
    update public.line_messages
    set status = case when v_outbox.attempts + 1 >= 3 then 'failed' else 'queued' end
    where id = v_outbox.message_id and clinic_id = p_clinic_id;

    update public.line_chat_outbox
    set
      status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
      attempts = attempts + 1,
      next_attempt_at = case
        when attempts + 1 >= 3 then next_attempt_at
        else statement_timestamp() + make_interval(secs => power(2, attempts)::integer * 30)
      end,
      claim_token = null,
      claimed_at = null,
      last_error_code = left(coalesce(p_error_code, 'line_push_failed'), 255)
    where id = p_outbox_id;
  end if;
end
$function$;

create or replace function public.close_line_setup_session(
  p_clinic_id uuid,
  p_setup_session_id uuid,
  p_status text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_status not in ('consumed', 'revoked') then
    raise exception 'LINE_SETUP_SESSION_CLOSE_STATUS_INVALID'
      using errcode = '22023';
  end if;

  update public.clinic_line_setup_sessions setup_session
  set
    encrypted_private_jwk = null,
    status = p_status,
    consumed_at = case when p_status = 'consumed' then statement_timestamp() else null end
  where setup_session.id = p_setup_session_id
    and setup_session.clinic_id = p_clinic_id
    and setup_session.status in ('prepared', 'verified');

  if not found then
    raise exception 'LINE_SETUP_SESSION_NOT_CLOSABLE'
      using errcode = 'P0001';
  end if;
end
$function$;

create or replace function public.enqueue_outreach_campaign(
  p_clinic_id uuid,
  p_campaign_id uuid,
  p_expected_message_body text,
  p_deliveries jsonb
)
returns table (
  enqueued_count integer,
  sent_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_campaign_message_body text;
  v_credential_generation_id uuid;
  v_delivery_count integer;
  v_eligible_count integer;
  v_sent_at timestamptz := statement_timestamp();
begin
  if p_deliveries is null
    or jsonb_typeof(p_deliveries) <> 'array'
    or jsonb_array_length(p_deliveries) not between 1 and 300
  then
    raise exception 'LINE_OUTREACH_DELIVERIES_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  select credentials.credential_generation_id
  into v_credential_generation_id
  from public.clinic_line_credentials credentials
  join public.clinic_feature_flags feature_flags
    on feature_flags.clinic_id = credentials.clinic_id
   and feature_flags.line_notification_enabled
  where credentials.clinic_id = p_clinic_id
    and credentials.is_active
  for update of credentials;

  if not found then
    raise exception 'LINE_NOTIFICATION_DISABLED_OR_UNCONFIGURED'
      using errcode = 'P0001';
  end if;

  select campaign.message_body
  into v_campaign_message_body
  from public.patient_outreach_campaigns campaign
  where campaign.id = p_campaign_id
    and campaign.clinic_id = p_clinic_id
    and campaign.status = 'draft'
  for update;

  if not found then
    raise exception 'LINE_OUTREACH_CAMPAIGN_NOT_SENDABLE'
      using errcode = 'P0001';
  end if;

  if v_campaign_message_body is distinct from p_expected_message_body then
    raise exception 'LINE_OUTREACH_CAMPAIGN_CHANGED'
      using errcode = '40001';
  end if;

  perform 1
  from public.patient_outreach_recipients recipient
  join public.customers customer
    on customer.id = recipient.customer_id
   and customer.clinic_id = recipient.clinic_id
  where recipient.campaign_id = p_campaign_id
    and recipient.clinic_id = p_clinic_id
  for update of recipient, customer;

  select count(*)::integer
  into v_delivery_count
  from jsonb_to_recordset(p_deliveries) as delivery(
    recipient_id uuid,
    customer_id uuid,
    line_user_id text,
    payload jsonb
  )
  where delivery.recipient_id is not null
    and delivery.customer_id is not null
    and length(btrim(coalesce(delivery.line_user_id, ''))) > 0
    and jsonb_typeof(delivery.payload) = 'object'
    and length(btrim(coalesce(delivery.payload->>'text', ''))) > 0
    and delivery.payload->>'customerId' = delivery.customer_id::text
    and delivery.payload#>>'{outreach,campaignId}' = p_campaign_id::text
    and delivery.payload#>>'{outreach,recipientId}' = delivery.recipient_id::text
    and delivery.payload#>>'{outreach,customerId}' = delivery.customer_id::text;

  if v_delivery_count <> jsonb_array_length(p_deliveries)
    or (
      select count(distinct delivery.recipient_id)
      from jsonb_to_recordset(p_deliveries) as delivery(
        recipient_id uuid,
        customer_id uuid,
        line_user_id text,
        payload jsonb
      )
    ) <> v_delivery_count
  then
    raise exception 'LINE_OUTREACH_DELIVERY_CONTRACT_INVALID'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.patient_outreach_recipients recipient
  join public.customers customer
    on customer.id = recipient.customer_id
   and customer.clinic_id = recipient.clinic_id
   and customer.line_user_id = recipient.line_user_id
   and customer.line_credential_generation_id = v_credential_generation_id
   and customer.consent_marketing
   and not customer.is_deleted
  where recipient.campaign_id = p_campaign_id
    and recipient.clinic_id = p_clinic_id
    and recipient.delivery_status = 'pending';

  if v_eligible_count <> v_delivery_count
    or exists (
      select 1
      from jsonb_to_recordset(p_deliveries) as delivery(
        recipient_id uuid,
        customer_id uuid,
        line_user_id text,
        payload jsonb
      )
      where not exists (
        select 1
        from public.patient_outreach_recipients recipient
        join public.customers customer
          on customer.id = recipient.customer_id
         and customer.clinic_id = recipient.clinic_id
         and customer.line_user_id = recipient.line_user_id
         and customer.line_credential_generation_id = v_credential_generation_id
         and customer.consent_marketing
         and not customer.is_deleted
        where recipient.id = delivery.recipient_id
          and recipient.campaign_id = p_campaign_id
          and recipient.clinic_id = p_clinic_id
          and recipient.customer_id = delivery.customer_id
          and recipient.line_user_id = delivery.line_user_id
          and recipient.delivery_status = 'pending'
      )
    )
  then
    raise exception 'LINE_OUTREACH_RECIPIENT_SET_CHANGED'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_deliveries) as delivery(
      recipient_id uuid,
      customer_id uuid,
      line_user_id text,
      payload jsonb
    )
    join public.patient_outreach_recipients recent_recipient
      on recent_recipient.clinic_id = p_clinic_id
     and recent_recipient.customer_id = delivery.customer_id
     and recent_recipient.campaign_id <> p_campaign_id
     and recent_recipient.sent_at >= v_sent_at - interval '30 days'
  ) then
    raise exception 'LINE_OUTREACH_FREQUENCY_LIMIT'
      using errcode = '23514';
  end if;

  update public.patient_outreach_recipients recipient
  set delivery_status = 'skipped'
  where recipient.campaign_id = p_campaign_id
    and recipient.clinic_id = p_clinic_id
    and recipient.delivery_status = 'pending'
    and not exists (
      select 1
      from jsonb_to_recordset(p_deliveries) as delivery(
        recipient_id uuid,
        customer_id uuid,
        line_user_id text,
        payload jsonb
      )
      where delivery.recipient_id = recipient.id
    );

  insert into public.line_message_outbox (
    clinic_id,
    credential_generation_id,
    customer_id,
    line_user_id,
    message_type,
    payload,
    status
  )
  select
    p_clinic_id,
    v_credential_generation_id,
    delivery.customer_id,
    delivery.line_user_id,
    'outreach',
    delivery.payload,
    'pending'
  from jsonb_to_recordset(p_deliveries) as delivery(
    recipient_id uuid,
    customer_id uuid,
    line_user_id text,
    payload jsonb
  );

  update public.patient_outreach_recipients recipient
  set delivery_status = 'pending', sent_at = v_sent_at
  where recipient.campaign_id = p_campaign_id
    and recipient.clinic_id = p_clinic_id
    and exists (
      select 1
      from jsonb_to_recordset(p_deliveries) as delivery(
        recipient_id uuid,
        customer_id uuid,
        line_user_id text,
        payload jsonb
      )
      where delivery.recipient_id = recipient.id
    );

  update public.patient_outreach_campaigns campaign
  set status = 'sent', sent_at = v_sent_at
  where campaign.id = p_campaign_id
    and campaign.clinic_id = p_clinic_id
    and campaign.status = 'draft';

  if not found then
    raise exception 'LINE_OUTREACH_CAMPAIGN_CLAIM_CONFLICT'
      using errcode = '40001';
  end if;

  return query select v_delivery_count, v_sent_at;
end
$function$;

create or replace function public.relink_line_contact_generation(
  p_clinic_id uuid,
  p_previous_contact_id uuid,
  p_line_user_id text,
  p_customer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current_generation_id uuid;
  v_contact_id uuid;
  v_previous_customer_id uuid;
begin
  if p_line_user_id is null or length(btrim(p_line_user_id)) = 0 then
    raise exception 'LINE_USER_ID_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  select credentials.credential_generation_id
  into v_current_generation_id
  from public.clinic_line_credentials credentials
  where credentials.clinic_id = p_clinic_id
    and credentials.is_active
  for update;

  if not found then
    raise exception 'LINE_CREDENTIALS_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if p_previous_contact_id is not null then
    select contact.customer_id
    into v_previous_customer_id
    from public.line_contacts contact
    where contact.id = p_previous_contact_id
      and contact.clinic_id = p_clinic_id
      and contact.credential_generation_id <> v_current_generation_id
    for update;

    if not found then
      raise exception 'LINE_PREVIOUS_CONTACT_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_previous_customer_id is not null
      and v_previous_customer_id is distinct from p_customer_id
    then
      raise exception 'LINE_PREVIOUS_CONTACT_CUSTOMER_MISMATCH'
        using errcode = '42501';
    end if;
  end if;

  insert into public.line_contacts (
    clinic_id,
    line_user_id,
    credential_generation_id
  )
  values (
    p_clinic_id,
    p_line_user_id,
    v_current_generation_id
  )
  on conflict (clinic_id, credential_generation_id, line_user_id)
  do update set updated_at = statement_timestamp()
  returning id into v_contact_id;

  if p_customer_id is not null then
    update public.line_contacts contact
    set customer_id = null
    where contact.id = p_previous_contact_id
      and contact.clinic_id = p_clinic_id;

    update public.customers customer
    set
      line_user_id = null,
      line_credential_generation_id = null
    where customer.id = p_customer_id
      and customer.clinic_id = p_clinic_id;

    if not found then
      raise exception 'LINE_CUSTOMER_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    update public.customers customer
    set
      line_user_id = p_line_user_id,
      line_credential_generation_id = v_current_generation_id
    where customer.id = p_customer_id
      and customer.clinic_id = p_clinic_id;

    update public.line_contacts contact
    set customer_id = p_customer_id
    where contact.id = v_contact_id
      and contact.clinic_id = p_clinic_id;

  end if;

  return v_contact_id;
end
$function$;

create or replace function public.purge_expired_line_chat_data(
  p_clinic_id uuid default null
)
returns table (
  deleted_messages integer,
  deleted_webhook_events integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_deleted_messages integer := 0;
  v_deleted_events integer := 0;
begin
  with deleted as (
    delete from public.line_messages message
    where (p_clinic_id is null or message.clinic_id = p_clinic_id)
      and message.created_at < statement_timestamp() - make_interval(
        days => coalesce(
          (
            select settings.retention_days
            from public.clinic_line_chat_settings settings
            where settings.clinic_id = message.clinic_id
          ),
          90
        )
      )
    returning message.id
  )
  select count(*)::integer into v_deleted_messages from deleted;

  with deleted as (
    delete from public.line_webhook_events event
    where (p_clinic_id is null or event.clinic_id = p_clinic_id)
      and event.created_at < statement_timestamp() - make_interval(
        days => coalesce(
          (
            select settings.retention_days
            from public.clinic_line_chat_settings settings
            where settings.clinic_id = event.clinic_id
          ),
          90
        )
      )
      and not exists (
        select 1
        from public.line_messages message
        where message.webhook_event_id = event.id
      )
    returning event.id
  )
  select count(*)::integer into v_deleted_events from deleted;

  return query select v_deleted_messages, v_deleted_events;
end
$function$;

revoke all on function public.expire_line_setup_sessions(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.expire_line_setup_sessions(uuid)
  to service_role;

revoke all on function public.initialize_line_credential_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_line_credential_generation()
  to service_role;

revoke all on function public.initialize_customer_line_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_customer_line_generation()
  to service_role;

revoke all on function public.protect_customer_line_identity()
  from public, anon, authenticated, service_role;
grant execute on function public.protect_customer_line_identity()
  to service_role;

revoke all on function public.initialize_line_message_outbox_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_line_message_outbox_generation()
  to service_role;

revoke all on function public.sync_failed_line_notification_tracking()
  from public, anon, authenticated, service_role;
grant execute on function public.sync_failed_line_notification_tracking()
  to service_role;

revoke all on function public.quarantine_unverified_line_notification_history()
  from public, anon, authenticated, service_role;
grant execute on function public.quarantine_unverified_line_notification_history()
  to service_role;

revoke all on function public.claim_line_notification_outbox(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_notification_outbox(uuid, uuid, integer)
  to service_role;

revoke all on function public.finalize_line_notification_outbox(
  uuid, uuid, uuid, text, timestamptz, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_notification_outbox(
  uuid, uuid, uuid, text, timestamptz, text, timestamptz
) to service_role;

revoke all on function public.renew_line_notification_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_line_notification_claim(uuid, uuid, uuid)
  to service_role;

revoke all on function public.validate_line_current_generation()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_current_generation()
  to service_role;

revoke all on function public.rotate_line_credential_generation(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rotate_line_credential_generation(uuid, uuid, uuid, jsonb, uuid)
  to service_role;

revoke all on function public.validate_line_credential_rotation()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_credential_rotation()
  to service_role;

revoke all on function public.purge_expired_line_chat_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_line_chat_data(uuid)
  to service_role;

revoke all on function public.validate_line_chat_outbox_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.validate_line_chat_outbox_contract()
  to service_role;

revoke all on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  to service_role;

revoke all on function public.claim_line_chat_outbox(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_chat_outbox(uuid, integer)
  to service_role;

revoke all on function public.finalize_line_chat_outbox(uuid, uuid, uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_chat_outbox(uuid, uuid, uuid, boolean, text, text)
  to service_role;

revoke all on function public.close_line_setup_session(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_line_setup_session(uuid, uuid, text)
  to service_role;

revoke all on function public.enqueue_outreach_campaign(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_outreach_campaign(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.relink_line_contact_generation(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.relink_line_contact_generation(uuid, uuid, text, uuid)
  to service_role;

do $postflight$
declare
  table_name text;
  function_oid oid;
  actual_execute_roles text[];
  has_execute_grant_option boolean;
begin
  foreach table_name in array array[
    'clinic_line_setup_sessions',
    'clinic_line_credential_generations',
    'clinic_line_chat_settings',
    'line_contacts',
    'line_conversations',
    'line_webhook_events',
    'line_messages',
    'line_chat_outbox',
    'line_job_heartbeats'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'LINE_FOUNDATION_RLS_DISABLED:%', table_name;
    end if;

    if pg_get_userbyid(
      (
        select relation.relowner
        from pg_class relation
        where relation.oid = format('public.%I', table_name)::regclass
      )
    ) <> 'postgres' then
      raise exception 'LINE_FOUNDATION_TABLE_OWNER_DRIFT:%', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'select')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'select')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'insert')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'update')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'delete')
    then
      raise exception 'LINE_FOUNDATION_CLIENT_TABLE_GRANT:%', table_name;
    end if;

    if not (
      has_table_privilege('service_role', format('public.%I', table_name), 'select')
      and has_table_privilege('service_role', format('public.%I', table_name), 'insert')
      and has_table_privilege('service_role', format('public.%I', table_name), 'update')
      and has_table_privilege('service_role', format('public.%I', table_name), 'delete')
      and has_table_privilege('service_role', format('public.%I', table_name), 'truncate')
      and has_table_privilege('service_role', format('public.%I', table_name), 'references')
      and has_table_privilege('service_role', format('public.%I', table_name), 'trigger')
    ) or exists (
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
    ) then
      raise exception 'LINE_FOUNDATION_EXACT_TABLE_ACL_DRIFT:%', table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.expire_line_setup_sessions(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.expire_line_setup_sessions(uuid)', 'execute')
    or has_function_privilege('anon', 'public.purge_expired_line_chat_data(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.purge_expired_line_chat_data(uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_chat_outbox_contract()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_chat_outbox_contract()', 'execute')
    or has_function_privilege('anon', 'public.enqueue_line_chat_message(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.enqueue_line_chat_message(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_credential_rotation()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_credential_rotation()', 'execute')
    or has_function_privilege('anon', 'public.initialize_line_credential_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_line_credential_generation()', 'execute')
    or has_function_privilege('anon', 'public.initialize_customer_line_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_customer_line_generation()', 'execute')
    or has_function_privilege('anon', 'public.protect_customer_line_identity()', 'execute')
    or has_function_privilege('authenticated', 'public.protect_customer_line_identity()', 'execute')
    or has_function_privilege('anon', 'public.initialize_line_message_outbox_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.initialize_line_message_outbox_generation()', 'execute')
    or has_function_privilege('anon', 'public.sync_failed_line_notification_tracking()', 'execute')
    or has_function_privilege('authenticated', 'public.sync_failed_line_notification_tracking()', 'execute')
    or has_function_privilege('anon', 'public.quarantine_unverified_line_notification_history()', 'execute')
    or has_function_privilege('authenticated', 'public.quarantine_unverified_line_notification_history()', 'execute')
    or has_function_privilege('anon', 'public.claim_line_notification_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_line_notification_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('anon', 'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)', 'execute')
    or has_function_privilege('anon', 'public.renew_line_notification_claim(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.renew_line_notification_claim(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.validate_line_current_generation()', 'execute')
    or has_function_privilege('authenticated', 'public.validate_line_current_generation()', 'execute')
    or has_function_privilege('anon', 'public.claim_line_chat_outbox(uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_line_chat_outbox(uuid,integer)', 'execute')
    or has_function_privilege('anon', 'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)', 'execute')
    or has_function_privilege('anon', 'public.close_line_setup_session(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.close_line_setup_session(uuid,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.relink_line_contact_generation(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.relink_line_contact_generation(uuid,uuid,text,uuid)', 'execute')
  then
    raise exception 'LINE_FOUNDATION_CLIENT_FUNCTION_GRANT';
  end if;

  foreach function_oid in array array[
    'public.expire_line_setup_sessions(uuid)'::regprocedure::oid,
    'public.purge_expired_line_chat_data(uuid)'::regprocedure::oid,
    'public.validate_line_chat_outbox_contract()'::regprocedure::oid,
    'public.enqueue_line_chat_message(uuid,uuid,text,uuid)'::regprocedure::oid,
    'public.rotate_line_credential_generation(uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid,
    'public.validate_line_credential_rotation()'::regprocedure::oid,
    'public.initialize_line_credential_generation()'::regprocedure::oid,
    'public.initialize_customer_line_generation()'::regprocedure::oid,
    'public.protect_customer_line_identity()'::regprocedure::oid,
    'public.initialize_line_message_outbox_generation()'::regprocedure::oid,
    'public.sync_failed_line_notification_tracking()'::regprocedure::oid,
    'public.quarantine_unverified_line_notification_history()'::regprocedure::oid,
    'public.claim_line_notification_outbox(uuid,uuid,integer)'::regprocedure::oid,
    'public.finalize_line_notification_outbox(uuid,uuid,uuid,text,timestamptz,text,timestamptz)'::regprocedure::oid,
    'public.renew_line_notification_claim(uuid,uuid,uuid)'::regprocedure::oid,
    'public.validate_line_current_generation()'::regprocedure::oid,
    'public.claim_line_chat_outbox(uuid,integer)'::regprocedure::oid,
    'public.finalize_line_chat_outbox(uuid,uuid,uuid,boolean,text,text)'::regprocedure::oid,
    'public.close_line_setup_session(uuid,uuid,text)'::regprocedure::oid,
    'public.enqueue_outreach_campaign(uuid,uuid,text,jsonb)'::regprocedure::oid,
    'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure::oid
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
      raise exception 'LINE_FOUNDATION_EXACT_FUNCTION_ACL_DRIFT:%', function_oid;
    end if;

    if exists (
      select 1
      from pg_proc function_data
      where function_data.oid = function_oid
        and (
          function_data.prosecdef is distinct from (
            function_data.oid = 'public.relink_line_contact_generation(uuid,uuid,text,uuid)'::regprocedure::oid
          )
          or pg_get_userbyid(function_data.proowner) <> 'postgres'
          or not exists (
            select 1
            from unnest(coalesce(function_data.proconfig, array[]::text[])) setting
            where setting = 'search_path=pg_catalog, public'
          )
        )
    ) then
      raise exception 'LINE_FOUNDATION_FUNCTION_CONTRACT_DRIFT:%', function_oid;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'customers_clinic_line_user_id_unique'
      and indexdef ilike '%unique%clinic_id%line_user_id%where (line_user_id is not null)%'
  ) then
    raise exception 'LINE_FOUNDATION_CUSTOMER_IDENTITY_INDEX_DRIFT';
  end if;
end
$postflight$;

commit;
