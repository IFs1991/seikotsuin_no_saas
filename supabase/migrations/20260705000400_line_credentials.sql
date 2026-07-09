-- Spec: docs/stabilization/spec-liff-booking-workflow-v0.3.md
-- Phase D / PR6: clinic-scoped LINE credentials and rollout flag.

create table if not exists public.clinic_line_credentials (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  liff_id text,
  login_channel_id text,
  messaging_channel_id text not null,
  channel_secret_encrypted text not null,
  assertion_private_key_encrypted text not null,
  assertion_kid text not null,
  access_token_encrypted text,
  token_expires_at timestamptz,
  oa_basic_id text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint clinic_line_credentials_messaging_channel_id_not_blank
    check (length(btrim(messaging_channel_id)) > 0),
  constraint clinic_line_credentials_assertion_kid_not_blank
    check (length(btrim(assertion_kid)) > 0),
  constraint clinic_line_credentials_channel_secret_not_blank
    check (length(btrim(channel_secret_encrypted)) > 0),
  constraint clinic_line_credentials_assertion_private_key_not_blank
    check (length(btrim(assertion_private_key_encrypted)) > 0)
);

comment on table public.clinic_line_credentials is
  'Encrypted clinic-scoped LINE official account, LIFF, and Messaging API credentials. Access is service-role only.';
comment on column public.clinic_line_credentials.liff_id is
  'Public LIFF app ID. Returned only after rollout gates are satisfied in later PRs.';
comment on column public.clinic_line_credentials.login_channel_id is
  'LINE Login channel ID used as the audience when verifying ID tokens.';
comment on column public.clinic_line_credentials.messaging_channel_id is
  'LINE Messaging API channel ID used for channel access token v2.1 assertions.';
comment on column public.clinic_line_credentials.channel_secret_encrypted is
  'AES-256-GCM encrypted LINE channel secret.';
comment on column public.clinic_line_credentials.assertion_private_key_encrypted is
  'AES-256-GCM encrypted assertion signing private JWK.';
comment on column public.clinic_line_credentials.access_token_encrypted is
  'AES-256-GCM encrypted cached channel access token v2.1.';

drop trigger if exists update_clinic_line_credentials_updated_at
on public.clinic_line_credentials;

create trigger update_clinic_line_credentials_updated_at
before update on public.clinic_line_credentials
for each row execute function public.update_updated_at_column();

alter table public.clinic_line_credentials enable row level security;

-- RLS deny: no policies are intentionally created for anon/authenticated roles.
revoke all on table public.clinic_line_credentials from anon;
revoke all on table public.clinic_line_credentials from authenticated;
grant all on table public.clinic_line_credentials to service_role;

alter table public.clinic_feature_flags
  add column if not exists line_booking_enabled boolean not null default false;

comment on column public.clinic_feature_flags.line_booking_enabled is
  'Clinic-scoped LIFF/LINE booking entitlement. Still gated by NEXT_PUBLIC_ENABLE_LIFF_BOOKING and active LINE credentials.';

do $$
begin
  if to_regclass('public.clinic_line_credentials') is null then
    raise exception 'clinic_line_credentials table was not created';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinic_feature_flags'
      and column_name = 'line_booking_enabled'
  ) then
    raise exception 'clinic_feature_flags.line_booking_enabled was not created';
  end if;
end $$;
