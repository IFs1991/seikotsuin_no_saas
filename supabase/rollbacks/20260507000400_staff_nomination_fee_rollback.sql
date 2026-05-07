-- Rollback staff nomination fee support.

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
  r.selected_options
from public.reservations r
join public.customers c on r.customer_id = c.id
join public.menus m on r.menu_id = m.id
join public.resources res on r.staff_id = res.id
where
  r.is_deleted = false
  and c.is_deleted = false
  and m.is_deleted = false
  and res.is_deleted = false;

alter table public.reservations
  drop constraint if exists reservations_staff_nomination_fee_non_negative;

alter table public.resources
  drop constraint if exists resources_nomination_fee_non_negative;

alter table public.reservations
  drop column if exists staff_nomination_fee,
  drop column if exists is_staff_requested;

alter table public.resources
  drop column if exists nomination_fee;
