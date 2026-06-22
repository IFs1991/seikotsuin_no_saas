-- ================================================================
-- Migration: Stripe Billing DB Core
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- Phase: PR1 - Billing DB Core
-- ================================================================

begin;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_root_clinic_id uuid not null unique
    references public.clinics(id) on delete restrict,
  plan_code text not null
    check (plan_code in ('single_clinic', 'group')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  checkout_started_at timestamptz,
  checkout_expires_at timestamptz,
  checkout_plan_code text
    check (
      checkout_plan_code is null
      or checkout_plan_code in ('single_clinic', 'group')
    ),
  stripe_single_subscription_item_id text unique,
  stripe_group_base_subscription_item_id text unique,
  stripe_store_subscription_item_id text unique,
  stripe_status text not null default 'none',
  billing_state text not null default 'none'
    check (
      billing_state in (
        'none',
        'checkout_pending',
        'trialing',
        'active',
        'cancel_scheduled',
        'past_due_grace',
        'past_due_locked',
        'canceled',
        'expired',
        'override_active'
      )
    ),
  included_store_quantity integer not null default 5
    check (included_store_quantity >= 0),
  paid_extra_store_quantity integer not null default 0
    check (paid_extra_store_quantity >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  trial_consumed boolean not null default false,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  past_due_since timestamptz,
  grace_until timestamptz,
  last_stripe_event_id text,
  last_stripe_event_created timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_checkout_expiry_check
    check (
      checkout_started_at is null
      or checkout_expires_at is null
      or checkout_expires_at > checkout_started_at
    ),
  constraint subscriptions_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.subscriptions is
  'Stripe subscription cache and billing access gate source scoped to an organization root clinic.';
comment on column public.subscriptions.org_root_clinic_id is
  'Contract subject. Must reference a root clinic where clinics.parent_id is null.';
comment on column public.subscriptions.paid_extra_store_quantity is
  'Stripe store add-on quantity beyond included_store_quantity, not total active stores.';

create index subscriptions_billing_state_idx
  on public.subscriptions (billing_state);
create index subscriptions_last_stripe_event_created_idx
  on public.subscriptions (last_stripe_event_created);

create or replace function app_private.assert_subscription_org_root_clinic()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_parent_id uuid;
begin
  select c.parent_id
  into v_parent_id
  from public.clinics c
  where c.id = new.org_root_clinic_id;

  if not found then
    raise exception 'subscriptions.org_root_clinic_id must reference an existing clinic'
      using errcode = '23503';
  end if;

  if v_parent_id is not null then
    raise exception 'subscriptions.org_root_clinic_id must reference a root clinic'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger subscriptions_org_root_clinic_guard
before insert or update of org_root_clinic_id
on public.subscriptions
for each row execute function app_private.assert_subscription_org_root_clinic();

create trigger update_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.update_updated_at_column();

alter table public.subscriptions enable row level security;

create policy "customer admin can read own subscription"
on public.subscriptions
for select
to authenticated
using (
  app_private.is_admin()
  and app_private.can_access_clinic(org_root_clinic_id)
);

create policy "service_role full access subscriptions"
on public.subscriptions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  stripe_created_at timestamptz,
  livemode boolean not null,
  payload jsonb not null,
  processing_status text not null default 'received'
    check (
      processing_status in (
        'received',
        'processing',
        'processed',
        'ignored',
        'failed'
      )
    ),
  retryable boolean not null default false,
  processed_at timestamptz,
  processing_error text,
  related_org_root_clinic_id uuid
    references public.clinics(id) on delete set null,
  related_stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

comment on table public.stripe_webhook_events is
  'Idempotent Stripe webhook event log for replay, debugging, and out-of-order subscription sync.';

create index stripe_webhook_events_type_created_idx
  on public.stripe_webhook_events (event_type, stripe_created_at desc);
create index stripe_webhook_events_processing_idx
  on public.stripe_webhook_events (processing_status, created_at);
create index stripe_webhook_events_related_subscription_idx
  on public.stripe_webhook_events (related_stripe_subscription_id)
  where related_stripe_subscription_id is not null;

create trigger update_stripe_webhook_events_updated_at
before update on public.stripe_webhook_events
for each row execute function public.update_updated_at_column();

alter table public.stripe_webhook_events enable row level security;

create policy "service_role full access stripe webhook events"
on public.stripe_webhook_events
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

commit;
