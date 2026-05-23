-- Rollback for Insurance fee system master Phase 3A-2 hardening.
-- Non-destructive: drops only the schedule context mutation guard.

drop trigger if exists insurance_fee_schedules_context_mutation_guard
on public.insurance_fee_schedules;

drop index if exists public.idx_insurance_fee_items_schedule_auto_amount_guard;

revoke execute on function public.validate_insurance_fee_schedule_context_mutation()
from public, anon, authenticated, service_role;

drop function if exists public.validate_insurance_fee_schedule_context_mutation();
