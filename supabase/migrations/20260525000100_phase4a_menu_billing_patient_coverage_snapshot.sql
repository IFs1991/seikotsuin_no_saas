-- Phase 4A: menu billing profiles, patient coverage defaults, and revenue breakdown snapshots.
-- @spec docs/stabilization/spec-phase4a-menu-billing-patient-coverage-snapshot-v0.1.md
-- @rollback supabase/rollbacks/20260525000100_phase4a_menu_billing_patient_coverage_snapshot_rollback.sql

create table if not exists public.menu_template_billing_profiles (
  id uuid primary key default extensions.uuid_generate_v4(),
  owner_clinic_id uuid not null references public.clinics(id) on delete cascade,
  menu_template_id uuid not null references public.menu_templates(id) on delete cascade,
  revenue_context_code text not null references public.revenue_contexts(code),
  calculation_method text not null check (
    calculation_method in ('fixed_amount', 'insurance_master', 'manual_estimate')
  ),
  fixed_amount_yen numeric(10,2),
  default_patient_burden_rate integer check (
    default_patient_burden_rate is null
    or default_patient_burden_rate in (0, 10, 20, 30)
  ),
  profession_type text,
  requires_review boolean not null default false,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_template_billing_profiles_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint menu_template_billing_profiles_fixed_amount_check
    check (fixed_amount_yen is null or fixed_amount_yen >= 0),
  constraint menu_template_billing_profiles_method_values_check
    check (
      (calculation_method = 'fixed_amount' and fixed_amount_yen is not null)
      or (calculation_method <> 'fixed_amount' and fixed_amount_yen is null)
    )
);

create index if not exists idx_menu_template_billing_profiles_resolve
on public.menu_template_billing_profiles (
  owner_clinic_id,
  menu_template_id,
  revenue_context_code,
  effective_from desc
)
where is_active = true and is_deleted = false;

create table if not exists public.menu_billing_profiles (
  id uuid primary key default extensions.uuid_generate_v4(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  source_template_profile_id uuid references public.menu_template_billing_profiles(id) on delete set null,
  revenue_context_code text not null references public.revenue_contexts(code),
  calculation_method text not null check (
    calculation_method in ('fixed_amount', 'insurance_master', 'manual_estimate')
  ),
  fixed_amount_yen numeric(10,2),
  default_patient_burden_rate integer check (
    default_patient_burden_rate is null
    or default_patient_burden_rate in (0, 10, 20, 30)
  ),
  profession_type text,
  requires_review boolean not null default false,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_billing_profiles_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint menu_billing_profiles_fixed_amount_check
    check (fixed_amount_yen is null or fixed_amount_yen >= 0),
  constraint menu_billing_profiles_method_values_check
    check (
      (calculation_method = 'fixed_amount' and fixed_amount_yen is not null)
      or (calculation_method <> 'fixed_amount' and fixed_amount_yen is null)
    )
);

create index if not exists idx_menu_billing_profiles_resolve
on public.menu_billing_profiles (
  clinic_id,
  menu_id,
  revenue_context_code,
  effective_from desc
)
where is_active = true and is_deleted = false;

create table if not exists public.customer_insurance_coverages (
  id uuid primary key default extensions.uuid_generate_v4(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  payer_context_code text not null default 'insurance'
    check (payer_context_code = 'insurance'),
  patient_burden_rate integer not null
    check (patient_burden_rate in (0, 10, 20, 30)),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'confirmed'
    check (verification_status in ('confirmed', 'needs_review', 'expired', 'inactive')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_insurance_coverages_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists idx_customer_insurance_coverages_current_lookup
on public.customer_insurance_coverages (
  clinic_id,
  customer_id,
  effective_from desc
)
where verification_status = 'confirmed';

alter table public.daily_report_items
  add column if not exists menu_billing_profile_id uuid
    references public.menu_billing_profiles(id) on delete set null,
  add column if not exists customer_insurance_coverage_id uuid
    references public.customer_insurance_coverages(id) on delete set null,
  add column if not exists patient_burden_rate integer,
  add column if not exists coverage_resolution_source text,
  add column if not exists pricing_snapshot_status text not null default 'pending',
  add column if not exists pricing_confirmed_at timestamptz;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_patient_burden_rate_check,
  add constraint daily_report_items_patient_burden_rate_check
    check (patient_burden_rate is null or patient_burden_rate in (0, 10, 20, 30)),
  drop constraint if exists daily_report_items_coverage_resolution_source_check,
  add constraint daily_report_items_coverage_resolution_source_check
    check (
      coverage_resolution_source is null
      or coverage_resolution_source in ('customer_default', 'manual', 'recalculated')
    ),
  drop constraint if exists daily_report_items_pricing_snapshot_status_check,
  add constraint daily_report_items_pricing_snapshot_status_check
    check (pricing_snapshot_status in ('pending', 'confirmed', 'needs_review', 'recalculated'));

create index if not exists idx_daily_report_items_coverage
on public.daily_report_items (
  clinic_id,
  customer_insurance_coverage_id
)
where customer_insurance_coverage_id is not null;

alter table public.revenue_estimate_lines
  add column if not exists amount_role text;

alter table public.revenue_estimate_lines
  drop constraint if exists revenue_estimate_lines_amount_role_check,
  add constraint revenue_estimate_lines_amount_role_check
  check (
    amount_role is null
    or amount_role in (
      'gross_estimated_total',
      'patient_copay_estimated',
      'insurer_receivable_estimated',
      'private_revenue_estimated',
      'traffic_accident_receivable_estimated',
      'workers_comp_receivable_estimated',
      'adjustment'
    )
  );

create index if not exists idx_revenue_estimate_lines_amount_role
on public.revenue_estimate_lines (
  clinic_id,
  amount_role,
  revenue_estimate_id
)
where amount_role is not null;

drop trigger if exists update_menu_template_billing_profiles_updated_at
on public.menu_template_billing_profiles;

create trigger update_menu_template_billing_profiles_updated_at
before update on public.menu_template_billing_profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_menu_billing_profiles_updated_at
on public.menu_billing_profiles;

create trigger update_menu_billing_profiles_updated_at
before update on public.menu_billing_profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_customer_insurance_coverages_updated_at
on public.customer_insurance_coverages;

create trigger update_customer_insurance_coverages_updated_at
before update on public.customer_insurance_coverages
for each row execute function public.update_updated_at_column();

create or replace function public.validate_menu_template_billing_profile_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_owner_clinic_id uuid;
begin
  select owner_clinic_id
  into v_owner_clinic_id
  from public.menu_templates
  where id = new.menu_template_id;

  if not found then
    raise exception 'menu_templates.id not found' using errcode = '23503';
  end if;

  if v_owner_clinic_id <> new.owner_clinic_id then
    raise exception 'menu_template_billing_profiles.menu_template_id clinic mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists menu_template_billing_profiles_ref_check
on public.menu_template_billing_profiles;

create trigger menu_template_billing_profiles_ref_check
before insert or update on public.menu_template_billing_profiles
for each row execute function public.validate_menu_template_billing_profile_refs();

create or replace function public.validate_menu_billing_profile_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_menu_clinic_id uuid;
begin
  select clinic_id
  into v_menu_clinic_id
  from public.menus
  where id = new.menu_id;

  if not found then
    raise exception 'menus.id not found' using errcode = '23503';
  end if;

  if v_menu_clinic_id <> new.clinic_id then
    raise exception 'menu_billing_profiles.menu_id clinic mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists menu_billing_profiles_ref_check
on public.menu_billing_profiles;

create trigger menu_billing_profiles_ref_check
before insert or update on public.menu_billing_profiles
for each row execute function public.validate_menu_billing_profile_refs();

create or replace function public.validate_customer_insurance_coverage_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_customer_clinic_id uuid;
begin
  select clinic_id
  into v_customer_clinic_id
  from public.customers
  where id = new.customer_id;

  if not found then
    raise exception 'customers.id not found' using errcode = '23503';
  end if;

  if v_customer_clinic_id <> new.clinic_id then
    raise exception 'customer_insurance_coverages.customer_id clinic mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_insurance_coverages_ref_check
on public.customer_insurance_coverages;

create trigger customer_insurance_coverages_ref_check
before insert or update on public.customer_insurance_coverages
for each row execute function public.validate_customer_insurance_coverage_refs();

create or replace function public.reject_overlapping_confirmed_customer_coverage()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
begin
  if new.verification_status <> 'confirmed' then
    return new;
  end if;

  if exists (
    select 1
    from public.customer_insurance_coverages existing
    where existing.clinic_id = new.clinic_id
      and existing.customer_id = new.customer_id
      and existing.payer_context_code = 'insurance'
      and existing.verification_status = 'confirmed'
      and existing.id <> new.id
      and daterange(
        existing.effective_from,
        coalesce(existing.effective_to, 'infinity'::date),
        '[]'
      ) && daterange(
        new.effective_from,
        coalesce(new.effective_to, 'infinity'::date),
        '[]'
      )
  ) then
    raise exception 'confirmed customer insurance coverage overlaps'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_insurance_coverages_overlap_guard
on public.customer_insurance_coverages;

create trigger customer_insurance_coverages_overlap_guard
before insert or update of
  clinic_id,
  customer_id,
  payer_context_code,
  patient_burden_rate,
  effective_from,
  effective_to,
  verification_status
on public.customer_insurance_coverages
for each row execute function public.reject_overlapping_confirmed_customer_coverage();

create or replace function public.validate_daily_report_item_pricing_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_profile_clinic_id uuid;
  v_coverage_clinic_id uuid;
  v_coverage_customer_id uuid;
begin
  if new.menu_billing_profile_id is not null then
    select clinic_id
    into v_profile_clinic_id
    from public.menu_billing_profiles
    where id = new.menu_billing_profile_id;

    if not found then
      raise exception 'menu_billing_profiles.id not found' using errcode = '23503';
    end if;

    if v_profile_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.menu_billing_profile_id clinic mismatch'
        using errcode = '23514';
    end if;
  end if;

  if new.customer_insurance_coverage_id is not null then
    select clinic_id, customer_id
    into v_coverage_clinic_id, v_coverage_customer_id
    from public.customer_insurance_coverages
    where id = new.customer_insurance_coverage_id;

    if not found then
      raise exception 'customer_insurance_coverages.id not found' using errcode = '23503';
    end if;

    if v_coverage_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.customer_insurance_coverage_id clinic mismatch'
        using errcode = '23514';
    end if;

    if new.customer_id is not null and v_coverage_customer_id <> new.customer_id then
      raise exception 'daily_report_items.customer_insurance_coverage_id customer mismatch'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists daily_report_items_pricing_ref_check
on public.daily_report_items;

create trigger daily_report_items_pricing_ref_check
before insert or update of
  clinic_id,
  customer_id,
  menu_billing_profile_id,
  customer_insurance_coverage_id
on public.daily_report_items
for each row execute function public.validate_daily_report_item_pricing_refs();

drop trigger if exists daily_report_items_recalculate_totals
on public.daily_report_items;

create trigger daily_report_items_recalculate_totals
after insert or delete or update of
  fee,
  billing_type,
  daily_report_id
on public.daily_report_items
for each row execute function public.sync_daily_report_item_totals();

create or replace function public.sync_arrived_reservation_daily_report_item()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_report_id uuid;
  v_report_date date;
  v_customer_name text;
  v_menu_name text;
  v_menu_price numeric(10,2);
  v_is_insurance boolean;
  v_option_delta numeric(10,2) := 0;
  v_fee numeric(10,2);
  v_duration_minutes integer;
begin
  if tg_op = 'UPDATE'
    and old.status = 'arrived'
    and (new.status <> 'arrived' or coalesce(new.is_deleted, false) = true)
  then
    delete from public.daily_report_items
    where reservation_id = old.id
      and source = 'reservation'
      and pricing_snapshot_status = 'pending';
    return new;
  end if;

  if new.status <> 'arrived' or coalesce(new.is_deleted, false) = true then
    return new;
  end if;

  v_report_date := date(new.start_time at time zone 'Asia/Tokyo');

  insert into public.daily_reports (
    clinic_id,
    report_date,
    total_patients,
    new_patients,
    total_revenue,
    insurance_revenue,
    private_revenue,
    report_text
  )
  values (
    new.clinic_id,
    v_report_date,
    0,
    0,
    0,
    0,
    0,
    '自動作成: 来院済み予約'
  )
  on conflict (clinic_id, report_date)
  do update set updated_at = now()
  returning id into v_report_id;

  select c.name, m.name, m.price, coalesce(m.is_insurance_applicable, false)
  into v_customer_name, v_menu_name, v_menu_price, v_is_insurance
  from public.customers c
  join public.menus m on m.id = new.menu_id
  where c.id = new.customer_id;

  if not found then
    raise exception 'daily_report_items arrived reservation references not found'
      using errcode = '23503';
  end if;

  select coalesce(
    sum(
      case
        when option_item.value->>'priceDelta' ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (option_item.value->>'priceDelta')::numeric
        else 0
      end
    ),
    0
  )::numeric(10,2)
  into v_option_delta
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(new.selected_options, '[]'::jsonb)) = 'array'
        then coalesce(new.selected_options, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as option_item(value);

  v_fee := coalesce(new.actual_price, new.price, v_menu_price + v_option_delta, 0)::numeric(10,2);
  v_duration_minutes := greatest(
    0,
    round(extract(epoch from (new.end_time - new.start_time)) / 60)::integer
  );

  insert into public.daily_report_items (
    clinic_id,
    daily_report_id,
    report_date,
    reservation_id,
    customer_id,
    menu_id,
    staff_resource_id,
    patient_name,
    treatment_name,
    duration_minutes,
    fee,
    billing_type,
    revenue_context_code,
    revenue_context_source,
    amount_source,
    estimate_status,
    pricing_snapshot_status,
    source,
    notes,
    created_by,
    updated_by
  )
  values (
    new.clinic_id,
    v_report_id,
    v_report_date,
    new.id,
    new.customer_id,
    new.menu_id,
    new.staff_id,
    v_customer_name,
    v_menu_name,
    v_duration_minutes,
    v_fee,
    case when v_is_insurance then 'insurance' else 'private' end,
    case when v_is_insurance then 'insurance' else 'private' end,
    'derived',
    'reservation',
    'not_calculated',
    'pending',
    'reservation',
    new.notes,
    new.created_by,
    new.created_by
  )
  on conflict (clinic_id, reservation_id) where reservation_id is not null
  do update set
    daily_report_id = excluded.daily_report_id,
    report_date = excluded.report_date,
    customer_id = excluded.customer_id,
    menu_id = excluded.menu_id,
    staff_resource_id = excluded.staff_resource_id,
    patient_name = excluded.patient_name,
    treatment_name = excluded.treatment_name,
    duration_minutes = excluded.duration_minutes,
    fee =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          or public.daily_report_items.amount_source = 'override'
          then public.daily_report_items.fee
        else excluded.fee
      end,
    billing_type =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          then public.daily_report_items.billing_type
        when public.daily_report_items.revenue_context_source in ('manual', 'override') then
          case
            when public.daily_report_items.revenue_context_code = 'insurance' then 'insurance'
            else 'private'
          end
        else excluded.billing_type
      end,
    revenue_context_code =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          then public.daily_report_items.revenue_context_code
        when public.daily_report_items.revenue_context_source in ('manual', 'override')
          then public.daily_report_items.revenue_context_code
        else excluded.revenue_context_code
      end,
    revenue_context_source =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          then public.daily_report_items.revenue_context_source
        when public.daily_report_items.revenue_context_source in ('manual', 'override')
          then public.daily_report_items.revenue_context_source
        else excluded.revenue_context_source
      end,
    amount_source =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          then public.daily_report_items.amount_source
        else excluded.amount_source
      end,
    estimate_status =
      case
        when public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')
          or public.daily_report_items.estimate_status in ('overridden', 'blocked')
          then public.daily_report_items.estimate_status
        else excluded.estimate_status
      end,
    notes = excluded.notes,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return new;
end;
$$;

revoke execute on function public.sync_arrived_reservation_daily_report_item()
from public, anon, authenticated;

grant execute on function public.sync_arrived_reservation_daily_report_item()
to service_role;

create or replace function public.confirm_daily_report_item_pricing(
  p_clinic_id uuid,
  p_daily_report_item_id uuid,
  p_patient_burden_rate_override integer default null,
  p_manual_estimated_amount numeric default null,
  p_update_customer_coverage boolean default false,
  p_confirmation_note text default null,
  p_actor_user_id uuid default null
)
returns table (
  daily_report_item_id uuid,
  revenue_estimate_id uuid,
  estimate_status text,
  estimated_total numeric,
  pricing_snapshot_status text,
  patient_burden_rate integer
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_item public.daily_report_items%rowtype;
  v_profile public.menu_billing_profiles%rowtype;
  v_profile_found boolean := false;
  v_coverage public.customer_insurance_coverages%rowtype;
  v_coverage_found boolean := false;
  v_estimate_id uuid;
  v_calculation_method text;
  v_fixed_amount numeric(10,2);
  v_gross numeric(10,2);
  v_manual_amount numeric(10,2);
  v_patient_rate integer;
  v_patient_copay numeric(10,2);
  v_insurer_receivable numeric(10,2);
  v_status text;
  v_snapshot_status text;
  v_now timestamptz := now();
begin
  if p_patient_burden_rate_override is not null
    and p_patient_burden_rate_override not in (0, 10, 20, 30)
  then
    raise exception 'patient burden rate must be one of 0,10,20,30'
      using errcode = '23514';
  end if;

  select *
  into v_item
  from public.daily_report_items
  where clinic_id = p_clinic_id
    and id = p_daily_report_item_id
  for update;

  if not found then
    raise exception 'daily_report_items.id not found' using errcode = '23503';
  end if;

  if v_item.estimate_status = 'overridden' then
    raise exception 'overridden revenue estimate is protected'
      using errcode = '23514';
  end if;

  if v_item.menu_id is not null then
    select *
    into v_profile
    from public.menu_billing_profiles
    where clinic_id = p_clinic_id
      and menu_id = v_item.menu_id
      and revenue_context_code = v_item.revenue_context_code
      and is_active = true
      and is_deleted = false
      and effective_from <= v_item.report_date
      and (effective_to is null or effective_to >= v_item.report_date)
    order by effective_from desc, created_at desc
    limit 1;

    v_profile_found := found;
  end if;

  v_calculation_method :=
    case
      when v_profile_found then v_profile.calculation_method
      when v_item.revenue_context_code = 'insurance' then 'insurance_master'
      when v_item.revenue_context_code in ('traffic_accident', 'workers_comp') then 'manual_estimate'
      else 'fixed_amount'
    end;

  v_fixed_amount := coalesce(v_profile.fixed_amount_yen, v_item.fee, 0)::numeric(10,2);
  v_gross := coalesce(v_item.fee, 0)::numeric(10,2);
  v_manual_amount := coalesce(p_manual_estimated_amount, v_item.fee, 0)::numeric(10,2);
  v_patient_rate := p_patient_burden_rate_override;

  if v_calculation_method = 'insurance_master' and v_patient_rate is null and v_item.customer_id is not null then
    select *
    into v_coverage
    from public.customer_insurance_coverages
    where clinic_id = p_clinic_id
      and customer_id = v_item.customer_id
      and payer_context_code = 'insurance'
      and verification_status = 'confirmed'
      and effective_from <= v_item.report_date
      and (effective_to is null or effective_to >= v_item.report_date)
    order by effective_from desc
    limit 1;

    v_coverage_found := found;
    if v_coverage_found then
      v_patient_rate := v_coverage.patient_burden_rate;
    end if;
  end if;

  if v_calculation_method = 'fixed_amount' then
    v_status := 'calculated';
    v_snapshot_status := 'confirmed';
    v_gross := v_fixed_amount;
  elsif v_calculation_method = 'manual_estimate' then
    v_status := 'needs_review';
    v_snapshot_status := 'needs_review';
    v_gross := v_manual_amount;
  elsif v_patient_rate is null then
    v_status := 'needs_review';
    v_snapshot_status := 'needs_review';
  else
    v_status := 'calculated';
    v_snapshot_status := 'confirmed';
  end if;

  insert into public.revenue_estimates (
    clinic_id,
    daily_report_item_id,
    revenue_context_code,
    estimate_status,
    estimated_total,
    disclaimer,
    calculated_at,
    calculation_version,
    created_by,
    updated_by
  )
  values (
    p_clinic_id,
    p_daily_report_item_id,
    v_item.revenue_context_code,
    v_status,
    v_gross,
    '経営分析用の概算です。請求確定額ではありません。',
    v_now,
    'phase4a_v1_snapshot',
    p_actor_user_id,
    p_actor_user_id
  )
  on conflict (daily_report_item_id)
  do update set
    revenue_context_code = excluded.revenue_context_code,
    estimate_status = excluded.estimate_status,
    estimated_total = excluded.estimated_total,
    disclaimer = excluded.disclaimer,
    calculated_at = excluded.calculated_at,
    calculation_version = excluded.calculation_version,
    updated_by = excluded.updated_by
  returning id into v_estimate_id;

  delete from public.revenue_estimate_warnings
  where clinic_id = p_clinic_id
    and revenue_estimate_id = v_estimate_id;

  delete from public.revenue_estimate_lines
  where clinic_id = p_clinic_id
    and revenue_estimate_id = v_estimate_id;

  if v_calculation_method = 'fixed_amount' then
    insert into public.revenue_estimate_lines (
      clinic_id,
      revenue_estimate_id,
      line_type,
      label,
      quantity,
      unit_amount,
      total_amount,
      sort_order,
      amount_role
    )
    values (
      p_clinic_id,
      v_estimate_id,
      'fixed_amount',
      '自費 売上見込み',
      1,
      v_gross,
      v_gross,
      10,
      'private_revenue_estimated'
    );
  elsif v_calculation_method = 'manual_estimate' then
    insert into public.revenue_estimate_lines (
      clinic_id,
      revenue_estimate_id,
      line_type,
      label,
      quantity,
      unit_amount,
      total_amount,
      sort_order,
      amount_role
    )
    values (
      p_clinic_id,
      v_estimate_id,
      'manual_estimate',
      case
        when v_item.revenue_context_code = 'workers_comp' then '労災 手入力概算'
        else '交通事故 手入力概算'
      end,
      1,
      v_gross,
      v_gross,
      10,
      case
        when v_item.revenue_context_code = 'workers_comp'
          then 'workers_comp_receivable_estimated'
        else 'traffic_accident_receivable_estimated'
      end
    );

    insert into public.revenue_estimate_warnings (
      clinic_id,
      revenue_estimate_id,
      warning_code,
      severity,
      message
    )
    values (
      p_clinic_id,
      v_estimate_id,
      case
        when v_item.revenue_context_code = 'workers_comp' then 'WORKERS_COMP_REVIEW'
        else 'TRAFFIC_ACCIDENT_REVIEW'
      end,
      'needs_review',
      case
        when v_item.revenue_context_code = 'workers_comp'
          then '労災関連の手入力概算です。Phase 4Aでは自動算定未対応です。'
        else '交通事故・自賠責関連の手入力概算です。公式マスタ由来の自動請求額ではありません。'
      end
    );
  elsif v_patient_rate is null then
    insert into public.revenue_estimate_lines (
      clinic_id,
      revenue_estimate_id,
      line_type,
      label,
      quantity,
      unit_amount,
      total_amount,
      sort_order,
      amount_role
    )
    values (
      p_clinic_id,
      v_estimate_id,
      'insurance_gross',
      '保険 療養費見込み 要確認',
      1,
      v_gross,
      v_gross,
      10,
      'gross_estimated_total'
    );

    insert into public.revenue_estimate_warnings (
      clinic_id,
      revenue_estimate_id,
      warning_code,
      severity,
      message
    )
    values (
      p_clinic_id,
      v_estimate_id,
      'PATIENT_COVERAGE_REVIEW_REQUIRED',
      'needs_review',
      '患者負担割合の確認が必要です。'
    );
  else
    v_patient_copay := round((v_gross * v_patient_rate / 100.0), 0)::numeric(10,2);
    v_insurer_receivable := greatest(0, v_gross - v_patient_copay)::numeric(10,2);

    insert into public.revenue_estimate_lines (
      clinic_id,
      revenue_estimate_id,
      line_type,
      label,
      quantity,
      unit_amount,
      total_amount,
      sort_order,
      amount_role
    )
    values
      (
        p_clinic_id,
        v_estimate_id,
        'insurance_gross',
        '保険 療養費見込み',
        1,
        v_gross,
        v_gross,
        10,
        'gross_estimated_total'
      ),
      (
        p_clinic_id,
        v_estimate_id,
        'patient_copay',
        '患者負担見込み',
        1,
        v_patient_copay,
        v_patient_copay,
        20,
        'patient_copay_estimated'
      ),
      (
        p_clinic_id,
        v_estimate_id,
        'insurer_receivable',
        '保険者請求見込み',
        1,
        v_insurer_receivable,
        v_insurer_receivable,
        30,
        'insurer_receivable_estimated'
      );
  end if;

  if p_update_customer_coverage = true
    and v_calculation_method = 'insurance_master'
    and p_patient_burden_rate_override is not null
    and v_item.customer_id is not null
  then
    update public.customer_insurance_coverages
    set
      verification_status = 'inactive',
      effective_to =
        case
          when effective_from < v_item.report_date then v_item.report_date - 1
          else effective_from
        end,
      updated_by = p_actor_user_id
    where clinic_id = p_clinic_id
      and customer_id = v_item.customer_id
      and payer_context_code = 'insurance'
      and verification_status = 'confirmed'
      and effective_from <= v_item.report_date
      and (effective_to is null or effective_to >= v_item.report_date);

    insert into public.customer_insurance_coverages (
      clinic_id,
      customer_id,
      payer_context_code,
      patient_burden_rate,
      effective_from,
      verification_status,
      verified_at,
      verified_by,
      notes,
      created_by,
      updated_by
    )
    values (
      p_clinic_id,
      v_item.customer_id,
      'insurance',
      p_patient_burden_rate_override,
      v_item.report_date,
      'confirmed',
      v_now,
      p_actor_user_id,
      p_confirmation_note,
      p_actor_user_id,
      p_actor_user_id
    )
    returning * into v_coverage;

    v_coverage_found := true;
  end if;

  update public.daily_report_items
  set
    menu_billing_profile_id = case when v_profile_found then v_profile.id else null end,
    customer_insurance_coverage_id =
      case when v_coverage_found then v_coverage.id else null end,
    patient_burden_rate = v_patient_rate,
    coverage_resolution_source =
      case
        when v_patient_rate is null then null
        when p_patient_burden_rate_override is not null then 'manual'
        when v_coverage_found then 'customer_default'
        else 'manual'
      end,
    pricing_snapshot_status = v_snapshot_status,
    pricing_confirmed_at = v_now,
    estimate_status = v_status,
    amount_source = 'estimate',
    updated_by = p_actor_user_id
  where clinic_id = p_clinic_id
    and id = p_daily_report_item_id;

  return query
  select
    p_daily_report_item_id,
    v_estimate_id,
    v_status,
    v_gross,
    v_snapshot_status,
    v_patient_rate;
end;
$$;

revoke execute on function public.confirm_daily_report_item_pricing(
  uuid,
  uuid,
  integer,
  numeric,
  boolean,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.confirm_daily_report_item_pricing(
  uuid,
  uuid,
  integer,
  numeric,
  boolean,
  text,
  uuid
) to service_role;

alter table public.menu_template_billing_profiles enable row level security;
alter table public.menu_billing_profiles enable row level security;
alter table public.customer_insurance_coverages enable row level security;

drop policy if exists "menu_template_billing_profiles_select_for_managers"
on public.menu_template_billing_profiles;
create policy "menu_template_billing_profiles_select_for_managers"
on public.menu_template_billing_profiles
for select
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin', 'manager'])
  and app_private.can_access_clinic(owner_clinic_id)
);

drop policy if exists "menu_template_billing_profiles_write_for_admin"
on public.menu_template_billing_profiles;
create policy "menu_template_billing_profiles_write_for_admin"
on public.menu_template_billing_profiles
for all
to authenticated
using (
  app_private.get_current_role() = 'admin'
  and app_private.can_access_clinic(owner_clinic_id)
)
with check (
  app_private.get_current_role() = 'admin'
  and app_private.can_access_clinic(owner_clinic_id)
);

drop policy if exists "menu_billing_profiles_select_for_staff"
on public.menu_billing_profiles;
create policy "menu_billing_profiles_select_for_staff"
on public.menu_billing_profiles
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "menu_billing_profiles_write_for_clinic_pricing_admin"
on public.menu_billing_profiles;
create policy "menu_billing_profiles_write_for_clinic_pricing_admin"
on public.menu_billing_profiles
for all
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "customer_insurance_coverages_select_for_staff"
on public.customer_insurance_coverages;
create policy "customer_insurance_coverages_select_for_staff"
on public.customer_insurance_coverages
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "customer_insurance_coverages_write_for_clinic_pricing_admin"
on public.customer_insurance_coverages;
create policy "customer_insurance_coverages_write_for_clinic_pricing_admin"
on public.customer_insurance_coverages
for all
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (array['admin', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

revoke all on table public.menu_template_billing_profiles from anon;
revoke all on table public.menu_billing_profiles from anon;
revoke all on table public.customer_insurance_coverages from anon;

grant select, insert, update, delete on table public.menu_template_billing_profiles to authenticated;
grant select, insert, update, delete on table public.menu_billing_profiles to authenticated;
grant select, insert, update, delete on table public.customer_insurance_coverages to authenticated;

grant all on table public.menu_template_billing_profiles to service_role;
grant all on table public.menu_billing_profiles to service_role;
grant all on table public.customer_insurance_coverages to service_role;

create or replace view public.daily_report_revenue_breakdown_summary
with (security_invoker = true)
as
select
  dri.clinic_id,
  dri.report_date,
  rel.amount_role,
  count(*)::integer as line_count,
  coalesce(sum(rel.total_amount), 0)::numeric(10,2) as estimated_amount
from public.daily_report_items dri
join public.revenue_estimates re
  on re.daily_report_item_id = dri.id
join public.revenue_estimate_lines rel
  on rel.revenue_estimate_id = re.id
where re.estimate_status in ('calculated', 'needs_review', 'overridden')
  and rel.amount_role is not null
group by
  dri.clinic_id,
  dri.report_date,
  rel.amount_role;

grant select on public.daily_report_revenue_breakdown_summary to authenticated;
grant select on public.daily_report_revenue_breakdown_summary to service_role;

revoke execute on function public.validate_menu_template_billing_profile_refs()
from public, anon, authenticated;
revoke execute on function public.validate_menu_billing_profile_refs()
from public, anon, authenticated;
revoke execute on function public.validate_customer_insurance_coverage_refs()
from public, anon, authenticated;
revoke execute on function public.reject_overlapping_confirmed_customer_coverage()
from public, anon, authenticated;
revoke execute on function public.validate_daily_report_item_pricing_refs()
from public, anon, authenticated;

grant execute on function public.validate_menu_template_billing_profile_refs()
to service_role;
grant execute on function public.validate_menu_billing_profile_refs()
to service_role;
grant execute on function public.validate_customer_insurance_coverage_refs()
to service_role;
grant execute on function public.reject_overlapping_confirmed_customer_coverage()
to service_role;
grant execute on function public.validate_daily_report_item_pricing_refs()
to service_role;

comment on table public.menu_template_billing_profiles is
  'Phase 4A standard billing profile definitions for menu templates.';
comment on table public.menu_billing_profiles is
  'Phase 4A clinic-owned billing profile definitions for operational menus.';
comment on table public.customer_insurance_coverages is
  'Phase 4A effective-dated health insurance burden settings for customers.';
comment on column public.revenue_estimate_lines.amount_role is
  'Phase 4A revenue breakdown role such as patient copay or insurer receivable.';
comment on function public.confirm_daily_report_item_pricing(
  uuid,
  uuid,
  integer,
  numeric,
  boolean,
  text,
  uuid
) is
  'Atomically confirms daily report item pricing snapshots and revenue breakdown estimate lines.';
