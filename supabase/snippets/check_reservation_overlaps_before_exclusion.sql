select
  r1.clinic_id,
  r1.staff_id,
  r1.id as reservation_id,
  r1.start_time as reservation_start_time,
  r1.end_time as reservation_end_time,
  r1.status as reservation_status,
  r2.id as conflicting_reservation_id,
  r2.start_time as conflicting_start_time,
  r2.end_time as conflicting_end_time,
  r2.status as conflicting_status
from public.reservations r1
join public.reservations r2
  on r1.id < r2.id
 and r1.clinic_id = r2.clinic_id
 and r1.staff_id = r2.staff_id
 and r1.is_deleted = false
 and r2.is_deleted = false
 and r1.status not in ('cancelled', 'no_show')
 and r2.status not in ('cancelled', 'no_show')
 and tstzrange(r1.start_time, r1.end_time, '[)') &&
     tstzrange(r2.start_time, r2.end_time, '[)')
order by r1.clinic_id, r1.staff_id, r1.start_time, r2.start_time;
