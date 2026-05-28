-- Phase 4A-7: verification and benchmark hardening.
-- @spec docs/stabilization/spec-phase4a-menu-billing-patient-coverage-snapshot-v0.1.md
-- @rollback supabase/rollbacks/20260528000100_phase4a7_verification_benchmark_hardening_rollback.sql

create or replace function public.sync_daily_report_item_totals()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_daily_report_totals(old.daily_report_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.daily_report_id is not distinct from new.daily_report_id
      and old.fee is not distinct from new.fee
      and old.billing_type is not distinct from new.billing_type
    then
      return new;
    end if;

    if old.daily_report_id is distinct from new.daily_report_id then
      perform public.recalculate_daily_report_totals(old.daily_report_id);
    end if;

    perform public.recalculate_daily_report_totals(new.daily_report_id);
    return new;
  end if;

  perform public.recalculate_daily_report_totals(new.daily_report_id);
  return new;
end;
$$;

revoke execute on function public.sync_daily_report_item_totals()
from public, anon, authenticated;

grant execute on function public.sync_daily_report_item_totals()
to service_role;

comment on function public.sync_daily_report_item_totals() is
  'Phase 4A-7 hardening: skips daily report aggregate recalculation when update-triggered aggregate inputs are unchanged.';
