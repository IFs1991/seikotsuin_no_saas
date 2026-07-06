-- Spec: docs/stabilization/spec-saas-review-findings-remediation-v0.1.md PR-03 / F-09
-- Staff calendar feed tokens must be bound to a single clinic.

alter table public.calendar_feed_tokens
  drop constraint if exists calendar_feed_tokens_target_check;

alter table public.calendar_feed_tokens
  add constraint calendar_feed_tokens_target_check
  check (
    (
      feed_type = 'staff'
      and staff_profile_id is not null
      and clinic_id is not null
    )
    or
    (
      feed_type = 'clinic'
      and clinic_id is not null
      and staff_profile_id is null
    )
  ) not valid;

create index if not exists calendar_feed_tokens_staff_clinic_active_idx
on public.calendar_feed_tokens (staff_profile_id, clinic_id, is_active)
where feed_type = 'staff';
