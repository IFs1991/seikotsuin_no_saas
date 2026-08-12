-- Function runtime contract remediation
-- Spec: docs/stabilization/spec-function-runtime-contract-remediation-v0.1.md
-- Rollback: supabase/rollbacks/20260812160826_function_runtime_contract_remediation_rollback.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Resolve the PL/pgSQL output-parameter ambiguity by naming the existing
-- unique constraint explicitly. The surrounding pricing transaction is kept
-- byte-for-byte equivalent apart from the conflict target.
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
  on conflict on constraint revenue_estimates_unique_item
  do update set
    revenue_context_code = excluded.revenue_context_code,
    estimate_status = excluded.estimate_status,
    estimated_total = excluded.estimated_total,
    disclaimer = excluded.disclaimer,
    calculated_at = excluded.calculated_at,
    calculation_version = excluded.calculation_version,
    updated_by = excluded.updated_by
  returning id into v_estimate_id;

  delete from public.revenue_estimate_warnings warning
  where warning.clinic_id = p_clinic_id
    and warning.revenue_estimate_id = v_estimate_id;

  delete from public.revenue_estimate_lines estimate_line
  where estimate_line.clinic_id = p_clinic_id
    and estimate_line.revenue_estimate_id = v_estimate_id;

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

revoke all on function public.confirm_daily_report_item_pricing(
  uuid, uuid, integer, numeric, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.confirm_daily_report_item_pricing(
  uuid, uuid, integer, numeric, boolean, text, uuid
) to service_role;

create or replace function public.check_reservation_conflict(
  p_staff_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_reservation_id uuid default null
)
returns table (
  has_conflict boolean,
  conflict_type varchar,
  conflict_reason text,
  conflicting_reservation_id uuid
)
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
begin
  return query
  select
    true,
    'reservation'::varchar,
    'この時間帯は既に予約が入っています'::text,
    reservation.id
  from public.reservations reservation
  where reservation.staff_id = p_staff_id
    and reservation.is_deleted = false
    and reservation.status not in ('cancelled', 'no_show')
    and (p_exclude_reservation_id is null or reservation.id <> p_exclude_reservation_id)
    and reservation.start_time < p_end_time
    and reservation.end_time > p_start_time
  limit 1;

  if not found then
    return query
    select
      true,
      'block'::varchar,
      coalesce('販売停止期間: ' || block.reason, '販売停止期間'),
      block.id
    from public.blocks block
    where block.resource_id = p_staff_id
      and block.is_deleted = false
      and block.is_active = true
      and block.start_time < p_end_time
      and block.end_time > p_start_time
    limit 1;
  end if;

  if not found then
    return query
    select false, null::varchar, null::text, null::uuid;
  end if;
end;
$$;

grant execute on function public.check_reservation_conflict(uuid, timestamptz, timestamptz, uuid)
  to public, anon, authenticated, service_role;

create or replace function public.calculate_churn_risk_score(patient_uuid uuid)
returns numeric
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
declare
  v_last_visit_date date;
  v_visit_count bigint;
  v_treatment_period_days integer;
  v_days_since_last_visit integer;
  v_expected_gap_days integer;
  v_gap_ratio numeric;
  v_risk_score numeric := 10;
begin
  select
    summary.last_visit_date,
    coalesce(summary.visit_count, 0),
    coalesce(summary.treatment_period_days, 0)
  into
    v_last_visit_date,
    v_visit_count,
    v_treatment_period_days
  from public.patient_visit_summary summary
  where summary.patient_id = patient_uuid
  limit 1;

  if not found or v_visit_count = 0 or v_last_visit_date is null then
    return 0;
  end if;

  v_days_since_last_visit := greatest(
    0,
    (now() at time zone 'UTC')::date - v_last_visit_date
  );

  if v_visit_count > 1 and v_treatment_period_days > 0 then
    v_expected_gap_days := greatest(
      14,
      round(v_treatment_period_days::numeric / (v_visit_count - 1))::integer
    );
  else
    v_expected_gap_days := 30;
  end if;

  v_gap_ratio := v_days_since_last_visit::numeric / v_expected_gap_days;

  if v_gap_ratio > 4 then
    v_risk_score := 95;
  elsif v_gap_ratio > 3 then
    v_risk_score := 80;
  elsif v_gap_ratio > 2 then
    v_risk_score := 60;
  elsif v_gap_ratio > 1 then
    v_risk_score := 35;
  end if;

  if v_visit_count = 1 and v_days_since_last_visit > 14 then
    v_risk_score := greatest(v_risk_score, 55);
  end if;

  return v_risk_score;
end;
$$;

grant execute on function public.calculate_churn_risk_score(uuid)
  to public, anon, authenticated, service_role;

create or replace function public.get_invite_by_token(invite_token uuid)
returns table (
  id uuid,
  clinic_id uuid,
  email varchar,
  role varchar,
  expires_at timestamptz,
  accepted_at timestamptz,
  clinic_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    invite.id,
    invite.clinic_id,
    invite.email,
    invite.role,
    invite.expires_at,
    invite.accepted_at,
    clinic.name::text
  from public.staff_invites invite
  left join public.clinics clinic on clinic.id = invite.clinic_id
  where invite.token = invite_token
    and invite.expires_at > now()
    and invite.accepted_at is null;
end;
$$;

revoke all on function public.get_invite_by_token(uuid)
  from public, anon, authenticated;
grant execute on function public.get_invite_by_token(uuid)
  to service_role;

create or replace function public.analyze_staff_efficiency(
  clinic_uuid uuid,
  analysis_period integer default 30
)
returns table (
  staff_id uuid,
  staff_name varchar,
  efficiency_score numeric,
  revenue_per_hour numeric,
  patients_per_day numeric,
  satisfaction_trend varchar
)
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
declare
  v_period_days integer := greatest(coalesce(analysis_period, 30), 1);
  v_period_start timestamptz := (
    ((now() at time zone 'Asia/Tokyo')::date - (v_period_days - 1))::timestamp
    at time zone 'Asia/Tokyo'
  );
  v_period_end timestamptz := (
    ((now() at time zone 'Asia/Tokyo')::date + 1)::timestamp
    at time zone 'Asia/Tokyo'
  );
begin
  return query
  with reservation_metrics as (
    select
      reservation.staff_id,
      count(distinct reservation.customer_id)::numeric as unique_patients,
      coalesce(sum(coalesce(reservation.actual_price, reservation.price, 0)), 0)::numeric as total_revenue,
      count(distinct (reservation.start_time at time zone 'Asia/Tokyo')::date)::numeric as working_days
    from public.reservations reservation
    where reservation.clinic_id = clinic_uuid
      and reservation.is_deleted = false
      and reservation.status in ('completed', 'arrived')
      and reservation.start_time >= v_period_start
      and reservation.start_time < v_period_end
    group by reservation.staff_id
  )
  select
    resource.id,
    resource.name,
    case
      when metrics.working_days > 0
        then round(metrics.total_revenue * 3 / metrics.working_days, 2)
      else null
    end,
    case
      when metrics.working_days > 0
        then round(metrics.total_revenue / (metrics.working_days * 8), 2)
      else null
    end,
    case
      when metrics.working_days > 0
        then round(metrics.unique_patients / metrics.working_days, 2)
      else null
    end,
    'needs_improvement'::varchar
  from public.resources resource
  left join reservation_metrics metrics on metrics.staff_id = resource.id
  where resource.clinic_id = clinic_uuid
    and resource.type = 'staff'
    and resource.is_deleted = false
  order by 3 desc nulls last, resource.display_order, resource.name;
end;
$$;

grant execute on function public.analyze_staff_efficiency(uuid, integer)
  to public, anon, authenticated, service_role;

create or replace function public.predict_revenue(
  clinic_uuid uuid,
  forecast_days integer default 30
)
returns table (
  forecast_date date,
  predicted_revenue numeric,
  confidence_level varchar
)
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
declare
  avg_daily_revenue numeric(10,2);
  revenue_trend numeric(10,2);
begin
  select
    avg(summary.total_revenue),
    (max(summary.total_revenue) - min(summary.total_revenue)) / 30
  into avg_daily_revenue, revenue_trend
  from public.daily_revenue_summary summary
  where summary.clinic_id = clinic_uuid
    and summary.revenue_date >= current_date - interval '30 days';

  for day_counter in 1..forecast_days loop
    return query
    select
      (current_date + day_counter)::date,
      greatest(0, avg_daily_revenue + (revenue_trend * day_counter))::numeric(10,2),
      case
        when day_counter <= 7 then 'high'
        when day_counter <= 14 then 'medium'
        else 'low'
      end::varchar;
  end loop;
end;
$$;

grant execute on function public.predict_revenue(uuid, integer)
  to public, anon, authenticated, service_role;

create or replace function public.convert_shift_requests(
  p_clinic_id uuid,
  p_period_id uuid,
  p_request_ids uuid[] default null,
  p_mode text default 'selected',
  p_actor_user_id uuid default auth.uid(),
  p_actor_role text default app_private.get_current_role()
)
returns table(converted_request_id uuid, converted_shift_id uuid)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_period_status text;
  v_requested_count integer := 0;
  v_candidate_count integer := 0;
begin
  perform 'PRAGMA:TABLE: shift_request_conversion_candidates(request_id uuid, clinic_id uuid, period_id uuid, staff_id uuid, start_time timestamptz, end_time timestamptz, note text, request_type text, status text, before_data jsonb)';
  perform 'PRAGMA:TABLE: shift_request_conversion_map(request_id uuid, shift_id uuid)';

  if p_actor_user_id is null then
    raise exception 'actor user id is required' using errcode = '23514';
  end if;

  if p_actor_role is null or p_actor_role <> all (array['admin', 'manager']) then
    raise exception 'only manager/admin can convert shift requests' using errcode = '42501';
  end if;

  if p_mode not in ('selected', 'all_approved') then
    raise exception 'invalid conversion mode' using errcode = '23514';
  end if;

  select status
  into v_period_status
  from public.shift_request_periods
  where id = p_period_id
    and clinic_id = p_clinic_id;

  if not found then
    raise exception 'shift request period not found' using errcode = '23503';
  end if;

  if v_period_status in ('finalized', 'cancelled') then
    raise exception 'shift request period is not convertible' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text), hashtext(p_period_id::text));

  drop table if exists pg_temp.shift_request_conversion_candidates;

  if p_mode = 'selected' then
    if coalesce(array_length(p_request_ids, 1), 0) = 0 then
      raise exception 'request_ids are required for selected conversion' using errcode = '23514';
    end if;

    create temporary table shift_request_conversion_candidates on commit drop as
    with requested as (
      select distinct unnest(p_request_ids) as request_id
    )
    select
      request.id as request_id,
      request.clinic_id,
      request.period_id,
      request.staff_id,
      request.start_time,
      request.end_time,
      request.note,
      request.request_type,
      request.status,
      to_jsonb(request.*) as before_data
    from public.shift_requests request
    join requested selected on selected.request_id = request.id
    where request.clinic_id = p_clinic_id
      and request.period_id = p_period_id
      and request.status = 'approved'
      and request.request_type in ('available', 'preferred')
      and request.converted_shift_id is null
    for update of request;

    select count(*)
    into v_requested_count
    from (select distinct unnest(p_request_ids) as request_id) requested;

    select count(*)
    into v_candidate_count
    from shift_request_conversion_candidates;

    if v_requested_count <> v_candidate_count then
      raise exception 'selected request_ids include non-convertible requests' using errcode = '23514';
    end if;
  else
    create temporary table shift_request_conversion_candidates on commit drop as
    select
      request.id as request_id,
      request.clinic_id,
      request.period_id,
      request.staff_id,
      request.start_time,
      request.end_time,
      request.note,
      request.request_type,
      request.status,
      to_jsonb(request.*) as before_data
    from public.shift_requests request
    where request.clinic_id = p_clinic_id
      and request.period_id = p_period_id
      and request.status = 'approved'
      and request.request_type in ('available', 'preferred')
      and request.converted_shift_id is null
    for update of request;

    select count(*)
    into v_candidate_count
    from shift_request_conversion_candidates;
  end if;

  if v_candidate_count = 0 then
    return;
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates first_candidate
    join shift_request_conversion_candidates second_candidate
      on first_candidate.staff_id = second_candidate.staff_id
     and first_candidate.request_id::text < second_candidate.request_id::text
     and first_candidate.start_time < second_candidate.end_time
     and first_candidate.end_time > second_candidate.start_time
  ) then
    raise exception 'conversion candidates overlap internally' using errcode = '23514';
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates candidate
    join public.staff_shifts shift
      on shift.clinic_id = candidate.clinic_id
     and shift.staff_id = candidate.staff_id
     and shift.status <> 'cancelled'
     and shift.start_time < candidate.end_time
     and shift.end_time > candidate.start_time
  ) then
    raise exception 'conversion candidates overlap existing staff_shifts' using errcode = '23514';
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates candidate
    join public.shift_requests blocker
      on blocker.clinic_id = candidate.clinic_id
     and blocker.period_id = candidate.period_id
     and blocker.staff_id = candidate.staff_id
     and blocker.status = 'approved'
     and blocker.request_type in ('unavailable', 'day_off')
     and blocker.start_time < candidate.end_time
     and blocker.end_time > candidate.start_time
  ) then
    raise exception 'conversion candidates overlap approved unavailable/day_off requests' using errcode = '23514';
  end if;

  drop table if exists pg_temp.shift_request_conversion_map;
  create temporary table shift_request_conversion_map on commit drop as
  select
    candidate.request_id,
    gen_random_uuid() as shift_id
  from shift_request_conversion_candidates candidate;

  insert into public.staff_shifts (
    id,
    clinic_id,
    staff_id,
    start_time,
    end_time,
    status,
    notes,
    created_by
  )
  select
    conversion.shift_id,
    candidate.clinic_id,
    candidate.staff_id,
    candidate.start_time,
    candidate.end_time,
    'confirmed',
    candidate.note,
    p_actor_user_id
  from shift_request_conversion_candidates candidate
  join shift_request_conversion_map conversion on conversion.request_id = candidate.request_id;

  update public.shift_requests request
  set
    status = 'converted',
    converted_shift_id = conversion.shift_id,
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    updated_at = now()
  from shift_request_conversion_map conversion
  where request.id = conversion.request_id;

  insert into public.shift_request_audit_logs (
    clinic_id,
    period_id,
    request_id,
    actor_user_id,
    actor_role,
    action,
    before_data,
    after_data
  )
  select
    candidate.clinic_id,
    candidate.period_id,
    candidate.request_id,
    p_actor_user_id,
    p_actor_role,
    'request_convert',
    candidate.before_data,
    jsonb_build_object(
      'status', 'converted',
      'converted_shift_id', conversion.shift_id
    )
  from shift_request_conversion_candidates candidate
  join shift_request_conversion_map conversion on conversion.request_id = candidate.request_id;

  return query
  select
    conversion.request_id,
    conversion.shift_id
  from shift_request_conversion_map conversion
  order by conversion.request_id;
end;
$$;

revoke all on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  to service_role;

comment on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  is 'Atomically converts approved available/preferred shift_requests to confirmed staff_shifts. day_off/unavailable are excluded in every mode.';

alter function public.analyze_staff_efficiency(uuid, integer) owner to postgres;
alter function public.calculate_churn_risk_score(uuid) owner to postgres;
alter function public.check_reservation_conflict(uuid, timestamptz, timestamptz, uuid) owner to postgres;
alter function public.confirm_daily_report_item_pricing(uuid, uuid, integer, numeric, boolean, text, uuid) owner to postgres;
alter function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text) owner to postgres;
alter function public.get_invite_by_token(uuid) owner to postgres;
alter function public.predict_revenue(uuid, integer) owner to postgres;

-- Fail the migration if a public signature, execution mode, search_path, or
-- role boundary drifted while replacing the implementations.
do $function_contract$
declare
  contract record;
  function_oid oid;
  actual_definer boolean;
  actual_search_path text;
  actual_execute_roles text[];
  expected_execute_roles text[];
  has_execute_grant_option boolean;
begin
  for contract in
    select *
    from (values
      ('public.analyze_staff_efficiency(uuid,integer)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.calculate_churn_risk_score(uuid)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.check_reservation_conflict(uuid,timestamptz,timestamptz,uuid)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[]),
      ('public.confirm_daily_report_item_pricing(uuid,uuid,integer,numeric,boolean,text,uuid)', true, 'search_path=public, auth, extensions', array['service_role']::text[]),
      ('public.convert_shift_requests(uuid,uuid,uuid[],text,uuid,text)', true, 'search_path=public, auth, extensions', array['service_role']::text[]),
      ('public.get_invite_by_token(uuid)', true, 'search_path=public', array['service_role']::text[]),
      ('public.predict_revenue(uuid,integer)', false, 'search_path=public, auth, extensions', array['PUBLIC', 'anon', 'authenticated', 'service_role']::text[])
    ) as expected(signature, security_definer, search_path, execute_roles)
  loop
    function_oid := to_regprocedure(contract.signature);
    if function_oid is null then
      raise exception 'function contract missing: %', contract.signature;
    end if;

    select
      target_proc.prosecdef,
      (
        select setting
        from unnest(coalesce(target_proc.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
        limit 1
      )
    into actual_definer, actual_search_path
    from pg_proc target_proc
    where target_proc.oid = function_oid;

    if actual_definer is distinct from contract.security_definer then
      raise exception 'security mode drift for %', contract.signature;
    end if;

    if actual_search_path is distinct from contract.search_path then
      raise exception 'search_path drift for %: expected %, received %',
        contract.signature,
        contract.search_path,
        actual_search_path;
    end if;

    if pg_get_userbyid((select proowner from pg_proc where oid = function_oid)) <> 'postgres' then
      raise exception 'owner drift for %', contract.signature;
    end if;

    select
      coalesce(
        array_agg(
          distinct actual_grant.role_name collate "C"
          order by actual_grant.role_name collate "C"
        ),
        array[]::text[]
      ),
      coalesce(bool_or(actual_grant.is_grantable), false)
    into actual_execute_roles, has_execute_grant_option
    from (
      select case
        when acl_entry.grantee = 0 then 'PUBLIC'
        else pg_get_userbyid(acl_entry.grantee)::text
      end as role_name,
      acl_entry.is_grantable
      from pg_proc target_proc
      cross join lateral aclexplode(
        coalesce(target_proc.proacl, acldefault('f', target_proc.proowner))
      ) acl_entry
      where target_proc.oid = function_oid
        and acl_entry.privilege_type = 'EXECUTE'
        and acl_entry.grantee <> target_proc.proowner
    ) actual_grant;

    select coalesce(
      array_agg(expected_role order by expected_role collate "C"),
      array[]::text[]
    )
    into expected_execute_roles
    from unnest(contract.execute_roles) expected_role;

    if actual_execute_roles is distinct from expected_execute_roles
      or has_execute_grant_option
    then
      raise exception 'exact function EXECUTE ACL drift for %: expected %, received %, grant option %',
        contract.signature,
        expected_execute_roles,
        actual_execute_roles,
        has_execute_grant_option;
    end if;
  end loop;
end;
$function_contract$;

commit;
