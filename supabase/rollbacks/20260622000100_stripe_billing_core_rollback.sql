-- Rollback: Stripe Billing DB Core
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- This rollback refuses to destroy billing data. Disable billing feature flags
-- and export Stripe/app billing records before applying in any persistent env.

begin;

do $$
begin
  if to_regclass('public.stripe_webhook_events') is not null
    and exists (select 1 from public.stripe_webhook_events limit 1)
  then
    raise exception 'Refusing rollback: stripe_webhook_events contains data';
  end if;

  if to_regclass('public.subscriptions') is not null
    and exists (select 1 from public.subscriptions limit 1)
  then
    raise exception 'Refusing rollback: subscriptions contains data';
  end if;
end
$$;

drop trigger if exists update_stripe_webhook_events_updated_at
on public.stripe_webhook_events;
drop table if exists public.stripe_webhook_events;

drop trigger if exists update_subscriptions_updated_at
on public.subscriptions;
drop trigger if exists subscriptions_org_root_clinic_guard
on public.subscriptions;
drop table if exists public.subscriptions;

drop function if exists app_private.assert_subscription_org_root_clinic();

commit;
