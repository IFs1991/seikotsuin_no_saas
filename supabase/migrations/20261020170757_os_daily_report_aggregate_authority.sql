-- Spec: docs/stabilization/spec-os-daily-report-aggregate-authority-v0.1.md (Issue #146)
-- Rollback: supabase/rollbacks/20261020170757_os_daily_report_aggregate_authority_rollback.sql
--   (blocked by design; forward-fix only, see spec §9)
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. Explicit, persisted aggregate authority boundary.
--    manual: legacy hand-entered totals. items: totals derived from detail rows.
alter table public.daily_reports
  add column aggregate_source text not null default 'manual';

alter table public.daily_reports
  add constraint daily_reports_aggregate_source_check
  check (aggregate_source in ('manual', 'items'));

comment on column public.daily_reports.aggregate_source is
  'OS-F2: manual = hand-entered totals; items = totals derived from daily_report_items. Only manual -> items is allowed.';

-- 2. One-time classification. Reports that own detail rows are itemized.
--    Totals are not recalculated here (no bulk data repair); this runs before
--    the guard trigger exists.
update public.daily_reports report
set aggregate_source = 'items'
where exists (
  select 1
  from public.daily_report_items item
  where item.daily_report_id = report.id
);

-- 3. Guards for every write path (API RPC, PostgREST, service role, triggers).
--    BEFORE ROW triggers run before RLS WITH CHECK, so this SECURITY DEFINER
--    guard never reads rows the caller has not already been admitted to:
--    INSERT reads nothing, UPDATE only reads detail rows of OLD (which passed
--    the UPDATE USING policy) and the report id cannot change.
create function app_private.enforce_daily_report_aggregate_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_patients integer;
  v_total_revenue numeric(10,2);
  v_insurance_revenue numeric(10,2);
  v_private_revenue numeric(10,2);
begin
  if tg_op = 'INSERT' then
    -- A new report cannot own detail rows yet (non-deferrable composite FK),
    -- so it always starts manual; attaching a detail row itemizes it.
    if new.aggregate_source is distinct from 'manual' then
      raise exception 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'DAILY_REPORT_ID_IMMUTABLE' using errcode = '23514';
  end if;

  if old.aggregate_source = 'items'
     and new.aggregate_source is distinct from 'items' then
    raise exception 'DAILY_REPORT_AGGREGATE_SOURCE_IMMUTABLE' using errcode = '23514';
  end if;

  if new.aggregate_source = 'items' then
    -- Runs after the row lock is held, with a fresh READ COMMITTED snapshot.
    select
      count(*)::integer,
      coalesce(sum(item.fee), 0)::numeric(10,2),
      coalesce(sum(item.fee) filter (where item.billing_type = 'insurance'), 0)::numeric(10,2),
      coalesce(sum(item.fee) filter (where item.billing_type = 'private'), 0)::numeric(10,2)
    into
      v_total_patients,
      v_total_revenue,
      v_insurance_revenue,
      v_private_revenue
    from public.daily_report_items item
    where item.daily_report_id = old.id;

    -- manual -> items only when a detail row is attached, never by a client
    -- write that would discard hand-entered totals.
    if old.aggregate_source = 'manual' and v_total_patients = 0 then
      raise exception 'DAILY_REPORT_AGGREGATE_SOURCE_REQUIRES_ITEMS' using errcode = '23514';
    end if;

    new.total_patients := v_total_patients;
    new.total_revenue := v_total_revenue;
    new.insurance_revenue := v_insurance_revenue;
    new.private_revenue := v_private_revenue;

    -- Item writes may leave new_patients above the derived total (spec §5.1);
    -- only a write that sets new_patients is validated here.
    if new.new_patients is distinct from old.new_patients
       and coalesce(new.new_patients, 0) > v_total_patients then
      raise exception 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL'
        using errcode = '23514', detail = v_total_patients::text;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_daily_report_aggregate_authority()
  from public, anon, authenticated, service_role;

comment on function app_private.enforce_daily_report_aggregate_authority() is
  'OS-F2: derives itemized daily report totals and keeps aggregate_source client-unwritable and one-way. Reads only rows already admitted by RLS.';

create trigger daily_reports_aggregate_authority
before insert or update on public.daily_reports
for each row execute function app_private.enforce_daily_report_aggregate_authority();

-- AFTER ROW: runs only once RLS WITH CHECK has admitted the row, so the
-- staff lookup cannot be used as a cross-clinic membership oracle.
create function app_private.enforce_daily_report_staff_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.staff_id is null
     or (
       tg_op = 'UPDATE'
       and new.staff_id is not distinct from old.staff_id
       and new.clinic_id is not distinct from old.clinic_id
     ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.staff staff_member
    where staff_member.id = new.staff_id
      and staff_member.clinic_id = new.clinic_id
  ) then
    raise exception 'DAILY_REPORT_STAFF_CLINIC_MISMATCH' using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke all on function app_private.enforce_daily_report_staff_clinic()
  from public, anon, authenticated, service_role;

comment on function app_private.enforce_daily_report_staff_clinic() is
  'OS-F2: rejects a daily report staff_id from another clinic on every write path, after RLS admitted the row.';

create trigger daily_reports_staff_clinic_check
after insert or update of staff_id, clinic_id on public.daily_reports
for each row execute function app_private.enforce_daily_report_staff_clinic();

-- 4. Detail-row writes mark the parent itemized; the guard derives the totals.
create or replace function public.recalculate_daily_report_totals(p_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_daily_report_id is null then
    return;
  end if;

  -- Itemize only when a detail row exists (the guard rejects manual -> items
  -- otherwise); an itemized report with no rows is re-derived to zero.
  update public.daily_reports report
  set
    aggregate_source = case
      when report.aggregate_source = 'items'
        or exists (
          select 1
          from public.daily_report_items item
          where item.daily_report_id = report.id
        )
      then 'items'
      else report.aggregate_source
    end,
    updated_at = now()
  where report.id = p_daily_report_id;
end;
$$;

revoke all on function public.recalculate_daily_report_totals(uuid)
  from public, anon, authenticated;
grant execute on function public.recalculate_daily_report_totals(uuid)
  to service_role;

comment on function public.recalculate_daily_report_totals(uuid) is
  'OS-F2: marks a report that owns detail rows itemized; daily_reports_aggregate_authority derives the totals under the row lock.';

-- 5. Atomic body save used by the PC and mobile APIs. The mobile form edits
-- hand-entered totals only and sets p_require_manual: an item-derived report
-- is then refused under the row lock before any column is written.
create function public.save_daily_report(
  p_clinic_id uuid,
  p_report_date date,
  p_total_patients integer,
  p_new_patients integer,
  p_total_revenue numeric,
  p_insurance_revenue numeric,
  p_private_revenue numeric,
  p_report_id uuid default null,
  p_staff_id uuid default null,
  p_report_text text default null,
  p_require_manual boolean default false
)
returns public.daily_reports
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_report public.daily_reports;
  v_attempt integer := 0;
begin
  if p_clinic_id is null or p_report_date is null
     or p_total_patients is null or p_new_patients is null
     or p_total_revenue is null or p_insurance_revenue is null
     or p_private_revenue is null or p_require_manual is null
     or p_total_patients < 0 or p_new_patients < 0
     or p_total_revenue < 0 or p_insurance_revenue < 0 or p_private_revenue < 0 then
    raise exception 'DAILY_REPORT_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  if p_staff_id is not null and not exists (
    select 1
    from public.staff staff_member
    where staff_member.id = p_staff_id
      and staff_member.clinic_id = p_clinic_id
  ) then
    raise exception 'DAILY_REPORT_STAFF_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  if p_report_id is not null then
    select report.* into v_report
    from public.daily_reports report
    where report.id = p_report_id
      and report.clinic_id = p_clinic_id
      and report.report_date = p_report_date
    for update;

    if not found then
      raise exception 'DAILY_REPORT_NOT_ACCESSIBLE' using errcode = '42501';
    end if;
  else
    loop
      v_attempt := v_attempt + 1;

      select report.* into v_report
      from public.daily_reports report
      where report.clinic_id = p_clinic_id
        and report.report_date = p_report_date
      for update;

      exit when found;

      if v_attempt > 3 then
        raise exception 'DAILY_REPORT_SAVE_RETRY_EXHAUSTED' using errcode = '40001';
      end if;

      -- First report of the day: no detail row can exist yet, so it is manual.
      if p_new_patients > p_total_patients then
        raise exception 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL' using errcode = '23514';
      end if;
      if p_insurance_revenue + p_private_revenue > p_total_revenue then
        raise exception 'DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL' using errcode = '23514';
      end if;

      insert into public.daily_reports (
        clinic_id,
        report_date,
        staff_id,
        total_patients,
        new_patients,
        total_revenue,
        insurance_revenue,
        private_revenue,
        report_text,
        aggregate_source
      )
      values (
        p_clinic_id,
        p_report_date,
        p_staff_id,
        p_total_patients,
        p_new_patients,
        p_total_revenue,
        p_insurance_revenue,
        p_private_revenue,
        p_report_text,
        'manual'
      )
      on conflict (clinic_id, report_date) do nothing
      returning * into v_report;

      if found then
        return v_report;
      end if;
      -- A concurrent writer created the report: lock it and re-decide.
    end loop;
  end if;

  if p_require_manual and v_report.aggregate_source = 'items' then
    raise exception 'DAILY_REPORT_ITEMIZED' using errcode = '55000';
  end if;

  if v_report.aggregate_source = 'items' then
    update public.daily_reports report
    set
      staff_id = p_staff_id,
      new_patients = p_new_patients,
      report_text = p_report_text,
      updated_at = now()
    where report.id = v_report.id
    returning report.* into v_report;

    if v_report.new_patients > v_report.total_patients then
      raise exception 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL'
        using errcode = '23514', detail = v_report.total_patients::text;
    end if;

    return v_report;
  end if;

  if p_new_patients > p_total_patients then
    raise exception 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL' using errcode = '23514';
  end if;
  if p_insurance_revenue + p_private_revenue > p_total_revenue then
    raise exception 'DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL' using errcode = '23514';
  end if;

  update public.daily_reports report
  set
    staff_id = p_staff_id,
    total_patients = p_total_patients,
    new_patients = p_new_patients,
    total_revenue = p_total_revenue,
    insurance_revenue = p_insurance_revenue,
    private_revenue = p_private_revenue,
    report_text = p_report_text,
    updated_at = now()
  where report.id = v_report.id
  returning report.* into v_report;

  return v_report;
end;
$$;

revoke all on function public.save_daily_report(
  uuid, date, integer, integer, numeric, numeric, numeric, uuid, uuid, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.save_daily_report(
  uuid, date, integer, integer, numeric, numeric, numeric, uuid, uuid, text, boolean
) to authenticated;

comment on function public.save_daily_report(
  uuid, date, integer, integer, numeric, numeric, numeric, uuid, uuid, text, boolean
) is
  'OS-F2: atomic daily report body save. RLS applies (SECURITY INVOKER). Itemized reports ignore request totals and validate new_patients against the derived total under the row lock; with p_require_manual they are refused (DAILY_REPORT_ITEMIZED) without any write.';

commit;
