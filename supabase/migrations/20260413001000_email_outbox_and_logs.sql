-- =================================================================
-- Email Outbox + Email Logs テーブル
-- Resend メール送信基盤 (Outbox パターン)
-- =================================================================

begin;

-- -----------------------------------------------------------
-- email_outbox: メール送信キュー
-- -----------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  reservation_id uuid,
  customer_id uuid,
  template_type text not null,
  dedupe_key text not null,
  resend_idempotency_key text not null,
  to_email text not null,
  from_email text,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','cancelled')),
  attempts int not null default 0,
  provider text not null default 'resend',
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_outbox is 'メール送信キュー (Outbox パターン)';

-- dedupe_key で二重 enqueue を防止
create unique index email_outbox_dedupe_key_uidx
  on public.email_outbox (dedupe_key);

-- processor が pending ジョブを効率よく取得
create index email_outbox_pending_idx
  on public.email_outbox (status, next_attempt_at, created_at);

-- clinic 単位の一覧取得
create index email_outbox_clinic_idx
  on public.email_outbox (clinic_id, created_at desc);

-- -----------------------------------------------------------
-- email_logs: メール送信イベントログ
-- -----------------------------------------------------------
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.email_outbox(id) on delete cascade,
  clinic_id uuid not null,
  event_type text not null,
  provider text not null default 'resend',
  provider_message_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.email_logs is 'メール送信イベントログ (Webhook / 送信結果)';

create index email_logs_outbox_idx
  on public.email_logs(outbox_id, created_at);

create index email_logs_clinic_idx
  on public.email_logs(clinic_id, created_at desc);

-- -----------------------------------------------------------
-- RLS: 一般クライアントからの直接アクセスを禁止
-- server-only service / guarded API からのみ操作
-- -----------------------------------------------------------
alter table public.email_outbox enable row level security;
alter table public.email_logs enable row level security;

-- service_role のみフルアクセス (cron / server-side service 用)
create policy "service_role_full_access_outbox"
  on public.email_outbox
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service_role_full_access_logs"
  on public.email_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- updated_at 自動更新トリガー
create or replace function public.update_email_outbox_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger email_outbox_updated_at_trigger
  before update on public.email_outbox
  for each row
  execute function public.update_email_outbox_updated_at();

commit;
