-- Spec: docs/stabilization/spec-liff-booking-workflow-v0.3.md
-- PR 1: active reservations must not overlap for the same clinic and staff.

create extension if not exists "btree_gist";

do $$
declare
  overlap_count integer;
begin
  select count(*)
  into overlap_count
  from (
    select r1.id
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
  ) overlap_rows;

  if overlap_count > 0 then
    raise exception
      'Cannot add reservations_no_overlap: % active overlapping reservation pairs exist. Run supabase/snippets/check_reservation_overlaps_before_exclusion.sql and resolve them first.',
      overlap_count
      using errcode = '23514';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_no_overlap'
  ) then
    alter table public.reservations
      add constraint reservations_no_overlap
      exclude using gist (
        clinic_id with =,
        staff_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      )
      where (
        status not in ('cancelled', 'no_show')
        and is_deleted = false
      );
  end if;
end $$;
