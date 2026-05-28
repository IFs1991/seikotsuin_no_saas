-- Rollback for Phase 4A-7 verification and benchmark hardening.
-- Restores the pre-4A-7 daily report item total trigger function behavior.

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

  if tg_op = 'UPDATE' and old.daily_report_id is distinct from new.daily_report_id then
    perform public.recalculate_daily_report_totals(old.daily_report_id);
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
  'Synchronizes daily report aggregates after daily_report_items insert, update, or delete.';
