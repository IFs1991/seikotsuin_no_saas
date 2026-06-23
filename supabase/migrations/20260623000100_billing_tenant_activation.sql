-- ================================================================
-- Migration: Billing Tenant Activation Guard
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- Phase: Phase B - Store Quantity Enforcement
-- ================================================================

begin;

alter table public.clinics
  add column if not exists billing_activation_status text not null default 'active',
  add column if not exists billing_activation_requested_at timestamptz,
  add column if not exists billing_activated_at timestamptz,
  add column if not exists billing_activation_failed_at timestamptz,
  add column if not exists billing_activation_error text;

alter table public.clinics
  drop constraint if exists clinics_billing_activation_status_check;

alter table public.clinics
  add constraint clinics_billing_activation_status_check
    check (
      billing_activation_status in (
        'active',
        'pending_billing',
        'billing_failed'
      )
    );

comment on column public.clinics.billing_activation_status is
  'Billing-controlled tenant activation state for Phase B store quantity enforcement.';
comment on column public.clinics.billing_activation_requested_at is
  'Time at which a child store entered billing activation flow.';
comment on column public.clinics.billing_activated_at is
  'Time at which billing capacity was confirmed and the child store was activated.';
comment on column public.clinics.billing_activation_failed_at is
  'Time at which billing activation failed and requires retry/recovery.';
comment on column public.clinics.billing_activation_error is
  'Last billing activation failure reason, safe for operator/customer support display.';

create index if not exists clinics_billing_activation_pending_idx
  on public.clinics (parent_id, billing_activation_status, created_at)
  where parent_id is not null
    and billing_activation_status in ('pending_billing', 'billing_failed');

create or replace function public.activate_billable_store_if_capacity(
  p_org_root_clinic_id uuid,
  p_clinic_id uuid
)
returns table (
  success boolean,
  error_code text,
  active_billable_store_count integer,
  allowed_billable_store_count integer
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_clinic public.clinics%rowtype;
  v_active_count integer;
  v_allowed_count integer;
begin
  select *
  into v_subscription
  from public.subscriptions
  where org_root_clinic_id = p_org_root_clinic_id
  for update;

  if not found then
    return query select false, 'subscription_not_found', 0, 0;
    return;
  end if;

  if v_subscription.plan_code <> 'group' then
    return query select false, 'subscription_not_group', 0, 0;
    return;
  end if;

  if v_subscription.billing_state not in (
    'trialing',
    'active',
    'cancel_scheduled',
    'override_active'
  ) then
    return query select false, 'subscription_not_writable', 0, 0;
    return;
  end if;

  select *
  into v_clinic
  from public.clinics
  where id = p_clinic_id
  for update;

  if not found then
    return query select false, 'clinic_not_found', 0, 0;
    return;
  end if;

  if v_clinic.parent_id is distinct from p_org_root_clinic_id then
    return query select false, 'clinic_not_child_of_org', 0, 0;
    return;
  end if;

  if v_clinic.is_active is true then
    select count(*)::integer
    into v_active_count
    from public.clinics
    where parent_id = p_org_root_clinic_id
      and is_active is true;

    v_allowed_count :=
      v_subscription.included_store_quantity
      + v_subscription.paid_extra_store_quantity;

    return query select true, null::text, v_active_count, v_allowed_count;
    return;
  end if;

  if v_clinic.billing_activation_status <> 'pending_billing' then
    return query select false, 'clinic_not_pending_billing', 0, 0;
    return;
  end if;

  select count(*)::integer
  into v_active_count
  from public.clinics
  where parent_id = p_org_root_clinic_id
    and is_active is true;

  v_allowed_count :=
    v_subscription.included_store_quantity
    + v_subscription.paid_extra_store_quantity;

  if v_active_count >= v_allowed_count then
    return query select false, 'capacity_exceeded', v_active_count, v_allowed_count;
    return;
  end if;

  update public.clinics
  set
    is_active = true,
    billing_activation_status = 'active',
    billing_activated_at = now(),
    billing_activation_failed_at = null,
    billing_activation_error = null,
    updated_at = now()
  where id = p_clinic_id;

  return query select true, null::text, v_active_count + 1, v_allowed_count;
end;
$$;

revoke all on function public.activate_billable_store_if_capacity(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.activate_billable_store_if_capacity(uuid, uuid)
to service_role;

commit;
