-- Revenue estimate fee item link Phase 3B.
-- Rollback: supabase/rollbacks/20260523000200_revenue_estimate_fee_item_link_phase3b_rollback.sql

alter table public.revenue_estimates
  add column if not exists used_schedule_code text,
  add column if not exists source_snapshot_hash text;

alter table public.revenue_estimate_lines
  add column if not exists insurance_fee_item_id uuid,
  add column if not exists schedule_code text,
  add column if not exists fee_item_code text,
  add column if not exists source_snapshot_hash text;

alter table public.revenue_estimate_overrides
  add column if not exists override_reason_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimates_used_schedule_code_fkey'
      and conrelid = 'public.revenue_estimates'::regclass
  ) then
    alter table public.revenue_estimates
      add constraint revenue_estimates_used_schedule_code_fkey
      foreign key (used_schedule_code)
      references public.insurance_fee_schedules(schedule_code);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimates_source_snapshot_hash_fkey'
      and conrelid = 'public.revenue_estimates'::regclass
  ) then
    alter table public.revenue_estimates
      add constraint revenue_estimates_source_snapshot_hash_fkey
      foreign key (source_snapshot_hash)
      references public.insurance_fee_source_snapshots(content_hash);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_lines_fee_item_id_fkey'
      and conrelid = 'public.revenue_estimate_lines'::regclass
  ) then
    alter table public.revenue_estimate_lines
      add constraint revenue_estimate_lines_fee_item_id_fkey
      foreign key (insurance_fee_item_id)
      references public.insurance_fee_items(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_lines_schedule_code_fkey'
      and conrelid = 'public.revenue_estimate_lines'::regclass
  ) then
    alter table public.revenue_estimate_lines
      add constraint revenue_estimate_lines_schedule_code_fkey
      foreign key (schedule_code)
      references public.insurance_fee_schedules(schedule_code);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_lines_schedule_item_fkey'
      and conrelid = 'public.revenue_estimate_lines'::regclass
  ) then
    alter table public.revenue_estimate_lines
      add constraint revenue_estimate_lines_schedule_item_fkey
      foreign key (schedule_code, fee_item_code)
      references public.insurance_fee_items(schedule_code, item_code);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_lines_source_snapshot_hash_fkey'
      and conrelid = 'public.revenue_estimate_lines'::regclass
  ) then
    alter table public.revenue_estimate_lines
      add constraint revenue_estimate_lines_source_snapshot_hash_fkey
      foreign key (source_snapshot_hash)
      references public.insurance_fee_source_snapshots(content_hash);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_lines_fee_item_link_check'
      and conrelid = 'public.revenue_estimate_lines'::regclass
  ) then
    alter table public.revenue_estimate_lines
      add constraint revenue_estimate_lines_fee_item_link_check
      check (
        (
          insurance_fee_item_id is null
          and schedule_code is null
          and fee_item_code is null
          and source_snapshot_hash is null
        )
        or (
          insurance_fee_item_id is not null
          and schedule_code is not null
          and fee_item_code is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimates_schedule_link_check'
      and conrelid = 'public.revenue_estimates'::regclass
  ) then
    alter table public.revenue_estimates
      add constraint revenue_estimates_schedule_link_check
      check (
        (
          used_schedule_code is null
          and source_snapshot_hash is null
        )
        or used_schedule_code is not null
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'revenue_estimate_overrides_reason_code_check'
      and conrelid = 'public.revenue_estimate_overrides'::regclass
  ) then
    alter table public.revenue_estimate_overrides
      add constraint revenue_estimate_overrides_reason_code_check
      check (
        override_reason_code is null
        or override_reason_code in (
          'INSURER_SPECIFIC_RULE',
          'OFFICIAL_RULE_UNCLEAR',
          'PATIENT_CONTEXT_EXCEPTION',
          'MANUAL_CORRECTION',
          'CLAIM_REVIEW_ADJUSTMENT',
          'OTHER'
        )
      );
  end if;
end;
$$;

create or replace function public.validate_revenue_estimate_insurance_fee_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_report_date date;
  v_schedule_status text;
  v_payer_context_code text;
  v_effective_from date;
  v_effective_to date;
  v_source_snapshot_hash text;
begin
  if new.used_schedule_code is null then
    if new.source_snapshot_hash is not null then
      raise exception 'revenue_estimates source snapshot requires schedule link'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select report_date
  into v_report_date
  from public.daily_report_items
  where id = new.daily_report_item_id;

  if not found then
    raise exception 'daily_report_items.id not found' using errcode = '23503';
  end if;

  select
    schedule_status,
    payer_context_code,
    effective_from,
    effective_to,
    source_snapshot_hash
  into
    v_schedule_status,
    v_payer_context_code,
    v_effective_from,
    v_effective_to,
    v_source_snapshot_hash
  from public.insurance_fee_schedules
  where schedule_code = new.used_schedule_code;

  if not found then
    raise exception 'insurance_fee_schedules.schedule_code not found'
      using errcode = '23503';
  end if;

  if v_schedule_status <> 'active' then
    raise exception 'revenue_estimates insurance fee schedule must be active'
      using errcode = '23514';
  end if;

  if v_payer_context_code <> new.revenue_context_code then
    raise exception 'revenue_estimates insurance fee schedule context mismatch'
      using errcode = '23514';
  end if;

  if v_report_date < v_effective_from
    or (v_effective_to is not null and v_report_date > v_effective_to)
  then
    raise exception 'revenue_estimates insurance fee schedule date mismatch'
      using errcode = '23514';
  end if;

  if new.source_snapshot_hash is distinct from v_source_snapshot_hash then
    raise exception 'revenue_estimates insurance fee schedule snapshot mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists revenue_estimates_insurance_fee_ref_check
on public.revenue_estimates;

create trigger revenue_estimates_insurance_fee_ref_check
before insert or update of
  daily_report_item_id,
  revenue_context_code,
  used_schedule_code,
  source_snapshot_hash
on public.revenue_estimates
for each row execute function public.validate_revenue_estimate_insurance_fee_refs();

create or replace function public.validate_revenue_estimate_line_insurance_fee_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_parent_schedule_code text;
  v_item_schedule_code text;
  v_item_code text;
  v_item_snapshot_hash text;
  v_amount_yen numeric(10,2);
  v_manual_amount_required boolean;
  v_auto_calculation_allowed boolean;
  v_payer_context_code text;
begin
  if new.insurance_fee_item_id is null
    and new.schedule_code is null
    and new.fee_item_code is null
    and new.source_snapshot_hash is null
  then
    return new;
  end if;

  if new.insurance_fee_item_id is null
    or new.schedule_code is null
    or new.fee_item_code is null
  then
    raise exception 'revenue_estimate_lines insurance fee item link is incomplete'
      using errcode = '23514';
  end if;

  select used_schedule_code
  into v_parent_schedule_code
  from public.revenue_estimates
  where id = new.revenue_estimate_id;

  if not found then
    raise exception 'revenue_estimates.id not found' using errcode = '23503';
  end if;

  if v_parent_schedule_code is null
    or v_parent_schedule_code <> new.schedule_code
  then
    raise exception 'revenue_estimate_lines insurance fee schedule mismatch'
      using errcode = '23514';
  end if;

  select
    item.schedule_code,
    item.item_code,
    item.source_snapshot_hash,
    item.amount_yen,
    item.manual_amount_required,
    item.auto_calculation_allowed,
    schedule.payer_context_code
  into
    v_item_schedule_code,
    v_item_code,
    v_item_snapshot_hash,
    v_amount_yen,
    v_manual_amount_required,
    v_auto_calculation_allowed,
    v_payer_context_code
  from public.insurance_fee_items item
  join public.insurance_fee_schedules schedule
    on schedule.schedule_code = item.schedule_code
  where item.id = new.insurance_fee_item_id;

  if not found then
    raise exception 'insurance_fee_items.id not found' using errcode = '23503';
  end if;

  if v_item_schedule_code <> new.schedule_code
    or v_item_code <> new.fee_item_code
  then
    raise exception 'revenue_estimate_lines insurance fee item mismatch'
      using errcode = '23514';
  end if;

  if new.source_snapshot_hash is distinct from v_item_snapshot_hash then
    raise exception 'revenue_estimate_lines insurance fee item snapshot mismatch'
      using errcode = '23514';
  end if;

  if v_payer_context_code = 'traffic_accident' then
    raise exception 'revenue_estimate_lines traffic accident item links are manual only'
      using errcode = '23514';
  end if;

  if v_amount_yen is null
    or v_manual_amount_required = true
    or v_auto_calculation_allowed = false
  then
    raise exception 'revenue_estimate_lines insurance fee item link requires automatic item'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists revenue_estimate_lines_insurance_fee_ref_check
on public.revenue_estimate_lines;

create trigger revenue_estimate_lines_insurance_fee_ref_check
before insert or update of
  revenue_estimate_id,
  insurance_fee_item_id,
  schedule_code,
  fee_item_code,
  source_snapshot_hash
on public.revenue_estimate_lines
for each row execute function public.validate_revenue_estimate_line_insurance_fee_refs();

revoke execute on function public.validate_revenue_estimate_insurance_fee_refs()
from public, anon, authenticated;

revoke execute on function public.validate_revenue_estimate_line_insurance_fee_refs()
from public, anon, authenticated;

grant execute on function public.validate_revenue_estimate_insurance_fee_refs()
to service_role;

grant execute on function public.validate_revenue_estimate_line_insurance_fee_refs()
to service_role;

create index if not exists idx_revenue_estimates_used_schedule
  on public.revenue_estimates (clinic_id, used_schedule_code)
  where used_schedule_code is not null;

create index if not exists idx_revenue_estimate_lines_fee_item
  on public.revenue_estimate_lines (insurance_fee_item_id)
  where insurance_fee_item_id is not null;

create index if not exists idx_revenue_estimate_lines_schedule_item
  on public.revenue_estimate_lines (schedule_code, fee_item_code)
  where schedule_code is not null
    and fee_item_code is not null;

create index if not exists idx_revenue_estimate_overrides_reason_code
  on public.revenue_estimate_overrides (clinic_id, override_reason_code)
  where override_reason_code is not null;

comment on column public.revenue_estimates.used_schedule_code is
  'Insurance fee master schedule resolved during management estimate recalculation.';

comment on column public.revenue_estimates.source_snapshot_hash is
  'Source snapshot hash for the resolved insurance fee schedule.';

comment on column public.revenue_estimate_lines.insurance_fee_item_id is
  'Insurance fee master item matched to this management estimate line when unambiguous.';

comment on column public.revenue_estimate_lines.schedule_code is
  'Insurance fee master schedule code matched to this management estimate line.';

comment on column public.revenue_estimate_lines.fee_item_code is
  'Insurance fee master item code matched to this management estimate line.';

comment on column public.revenue_estimate_lines.source_snapshot_hash is
  'Source snapshot hash for the matched insurance fee master item.';

comment on column public.revenue_estimate_overrides.override_reason_code is
  'Structured reason code for manual revenue estimate overrides.';

comment on function public.validate_revenue_estimate_insurance_fee_refs() is
  'Validates estimate-level insurance fee master provenance against item date, context, and snapshot.';

comment on function public.validate_revenue_estimate_line_insurance_fee_refs() is
  'Validates estimate-line insurance fee item provenance and blocks traffic-accident automatic item links.';
