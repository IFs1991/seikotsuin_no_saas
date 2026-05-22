-- Insurance fee system master Phase 3A-1.
-- Rollback: supabase/rollbacks/20260521000100_insurance_fee_system_master_phase3a_rollback.sql

create table if not exists public.insurance_fee_sources (
  source_id text primary key,
  title text not null,
  publisher text not null,
  source_url text,
  document_date date,
  effective_from date,
  effective_to date,
  target_domain text not null,
  reliability text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint insurance_fee_sources_effective_range_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint insurance_fee_sources_reliability_check
    check (
      reliability in (
        'official',
        'quasi_official',
        'association',
        'vendor',
        'internal'
      )
    ),
  constraint insurance_fee_sources_target_domain_check
    check (
      target_domain in (
        'judo_health_insurance',
        'acupuncture_health_insurance',
        'workers_comp_judo',
        'workers_comp_acupuncture',
        'traffic_accident',
        'common'
      )
    )
);

create table if not exists public.insurance_fee_source_snapshots (
  id uuid default extensions.uuid_generate_v4() not null,
  source_id text not null,
  source_url text,
  document_title text not null,
  document_date date,
  fetched_or_recorded_at timestamptz not null default now(),
  content_hash text not null,
  file_path_or_storage_key text,
  mime_type text,
  byte_size integer,
  notes text,
  created_at timestamptz not null default now(),

  constraint insurance_fee_source_snapshots_pkey primary key (id),
  constraint insurance_fee_source_snapshots_source_id_fkey
    foreign key (source_id) references public.insurance_fee_sources(source_id),
  constraint insurance_fee_source_snapshots_content_hash_unique
    unique (content_hash),
  constraint insurance_fee_source_snapshots_source_hash_unique
    unique (source_id, content_hash),
  constraint insurance_fee_source_snapshots_byte_size_check
    check (byte_size is null or byte_size >= 0)
);

create table if not exists public.insurance_fee_schedules (
  id uuid default extensions.uuid_generate_v4() not null,
  schedule_code text not null,
  profession_type text not null,
  payer_context_code text not null,
  schedule_name text not null,
  effective_from date not null,
  effective_to date,
  schedule_status text not null default 'draft',
  source_id text not null,
  source_snapshot_hash text,
  revision_reason text,
  supersedes_schedule_code text,
  replacement_schedule_code text,
  is_locked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint insurance_fee_schedules_pkey primary key (id),
  constraint insurance_fee_schedules_schedule_code_unique unique (schedule_code),
  constraint insurance_fee_schedules_source_id_fkey
    foreign key (source_id) references public.insurance_fee_sources(source_id),
  constraint insurance_fee_schedules_source_snapshot_fkey
    foreign key (source_id, source_snapshot_hash)
    references public.insurance_fee_source_snapshots(source_id, content_hash),
  constraint insurance_fee_schedules_supersedes_fkey
    foreign key (supersedes_schedule_code)
    references public.insurance_fee_schedules(schedule_code),
  constraint insurance_fee_schedules_replacement_fkey
    foreign key (replacement_schedule_code)
    references public.insurance_fee_schedules(schedule_code),
  constraint insurance_fee_schedules_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint insurance_fee_schedules_profession_type_check
    check (
      profession_type in (
        'judo',
        'acupuncture',
        'moxibustion',
        'anma_massage',
        'common'
      )
    ),
  constraint insurance_fee_schedules_payer_context_code_check
    check (
      payer_context_code in (
        'insurance',
        'workers_comp',
        'traffic_accident'
      )
    ),
  constraint insurance_fee_schedules_status_check
    check (
      schedule_status in (
        'draft',
        'reviewed',
        'active',
        'superseded',
        'retired'
      )
    ),
  constraint insurance_fee_schedules_supersedes_self_check
    check (
      supersedes_schedule_code is null
      or supersedes_schedule_code <> schedule_code
    ),
  constraint insurance_fee_schedules_replacement_self_check
    check (
      replacement_schedule_code is null
      or replacement_schedule_code <> schedule_code
    )
);

create table if not exists public.insurance_fee_items (
  id uuid default extensions.uuid_generate_v4() not null,
  schedule_code text not null,
  item_code text not null,
  item_name text not null,
  official_label text,
  category text not null,
  amount_yen numeric(10,2),
  unit text not null,
  billing_scope text not null,
  calculation_basis text,
  applicable_conditions_json jsonb not null default '{}'::jsonb,
  exclusion_conditions_json jsonb not null default '{}'::jsonb,
  required_inputs_json jsonb not null default '{}'::jsonb,
  warning_codes_json jsonb not null default '[]'::jsonb,
  manual_amount_required boolean not null default false,
  auto_calculation_allowed boolean not null default true,
  source_id text not null,
  source_snapshot_hash text,
  confidence text not null default 'medium',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint insurance_fee_items_pkey primary key (id),
  constraint insurance_fee_items_schedule_code_fkey
    foreign key (schedule_code) references public.insurance_fee_schedules(schedule_code),
  constraint insurance_fee_items_source_id_fkey
    foreign key (source_id) references public.insurance_fee_sources(source_id),
  constraint insurance_fee_items_source_snapshot_fkey
    foreign key (source_id, source_snapshot_hash)
    references public.insurance_fee_source_snapshots(source_id, content_hash),
  constraint insurance_fee_items_unique_schedule_item
    unique (schedule_code, item_code),
  constraint insurance_fee_items_amount_check
    check (amount_yen is null or amount_yen >= 0),
  constraint insurance_fee_items_confidence_check
    check (confidence in ('high', 'medium', 'low')),
  constraint insurance_fee_items_applicable_conditions_check
    check (jsonb_typeof(applicable_conditions_json) = 'object'),
  constraint insurance_fee_items_exclusion_conditions_check
    check (jsonb_typeof(exclusion_conditions_json) = 'object'),
  constraint insurance_fee_items_required_inputs_check
    check (jsonb_typeof(required_inputs_json) = 'object'),
  constraint insurance_fee_items_warning_codes_check
    check (jsonb_typeof(warning_codes_json) = 'array'),
  constraint insurance_fee_items_manual_amount_check
    check (
      manual_amount_required = false
      or (amount_yen is null and auto_calculation_allowed = false)
    )
);

create table if not exists public.insurance_fee_warning_definitions (
  warning_code text primary key,
  severity text not null,
  message text not null,
  applies_to_profession_type text,
  applies_to_payer_context_code text,
  auto_block_calculation boolean not null default false,
  manual_review_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint insurance_fee_warning_definitions_severity_check
    check (severity in ('info', 'warning', 'needs_review', 'blocked')),
  constraint insurance_fee_warning_definitions_profession_type_check
    check (
      applies_to_profession_type is null
      or applies_to_profession_type in (
        'judo',
        'acupuncture',
        'moxibustion',
        'anma_massage',
        'common'
      )
    ),
  constraint insurance_fee_warning_definitions_payer_context_code_check
    check (
      applies_to_payer_context_code is null
      or applies_to_payer_context_code in (
        'insurance',
        'workers_comp',
        'traffic_accident'
      )
    )
);

create table if not exists public.insurance_fee_revision_diffs (
  id uuid default extensions.uuid_generate_v4() not null,
  old_schedule_code text,
  new_schedule_code text not null,
  item_code text not null,
  diff_type text not null,
  old_amount_yen numeric(10,2),
  new_amount_yen numeric(10,2),
  old_conditions_json jsonb,
  new_conditions_json jsonb,
  old_label text,
  new_label text,
  review_status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,

  constraint insurance_fee_revision_diffs_pkey primary key (id),
  constraint insurance_fee_revision_diffs_old_schedule_fkey
    foreign key (old_schedule_code)
    references public.insurance_fee_schedules(schedule_code),
  constraint insurance_fee_revision_diffs_new_schedule_fkey
    foreign key (new_schedule_code)
    references public.insurance_fee_schedules(schedule_code),
  constraint insurance_fee_revision_diffs_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null,
  constraint insurance_fee_revision_diffs_diff_type_check
    check (
      diff_type in (
        'added',
        'removed',
        'amount_changed',
        'condition_changed',
        'label_changed',
        'manual_rule_changed',
        'unchanged'
      )
    ),
  constraint insurance_fee_revision_diffs_review_status_check
    check (
      review_status in (
        'pending',
        'reviewed',
        'approved',
        'rejected'
      )
    ),
  constraint insurance_fee_revision_diffs_conditions_check
    check (
      (old_conditions_json is null or jsonb_typeof(old_conditions_json) = 'object')
      and (new_conditions_json is null or jsonb_typeof(new_conditions_json) = 'object')
    )
);

create index if not exists idx_insurance_fee_source_snapshots_source_recorded
  on public.insurance_fee_source_snapshots (source_id, fetched_or_recorded_at);

create index if not exists idx_insurance_fee_schedules_active_resolver
  on public.insurance_fee_schedules (
    profession_type,
    payer_context_code,
    effective_from,
    effective_to
  )
  where schedule_status = 'active';

create index if not exists idx_insurance_fee_items_schedule_sort
  on public.insurance_fee_items (schedule_code, sort_order, item_code);

create index if not exists idx_insurance_fee_revision_diffs_schedule_pair
  on public.insurance_fee_revision_diffs (old_schedule_code, new_schedule_code, item_code);

drop trigger if exists update_insurance_fee_sources_updated_at
on public.insurance_fee_sources;

create trigger update_insurance_fee_sources_updated_at
before update on public.insurance_fee_sources
for each row execute function public.update_updated_at_column();

drop trigger if exists update_insurance_fee_schedules_updated_at
on public.insurance_fee_schedules;

create trigger update_insurance_fee_schedules_updated_at
before update on public.insurance_fee_schedules
for each row execute function public.update_updated_at_column();

drop trigger if exists update_insurance_fee_items_updated_at
on public.insurance_fee_items;

create trigger update_insurance_fee_items_updated_at
before update on public.insurance_fee_items
for each row execute function public.update_updated_at_column();

drop trigger if exists update_insurance_fee_warning_definitions_updated_at
on public.insurance_fee_warning_definitions;

create trigger update_insurance_fee_warning_definitions_updated_at
before update on public.insurance_fee_warning_definitions
for each row execute function public.update_updated_at_column();

create or replace function public.validate_insurance_fee_schedule_active_range()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.schedule_status = 'active'
    and exists (
      select 1
      from public.insurance_fee_schedules schedule
      where schedule.schedule_code <> new.schedule_code
        and schedule.profession_type = new.profession_type
        and schedule.payer_context_code = new.payer_context_code
        and schedule.schedule_status = 'active'
        and schedule.effective_from <= coalesce(new.effective_to, 'infinity'::date)
        and coalesce(schedule.effective_to, 'infinity'::date) >= new.effective_from
    ) then
    raise exception 'insurance_fee_schedules active effective range overlaps'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists insurance_fee_schedules_active_range_check
on public.insurance_fee_schedules;

create trigger insurance_fee_schedules_active_range_check
before insert or update of
  profession_type,
  payer_context_code,
  schedule_status,
  effective_from,
  effective_to
on public.insurance_fee_schedules
for each row execute function public.validate_insurance_fee_schedule_active_range();

create or replace function public.protect_insurance_fee_schedule_revision()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if old.is_locked then
    raise exception 'insurance_fee_schedules locked schedule cannot be updated'
      using errcode = '23514';
  end if;

  if old.schedule_status = 'superseded' then
    raise exception 'insurance_fee_schedules superseded schedule cannot be updated'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists insurance_fee_schedules_revision_guard
on public.insurance_fee_schedules;

create trigger insurance_fee_schedules_revision_guard
before update on public.insurance_fee_schedules
for each row execute function public.protect_insurance_fee_schedule_revision();

create or replace function public.validate_insurance_fee_item_mutation()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_schedule_status text;
  v_schedule_is_locked boolean;
  v_payer_context_code text;
begin
  if tg_op <> 'INSERT' then
    select schedule_status, is_locked, payer_context_code
    into v_schedule_status, v_schedule_is_locked, v_payer_context_code
    from public.insurance_fee_schedules
    where schedule_code = old.schedule_code;

    if v_schedule_is_locked then
      raise exception 'insurance_fee_items locked schedule items cannot be mutated'
        using errcode = '23514';
    end if;

    if v_schedule_status = 'superseded' then
      raise exception 'insurance_fee_items superseded schedule items cannot be mutated'
        using errcode = '23514';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    if tg_op <> 'UPDATE' or new.schedule_code <> old.schedule_code then
      select schedule_status, is_locked, payer_context_code
      into v_schedule_status, v_schedule_is_locked, v_payer_context_code
      from public.insurance_fee_schedules
      where schedule_code = new.schedule_code;
    end if;

    if v_schedule_is_locked then
      raise exception 'insurance_fee_items locked schedule items cannot be mutated'
        using errcode = '23514';
    end if;

    if v_schedule_status = 'superseded' then
      raise exception 'insurance_fee_items superseded schedule items cannot be mutated'
        using errcode = '23514';
    end if;

    if v_payer_context_code = 'traffic_accident'
      and (
        new.amount_yen is not null
        or new.manual_amount_required = false
        or new.auto_calculation_allowed = true
      ) then
      raise exception 'insurance_fee_items traffic accident amounts must be manual'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists insurance_fee_items_mutation_guard
on public.insurance_fee_items;

create trigger insurance_fee_items_mutation_guard
before insert or update or delete on public.insurance_fee_items
for each row execute function public.validate_insurance_fee_item_mutation();

revoke execute on function public.validate_insurance_fee_schedule_active_range()
from public, anon, authenticated;

revoke execute on function public.protect_insurance_fee_schedule_revision()
from public, anon, authenticated;

revoke execute on function public.validate_insurance_fee_item_mutation()
from public, anon, authenticated;

grant execute on function public.validate_insurance_fee_schedule_active_range()
to service_role;

grant execute on function public.protect_insurance_fee_schedule_revision()
to service_role;

grant execute on function public.validate_insurance_fee_item_mutation()
to service_role;

alter table public.insurance_fee_sources enable row level security;
alter table public.insurance_fee_source_snapshots enable row level security;
alter table public.insurance_fee_schedules enable row level security;
alter table public.insurance_fee_items enable row level security;
alter table public.insurance_fee_warning_definitions enable row level security;
alter table public.insurance_fee_revision_diffs enable row level security;

drop policy if exists "insurance_fee_sources_select_for_authenticated"
on public.insurance_fee_sources;

create policy "insurance_fee_sources_select_for_authenticated"
on public.insurance_fee_sources
for select
to authenticated
using (true);

drop policy if exists "insurance_fee_source_snapshots_select_for_authenticated"
on public.insurance_fee_source_snapshots;

create policy "insurance_fee_source_snapshots_select_for_authenticated"
on public.insurance_fee_source_snapshots
for select
to authenticated
using (true);

drop policy if exists "insurance_fee_schedules_select_for_authenticated"
on public.insurance_fee_schedules;

create policy "insurance_fee_schedules_select_for_authenticated"
on public.insurance_fee_schedules
for select
to authenticated
using (true);

drop policy if exists "insurance_fee_items_select_for_authenticated"
on public.insurance_fee_items;

create policy "insurance_fee_items_select_for_authenticated"
on public.insurance_fee_items
for select
to authenticated
using (true);

drop policy if exists "insurance_fee_warning_definitions_select_for_authenticated"
on public.insurance_fee_warning_definitions;

create policy "insurance_fee_warning_definitions_select_for_authenticated"
on public.insurance_fee_warning_definitions
for select
to authenticated
using (true);

drop policy if exists "insurance_fee_revision_diffs_select_for_authenticated"
on public.insurance_fee_revision_diffs;

create policy "insurance_fee_revision_diffs_select_for_authenticated"
on public.insurance_fee_revision_diffs
for select
to authenticated
using (true);

revoke all on table public.insurance_fee_sources from anon;
revoke all on table public.insurance_fee_source_snapshots from anon;
revoke all on table public.insurance_fee_schedules from anon;
revoke all on table public.insurance_fee_items from anon;
revoke all on table public.insurance_fee_warning_definitions from anon;
revoke all on table public.insurance_fee_revision_diffs from anon;

revoke all on table public.insurance_fee_sources from authenticated;
revoke all on table public.insurance_fee_source_snapshots from authenticated;
revoke all on table public.insurance_fee_schedules from authenticated;
revoke all on table public.insurance_fee_items from authenticated;
revoke all on table public.insurance_fee_warning_definitions from authenticated;
revoke all on table public.insurance_fee_revision_diffs from authenticated;

grant select on table public.insurance_fee_sources to authenticated;
grant select on table public.insurance_fee_source_snapshots to authenticated;
grant select on table public.insurance_fee_schedules to authenticated;
grant select on table public.insurance_fee_items to authenticated;
grant select on table public.insurance_fee_warning_definitions to authenticated;
grant select on table public.insurance_fee_revision_diffs to authenticated;

grant all on table public.insurance_fee_sources to service_role;
grant all on table public.insurance_fee_source_snapshots to service_role;
grant all on table public.insurance_fee_schedules to service_role;
grant all on table public.insurance_fee_items to service_role;
grant all on table public.insurance_fee_warning_definitions to service_role;
grant all on table public.insurance_fee_revision_diffs to service_role;

comment on table public.insurance_fee_sources is
  'Source documents for insurance fee system master schedules.';

comment on table public.insurance_fee_source_snapshots is
  'Content snapshots recorded from insurance fee source documents.';

comment on table public.insurance_fee_schedules is
  'Effective insurance fee schedule versions for management estimates.';

comment on table public.insurance_fee_items is
  'Insurance fee schedule items used as management estimate inputs.';

comment on constraint insurance_fee_items_manual_amount_check
on public.insurance_fee_items is
  'Manual fee items must not expose a master amount for automatic calculation.';

comment on table public.insurance_fee_warning_definitions is
  'Reusable insurance fee warning definitions.';

comment on table public.insurance_fee_revision_diffs is
  'Reviewed item-level differences between insurance fee schedules.';
