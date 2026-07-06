-- Rollback for 20260707000100_calendar_feed_tokens_staff_clinic_scope.sql

drop index if exists public.calendar_feed_tokens_staff_clinic_active_idx;

alter table public.calendar_feed_tokens
  drop constraint if exists calendar_feed_tokens_target_check;

alter table public.calendar_feed_tokens
  add constraint calendar_feed_tokens_target_check
  check (
    (
      feed_type = 'staff'
      and staff_profile_id is not null
      and clinic_id is null
    )
    or
    (
      feed_type = 'clinic'
      and clinic_id is not null
      and staff_profile_id is null
    )
  ) not valid;
