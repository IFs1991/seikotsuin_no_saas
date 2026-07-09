-- Spec: spec-mobile-uiux-production-shell-write-rollout-v0.9.md
-- PR-G: DB entitlement design / migration

create table if not exists public.clinic_feature_flags (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  mobile_uiux_enabled boolean not null default false,
  mobile_uiux_real_data_enabled boolean not null default false,
  mobile_uiux_write_enabled boolean not null default false,
  mobile_uiux_reservation_write_enabled boolean not null default false,
  mobile_uiux_daily_report_write_enabled boolean not null default false,
  mobile_uiux_settings_write_enabled boolean not null default false,
  rollout_phase text not null default 'off',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.clinic_feature_flags is
  'Clinic-scoped feature entitlements for Mobile UIUX rollout. Does not store patient/customer PII or free-text notes.';

comment on column public.clinic_feature_flags.rollout_phase is
  'Operational rollout phase label for Mobile UIUX entitlement.';

drop trigger if exists update_clinic_feature_flags_updated_at
on public.clinic_feature_flags;

create trigger update_clinic_feature_flags_updated_at
before update on public.clinic_feature_flags
for each row execute function public.update_updated_at_column();

alter table public.clinic_feature_flags enable row level security;

drop policy if exists "clinic_feature_flags_select_scoped"
on public.clinic_feature_flags;
create policy "clinic_feature_flags_select_scoped"
on public.clinic_feature_flags
for select
using (
  app_private.get_current_role() = 'admin'
  or app_private.can_access_clinic(clinic_id)
);

drop policy if exists "clinic_feature_flags_write_admin_only"
on public.clinic_feature_flags;
create policy "clinic_feature_flags_write_admin_only"
on public.clinic_feature_flags
for all
using (app_private.get_current_role() = 'admin')
with check (app_private.get_current_role() = 'admin');

grant select, insert, update, delete on public.clinic_feature_flags to authenticated;
grant all on public.clinic_feature_flags to service_role;

do $$
begin
  if to_regclass('public.clinic_feature_flags') is null then
    raise exception 'clinic_feature_flags table was not created';
  end if;
end $$;
