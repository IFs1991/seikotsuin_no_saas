-- Rollback: Stripe Billing Commercial Operations
-- Spec: docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md
-- Disable billing commercial ops flags and export records before applying.

begin;

do $$
begin
  if to_regclass('public.billing_overrides') is not null
    and exists (select 1 from public.billing_overrides limit 1)
  then
    raise exception 'Refusing rollback: billing_overrides contains data';
  end if;

  if to_regclass('public.billing_audit_logs') is not null
    and exists (select 1 from public.billing_audit_logs limit 1)
  then
    raise exception 'Refusing rollback: billing_audit_logs contains data';
  end if;
end;
$$;

drop trigger if exists update_billing_overrides_updated_at
on public.billing_overrides;

drop table if exists public.billing_overrides;
drop table if exists public.billing_audit_logs;

commit;
