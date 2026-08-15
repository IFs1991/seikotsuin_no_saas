begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

alter table public.line_webhook_events
  add column if not exists unsend_message_id text;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.line_webhook_events'::regclass
      and conname = 'line_webhook_events_unsend_message_id_not_blank'
  ) then
    alter table public.line_webhook_events
      add constraint line_webhook_events_unsend_message_id_not_blank
      check (
        unsend_message_id is null
        or length(btrim(unsend_message_id)) > 0
      );
  end if;
end
$constraints$;

comment on column public.line_webhook_events.unsend_message_id is
  'Unsend target retained on ordinary webhook metadata. Durable privacy enforcement uses the digest tombstone table.';

create table if not exists public.line_unsend_tombstones (
  clinic_id uuid not null,
  credential_generation_id uuid not null,
  line_message_digest bytea not null,
  unsent_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (clinic_id, credential_generation_id, line_message_digest),
  foreign key (clinic_id, credential_generation_id)
    references public.clinic_line_credential_generations (clinic_id, id)
    on delete cascade,
  constraint line_unsend_tombstones_digest_length
    check (octet_length(line_message_digest) = 32)
);

comment on table public.line_unsend_tombstones is
  'Permanent content-free SHA-256 tombstones for withdrawn LINE message IDs. They are deliberately outside configurable chat retention.';

alter table public.line_unsend_tombstones enable row level security;
alter table public.line_unsend_tombstones owner to postgres;
revoke all on table public.line_unsend_tombstones
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.line_unsend_tombstones
  to service_role;

create or replace function public.process_line_webhook_delivery(
  p_clinic_id uuid,
  p_credential_generation_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_auto_reply_message text;
  v_chat_enabled boolean := false;
  v_contact_blocked boolean := false;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_duplicate_count integer := 0;
  v_event jsonb;
  v_event_id uuid;
  v_event_type text;
  v_ignored_count integer := 0;
  v_is_redelivery boolean;
  v_line_message_id text;
  v_line_user_id text;
  v_message_id uuid;
  v_message_type text;
  v_occurred_at timestamptz;
  v_payload_digest text;
  v_processed_count integer := 0;
  v_source_type text;
  v_text_content text;
  v_tombstone_unsent_at timestamptz;
  v_unsend_message_id text;
begin
  if p_clinic_id is null
    or p_credential_generation_id is null
    or p_events is null
    or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) > 1000
  then
    raise exception 'LINE_WEBHOOK_DELIVERY_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  if not exists (
    select 1
    from public.clinic_line_credentials credentials
    where credentials.clinic_id = p_clinic_id
      and credentials.credential_generation_id = p_credential_generation_id
      and credentials.is_active
    for update
  ) then
    raise exception 'LINE_WEBHOOK_CREDENTIAL_GENERATION_INVALID'
      using errcode = '23503';
  end if;

  update public.clinic_line_credentials credentials
  set
    webhook_verified_at = coalesce(
      credentials.webhook_verified_at,
      statement_timestamp()
    ),
    last_webhook_received_at = statement_timestamp()
  where credentials.clinic_id = p_clinic_id
    and credentials.credential_generation_id = p_credential_generation_id;

  select coalesce(
    (
      select feature_flags.line_chat_enabled
      from public.clinic_feature_flags feature_flags
      where feature_flags.clinic_id = p_clinic_id
    ),
    false
  ) into v_chat_enabled;

  select settings.auto_reply_message
  into v_auto_reply_message
  from public.clinic_line_chat_settings settings
  where settings.clinic_id = p_clinic_id
    and settings.auto_reply_enabled;

  for v_event in
    select event_data.value
    from jsonb_array_elements(p_events) event_data(value)
  loop
    v_contact_id := null;
    v_conversation_id := null;
    v_event_id := null;
    v_message_id := null;
    v_contact_blocked := false;
    v_tombstone_unsent_at := null;
    v_event_type := nullif(btrim(v_event->>'eventType'), '');
    v_line_message_id := nullif(btrim(v_event->>'lineMessageId'), '');
    v_line_user_id := nullif(btrim(v_event->>'lineUserId'), '');
    v_message_type := nullif(btrim(v_event->>'messageType'), '');
    v_payload_digest := nullif(btrim(v_event->>'payloadDigest'), '');
    v_source_type := nullif(btrim(v_event->>'sourceType'), '');
    v_text_content := v_event->>'textContent';
    v_unsend_message_id := nullif(btrim(v_event->>'unsendMessageId'), '');
    v_is_redelivery := coalesce((v_event->>'isRedelivery')::boolean, false);

    begin
      v_occurred_at := (v_event->>'occurredAt')::timestamptz;
    exception when others then
      raise exception 'LINE_WEBHOOK_EVENT_TIMESTAMP_INVALID'
        using errcode = '22023';
    end;

    if nullif(btrim(v_event->>'webhookEventId'), '') is null
      or v_event_type is null
      or v_payload_digest is null
      or v_occurred_at is null
    then
      raise exception 'LINE_WEBHOOK_EVENT_INVALID'
        using errcode = '22023';
    end if;

    insert into public.line_webhook_events (
      clinic_id,
      webhook_event_id,
      event_type,
      credential_generation_id,
      is_redelivery,
      payload_digest,
      status,
      occurred_at
    ) values (
      p_clinic_id,
      v_event->>'webhookEventId',
      v_event_type,
      p_credential_generation_id,
      v_is_redelivery,
      v_payload_digest,
      'received',
      v_occurred_at
    )
    on conflict (clinic_id, webhook_event_id) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      v_duplicate_count := v_duplicate_count + 1;
      continue;
    end if;

    if not v_chat_enabled
      and v_event_type not in ('unsend', 'follow', 'unfollow')
    then
      update public.line_webhook_events event
      set
        status = 'ignored',
        error_code = 'line_chat_disabled',
        processed_at = statement_timestamp()
      where event.id = v_event_id;
      v_ignored_count := v_ignored_count + 1;
      continue;
    end if;

    if v_event_type in ('message', 'follow', 'unfollow', 'unsend')
      and v_source_type is distinct from 'user'
    then
      update public.line_webhook_events event
      set
        status = 'ignored',
        error_code = 'source_not_supported',
        processed_at = statement_timestamp()
      where event.id = v_event_id;
      v_ignored_count := v_ignored_count + 1;
      continue;
    end if;

    if v_event_type in ('message', 'follow', 'unfollow') then
      if v_line_user_id is null then
        update public.line_webhook_events event
        set
          status = 'failed',
          error_code = 'line_user_id_missing',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_ignored_count := v_ignored_count + 1;
        continue;
      end if;

      insert into public.line_contacts (
        clinic_id,
        credential_generation_id,
        line_user_id,
        followed_at,
        unfollowed_at,
        blocked_at
      ) values (
        p_clinic_id,
        p_credential_generation_id,
        v_line_user_id,
        case when v_event_type = 'follow' then v_occurred_at else null end,
        case when v_event_type = 'unfollow' then v_occurred_at else null end,
        case when v_event_type = 'unfollow' then v_occurred_at else null end
      )
      on conflict (clinic_id, credential_generation_id, line_user_id)
      do update set
        followed_at = case
          when v_event_type = 'follow'
            and v_occurred_at >= coalesce(
              line_contacts.followed_at,
              '-infinity'::timestamptz
            )
            and v_occurred_at > coalesce(
              line_contacts.unfollowed_at,
              '-infinity'::timestamptz
            )
          then v_occurred_at
          else line_contacts.followed_at
        end,
        unfollowed_at = case
          when v_event_type = 'follow'
            and v_occurred_at >= coalesce(
              line_contacts.followed_at,
              '-infinity'::timestamptz
            )
            and v_occurred_at > coalesce(
              line_contacts.unfollowed_at,
              '-infinity'::timestamptz
            )
          then null
          when v_event_type = 'unfollow'
            and v_occurred_at >= coalesce(
              line_contacts.followed_at,
              '-infinity'::timestamptz
            )
            and v_occurred_at >= coalesce(
              line_contacts.unfollowed_at,
              '-infinity'::timestamptz
            )
          then v_occurred_at
          else line_contacts.unfollowed_at
        end,
        blocked_at = case
          when v_event_type = 'follow'
            and v_occurred_at >= coalesce(
              line_contacts.followed_at,
              '-infinity'::timestamptz
            )
            and v_occurred_at > coalesce(
              line_contacts.unfollowed_at,
              '-infinity'::timestamptz
            )
          then null
          when v_event_type = 'unfollow'
            and v_occurred_at >= coalesce(
              line_contacts.followed_at,
              '-infinity'::timestamptz
            )
            and v_occurred_at >= coalesce(
              line_contacts.unfollowed_at,
              '-infinity'::timestamptz
            )
          then v_occurred_at
          else line_contacts.blocked_at
        end
      returning
        id,
        blocked_at is not null or unfollowed_at is not null
      into v_contact_id, v_contact_blocked;

      update public.line_webhook_events event
      set contact_id = v_contact_id, line_user_id = v_line_user_id
      where event.id = v_event_id;

      if v_contact_blocked and v_event_type = 'message' then
        update public.line_webhook_events event
        set
          status = 'ignored',
          error_code = 'contact_not_sendable',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_ignored_count := v_ignored_count + 1;
        continue;
      end if;

      if v_contact_blocked and v_event_type = 'unfollow' then
        update public.line_conversations conversation
        set
          status = 'closed',
          closed_at = greatest(
            coalesce(conversation.closed_at, v_occurred_at),
            v_occurred_at
          )
        where conversation.clinic_id = p_clinic_id
          and conversation.contact_id = v_contact_id;

        update public.line_chat_outbox outbox
        set
          status = 'failed',
          last_error_code = 'contact_unfollowed'
        from public.line_conversations conversation
        where conversation.id = outbox.conversation_id
          and conversation.clinic_id = p_clinic_id
          and conversation.contact_id = v_contact_id
          and outbox.clinic_id = p_clinic_id
          and outbox.status = 'pending';

        update public.line_messages message
        set status = 'failed'
        from public.line_chat_outbox outbox
        where outbox.message_id = message.id
          and outbox.clinic_id = p_clinic_id
          and outbox.status = 'failed'
          and outbox.last_error_code = 'contact_unfollowed'
          and message.status = 'queued';
      end if;
    end if;

    if v_event_type = 'message' then
      insert into public.line_conversations (
        clinic_id,
        contact_id,
        credential_generation_id,
        status,
        last_message_at,
        last_inbound_at,
        unread_count
      ) values (
        p_clinic_id,
        v_contact_id,
        p_credential_generation_id,
        'open',
        null,
        null,
        0
      )
      on conflict on constraint line_conversations_contact_unique
      do update set
        status = 'open',
        closed_at = null
      returning id into v_conversation_id;

      if v_line_message_id is null then
        update public.line_webhook_events event
        set
          status = 'failed',
          error_code = 'line_message_id_missing',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_ignored_count := v_ignored_count + 1;
        continue;
      end if;

      select tombstone.unsent_at
      into v_tombstone_unsent_at
      from public.line_unsend_tombstones tombstone
      where tombstone.clinic_id = p_clinic_id
        and tombstone.credential_generation_id = p_credential_generation_id
        and tombstone.line_message_digest = extensions.digest(
          convert_to(v_line_message_id, 'UTF8'),
          'sha256'
        );

      if v_message_type = 'text'
        and v_text_content is not null
        and length(btrim(v_text_content)) between 1 and 5000
      then
        insert into public.line_messages (
          clinic_id,
          conversation_id,
          contact_id,
          credential_generation_id,
          webhook_event_id,
          line_message_id,
          direction,
          message_type,
          text_content,
          status,
          occurred_at,
          unsent_at
        ) values (
          p_clinic_id,
          v_conversation_id,
          v_contact_id,
          p_credential_generation_id,
          v_event_id,
          v_line_message_id,
          'inbound',
          'text',
          case when v_tombstone_unsent_at is null then v_text_content else null end,
          case when v_tombstone_unsent_at is null then 'received' else 'unsent' end,
          v_occurred_at,
          v_tombstone_unsent_at
        )
        on conflict (clinic_id, line_message_id)
          where line_message_id is not null
        do nothing
        returning id into v_message_id;
      else
        insert into public.line_messages (
          clinic_id,
          conversation_id,
          contact_id,
          credential_generation_id,
          webhook_event_id,
          line_message_id,
          direction,
          message_type,
          text_content,
          status,
          occurred_at,
          unsent_at
        ) values (
          p_clinic_id,
          v_conversation_id,
          v_contact_id,
          p_credential_generation_id,
          v_event_id,
          v_line_message_id,
          'inbound',
          'unsupported',
          null,
          case when v_tombstone_unsent_at is null then 'received' else 'unsent' end,
          v_occurred_at,
          v_tombstone_unsent_at
        )
        on conflict (clinic_id, line_message_id)
          where line_message_id is not null
        do nothing
        returning id into v_message_id;
      end if;

      if v_message_id is null then
        update public.line_webhook_events event
        set
          status = 'ignored',
          error_code = 'duplicate_line_message',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_duplicate_count := v_duplicate_count + 1;
        continue;
      end if;

      update public.line_webhook_events event
      set status = 'processed', processed_at = statement_timestamp()
      where event.id = v_event_id;

      v_processed_count := v_processed_count + 1;

      if v_tombstone_unsent_at is not null then
        continue;
      end if;

      update public.line_conversations conversation
      set
        last_message_at = greatest(
          coalesce(conversation.last_message_at, v_occurred_at),
          v_occurred_at
        ),
        last_inbound_at = greatest(
          coalesce(conversation.last_inbound_at, v_occurred_at),
          v_occurred_at
        ),
        unread_count = conversation.unread_count + 1
      where conversation.id = v_conversation_id
        and conversation.clinic_id = p_clinic_id;

      if v_auto_reply_message is not null
        and not exists (
          select 1
          from public.line_messages message
          where message.clinic_id = p_clinic_id
            and message.conversation_id = v_conversation_id
            and message.direction = 'outbound'
            and message.sent_by is null
            and message.status in ('queued', 'sent')
            and message.occurred_at >= statement_timestamp() - interval '24 hours'
        )
      then
        v_message_id := gen_random_uuid();
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
          occurred_at
        ) values (
          v_message_id,
          p_clinic_id,
          v_conversation_id,
          v_contact_id,
          p_credential_generation_id,
          'outbound',
          'text',
          v_auto_reply_message,
          'queued',
          statement_timestamp()
        );

        insert into public.line_chat_outbox (
          clinic_id,
          conversation_id,
          message_id,
          credential_generation_id
        ) values (
          p_clinic_id,
          v_conversation_id,
          v_message_id,
          p_credential_generation_id
        );

        update public.line_conversations conversation
        set last_message_at = statement_timestamp()
        where conversation.id = v_conversation_id
          and conversation.clinic_id = p_clinic_id;
      end if;
    elsif v_event_type = 'unsend' then
      if v_unsend_message_id is null then
        update public.line_webhook_events event
        set
          status = 'failed',
          error_code = 'unsend_message_id_missing',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_ignored_count := v_ignored_count + 1;
        continue;
      end if;

      update public.line_webhook_events event
      set unsend_message_id = v_unsend_message_id
      where event.id = v_event_id;

      insert into public.line_unsend_tombstones (
        clinic_id,
        credential_generation_id,
        line_message_digest,
        unsent_at
      ) values (
        p_clinic_id,
        p_credential_generation_id,
        extensions.digest(convert_to(v_unsend_message_id, 'UTF8'), 'sha256'),
        v_occurred_at
      )
      on conflict (clinic_id, credential_generation_id, line_message_digest)
      do update set unsent_at = greatest(
        line_unsend_tombstones.unsent_at,
        excluded.unsent_at
      );

      select
        message.id,
        message.contact_id,
        message.conversation_id,
        contact.line_user_id
      into
        v_message_id,
        v_contact_id,
        v_conversation_id,
        v_line_user_id
      from public.line_messages message
      join public.line_contacts contact
        on contact.id = message.contact_id
       and contact.clinic_id = message.clinic_id
      where message.clinic_id = p_clinic_id
        and message.credential_generation_id = p_credential_generation_id
        and message.line_message_id = v_unsend_message_id
        and message.direction = 'inbound'
      for update of message;

      if not found then
        update public.line_webhook_events event
        set
          status = 'processed',
          error_code = 'unsend_target_pending',
          processed_at = statement_timestamp()
        where event.id = v_event_id;
        v_processed_count := v_processed_count + 1;
        continue;
      end if;

      update public.line_messages message
      set
        status = 'unsent',
        text_content = null,
        unsent_at = greatest(
          coalesce(message.unsent_at, v_occurred_at),
          v_occurred_at
        )
      where message.id = v_message_id;

      update public.line_webhook_events event
      set
        contact_id = v_contact_id,
        line_user_id = v_line_user_id,
        status = 'processed',
        processed_at = statement_timestamp()
      where event.id = v_event_id;
      v_processed_count := v_processed_count + 1;
    elsif v_event_type in ('follow', 'unfollow') then
      update public.line_webhook_events event
      set status = 'processed', processed_at = statement_timestamp()
      where event.id = v_event_id;
      v_processed_count := v_processed_count + 1;
    else
      update public.line_webhook_events event
      set
        status = 'ignored',
        error_code = 'event_type_unsupported',
        processed_at = statement_timestamp()
      where event.id = v_event_id;
      v_ignored_count := v_ignored_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'duplicates', v_duplicate_count,
    'ignored', v_ignored_count,
    'processed', v_processed_count,
    'webhookVerified', true
  );
end
$function$;

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
  v_actor_role text;
  v_contact_id uuid;
  v_credential_generation_id uuid;
  v_membership_id uuid;
  v_message_id uuid := gen_random_uuid();
  v_permission_clinic_id uuid;
  v_privileged boolean := false;
begin
  if p_text is null or length(btrim(p_text)) not between 1 and 5000 then
    raise exception 'LINE_CHAT_TEXT_INVALID'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('manager_clinic_assignments'),
    hashtext(p_sent_by::text)
  );

  if not exists (
    select 1
    from public.clinic_feature_flags feature_flags
    where feature_flags.clinic_id = p_clinic_id
      and feature_flags.line_chat_enabled
  ) then
    raise exception 'LINE_CHAT_DISABLED'
      using errcode = 'P0001';
  end if;

  select membership.id
  into v_membership_id
  from public.staff_profiles staff_profile
  join public.staff_clinic_memberships membership
    on membership.staff_profile_id = staff_profile.id
  where staff_profile.user_id = p_sent_by
    and staff_profile.is_active
    and membership.clinic_id = p_clinic_id
    and membership.membership_type <> 'blocked'
  for share of staff_profile, membership;

  select permission.role::text, permission.clinic_id
  into v_actor_role, v_permission_clinic_id
  from public.user_permissions permission
  where permission.staff_id = p_sent_by
  for update;

  if v_actor_role = 'manager' then
    select true
    into v_privileged
    from public.manager_clinic_assignments assignment
    where assignment.manager_user_id = p_sent_by
      and assignment.clinic_id = p_clinic_id
      and assignment.revoked_at is null
    for update;
  elsif v_actor_role = 'clinic_admin' and v_permission_clinic_id is not null then
    select true
    into v_privileged
    from public.clinics target_clinic
    join public.clinics permission_clinic
      on permission_clinic.id = v_permission_clinic_id
    where target_clinic.id = p_clinic_id
      and coalesce(target_clinic.parent_id, target_clinic.id)
        = coalesce(permission_clinic.parent_id, permission_clinic.id)
    for share of target_clinic, permission_clinic;
  end if;

  v_privileged := coalesce(v_privileged, false);

  if not v_privileged and (
    coalesce(v_actor_role not in ('therapist', 'staff'), true)
    or v_membership_id is null
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
    and (
      v_privileged
      or conversation.assigned_membership_id = v_membership_id
    )
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
  ) values (
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
  ) values (
    p_clinic_id,
    p_conversation_id,
    v_message_id,
    v_credential_generation_id
  );

  update public.line_conversations conversation
  set last_message_at = statement_timestamp()
  where conversation.id = p_conversation_id
    and conversation.clinic_id = p_clinic_id;

  return v_message_id;
end
$function$;

create or replace function public.list_authorized_line_chat_messages(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns table (
  direction text,
  id uuid,
  message_type text,
  occurred_at timestamptz,
  status text,
  text_content text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_assigned_membership_id uuid;
  v_membership_id uuid;
  v_permission_clinic_id uuid;
  v_privileged boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtext('manager_clinic_assignments'),
    hashtext(p_actor_user_id::text)
  );

  select membership.id
  into v_membership_id
  from public.staff_profiles staff_profile
  join public.staff_clinic_memberships membership
    on membership.staff_profile_id = staff_profile.id
  where staff_profile.user_id = p_actor_user_id
    and staff_profile.is_active
    and membership.clinic_id = p_clinic_id
    and membership.membership_type <> 'blocked'
  for share of staff_profile, membership;

  select permission.role::text, permission.clinic_id
  into v_actor_role, v_permission_clinic_id
  from public.user_permissions permission
  where permission.staff_id = p_actor_user_id
  for update;

  if v_actor_role = 'manager' then
    select true
    into v_privileged
    from public.manager_clinic_assignments assignment
    where assignment.manager_user_id = p_actor_user_id
      and assignment.clinic_id = p_clinic_id
      and assignment.revoked_at is null
    for update;
  elsif v_actor_role = 'clinic_admin' and v_permission_clinic_id is not null then
    select true
    into v_privileged
    from public.clinics target_clinic
    join public.clinics permission_clinic
      on permission_clinic.id = v_permission_clinic_id
    where target_clinic.id = p_clinic_id
      and coalesce(target_clinic.parent_id, target_clinic.id)
        = coalesce(permission_clinic.parent_id, permission_clinic.id)
    for share of target_clinic, permission_clinic;
  end if;

  v_privileged := coalesce(v_privileged, false);

  if not v_privileged and (
    coalesce(v_actor_role not in ('therapist', 'staff'), true)
    or v_membership_id is null
  ) then
    raise exception 'LINE_CHAT_ACTOR_NOT_IN_CLINIC'
      using errcode = '42501';
  end if;

  select conversation.assigned_membership_id
  into v_assigned_membership_id
  from public.line_conversations conversation
  where conversation.id = p_conversation_id
    and conversation.clinic_id = p_clinic_id
  for share;

  if not found
    or (
      not v_privileged
      and v_assigned_membership_id is distinct from v_membership_id
    )
  then
    raise exception 'LINE_CHAT_CONVERSATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  return query
  select
    message.direction,
    message.id,
    message.message_type,
    message.occurred_at,
    message.status,
    message.text_content
  from public.line_messages message
  where message.clinic_id = p_clinic_id
    and message.conversation_id = p_conversation_id
  order by message.occurred_at, message.id
  limit 500;
end
$function$;

create or replace function public.assign_line_chat_conversation(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_assigned_membership_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_permission_clinic_id uuid;
  v_privileged boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtext('manager_clinic_assignments'),
    hashtext(p_actor_user_id::text)
  );

  select permission.role::text, permission.clinic_id
  into v_actor_role, v_permission_clinic_id
  from public.user_permissions permission
  where permission.staff_id = p_actor_user_id
  for update;

  if v_actor_role = 'manager' then
    select true
    into v_privileged
    from public.manager_clinic_assignments assignment
    where assignment.manager_user_id = p_actor_user_id
      and assignment.clinic_id = p_clinic_id
      and assignment.revoked_at is null
    for update;
  elsif v_actor_role = 'clinic_admin' and v_permission_clinic_id is not null then
    select true
    into v_privileged
    from public.clinics target_clinic
    join public.clinics permission_clinic
      on permission_clinic.id = v_permission_clinic_id
    where target_clinic.id = p_clinic_id
      and coalesce(target_clinic.parent_id, target_clinic.id)
        = coalesce(permission_clinic.parent_id, permission_clinic.id)
    for share of target_clinic, permission_clinic;
  end if;

  if not coalesce(v_privileged, false) then
    raise exception 'LINE_CHAT_ASSIGNMENT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if p_assigned_membership_id is not null then
    perform 1
    from public.staff_clinic_memberships membership
    join public.staff_profiles staff_profile
      on staff_profile.id = membership.staff_profile_id
     and staff_profile.is_active
    where membership.id = p_assigned_membership_id
      and membership.clinic_id = p_clinic_id
      and membership.membership_type <> 'blocked'
    for share of membership, staff_profile;

    if not found then
      raise exception 'LINE_CHAT_ASSIGNEE_NOT_IN_CLINIC'
        using errcode = '23503';
    end if;
  end if;

  update public.line_conversations conversation
  set assigned_membership_id = p_assigned_membership_id
  where conversation.id = p_conversation_id
    and conversation.clinic_id = p_clinic_id;

  if not found then
    raise exception 'LINE_CHAT_CONVERSATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
end
$function$;

create or replace function public.renew_line_chat_outbox_claim(
  p_clinic_id uuid,
  p_outbox_id uuid,
  p_claim_token uuid
)
returns table (
  credential_generation_id uuid,
  line_user_id text,
  text_content text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_outbox public.line_chat_outbox%rowtype;
  v_credential_generation_id uuid;
  v_line_user_id text;
  v_text_content text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('line-delivery:' || p_clinic_id::text, 0)
  );

  select outbox.*
  into v_outbox
  from public.line_chat_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
  for update;

  if not found
    or v_outbox.status <> 'processing'
    or v_outbox.claim_token is distinct from p_claim_token
    or v_outbox.claimed_at < statement_timestamp() - interval '5 minutes'
  then
    raise exception 'LINE_CHAT_OUTBOX_CLAIM_INVALID'
      using errcode = 'P0001';
  end if;

  select
    outbox.credential_generation_id,
    contact.line_user_id,
    message.text_content
  into
    v_credential_generation_id,
    v_line_user_id,
    v_text_content
  from public.line_chat_outbox outbox
  join public.line_conversations conversation
    on conversation.id = outbox.conversation_id
   and conversation.clinic_id = outbox.clinic_id
   and conversation.credential_generation_id = outbox.credential_generation_id
  join public.line_contacts contact
    on contact.id = conversation.contact_id
   and contact.clinic_id = conversation.clinic_id
   and contact.credential_generation_id = conversation.credential_generation_id
  join public.line_messages message
    on message.id = outbox.message_id
   and message.clinic_id = outbox.clinic_id
   and message.conversation_id = outbox.conversation_id
   and message.credential_generation_id = outbox.credential_generation_id
  join public.clinic_line_credentials credentials
    on credentials.clinic_id = outbox.clinic_id
   and credentials.credential_generation_id = outbox.credential_generation_id
   and credentials.is_active
  join public.clinic_feature_flags feature_flags
    on feature_flags.clinic_id = outbox.clinic_id
   and feature_flags.line_chat_enabled
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id
    and conversation.status = 'open'
    and contact.blocked_at is null
    and contact.unfollowed_at is null
    and message.direction = 'outbound'
    and message.message_type = 'text'
    and message.status = 'queued'
    and message.text_content is not null
  for share of conversation, contact, message, credentials, feature_flags;

  if not found then
    update public.line_chat_outbox outbox
    set
      status = 'failed',
      claim_token = null,
      claimed_at = null,
      last_error_code = 'claim_not_sendable'
    where outbox.id = p_outbox_id
      and outbox.clinic_id = p_clinic_id;

    update public.line_messages message
    set status = 'failed'
    where message.id = v_outbox.message_id
      and message.clinic_id = p_clinic_id
      and message.status = 'queued';
    return;
  end if;

  update public.line_chat_outbox outbox
  set claimed_at = statement_timestamp()
  where outbox.id = p_outbox_id
    and outbox.clinic_id = p_clinic_id;

  return query select
    v_credential_generation_id,
    v_line_user_id,
    v_text_content;
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

    update public.line_conversations conversation
    set
      last_message_at = greatest(
        coalesce(conversation.last_message_at, statement_timestamp()),
        statement_timestamp()
      ),
      last_outbound_at = statement_timestamp()
    where conversation.id = v_outbox.conversation_id
      and conversation.clinic_id = p_clinic_id;
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
      and not exists (
        select 1
        from public.line_chat_outbox outbox
        where outbox.message_id = message.id
          and outbox.clinic_id = message.clinic_id
          and outbox.status in ('pending', 'processing')
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

create or replace function public.run_line_chat_cleanup_if_due()
returns table (
  skipped boolean,
  deleted_messages integer,
  deleted_webhook_events integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_last_completed_at timestamptz;
  v_deleted_messages integer := 0;
  v_deleted_webhook_events integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('line-chat-cleanup', 0)
  );

  select heartbeat.last_completed_at
  into v_last_completed_at
  from public.line_job_heartbeats heartbeat
  where heartbeat.job_name = 'line-chat-cleanup'
    and heartbeat.clinic_id is null
  for update;

  if v_last_completed_at is not null
    and v_last_completed_at > statement_timestamp() - interval '24 hours'
  then
    return query select true, 0, 0;
    return;
  end if;

  update public.line_job_heartbeats heartbeat
  set
    last_started_at = statement_timestamp(),
    last_status = 'running',
    last_error_code = null,
    updated_at = statement_timestamp()
  where heartbeat.job_name = 'line-chat-cleanup'
    and heartbeat.clinic_id is null;

  if not found then
    insert into public.line_job_heartbeats (
      clinic_id,
      job_name,
      last_started_at,
      last_status,
      updated_at
    ) values (
      null,
      'line-chat-cleanup',
      statement_timestamp(),
      'running',
      statement_timestamp()
    );
  end if;

  select purge.deleted_messages, purge.deleted_webhook_events
  into v_deleted_messages, v_deleted_webhook_events
  from public.purge_expired_line_chat_data(null) purge;

  update public.line_job_heartbeats heartbeat
  set
    last_completed_at = statement_timestamp(),
    last_status = 'succeeded',
    last_error_code = null,
    updated_at = statement_timestamp()
  where heartbeat.job_name = 'line-chat-cleanup'
    and heartbeat.clinic_id is null;

  return query select false, v_deleted_messages, v_deleted_webhook_events;
end
$function$;

create or replace function public.list_line_chat_delivery_clinics(
  p_limit integer default 100
)
returns table (clinic_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'LINE_CHAT_CLINIC_LIMIT_INVALID'
      using errcode = '22023';
  end if;

  update public.line_chat_outbox outbox
  set
    status = 'failed',
    claim_token = null,
    claimed_at = null,
    last_error_code = 'delivery_target_not_sendable'
  where (
      (
        outbox.status = 'pending'
        and outbox.next_attempt_at <= statement_timestamp()
      ) or (
        outbox.status = 'processing'
        and outbox.claimed_at < statement_timestamp() - interval '5 minutes'
      )
    )
    and not exists (
      select 1
      from public.line_conversations conversation
      join public.line_contacts contact
        on contact.id = conversation.contact_id
       and contact.clinic_id = conversation.clinic_id
       and contact.credential_generation_id = conversation.credential_generation_id
      join public.line_messages message
        on message.id = outbox.message_id
       and message.clinic_id = outbox.clinic_id
       and message.conversation_id = outbox.conversation_id
       and message.credential_generation_id = outbox.credential_generation_id
      join public.clinic_line_credentials credentials
        on credentials.clinic_id = outbox.clinic_id
       and credentials.credential_generation_id = outbox.credential_generation_id
       and credentials.is_active
      join public.clinic_feature_flags feature_flags
        on feature_flags.clinic_id = outbox.clinic_id
       and feature_flags.line_chat_enabled
      where conversation.id = outbox.conversation_id
        and conversation.clinic_id = outbox.clinic_id
        and conversation.status = 'open'
        and contact.blocked_at is null
        and contact.unfollowed_at is null
        and message.direction = 'outbound'
        and message.message_type = 'text'
        and message.status = 'queued'
        and message.text_content is not null
    );

  update public.line_messages message
  set status = 'failed'
  from public.line_chat_outbox outbox
  where outbox.message_id = message.id
    and outbox.status = 'failed'
    and outbox.last_error_code = 'delivery_target_not_sendable'
    and message.status = 'queued';

  return query
  select outbox.clinic_id
  from public.line_chat_outbox outbox
  where (
      outbox.status = 'pending'
      and outbox.next_attempt_at <= statement_timestamp()
    ) or (
      outbox.status = 'processing'
      and outbox.claimed_at < statement_timestamp() - interval '5 minutes'
    )
  group by outbox.clinic_id
  order by min(outbox.created_at), outbox.clinic_id
  limit p_limit;
end
$function$;

revoke all on function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  to service_role;

revoke all on function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  to service_role;

revoke all on function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  to service_role;

revoke all on function public.claim_line_chat_outbox(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_line_chat_outbox(uuid, integer)
  to service_role;

revoke all on function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  to service_role;

revoke all on function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) to service_role;

revoke all on function public.purge_expired_line_chat_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_line_chat_data(uuid)
  to service_role;

revoke all on function public.run_line_chat_cleanup_if_due()
  from public, anon, authenticated, service_role;
grant execute on function public.run_line_chat_cleanup_if_due()
  to service_role;

revoke all on function public.list_line_chat_delivery_clinics(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_line_chat_delivery_clinics(integer)
  to service_role;

alter function public.process_line_webhook_delivery(uuid, uuid, jsonb)
  owner to postgres;
alter function public.enqueue_line_chat_message(uuid, uuid, text, uuid)
  owner to postgres;
alter function public.list_authorized_line_chat_messages(uuid, uuid, uuid)
  owner to postgres;
alter function public.assign_line_chat_conversation(uuid, uuid, uuid, uuid)
  owner to postgres;
alter function public.claim_line_chat_outbox(uuid, integer)
  owner to postgres;
alter function public.renew_line_chat_outbox_claim(uuid, uuid, uuid)
  owner to postgres;
alter function public.finalize_line_chat_outbox(
  uuid, uuid, uuid, boolean, text, text
) owner to postgres;
alter function public.purge_expired_line_chat_data(uuid)
  owner to postgres;
alter function public.run_line_chat_cleanup_if_due()
  owner to postgres;
alter function public.list_line_chat_delivery_clinics(integer)
  owner to postgres;

do $table_verify$
declare
  actual_privileges text[];
  has_grant_option boolean;
  tombstone_table_oid oid := to_regclass('public.line_unsend_tombstones');
begin
  if tombstone_table_oid is null
    or to_regclass('public.line_unsend_tombstones_pkey') is null
    or not exists (
      select 1
      from pg_class table_data
      where table_data.oid = tombstone_table_oid
        and table_data.relrowsecurity
        and pg_get_userbyid(table_data.relowner) = 'postgres'
    )
    or not exists (
      select 1
      from pg_constraint constraint_data
      where constraint_data.conrelid = tombstone_table_oid
        and constraint_data.conname = 'line_unsend_tombstones_digest_length'
    )
  then
    raise exception 'LINE_UNSEND_TOMBSTONE_TABLE_CONTRACT_DRIFT';
  end if;

  select
    coalesce(
      array_agg(
        distinct (
          case
            when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text
          end || ':' || acl_entry.privilege_type
        ) collate "C"
        order by (
          case
            when acl_entry.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl_entry.grantee)::text
          end || ':' || acl_entry.privilege_type
        ) collate "C"
      ),
      array[]::text[]
    ),
    coalesce(bool_or(acl_entry.is_grantable), false)
  into actual_privileges, has_grant_option
  from pg_class table_data
  cross join lateral aclexplode(
    coalesce(table_data.relacl, acldefault('r', table_data.relowner))
  ) acl_entry
  where table_data.oid = tombstone_table_oid
    and acl_entry.grantee <> table_data.relowner;

  if actual_privileges is distinct from array[
      'service_role:DELETE',
      'service_role:INSERT',
      'service_role:SELECT',
      'service_role:UPDATE'
    ]::text[]
    or has_grant_option
  then
    raise exception 'LINE_UNSEND_TOMBSTONE_PRIVILEGE_DRIFT';
  end if;
end
$table_verify$;

do $verify$
declare
  function_oid oid;
  actual_execute_roles text[];
  has_execute_grant_option boolean;
begin
  foreach function_oid in array array[
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
      or exists (
        select 1
        from pg_proc function_data
        where function_data.oid = function_oid
          and (
            function_data.prosecdef
            or pg_get_userbyid(function_data.proowner) <> 'postgres'
            or not coalesce(function_data.proconfig, array[]::text[])
              @> array['search_path=pg_catalog, public']::text[]
          )
      )
    then
      raise exception 'LINE_CHAT_RUNTIME_FUNCTION_CONTRACT_DRIFT:%', function_oid;
    end if;
  end loop;
end
$verify$;

commit;
