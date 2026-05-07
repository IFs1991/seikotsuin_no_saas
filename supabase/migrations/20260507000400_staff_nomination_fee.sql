-- Staff nomination fee support for reservations.
-- Adds per-resource fee settings and reservation-time snapshots without
-- changing RLS policies or clinic-scoped access.

alter table public.resources
  add column if not exists nomination_fee numeric(10,2) not null default 0;

alter table public.reservations
  add column if not exists is_staff_requested boolean not null default false,
  add column if not exists staff_nomination_fee numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.resources'::regclass
      and conname = 'resources_nomination_fee_non_negative'
  ) then
    alter table public.resources
      add constraint resources_nomination_fee_non_negative
      check (nomination_fee >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_staff_nomination_fee_non_negative'
  ) then
    alter table public.reservations
      add constraint reservations_staff_nomination_fee_non_negative
      check (staff_nomination_fee >= 0);
  end if;
end $$;

comment on column public.resources.nomination_fee is
  'Staff-specific nomination fee used when a patient requests this staff resource.';

comment on column public.reservations.is_staff_requested is
  'True when the reservation was created or updated as a patient-requested staff nomination.';

comment on column public.reservations.staff_nomination_fee is
  'Reservation-time snapshot of the staff nomination fee. Kept independent from later resource fee changes.';

create or replace view public.reservation_list_view as
select
  r.id,
  r.clinic_id,
  r.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  r.menu_id,
  m.name as menu_name,
  m.duration_minutes,
  m.price as menu_price,
  r.staff_id,
  res.name as staff_name,
  res.type as resource_type,
  r.start_time,
  r.end_time,
  r.status,
  r.channel,
  r.notes,
  r.price,
  r.actual_price,
  r.payment_status,
  r.reservation_group_id,
  r.created_at,
  r.updated_at,
  r.created_by,
  r.selected_options,
  r.is_staff_requested,
  r.staff_nomination_fee
from public.reservations r
join public.customers c on r.customer_id = c.id
join public.menus m on r.menu_id = m.id
join public.resources res on r.staff_id = res.id
where
  r.is_deleted = false
  and c.is_deleted = false
  and m.is_deleted = false
  and res.is_deleted = false;
