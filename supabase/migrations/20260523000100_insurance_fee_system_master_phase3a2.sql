-- Insurance fee system master Phase 3A-2 resolver/validation hardening.
-- Rollback: supabase/rollbacks/20260523000100_insurance_fee_system_master_phase3a2_rollback.sql

create or replace function public.validate_insurance_fee_schedule_context_mutation()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.payer_context_code is not distinct from old.payer_context_code then
    return new;
  end if;

  if old.payer_context_code <> 'traffic_accident'
    and new.payer_context_code = 'traffic_accident'
    and exists (
      select 1
      from public.insurance_fee_items item
      where item.schedule_code = old.schedule_code
        and (
          item.amount_yen is not null
          or item.manual_amount_required = false
          or item.auto_calculation_allowed = true
        )
    ) then
    raise exception 'insurance_fee_schedules traffic accident context requires manual-only items'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create index if not exists idx_insurance_fee_items_schedule_auto_amount_guard
  on public.insurance_fee_items (schedule_code)
  where amount_yen is not null
    or manual_amount_required = false
    or auto_calculation_allowed = true;

drop trigger if exists insurance_fee_schedules_context_mutation_guard
on public.insurance_fee_schedules;

create trigger insurance_fee_schedules_context_mutation_guard
before update of payer_context_code on public.insurance_fee_schedules
for each row execute function public.validate_insurance_fee_schedule_context_mutation();

revoke execute on function public.validate_insurance_fee_schedule_context_mutation()
from public, anon, authenticated;

grant execute on function public.validate_insurance_fee_schedule_context_mutation()
to service_role;

comment on function public.validate_insurance_fee_schedule_context_mutation() is
  'Prevents schedule context updates from turning automatic amount items into traffic-accident master pricing.';
