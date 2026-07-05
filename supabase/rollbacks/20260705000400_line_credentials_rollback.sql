drop trigger if exists update_clinic_line_credentials_updated_at
on public.clinic_line_credentials;

drop table if exists public.clinic_line_credentials;

alter table public.clinic_feature_flags
  drop column if exists line_booking_enabled;
