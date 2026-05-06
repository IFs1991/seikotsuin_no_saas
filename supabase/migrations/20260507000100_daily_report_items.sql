-- Daily report item rows, payment method linkage, and arrived reservation import.
-- Rollback: docs/stabilization/rollbacks/20260507000100_daily_report_items_rollback.sql

create table if not exists public.daily_report_items (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  daily_report_id uuid not null,
  report_date date not null,
  reservation_id uuid,
  customer_id uuid,
  menu_id uuid,
  staff_resource_id uuid,
  patient_name varchar(255) not null,
  treatment_name varchar(255) not null,
  duration_minutes integer default 0 not null,
  fee numeric(10,2) default 0 not null,
  billing_type varchar(20) default 'private' not null,
  payment_method_id uuid,
  next_reservation_start_time timestamp with time zone,
  next_reservation_end_time timestamp with time zone,
  next_reservation_id uuid,
  source varchar(20) default 'manual' not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  updated_by uuid,
  constraint daily_report_items_pkey primary key (id),
  constraint daily_report_items_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint daily_report_items_daily_report_id_fkey foreign key (daily_report_id) references public.daily_reports(id) on delete cascade,
  constraint daily_report_items_reservation_id_fkey foreign key (reservation_id) references public.reservations(id) on delete set null,
  constraint daily_report_items_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null,
  constraint daily_report_items_menu_id_fkey foreign key (menu_id) references public.menus(id) on delete set null,
  constraint daily_report_items_staff_resource_id_fkey foreign key (staff_resource_id) references public.resources(id) on delete set null,
  constraint daily_report_items_payment_method_id_fkey foreign key (payment_method_id) references public.master_payment_methods(id) on delete set null,
  constraint daily_report_items_next_reservation_id_fkey foreign key (next_reservation_id) references public.reservations(id) on delete set null,
  constraint daily_report_items_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  constraint daily_report_items_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null,
  constraint daily_report_items_duration_non_negative check (duration_minutes >= 0),
  constraint daily_report_items_fee_non_negative check (fee >= 0),
  constraint daily_report_items_billing_type_check check (billing_type in ('insurance', 'private')),
  constraint daily_report_items_source_check check (source in ('reservation', 'manual')),
  constraint daily_report_items_next_reservation_window_check check (
    (
      next_reservation_start_time is null
      and next_reservation_end_time is null
    )
    or (
      next_reservation_start_time is not null
      and next_reservation_end_time is not null
      and next_reservation_end_time > next_reservation_start_time
    )
  )
);

create unique index if not exists daily_report_items_clinic_reservation_unique
  on public.daily_report_items (clinic_id, reservation_id)
  where reservation_id is not null;

create index if not exists idx_daily_report_items_clinic_date_created_at
  on public.daily_report_items (clinic_id, report_date, created_at);

create index if not exists idx_daily_report_items_daily_report_id
  on public.daily_report_items (daily_report_id);

create index if not exists idx_daily_report_items_payment_method_id
  on public.daily_report_items (payment_method_id);

create index if not exists idx_daily_report_items_next_reservation_id
  on public.daily_report_items (next_reservation_id);

create index if not exists idx_reservations_clinic_staff_time_active
  on public.reservations (clinic_id, staff_id, start_time, end_time)
  where is_deleted = false
    and status not in ('cancelled', 'no_show');

create or replace function public.validate_daily_report_items_clinic_refs()
returns trigger
language plpgsql
as $$
declare
  v_report_clinic_id uuid;
  v_report_date date;
  v_ref_clinic_id uuid;
begin
  if new.clinic_id is null then
    raise exception 'daily_report_items.clinic_id is required' using errcode = '23514';
  end if;

  select clinic_id, report_date
  into v_report_clinic_id, v_report_date
  from public.daily_reports
  where id = new.daily_report_id;

  if not found then
    raise exception 'daily_reports.id not found' using errcode = '23503';
  end if;

  if v_report_clinic_id is null or v_report_clinic_id <> new.clinic_id then
    raise exception 'daily_report_items.daily_report_id clinic mismatch' using errcode = '23514';
  end if;

  if v_report_date <> new.report_date then
    raise exception 'daily_report_items.report_date daily_report mismatch' using errcode = '23514';
  end if;

  if new.reservation_id is not null then
    select clinic_id into v_ref_clinic_id from public.reservations where id = new.reservation_id;
    if not found then
      raise exception 'reservations.id not found' using errcode = '23503';
    end if;
    if v_ref_clinic_id is null or v_ref_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.reservation_id clinic mismatch' using errcode = '23514';
    end if;
  end if;

  if new.next_reservation_id is not null then
    select clinic_id into v_ref_clinic_id from public.reservations where id = new.next_reservation_id;
    if not found then
      raise exception 'next reservations.id not found' using errcode = '23503';
    end if;
    if v_ref_clinic_id is null or v_ref_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.next_reservation_id clinic mismatch' using errcode = '23514';
    end if;
  end if;

  if new.customer_id is not null then
    select clinic_id into v_ref_clinic_id from public.customers where id = new.customer_id;
    if not found then
      raise exception 'customers.id not found' using errcode = '23503';
    end if;
    if v_ref_clinic_id is null or v_ref_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.customer_id clinic mismatch' using errcode = '23514';
    end if;
  end if;

  if new.menu_id is not null then
    select clinic_id into v_ref_clinic_id from public.menus where id = new.menu_id;
    if not found then
      raise exception 'menus.id not found' using errcode = '23503';
    end if;
    if v_ref_clinic_id is not null and v_ref_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.menu_id clinic mismatch' using errcode = '23514';
    end if;
  end if;

  if new.staff_resource_id is not null then
    select clinic_id into v_ref_clinic_id from public.resources where id = new.staff_resource_id;
    if not found then
      raise exception 'resources.id not found' using errcode = '23503';
    end if;
    if v_ref_clinic_id is null or v_ref_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.staff_resource_id clinic mismatch' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_daily_report_totals(p_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_patients integer;
  v_total_revenue numeric(10,2);
  v_insurance_revenue numeric(10,2);
  v_private_revenue numeric(10,2);
begin
  if p_daily_report_id is null then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(fee), 0)::numeric(10,2),
    coalesce(sum(fee) filter (where billing_type = 'insurance'), 0)::numeric(10,2),
    coalesce(sum(fee) filter (where billing_type = 'private'), 0)::numeric(10,2)
  into
    v_total_patients,
    v_total_revenue,
    v_insurance_revenue,
    v_private_revenue
  from public.daily_report_items
  where daily_report_id = p_daily_report_id;

  update public.daily_reports
  set
    total_patients = v_total_patients,
    total_revenue = v_total_revenue,
    insurance_revenue = v_insurance_revenue,
    private_revenue = v_private_revenue,
    updated_at = now()
  where id = p_daily_report_id;
end;
$$;

create or replace function public.sync_daily_report_item_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_daily_report_totals(old.daily_report_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.daily_report_id is distinct from new.daily_report_id then
    perform public.recalculate_daily_report_totals(old.daily_report_id);
  end if;

  perform public.recalculate_daily_report_totals(new.daily_report_id);
  return new;
end;
$$;

create or replace function public.sync_arrived_reservation_daily_report_item()
returns trigger
language plpgsql
security definer
set search_path = public
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

create trigger daily_report_items_clinic_ref_check
before insert or update on public.daily_report_items
for each row execute function public.validate_daily_report_items_clinic_refs();

create trigger update_daily_report_items_updated_at
before update on public.daily_report_items
for each row execute function public.update_updated_at_column();

create trigger daily_report_items_recalculate_totals
after insert or update or delete on public.daily_report_items
for each row execute function public.sync_daily_report_item_totals();

create trigger sync_daily_report_item_from_arrived_reservation
after insert or update of status, start_time, end_time, customer_id, menu_id, staff_id, actual_price, price, selected_options, notes, is_deleted
on public.reservations
for each row execute function public.sync_arrived_reservation_daily_report_item();

alter table public.daily_report_items enable row level security;

create policy "daily_report_items_select_for_staff"
on public.daily_report_items
for select
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])
  and public.can_access_clinic(clinic_id)
);

create policy "daily_report_items_insert_for_staff"
on public.daily_report_items
for insert
with check (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])
  and public.can_access_clinic(clinic_id)
);

create policy "daily_report_items_update_for_staff"
on public.daily_report_items
for update
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])
  and public.can_access_clinic(clinic_id)
)
with check (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text, 'therapist'::text, 'staff'::text])
  and public.can_access_clinic(clinic_id)
);

create policy "daily_report_items_delete_for_managers"
on public.daily_report_items
for delete
using (
  public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text, 'manager'::text])
  and public.can_access_clinic(clinic_id)
);

grant all on table public.daily_report_items to anon;
grant all on table public.daily_report_items to authenticated;
grant all on table public.daily_report_items to service_role;

comment on table public.daily_report_items is 'Per-patient daily report detail rows. Aggregates are maintained in daily_reports.';
comment on column public.daily_report_items.payment_method_id is 'Selected payment method from master_payment_methods.';
comment on column public.daily_report_items.next_reservation_id is 'Reservation created from the next visit datetime in the daily report item.';
