-- Rollback: CRM Data Foundation & LINE Growth Features v0.1
-- Functions must be removed before their feature tables.

begin;

drop function if exists public.finalize_staff_availability_delivery(
  uuid, uuid, uuid, text, timestamptz, text
);
drop function if exists public.create_staff_availability_reservation(
  uuid, uuid, uuid, text, uuid, uuid, timestamptz, timestamptz,
  text, text, boolean, jsonb, uuid
);
drop function if exists public.create_staff_availability_event(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
);

drop table if exists public.reservation_rewards;
drop table if exists public.staff_availability_notifications;
drop table if exists public.staff_availability_events;
drop table if exists public.patient_staff_preferences;
drop table if exists public.patient_identity_aliases;

alter table public.line_message_outbox
  drop constraint if exists line_message_outbox_id_clinic_unique;

-- These composite uniqueness constraints are required by the feature tables.
-- Keep them as tenant-integrity constraints after rollback; removing them
-- would weaken existing commercial hardening guarantees.

commit;
