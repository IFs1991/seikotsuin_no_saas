-- Spec: docs/stabilization/spec-liff-booking-workflow-v0.3.md
-- Phase C / PR8: LINE push outbox and service-role-only processing.

create table if not exists public.line_message_outbox (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  line_user_id text not null,
  message_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0
    check (attempts >= 0 and attempts <= 3),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint line_message_outbox_line_user_id_not_blank
    check (length(btrim(line_user_id)) > 0),
  constraint line_message_outbox_message_type_not_blank
    check (length(btrim(message_type)) > 0)
);

comment on table public.line_message_outbox is
  'Clinic-scoped LINE push notification queue. Access is service-role only.';
comment on column public.line_message_outbox.payload is
  'LINE text payload plus optional email fallback metadata.';
comment on column public.line_message_outbox.next_attempt_at is
  'Retry schedule used for LINE errors and Retry-After responses.';

create index if not exists line_message_outbox_pending_idx
  on public.line_message_outbox (status, next_attempt_at, created_at)
  where status = 'pending';

create index if not exists line_message_outbox_clinic_created_idx
  on public.line_message_outbox (clinic_id, created_at desc);

alter table public.line_message_outbox enable row level security;

-- RLS deny: no policies are intentionally created for anon/authenticated roles.
revoke all on table public.line_message_outbox from anon;
revoke all on table public.line_message_outbox from authenticated;
grant all on table public.line_message_outbox to service_role;

do $$
begin
  if to_regclass('public.line_message_outbox') is null then
    raise exception 'line_message_outbox table was not created';
  end if;
end $$;
