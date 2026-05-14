-- Reverts supabase/migrations/20260514000100_revenue_context_phase1.sql.
-- Destructive: drops revenue context columns and tag data from daily_report_items.

drop view if exists public.daily_report_revenue_context_summary;

drop trigger if exists update_daily_report_item_tags_updated_at
on public.daily_report_item_tags;

drop trigger if exists daily_report_item_tags_ref_check
on public.daily_report_item_tags;

drop function if exists public.validate_daily_report_item_tags_refs();

drop table if exists public.daily_report_item_tags;
drop table if exists public.daily_report_item_tag_definitions;

drop index if exists public.idx_daily_report_items_estimate_status;
drop index if exists public.idx_daily_report_items_staff_context_date;
drop index if exists public.idx_daily_report_items_revenue_context;

alter table if exists public.daily_report_items
  drop constraint if exists daily_report_items_estimate_status_check,
  drop constraint if exists daily_report_items_amount_source_check,
  drop constraint if exists daily_report_items_revenue_context_source_check,
  drop constraint if exists daily_report_items_revenue_context_code_fkey;

alter table if exists public.daily_report_items
  drop column if exists estimate_status,
  drop column if exists amount_source,
  drop column if exists revenue_context_source,
  drop column if exists revenue_context_code;

drop table if exists public.revenue_contexts;

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
      and source = 'reservation';
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
    raise exception 'daily_report_items arrived reservation references not found' using errcode = '23503';
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
    fee = excluded.fee,
    billing_type = excluded.billing_type,
    notes = excluded.notes,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return new;
end;
$$;
