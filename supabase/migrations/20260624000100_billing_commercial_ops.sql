-- ================================================================
-- Migration: Stripe Billing Commercial Operations
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- Phase: PR8/PR9 - Internal Recovery Tools + Audit / Override
-- ================================================================

begin;

create table public.billing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_root_clinic_id uuid references public.clinics(id) on delete set null,
  actor_type text not null
    check (actor_type in ('user', 'stripe', 'system', 'internal')),
  actor_user_id uuid,
  internal_actor text,
  event_type text not null,
  before_state jsonb,
  after_state jsonb,
  stripe_event_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint billing_audit_logs_before_state_object_check
    check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint billing_audit_logs_after_state_object_check
    check (after_state is null or jsonb_typeof(after_state) = 'object'),
  constraint billing_audit_logs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.billing_audit_logs is
  'Commercial billing audit trail for Stripe sync, internal recovery, and time-limited overrides.';
comment on column public.billing_audit_logs.internal_actor is
  'Server-only script or internal route identifier. Not a customer role.';

create index billing_audit_logs_org_created_idx
  on public.billing_audit_logs (org_root_clinic_id, created_at desc);
create index billing_audit_logs_event_created_idx
  on public.billing_audit_logs (event_type, created_at desc);
create index billing_audit_logs_stripe_event_idx
  on public.billing_audit_logs (stripe_event_id)
  where stripe_event_id is not null;

alter table public.billing_audit_logs enable row level security;

create policy "service_role full access billing audit logs"
on public.billing_audit_logs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on table public.billing_audit_logs from anon, authenticated;
grant all on table public.billing_audit_logs to service_role;

create table public.billing_overrides (
  id uuid primary key default gen_random_uuid(),
  org_root_clinic_id uuid not null
    references public.clinics(id) on delete restrict,
  override_state text not null
    check (override_state in ('allow_full_access', 'allow_read_export')),
  reason text not null
    check (length(btrim(reason)) > 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by_internal text not null
    check (length(btrim(created_by_internal)) > 0),
  revoked_at timestamptz,
  revoked_by_internal text,
  expired_audited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_overrides_expires_after_starts_check
    check (expires_at > starts_at),
  constraint billing_overrides_revoke_actor_check
    check (
      revoked_at is null
      or (
        revoked_by_internal is not null
        and length(btrim(revoked_by_internal)) > 0
      )
    ),
  constraint billing_overrides_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.billing_overrides is
  'Time-limited internal billing exceptions. Customer roles cannot create or read these records.';
comment on column public.billing_overrides.expired_audited_at is
  'Set by the internal expiration route after billing.override_expired is written once.';

create index billing_overrides_active_lookup_idx
  on public.billing_overrides (
    org_root_clinic_id,
    starts_at,
    expires_at,
    revoked_at
  );
create index billing_overrides_expire_idx
  on public.billing_overrides (expires_at, expired_audited_at)
  where revoked_at is null;

create trigger update_billing_overrides_updated_at
before update on public.billing_overrides
for each row execute function public.update_updated_at_column();

alter table public.billing_overrides enable row level security;

create policy "service_role full access billing overrides"
on public.billing_overrides
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on table public.billing_overrides from anon, authenticated;
grant all on table public.billing_overrides to service_role;

commit;
