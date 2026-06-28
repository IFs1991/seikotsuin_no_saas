-- Rollback: Billing Tenant Activation Guard
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- Refuses to remove activation columns when pending or failed stores exist.

begin;

do $$
begin
  if exists (
    select 1
    from public.clinics
    where billing_activation_status in ('pending_billing', 'billing_failed')
    limit 1
  ) then
    raise exception 'Refusing rollback: clinics contain pending or failed billing activation rows';
  end if;
end
$$;

revoke all on function public.activate_billable_store_if_capacity(uuid, uuid)
from public, anon, authenticated, service_role;
drop function if exists public.activate_billable_store_if_capacity(uuid, uuid);

drop index if exists public.clinics_billing_activation_pending_idx;

alter table public.clinics
  drop constraint if exists clinics_billing_activation_status_check,
  drop column if exists billing_activation_error,
  drop column if exists billing_activation_failed_at,
  drop column if exists billing_activated_at,
  drop column if exists billing_activation_requested_at,
  drop column if exists billing_activation_status;

commit;
