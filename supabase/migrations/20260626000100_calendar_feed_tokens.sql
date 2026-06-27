-- Spec: docs/stabilization/spec-clinic-daily-roster-help-assignment-ics-v0.1.md
-- PR5/PR6: one-way ICS feed token model

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  staff_profile_id uuid references public.staff_profiles(id) on delete cascade,
  feed_type text not null,
  token_hash text not null unique,
  label text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint calendar_feed_tokens_type_check
    check (feed_type in ('staff', 'clinic')),
  constraint calendar_feed_tokens_target_check
    check (
      (feed_type = 'staff' and staff_profile_id is not null and clinic_id is null)
      or
      (feed_type = 'clinic' and clinic_id is not null and staff_profile_id is null)
    )
);

create index if not exists calendar_feed_tokens_staff_active_idx
on public.calendar_feed_tokens (staff_profile_id, is_active)
where feed_type = 'staff';

create index if not exists calendar_feed_tokens_clinic_active_idx
on public.calendar_feed_tokens (clinic_id, is_active)
where feed_type = 'clinic';

create index if not exists calendar_feed_tokens_created_by_idx
on public.calendar_feed_tokens (created_by, created_at desc);

alter table public.calendar_feed_tokens enable row level security;

create policy "calendar_feed_tokens_select_scoped"
on public.calendar_feed_tokens
for select
using (
  app_private.get_current_role() = 'admin'
  or created_by = auth.uid()
  or (
    feed_type = 'clinic'
    and clinic_id is not null
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    feed_type = 'staff'
    and staff_profile_id is not null
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = calendar_feed_tokens.staff_profile_id
        and sp.user_id = auth.uid()
    )
  )
  or (
    feed_type = 'staff'
    and staff_profile_id is not null
    and exists (
      select 1
      from public.staff_clinic_memberships scm
      where scm.staff_profile_id = calendar_feed_tokens.staff_profile_id
        and app_private.can_access_clinic(scm.clinic_id)
    )
  )
);

create policy "calendar_feed_tokens_write_admin_only"
on public.calendar_feed_tokens
for all
using (app_private.get_current_role() = 'admin')
with check (app_private.get_current_role() = 'admin');

grant select, insert, update, delete on public.calendar_feed_tokens to authenticated;
grant all on public.calendar_feed_tokens to service_role;

do $$
begin
  if to_regclass('public.calendar_feed_tokens') is null then
    raise exception 'calendar_feed_tokens table was not created';
  end if;
end $$;
