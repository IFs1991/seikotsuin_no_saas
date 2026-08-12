-- CRM Data Foundation & LINE Growth Features v0.1
-- @spec docs/stabilization/spec-crm-line-growth-v0.1.md
-- @source docs/Tiramisu_CRM_Data_Foundation_and_Line_Growth_Features_Spec_v0.1.md
-- @rollback supabase/rollbacks/20260811155532_crm_line_growth_foundation_rollback.sql
--
-- The existing customers table is the canonical patient identity in this
-- repository. The legacy patients/patient_profiles names are intentionally not
-- reintroduced; all new relationships use customers.id as patient_id.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, auth, extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_id_clinic_unique'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_id_clinic_unique unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_id_clinic_unique'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_id_clinic_unique unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'resources_id_clinic_unique'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_id_clinic_unique unique (id, clinic_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_message_outbox_id_clinic_unique'
      and conrelid = 'public.line_message_outbox'::regclass
  ) then
    alter table public.line_message_outbox
      add constraint line_message_outbox_id_clinic_unique unique (id, clinic_id);
  end if;
end
$$;

create table if not exists public.patient_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  customer_id uuid not null,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null default 'name'
    check (alias_type in ('name', 'phonetic_name', 'other')),
  source text not null default 'manual'
    check (source in ('manual', 'line_profile', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_identity_aliases_customer_clinic_fkey
    foreign key (customer_id, clinic_id)
    references public.customers(id, clinic_id)
    on delete cascade,
  constraint patient_identity_aliases_alias_not_blank
    check (length(btrim(alias)) > 0),
  constraint patient_identity_aliases_normalized_not_blank
    check (length(btrim(normalized_alias)) > 0),
  constraint patient_identity_aliases_unique_value
    unique (clinic_id, customer_id, normalized_alias, alias_type)
);

comment on table public.patient_identity_aliases is
  'Patient identity aliases. customer_id is the canonical patient_id in the current data model.';

create index if not exists patient_identity_aliases_lookup_idx
  on public.patient_identity_aliases (clinic_id, normalized_alias);

create table if not exists public.patient_staff_preferences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  customer_id uuid not null,
  staff_id uuid not null,
  notification_enabled boolean not null default true,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_staff_preferences_customer_clinic_fkey
    foreign key (customer_id, clinic_id)
    references public.customers(id, clinic_id)
    on delete cascade,
  constraint patient_staff_preferences_staff_clinic_fkey
    foreign key (staff_id, clinic_id)
    references public.resources(id, clinic_id)
    on delete cascade,
  constraint patient_staff_preferences_staff_unique
    unique (clinic_id, customer_id, staff_id)
);

comment on table public.patient_staff_preferences is
  'LINE patient-to-staff relationship and availability notification preferences.';

create index if not exists patient_staff_preferences_staff_idx
  on public.patient_staff_preferences (clinic_id, staff_id, notification_enabled);

create table if not exists public.staff_availability_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  staff_id uuid not null,
  available_datetime timestamptz not null,
  reward_type text not null default 'priority_booking'
    check (reward_type in ('priority_booking', 'points', 'self_care', 'option')),
  status text not null default 'open'
    check (status in ('open', 'notified', 'booked', 'expired', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_availability_events_staff_clinic_fkey
    foreign key (staff_id, clinic_id)
    references public.resources(id, clinic_id)
    on delete cascade,
  constraint staff_availability_events_unique_slot
    unique (clinic_id, staff_id, available_datetime),
  constraint staff_availability_events_id_clinic_unique
    unique (id, clinic_id)
);

comment on table public.staff_availability_events is
  'Clinic-scoped staff availability events that may trigger LINE relationship notifications.';

create index if not exists staff_availability_events_open_idx
  on public.staff_availability_events (clinic_id, staff_id, available_datetime)
  where status = 'open';

create table if not exists public.staff_availability_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  availability_event_id uuid not null,
  customer_id uuid not null,
  line_user_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'booked')),
  line_outbox_id uuid,
  booked_reservation_id uuid,
  sent_at timestamptz,
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_availability_notifications_event_clinic_fkey
    foreign key (availability_event_id, clinic_id)
    references public.staff_availability_events(id, clinic_id)
    on delete cascade,
  constraint staff_availability_notifications_customer_clinic_fkey
    foreign key (customer_id, clinic_id)
    references public.customers(id, clinic_id)
    on delete cascade,
  constraint staff_availability_notifications_outbox_clinic_fkey
    foreign key (line_outbox_id, clinic_id)
    references public.line_message_outbox(id, clinic_id)
    on delete set null (line_outbox_id),
  constraint staff_availability_notifications_reservation_clinic_fkey
    foreign key (booked_reservation_id, clinic_id)
    references public.reservations(id, clinic_id)
    on delete set null,
  constraint staff_availability_notifications_line_user_id_not_blank
    check (length(btrim(line_user_id)) > 0),
  constraint staff_availability_notifications_unique_recipient
    unique (availability_event_id, customer_id)
);

comment on table public.staff_availability_notifications is
  'LINE delivery and booking attribution state for staff availability events.';

create index if not exists staff_availability_notifications_status_idx
  on public.staff_availability_notifications (clinic_id, status, created_at);

create table if not exists public.reservation_rewards (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  reservation_id uuid not null,
  reward_type text not null
    check (reward_type in ('priority_booking', 'points', 'self_care', 'option')),
  status text not null default 'issued'
    check (status in ('pending', 'issued', 'redeemed', 'void')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_rewards_reservation_clinic_fkey
    foreign key (reservation_id, clinic_id)
    references public.reservations(id, clinic_id)
    on delete cascade,
  constraint reservation_rewards_unique_type
    unique (clinic_id, reservation_id, reward_type)
);

comment on table public.reservation_rewards is
  'Relationship-first rewards granted to reservations attributed to LINE growth features.';

create index if not exists reservation_rewards_reservation_idx
  on public.reservation_rewards (clinic_id, reservation_id, status);

drop trigger if exists update_patient_identity_aliases_updated_at
on public.patient_identity_aliases;

create trigger update_patient_identity_aliases_updated_at
before update on public.patient_identity_aliases
for each row execute function public.update_updated_at_column();

drop trigger if exists update_patient_staff_preferences_updated_at
on public.patient_staff_preferences;

create trigger update_patient_staff_preferences_updated_at
before update on public.patient_staff_preferences
for each row execute function public.update_updated_at_column();

drop trigger if exists update_staff_availability_events_updated_at
on public.staff_availability_events;

create trigger update_staff_availability_events_updated_at
before update on public.staff_availability_events
for each row execute function public.update_updated_at_column();

drop trigger if exists update_reservation_rewards_updated_at
on public.reservation_rewards;

create trigger update_reservation_rewards_updated_at
before update on public.reservation_rewards
for each row execute function public.update_updated_at_column();

create or replace function public.create_staff_availability_event(
  p_event_id uuid,
  p_clinic_id uuid,
  p_staff_id uuid,
  p_available_datetime timestamptz,
  p_reward_type text,
  p_created_by uuid,
  p_recipients jsonb
)
returns table (
  id uuid,
  clinic_id uuid,
  staff_id uuid,
  available_datetime timestamptz,
  reward_type text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  recipient_count integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  recipient jsonb;
  v_notification_id uuid;
  v_outbox_id uuid;
  v_customer_id uuid;
  v_line_user_id text;
  v_notification_text text;
  v_booking_url text;
  inserted_event public.staff_availability_events%rowtype;
  inserted_count integer := 0;
begin
  if not exists (
    select 1
    from public.resources resource
    where resource.id = p_staff_id
      and resource.clinic_id = p_clinic_id
      and resource.type = 'staff'
      and resource.is_active = true
      and resource.is_bookable = true
      and resource.is_deleted = false
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_AVAILABILITY_STAFF_NOT_FOUND';
  end if;

  if p_available_datetime <= now()
     or (p_available_datetime at time zone 'Asia/Tokyo')::date
        < (now() at time zone 'Asia/Tokyo')::date
     or (p_available_datetime at time zone 'Asia/Tokyo')::date
        >= (now() at time zone 'Asia/Tokyo')::date + 14 then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_AVAILABILITY_TIME_OUT_OF_RANGE';
  end if;

  if p_reward_type not in ('priority_booking', 'points', 'self_care', 'option') then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_AVAILABILITY_INVALID_REWARD';
  end if;

  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_AVAILABILITY_INVALID_RECIPIENTS';
  end if;

  insert into public.staff_availability_events (
    id,
    clinic_id,
    staff_id,
    available_datetime,
    reward_type,
    status,
    created_by
  ) values (
    p_event_id,
    p_clinic_id,
    p_staff_id,
    p_available_datetime,
    p_reward_type,
    'open',
    p_created_by
  )
  returning * into inserted_event;

  for recipient in
    select value from jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb))
  loop
    v_customer_id := (recipient ->> 'customerId')::uuid;
    v_line_user_id := btrim(recipient ->> 'lineUserId');
    v_notification_text := recipient ->> 'text';
    v_booking_url := recipient ->> 'bookingUrl';

    if v_customer_id is null
       or v_line_user_id is null
       or v_line_user_id = ''
       or v_notification_text is null
       or btrim(v_notification_text) = ''
       or v_booking_url is null
       or btrim(v_booking_url) = '' then
      raise exception using
        errcode = 'P0001',
        message = 'STAFF_AVAILABILITY_INVALID_RECIPIENT';
    end if;

    if not exists (
      select 1
      from public.customers customer
      where customer.id = v_customer_id
        and customer.clinic_id = p_clinic_id
        and customer.line_user_id = v_line_user_id
        and customer.is_deleted = false
    ) or not exists (
      select 1
      from public.patient_staff_preferences preference
      where preference.clinic_id = p_clinic_id
        and preference.customer_id = v_customer_id
        and preference.staff_id = p_staff_id
        and preference.notification_enabled = true
    ) or not exists (
      select 1
      from public.reservations reservation
      where reservation.clinic_id = p_clinic_id
        and reservation.customer_id = v_customer_id
        and reservation.staff_id = p_staff_id
        and reservation.status in ('completed', 'arrived')
        and reservation.is_deleted = false
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'STAFF_AVAILABILITY_RECIPIENT_NOT_ELIGIBLE';
    end if;

    v_notification_id := gen_random_uuid();
    v_outbox_id := gen_random_uuid();

    insert into public.line_message_outbox (
      id,
      clinic_id,
      line_user_id,
      message_type,
      payload,
      status
    ) values (
      v_outbox_id,
      p_clinic_id,
      v_line_user_id,
      'staff_availability',
      jsonb_build_object(
        'text', v_notification_text,
        'confirmationUrl', v_booking_url,
        'availability', jsonb_build_object(
          'eventId', p_event_id,
          'notificationId', v_notification_id,
          'customerId', v_customer_id
        )
      ),
      'pending'
    );

    insert into public.staff_availability_notifications (
      id,
      clinic_id,
      availability_event_id,
      customer_id,
      line_user_id,
      status,
      line_outbox_id
    ) values (
      v_notification_id,
      p_clinic_id,
      p_event_id,
      v_customer_id,
      v_line_user_id,
      'pending',
      v_outbox_id
    );

    inserted_count := inserted_count + 1;
  end loop;

  if inserted_count > 0 then
    update public.staff_availability_events event
    set status = 'notified'
    where event.id = p_event_id
      and event.clinic_id = p_clinic_id
    returning * into inserted_event;
  end if;

  return query
  select
    inserted_event.id,
    inserted_event.clinic_id,
    inserted_event.staff_id,
    inserted_event.available_datetime,
    inserted_event.reward_type,
    inserted_event.status,
    inserted_event.created_by,
    inserted_event.created_at,
    inserted_event.updated_at,
    inserted_count;
end
$function$;

create or replace function public.create_staff_availability_reservation(
  p_clinic_id uuid,
  p_event_id uuid,
  p_customer_id uuid,
  p_line_user_id text,
  p_menu_id uuid,
  p_staff_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_notes text,
  p_channel text,
  p_is_staff_requested boolean,
  p_intake_responses jsonb,
  p_campaign_id uuid
)
returns table (
  id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  locked_event public.staff_availability_events%rowtype;
  locked_notification public.staff_availability_notifications%rowtype;
  inserted_reservation public.reservations%rowtype;
begin
  select event.*
  into locked_event
  from public.staff_availability_events event
  where event.id = p_event_id
    and event.clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_NOT_FOUND';
  end if;

  if locked_event.status not in ('open', 'notified')
     or locked_event.staff_id <> p_staff_id
     or locked_event.available_datetime <> p_start_time then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_CLAIM_CONFLICT';
  end if;

  select notification.*
  into locked_notification
  from public.staff_availability_notifications notification
  where notification.availability_event_id = p_event_id
    and notification.clinic_id = p_clinic_id
    and notification.customer_id = p_customer_id
    and notification.line_user_id = p_line_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_NOTIFICATION_NOT_FOUND';
  end if;

  if locked_notification.status not in ('pending', 'sent') then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_CLAIM_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.customers customer
    where customer.id = p_customer_id
      and customer.clinic_id = p_clinic_id
      and customer.line_user_id = p_line_user_id
      and customer.is_deleted = false
  ) or not exists (
    select 1
    from public.resources resource
    where resource.id = p_staff_id
      and resource.clinic_id = p_clinic_id
      and resource.type = 'staff'
      and resource.is_active = true
      and resource.is_bookable = true
      and resource.is_deleted = false
  ) or not exists (
    select 1
    from public.menus menu
    where menu.id = p_menu_id
      and menu.clinic_id = p_clinic_id
      and menu.is_active = true
      and menu.is_public = true
      and menu.is_deleted = false
  ) or p_end_time <= p_start_time
     or p_start_time <= now()
     or p_channel <> 'line' then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_CLAIM_CONFLICT';
  end if;

  insert into public.reservations (
    clinic_id,
    customer_id,
    menu_id,
    staff_id,
    start_time,
    end_time,
    status,
    notes,
    channel,
    is_staff_requested,
    intake_responses,
    campaign_id
  ) values (
    p_clinic_id,
    p_customer_id,
    p_menu_id,
    p_staff_id,
    p_start_time,
    p_end_time,
    'unconfirmed',
    p_notes,
    'line',
    p_is_staff_requested,
    coalesce(p_intake_responses, '[]'::jsonb),
    p_campaign_id
  )
  returning * into inserted_reservation;

  update public.staff_availability_notifications notification
  set
    status = 'booked',
    booked_reservation_id = inserted_reservation.id,
    booked_at = now()
  where notification.id = locked_notification.id
    and notification.clinic_id = p_clinic_id;

  update public.staff_availability_events event
  set status = 'booked'
  where event.id = p_event_id
    and event.clinic_id = p_clinic_id;

  insert into public.reservation_rewards (
    clinic_id,
    reservation_id,
    reward_type,
    status,
    metadata
  ) values (
    p_clinic_id,
    inserted_reservation.id,
    locked_event.reward_type,
    'issued',
    jsonb_build_object(
      'source', 'staff_availability_event',
      'availability_event_id', p_event_id,
      'notification_id', locked_notification.id
    )
  );

  return query
  select
    inserted_reservation.id,
    inserted_reservation.start_time,
    inserted_reservation.end_time,
    inserted_reservation.status::text,
    inserted_reservation.updated_at;
end
$function$;

create or replace function public.finalize_staff_availability_delivery(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_notification_id uuid,
  p_status text,
  p_sent_at timestamptz,
  p_last_error text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  notification_status text;
begin
  if p_status not in ('sent', 'failed') then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_INVALID_DELIVERY_STATUS';
  end if;

  select notification.status
  into notification_status
  from public.staff_availability_notifications notification
  join public.line_message_outbox outbox
    on outbox.id = notification.line_outbox_id
   and outbox.clinic_id = notification.clinic_id
  where notification.id = p_notification_id
    and notification.clinic_id = p_clinic_id
    and outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
  for update of notification, outbox;

  if not found then
    raise exception using errcode = 'P0001', message = 'STAFF_AVAILABILITY_DELIVERY_NOT_FOUND';
  end if;

  update public.line_message_outbox outbox
  set
    status = p_status,
    sent_at = case when p_status = 'sent' then coalesce(p_sent_at, now()) else null end,
    last_error = case when p_status = 'failed' then p_last_error else null end,
    next_attempt_at = coalesce(p_sent_at, now())
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id;

  if notification_status <> 'booked' then
    update public.staff_availability_notifications notification
    set
      status = p_status,
      sent_at = case when p_status = 'sent' then coalesce(p_sent_at, now()) else notification.sent_at end
    where notification.id = p_notification_id
      and notification.clinic_id = p_clinic_id;
  end if;
end
$function$;

revoke all on function public.create_staff_availability_event(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_staff_availability_event(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) to service_role;

revoke all on function public.create_staff_availability_reservation(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, timestamptz,
  text, text, boolean, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.create_staff_availability_reservation(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, timestamptz,
  text, text, boolean, jsonb, uuid
) to service_role;

revoke all on function public.finalize_staff_availability_delivery(
  uuid, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.finalize_staff_availability_delivery(
  uuid, uuid, uuid, text, timestamptz, text
) to service_role;

do $acl$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patient_identity_aliases',
    'patient_staff_preferences',
    'staff_availability_events',
    'staff_availability_notifications',
    'reservation_rewards'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end
$acl$;

do $$
begin
  if to_regclass('public.patient_identity_aliases') is null
     or to_regclass('public.patient_staff_preferences') is null
     or to_regclass('public.staff_availability_events') is null
     or to_regclass('public.staff_availability_notifications') is null
     or to_regclass('public.reservation_rewards') is null then
    raise exception 'CRM LINE growth tables were not created';
  end if;

  if to_regprocedure(
    'public.create_staff_availability_event(uuid,uuid,uuid,timestamptz,text,uuid,jsonb)'
  ) is null
     or to_regprocedure(
       'public.create_staff_availability_reservation(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,boolean,jsonb,uuid)'
     ) is null
     or to_regprocedure(
       'public.finalize_staff_availability_delivery(uuid,uuid,uuid,text,timestamptz,text)'
     ) is null then
    raise exception 'CRM LINE growth functions were not created';
  end if;
end
$$;

commit;
