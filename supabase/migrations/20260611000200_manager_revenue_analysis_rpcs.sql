-- ================================================================
-- Migration: Manager revenue analysis RPCs
-- Spec: docs/stabilization/spec-manager-revenue-analysis-v0.2.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

create or replace function public.manager_revenue_period_totals(
  p_clinic_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table (
  clinic_id uuid,
  operating_revenue numeric,
  insurance_revenue numeric,
  private_revenue numeric,
  product_revenue numeric,
  ticket_revenue numeric,
  traffic_accident_revenue numeric,
  workers_comp_revenue numeric,
  patient_copay_estimated numeric,
  insurer_receivable_estimated numeric,
  private_revenue_estimated numeric,
  visit_count bigint,
  report_days bigint,
  missing_report_days bigint,
  needs_review_count bigint,
  blocked_count bigint,
  first_report_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_clinics as (
    select distinct requested.requested_clinic_id as clinic_id
    from unnest(coalesce(p_clinic_ids, array[]::uuid[])) as requested(requested_clinic_id)
    where requested.requested_clinic_id is not null
  ),
  today as (
    select (now() at time zone 'Asia/Tokyo')::date as business_date
  ),
  report_bounds as (
    select
      rc.clinic_id,
      min(dr.report_date) as first_report_date,
      max(dr.report_date) as last_report_date
    from requested_clinics rc
    cross join today t
    left join public.daily_reports dr
      on dr.clinic_id = rc.clinic_id
     and dr.report_date <= t.business_date
    group by rc.clinic_id
  ),
  effective_bounds as (
    select
      rb.clinic_id,
      rb.first_report_date,
      case
        when rb.first_report_date is null then null
        else greatest(coalesce(p_start, rb.first_report_date), rb.first_report_date)
      end as effective_start,
      case
        when rb.first_report_date is null then null
        else least(coalesce(p_end, rb.last_report_date, t.business_date), t.business_date)
      end as effective_end
    from report_bounds rb
    cross join today t
  ),
  daily_agg as (
    select
      eb.clinic_id,
      coalesce(
        sum(
          coalesce(
            dr.total_revenue,
            coalesce(dr.insurance_revenue, 0) + coalesce(dr.private_revenue, 0),
            0
          )
        ),
        0
      )::numeric as operating_revenue,
      coalesce(sum(coalesce(dr.insurance_revenue, 0)), 0)::numeric as insurance_revenue,
      coalesce(sum(coalesce(dr.private_revenue, 0)), 0)::numeric as private_revenue,
      coalesce(sum(coalesce(dr.total_patients, 0)), 0)::bigint as visit_count,
      -- daily_reports は UNIQUE (clinic_id, report_date) のため distinct 不要
      count(dr.report_date)::bigint as report_days
    from effective_bounds eb
    left join public.daily_reports dr
      on dr.clinic_id = eb.clinic_id
     and eb.effective_start is not null
     and eb.effective_end is not null
     and eb.effective_start <= eb.effective_end
     and dr.report_date between eb.effective_start and eb.effective_end
    group by eb.clinic_id
  ),
  context_agg as (
    select
      eb.clinic_id,
      coalesce(sum(coalesce(ctx.total_revenue, 0)) filter (
        where ctx.revenue_context_code = 'product'
      ), 0)::numeric as product_revenue,
      coalesce(sum(coalesce(ctx.total_revenue, 0)) filter (
        where ctx.revenue_context_code = 'ticket'
      ), 0)::numeric as ticket_revenue,
      coalesce(sum(coalesce(ctx.total_revenue, 0)) filter (
        where ctx.revenue_context_code = 'traffic_accident'
      ), 0)::numeric as traffic_accident_revenue,
      coalesce(sum(coalesce(ctx.total_revenue, 0)) filter (
        where ctx.revenue_context_code = 'workers_comp'
      ), 0)::numeric as workers_comp_revenue
    from effective_bounds eb
    left join public.daily_report_revenue_context_summary ctx
      on ctx.clinic_id = eb.clinic_id
     and eb.effective_start is not null
     and eb.effective_end is not null
     and eb.effective_start <= eb.effective_end
     and ctx.report_date between eb.effective_start and eb.effective_end
    group by eb.clinic_id
  ),
  breakdown_agg as (
    select
      eb.clinic_id,
      coalesce(sum(coalesce(br.estimated_amount, 0)) filter (
        where br.amount_role = 'patient_copay_estimated'
      ), 0)::numeric as patient_copay_estimated,
      coalesce(sum(coalesce(br.estimated_amount, 0)) filter (
        where br.amount_role = 'insurer_receivable_estimated'
      ), 0)::numeric as insurer_receivable_estimated,
      coalesce(sum(coalesce(br.estimated_amount, 0)) filter (
        where br.amount_role = 'private_revenue_estimated'
      ), 0)::numeric as private_revenue_estimated
    from effective_bounds eb
    left join public.daily_report_revenue_breakdown_summary br
      on br.clinic_id = eb.clinic_id
     and eb.effective_start is not null
     and eb.effective_end is not null
     and eb.effective_start <= eb.effective_end
     and br.report_date between eb.effective_start and eb.effective_end
    group by eb.clinic_id
  ),
  estimate_agg as (
    select
      eb.clinic_id,
      coalesce(sum(coalesce(est.needs_review_count, 0)), 0)::bigint as needs_review_count,
      coalesce(sum(coalesce(est.blocked_count, 0)), 0)::bigint as blocked_count
    from effective_bounds eb
    left join public.daily_report_revenue_estimate_summary est
      on est.clinic_id = eb.clinic_id
     and eb.effective_start is not null
     and eb.effective_end is not null
     and eb.effective_start <= eb.effective_end
     and est.report_date between eb.effective_start and eb.effective_end
    group by eb.clinic_id
  ),
  expected_days as (
    select
      eb.clinic_id,
      case
        when eb.effective_start is null then 0
        when eb.effective_end is null then 0
        when eb.effective_start > eb.effective_end then 0
        else (eb.effective_end - eb.effective_start + 1)::bigint
      end as expected_day_count
    from effective_bounds eb
  )
  select
    rc.clinic_id,
    coalesce(da.operating_revenue, 0)::numeric,
    coalesce(da.insurance_revenue, 0)::numeric,
    coalesce(da.private_revenue, 0)::numeric,
    coalesce(ca.product_revenue, 0)::numeric,
    coalesce(ca.ticket_revenue, 0)::numeric,
    coalesce(ca.traffic_accident_revenue, 0)::numeric,
    coalesce(ca.workers_comp_revenue, 0)::numeric,
    coalesce(ba.patient_copay_estimated, 0)::numeric,
    coalesce(ba.insurer_receivable_estimated, 0)::numeric,
    coalesce(ba.private_revenue_estimated, 0)::numeric,
    coalesce(da.visit_count, 0)::bigint,
    coalesce(da.report_days, 0)::bigint,
    greatest(coalesce(ed.expected_day_count, 0) - coalesce(da.report_days, 0), 0)::bigint,
    coalesce(ea.needs_review_count, 0)::bigint,
    coalesce(ea.blocked_count, 0)::bigint,
    eb.first_report_date
  from requested_clinics rc
  left join effective_bounds eb on eb.clinic_id = rc.clinic_id
  left join expected_days ed on ed.clinic_id = rc.clinic_id
  left join daily_agg da on da.clinic_id = rc.clinic_id
  left join context_agg ca on ca.clinic_id = rc.clinic_id
  left join breakdown_agg ba on ba.clinic_id = rc.clinic_id
  left join estimate_agg ea on ea.clinic_id = rc.clinic_id
  order by rc.clinic_id;
$$;

create or replace function public.manager_revenue_period_series(
  p_clinic_ids uuid[],
  p_start date default null,
  p_end date default null,
  p_bucket text default 'monthly'
)
returns table (
  bucket_start date,
  bucket_end date,
  operating_revenue numeric,
  insurance_revenue numeric,
  private_revenue numeric,
  visit_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  -- バケット数は API のバケット規約（31日以下: daily / 180日以下: weekly / 以上: monthly）
  -- により高々40件程度。日報の走査は bucket 式での GROUP BY 1回に抑え、
  -- 欠損バケットは generate_series との等値結合で補完する。
  with today as (
    select (now() at time zone 'Asia/Tokyo')::date as business_date
  ),
  bounds as (
    -- p_start / p_end が null（period=all）のときだけ min/max を引く
    -- （coalesce の遅延評価によりスカラサブクエリは必要時のみ実行される）。
    select
      coalesce(
        p_start,
        (
          select min(dr.report_date)
          from public.daily_reports dr
          where dr.clinic_id = any (coalesce(p_clinic_ids, array[]::uuid[]))
            and dr.report_date <= t.business_date
            and (p_end is null or dr.report_date <= p_end)
        )
      ) as requested_start,
      least(
        coalesce(
          p_end,
          (
            select max(dr.report_date)
            from public.daily_reports dr
            where dr.clinic_id = any (coalesce(p_clinic_ids, array[]::uuid[]))
              and dr.report_date <= t.business_date
              and (p_start is null or dr.report_date >= p_start)
          ),
          t.business_date
        ),
        t.business_date
      ) as requested_end
    from today t
  ),
  aggregated as (
    select
      case p_bucket
        when 'daily' then dr.report_date
        when 'weekly' then date_trunc('week', dr.report_date::timestamp)::date
        else date_trunc('month', dr.report_date::timestamp)::date
      end as raw_start,
      coalesce(
        sum(
          coalesce(
            dr.total_revenue,
            coalesce(dr.insurance_revenue, 0) + coalesce(dr.private_revenue, 0),
            0
          )
        ),
        0
      )::numeric as operating_revenue,
      coalesce(sum(coalesce(dr.insurance_revenue, 0)), 0)::numeric as insurance_revenue,
      coalesce(sum(coalesce(dr.private_revenue, 0)), 0)::numeric as private_revenue,
      coalesce(sum(coalesce(dr.total_patients, 0)), 0)::bigint as visit_count
    from public.daily_reports dr
    cross join bounds b
    where p_bucket in ('daily', 'weekly', 'monthly')
      and dr.clinic_id = any (coalesce(p_clinic_ids, array[]::uuid[]))
      and b.requested_start is not null
      and dr.report_date between b.requested_start and b.requested_end
    group by 1
  ),
  buckets as (
    select
      generate_series(
        case p_bucket
          when 'daily' then b.requested_start
          when 'weekly' then date_trunc('week', b.requested_start::timestamp)::date
          else date_trunc('month', b.requested_start::timestamp)::date
        end::timestamp,
        b.requested_end::timestamp,
        case p_bucket
          when 'daily' then interval '1 day'
          when 'weekly' then interval '1 week'
          else interval '1 month'
        end
      )::date as raw_start,
      b.requested_start,
      b.requested_end
    from bounds b
    where b.requested_start is not null
      and b.requested_end is not null
      and b.requested_start <= b.requested_end
      and p_bucket in ('daily', 'weekly', 'monthly')
  )
  select
    greatest(b.raw_start, b.requested_start) as bucket_start,
    least(
      case p_bucket
        when 'daily' then b.raw_start
        when 'weekly' then b.raw_start + 6
        else (b.raw_start + interval '1 month' - interval '1 day')::date
      end,
      b.requested_end
    ) as bucket_end,
    coalesce(a.operating_revenue, 0)::numeric as operating_revenue,
    coalesce(a.insurance_revenue, 0)::numeric as insurance_revenue,
    coalesce(a.private_revenue, 0)::numeric as private_revenue,
    coalesce(a.visit_count, 0)::bigint as visit_count
  from buckets b
  left join aggregated a on a.raw_start = b.raw_start
  order by bucket_start;
$$;

create or replace function public.manager_revenue_context_breakdown(
  p_clinic_ids uuid[],
  p_start date default null,
  p_end date default null
)
returns table (
  revenue_context_code text,
  revenue_context_name text,
  total_revenue numeric,
  item_count bigint,
  needs_review_count bigint,
  blocked_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_clinics as (
    select distinct requested.requested_clinic_id as clinic_id
    from unnest(coalesce(p_clinic_ids, array[]::uuid[])) as requested(requested_clinic_id)
    where requested.requested_clinic_id is not null
  ),
  today as (
    select (now() at time zone 'Asia/Tokyo')::date as business_date
  ),
  filtered_context as (
    select ctx.*
    from public.daily_report_revenue_context_summary ctx
    join requested_clinics rc on rc.clinic_id = ctx.clinic_id
    cross join today t
    where ctx.report_date <= t.business_date
      and (p_start is null or ctx.report_date >= p_start)
      and (p_end is null or ctx.report_date <= least(p_end, t.business_date))
  )
  select
    coalesce(fc.revenue_context_code, 'other')::text,
    coalesce(fc.revenue_context_name, 'その他')::text,
    coalesce(sum(coalesce(fc.total_revenue, 0)), 0)::numeric,
    coalesce(sum(coalesce(fc.item_count, 0)), 0)::bigint,
    coalesce(sum(coalesce(fc.needs_review_count, 0)), 0)::bigint,
    coalesce(sum(coalesce(fc.blocked_count, 0)), 0)::bigint
  from filtered_context fc
  group by
    coalesce(fc.revenue_context_code, 'other'),
    coalesce(fc.revenue_context_name, 'その他')
  order by coalesce(sum(coalesce(fc.total_revenue, 0)), 0) desc;
$$;

revoke all on function public.manager_revenue_period_totals(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.manager_revenue_period_totals(uuid[], date, date)
  to service_role;

revoke all on function public.manager_revenue_period_series(uuid[], date, date, text)
  from public, anon, authenticated;
grant execute on function public.manager_revenue_period_series(uuid[], date, date, text)
  to service_role;

revoke all on function public.manager_revenue_context_breakdown(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.manager_revenue_context_breakdown(uuid[], date, date)
  to service_role;

commit;
