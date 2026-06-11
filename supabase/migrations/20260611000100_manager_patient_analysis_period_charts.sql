-- ================================================================
-- Migration: Manager patient analysis period charts
-- Spec: docs/stabilization/specmanagerpatientanalysisperiodchartsv0.2.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

create or replace function public.manager_patient_period_totals(
  p_clinic_ids uuid[],
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns table (
  clinic_id uuid,
  patient_count bigint,
  new_patients bigint,
  repeat_patients bigint,
  converted_new_patients bigint,
  visit_count bigint,
  total_revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_clinics as (
    select distinct requested.clinic_id
    from unnest(coalesce(p_clinic_ids, array[]::uuid[])) as requested(clinic_id)
    where requested.clinic_id is not null
  ),
  qualified_visits as (
    select
      r.id,
      r.clinic_id,
      r.customer_id,
      r.start_time,
      coalesce(r.actual_price, r.price, 0)::numeric as amount,
      row_number() over (
        partition by r.clinic_id, r.customer_id
        order by r.start_time, r.id
      ) as visit_number
    from public.reservations r
    join requested_clinics rc on rc.clinic_id = r.clinic_id
    where r.is_deleted = false
      and r.status::text in ('completed', 'arrived')
      and (p_end is null or r.start_time <= p_end)
  ),
  first_second_visits as (
    select
      qv.clinic_id,
      qv.customer_id,
      min(qv.start_time) filter (where qv.visit_number = 1) as first_visit_at,
      min(qv.start_time) filter (where qv.visit_number = 2) as second_visit_at
    from qualified_visits qv
    group by qv.clinic_id, qv.customer_id
  ),
  period_visits as (
    select qv.*
    from qualified_visits qv
    where (p_start is null or qv.start_time >= p_start)
      and (p_end is null or qv.start_time <= p_end)
  ),
  aggregated as (
    select
      pv.clinic_id,
      count(distinct pv.customer_id) as patient_count,
      count(distinct pv.customer_id) filter (
        where pv.visit_number = 1
      ) as new_patients,
      count(distinct pv.customer_id) filter (
        where pv.visit_number > 1
      ) as repeat_patients,
      count(distinct pv.customer_id) filter (
        where pv.visit_number = 1
          and fsv.second_visit_at is not null
          and (p_end is null or fsv.second_visit_at <= p_end)
      ) as converted_new_patients,
      count(*) as visit_count,
      coalesce(sum(pv.amount), 0)::numeric as total_revenue
    from period_visits pv
    join first_second_visits fsv
      on fsv.clinic_id = pv.clinic_id
     and fsv.customer_id = pv.customer_id
    group by pv.clinic_id
  )
  select
    rc.clinic_id,
    coalesce(a.patient_count, 0)::bigint,
    coalesce(a.new_patients, 0)::bigint,
    coalesce(a.repeat_patients, 0)::bigint,
    coalesce(a.converted_new_patients, 0)::bigint,
    coalesce(a.visit_count, 0)::bigint,
    coalesce(a.total_revenue, 0)::numeric
  from requested_clinics rc
  left join aggregated a on a.clinic_id = rc.clinic_id
  order by rc.clinic_id;
$$;

create or replace function public.manager_patient_period_series(
  p_clinic_ids uuid[],
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_bucket text default 'monthly'
)
returns table (
  bucket_start date,
  bucket_end date,
  patient_count bigint,
  new_patients bigint,
  repeat_patients bigint,
  converted_new_patients bigint,
  visit_count bigint,
  total_revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_clinics as (
    select distinct requested.clinic_id
    from unnest(coalesce(p_clinic_ids, array[]::uuid[])) as requested(clinic_id)
    where requested.clinic_id is not null
  ),
  qualified_visits as (
    select
      r.id,
      r.clinic_id,
      r.customer_id,
      r.start_time,
      (r.start_time at time zone 'Asia/Tokyo')::date as visit_date,
      coalesce(r.actual_price, r.price, 0)::numeric as amount,
      row_number() over (
        partition by r.clinic_id, r.customer_id
        order by r.start_time, r.id
      ) as visit_number
    from public.reservations r
    join requested_clinics rc on rc.clinic_id = r.clinic_id
    where r.is_deleted = false
      and r.status::text in ('completed', 'arrived')
      and (p_end is null or r.start_time <= p_end)
      and p_bucket in ('daily', 'weekly', 'monthly')
  ),
  first_second_visits as (
    select
      qv.clinic_id,
      qv.customer_id,
      min(qv.start_time) filter (where qv.visit_number = 1) as first_visit_at,
      min(qv.start_time) filter (where qv.visit_number = 2) as second_visit_at
    from qualified_visits qv
    group by qv.clinic_id, qv.customer_id
  ),
  bounds as (
    select
      coalesce((p_start at time zone 'Asia/Tokyo')::date, min(qv.visit_date)) as requested_start,
      coalesce((p_end at time zone 'Asia/Tokyo')::date, max(qv.visit_date)) as requested_end
    from qualified_visits qv
  ),
  normalized_bounds as (
    select
      requested_start,
      requested_end,
      case p_bucket
        when 'daily' then requested_start
        when 'weekly' then date_trunc('week', requested_start::timestamp)::date
        else date_trunc('month', requested_start::timestamp)::date
      end as series_start
    from bounds
    where requested_start is not null
      and requested_end is not null
      and requested_start <= requested_end
  ),
  raw_buckets as (
    select
      generate_series(
        nb.series_start::timestamp,
        nb.requested_end::timestamp,
        case p_bucket
          when 'daily' then interval '1 day'
          when 'weekly' then interval '1 week'
          else interval '1 month'
        end
      )::date as raw_start,
      nb.requested_start,
      nb.requested_end
    from normalized_bounds nb
  ),
  buckets as (
    select
      greatest(rb.raw_start, rb.requested_start) as bucket_start,
      least(
        case p_bucket
          when 'daily' then rb.raw_start
          when 'weekly' then rb.raw_start + 6
          else (rb.raw_start + interval '1 month' - interval '1 day')::date
        end,
        rb.requested_end
      ) as bucket_end
    from raw_buckets rb
  ),
  aggregated as (
    select
      b.bucket_start,
      b.bucket_end,
      count(distinct qv.customer_id) as patient_count,
      count(distinct qv.customer_id) filter (
        where qv.visit_number = 1
      ) as new_patients,
      count(distinct qv.customer_id) filter (
        where qv.visit_number > 1
      ) as repeat_patients,
      count(distinct qv.customer_id) filter (
        where qv.visit_number = 1
          and fsv.second_visit_at is not null
          and (p_end is null or fsv.second_visit_at <= p_end)
      ) as converted_new_patients,
      count(qv.id) as visit_count,
      coalesce(sum(qv.amount), 0)::numeric as total_revenue
    from buckets b
    left join qualified_visits qv
      on qv.visit_date between b.bucket_start and b.bucket_end
     and (p_start is null or qv.start_time >= p_start)
     and (p_end is null or qv.start_time <= p_end)
    left join first_second_visits fsv
      on fsv.clinic_id = qv.clinic_id
     and fsv.customer_id = qv.customer_id
    group by b.bucket_start, b.bucket_end
  )
  select
    a.bucket_start,
    a.bucket_end,
    a.patient_count::bigint,
    a.new_patients::bigint,
    a.repeat_patients::bigint,
    a.converted_new_patients::bigint,
    a.visit_count::bigint,
    a.total_revenue::numeric
  from aggregated a
  order by a.bucket_start;
$$;

revoke all on function public.manager_patient_period_totals(uuid[], timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.manager_patient_period_totals(uuid[], timestamptz, timestamptz)
  to service_role;

revoke all on function public.manager_patient_period_series(uuid[], timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.manager_patient_period_series(uuid[], timestamptz, timestamptz, text)
  to service_role;

commit;
