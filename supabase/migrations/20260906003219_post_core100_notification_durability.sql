-- Spec: docs/stabilization/spec-post-core100-notification-durability-v0.1.md
begin;

-- メール専用revisionを単調に進め、同一transaction内でも旧workerのCASを拒否する。
-- 他テーブルの共有updated_at関数は変更しない。
create or replace function public.update_email_outbox_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create index email_outbox_processing_lease_idx
  on public.email_outbox (updated_at, id) where status = 'processing';

-- 通知claimとprepared outboxを同じDB書込で確定する。配送は既存workerが行う。
create function app_private.persist_reservation_notification_outbox()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent jsonb := new.detail -> 'enqueue';
  v_customer_id uuid;
  v_outbox_id uuid;
  v_detail jsonb;
begin
  if new.status <> 'claimed' or v_intent is null then
    return null;
  end if;
  if jsonb_typeof(v_intent) is distinct from 'object'
     or v_intent ->> 'version' is distinct from '1'
     or jsonb_typeof(v_intent -> 'payload') is distinct from 'object' then
    raise exception 'Invalid reservation notification intent' using errcode = '23514';
  end if;

  v_customer_id := (v_intent ->> 'customer_id')::uuid;
  if not exists (
    select 1 from public.reservations reservation
    join public.customers customer
      on customer.id = reservation.customer_id and customer.clinic_id = reservation.clinic_id
    where reservation.id = new.reservation_id and reservation.clinic_id = new.clinic_id
      and reservation.customer_id = v_customer_id
  ) then
    raise exception 'Reservation notification customer clinic mismatch' using errcode = '23514';
  end if;

  if new.channel = 'email' then
    if nullif(v_intent ->> 'to_email', '') is null
       or nullif(v_intent ->> 'template_type', '') is null
       or nullif(v_intent ->> 'dedupe_key', '') is null
       or nullif(v_intent ->> 'resend_idempotency_key', '') is null then
      raise exception 'Incomplete reservation email intent' using errcode = '23514';
    end if;

    -- 旧claimの直後に停止した場合、既に存在する同じ通知outboxを再利用する。
    select outbox.id into v_outbox_id from public.email_outbox outbox
    where outbox.clinic_id = new.clinic_id and outbox.reservation_id = new.reservation_id
      and outbox.customer_id = v_customer_id
      and outbox.dedupe_key = v_intent ->> 'dedupe_key'
      and outbox.template_type = v_intent ->> 'template_type'
    order by outbox.created_at, outbox.id limit 1;

    if v_outbox_id is null then
      insert into public.email_outbox (
        clinic_id, reservation_id, customer_id, template_type, dedupe_key,
        resend_idempotency_key, to_email, payload, status
      ) values (
        new.clinic_id, new.reservation_id, v_customer_id, v_intent ->> 'template_type',
        v_intent ->> 'dedupe_key', v_intent ->> 'resend_idempotency_key',
        v_intent ->> 'to_email', v_intent -> 'payload', 'pending'
      ) on conflict (dedupe_key) do nothing returning id into v_outbox_id;
      if v_outbox_id is null then
        select outbox.id into v_outbox_id from public.email_outbox outbox
        where outbox.dedupe_key = v_intent ->> 'dedupe_key'
          and outbox.clinic_id = new.clinic_id and outbox.reservation_id = new.reservation_id
          and outbox.customer_id = v_customer_id
          and outbox.template_type = v_intent ->> 'template_type';
      end if;
    end if;
    if v_outbox_id is null then
      raise exception 'Reservation email dedupe scope mismatch' using errcode = '23514';
    end if;
    v_detail := jsonb_build_object('template_type', v_intent ->> 'template_type');
  elsif new.channel = 'line' then
    if nullif(v_intent ->> 'line_user_id', '') is null
       or nullif(v_intent ->> 'dedupe_timestamp', '') is null then
      raise exception 'Incomplete reservation LINE intent' using errcode = '23514';
    end if;
    select outbox.id into v_outbox_id from public.line_message_outbox outbox
    where outbox.clinic_id = new.clinic_id and outbox.customer_id = v_customer_id
      and outbox.message_type = new.notification_type
      and outbox.payload #>> '{reservation,reservationId}' = new.reservation_id::text
      and outbox.payload #>> '{reservation,updatedAt}' = v_intent ->> 'dedupe_timestamp'
    order by outbox.created_at, outbox.id limit 1;
    if v_outbox_id is null then
      -- revisionのない旧LINEジョブは同じeventと断定できないため、自動再送しない。
      if exists (
        select 1 from public.line_message_outbox outbox
        where outbox.clinic_id = new.clinic_id and outbox.customer_id = v_customer_id
          and outbox.message_type = new.notification_type
          and outbox.payload #>> '{reservation,reservationId}' = new.reservation_id::text
          and outbox.payload #>> '{reservation,updatedAt}' is null
      ) then
        raise exception 'Legacy LINE notification delivery requires review' using errcode = '23514';
      end if;
      insert into public.line_message_outbox (
        clinic_id, customer_id, line_user_id, message_type, payload, status
      ) values (
        new.clinic_id, v_customer_id, v_intent ->> 'line_user_id', new.notification_type,
        (v_intent -> 'payload') || jsonb_build_object(
          'customerId', v_customer_id,
          'reservation', jsonb_build_object('reservationId', new.reservation_id, 'notificationType', new.notification_type,
            'updatedAt', v_intent ->> 'dedupe_timestamp')
        ), 'pending'
      ) returning id into v_outbox_id;
    end if;
    v_detail := jsonb_build_object('line_outbox_id', v_outbox_id, 'message_type', new.notification_type);
  else
    raise exception 'Unsupported reservation notification channel' using errcode = '23514';
  end if;

  -- PHIを含む一時intentは同じtransaction内で消し、既存outboxだけに保持する。
  update public.reservation_notifications
  set status = 'enqueued',
      email_outbox_id = case when new.channel = 'email' then v_outbox_id else null end,
      detail = (new.detail - 'enqueue') || v_detail
  where id = new.id and clinic_id = new.clinic_id and status = 'claimed';
  return null;
end;
$$;

revoke all on function app_private.persist_reservation_notification_outbox()
  from public, anon, authenticated;
grant execute on function app_private.persist_reservation_notification_outbox() to service_role;

create trigger reservation_notification_durable_enqueue
  after insert or update of status, detail on public.reservation_notifications
  for each row execute function app_private.persist_reservation_notification_outbox();

commit;
