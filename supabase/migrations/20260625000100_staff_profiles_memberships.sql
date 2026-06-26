-- Spec: docs/stabilization/spec-clinic-daily-roster-help-assignment-ics-v0.1.md
-- PR3: staff_profiles / staff_clinic_memberships data model

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  membership_type text not null default 'home',
  can_help boolean not null default false,
  priority integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, clinic_id),
  constraint staff_clinic_memberships_type_check
    check (membership_type in ('home', 'regular', 'help', 'blocked')),
  constraint staff_clinic_memberships_priority_check
    check (priority between 1 and 5)
);

create unique index if not exists staff_clinic_memberships_resource_unique
on public.staff_clinic_memberships (resource_id)
where resource_id is not null;

create index if not exists staff_profiles_user_id_idx
on public.staff_profiles (user_id)
where user_id is not null;

create index if not exists staff_clinic_memberships_clinic_idx
on public.staff_clinic_memberships (clinic_id, membership_type, can_help);

create index if not exists staff_clinic_memberships_staff_profile_idx
on public.staff_clinic_memberships (staff_profile_id, clinic_id);

alter table public.staff_shifts
  add column if not exists staff_profile_id uuid references public.staff_profiles(id),
  add column if not exists home_clinic_id uuid references public.clinics(id),
  add column if not exists assignment_type text not null default 'regular',
  add column if not exists time_preset text,
  add column if not exists source_shift_request_id uuid references public.shift_requests(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_shifts_assignment_type_check'
      and conrelid = 'public.staff_shifts'::regclass
  ) then
    alter table public.staff_shifts
      add constraint staff_shifts_assignment_type_check
      check (assignment_type in ('regular', 'help'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_shifts_time_preset_check'
      and conrelid = 'public.staff_shifts'::regclass
  ) then
    alter table public.staff_shifts
      add constraint staff_shifts_time_preset_check
      check (
        time_preset is null
        or time_preset in ('full_day', 'morning', 'afternoon', 'late', 'custom')
      );
  end if;
end $$;

do $$
declare
  v_resource record;
  v_profile_id uuid;
  v_user_id uuid;
begin
  for v_resource in
    select r.id, r.name, r.clinic_id
    from public.resources r
    where r.type = 'staff'
      and coalesce(r.is_deleted, false) = false
      and not exists (
        select 1
        from public.staff_clinic_memberships scm
        where scm.resource_id = r.id
      )
  loop
    select u.id
    into v_user_id
    from auth.users u
    where u.id = v_resource.id
    limit 1;

    insert into public.staff_profiles (user_id, display_name, is_active)
    values (v_user_id, v_resource.name, true)
    returning id into v_profile_id;

    insert into public.staff_clinic_memberships (
      staff_profile_id,
      clinic_id,
      resource_id,
      membership_type,
      can_help,
      priority
    )
    values (
      v_profile_id,
      v_resource.clinic_id,
      v_resource.id,
      'home',
      false,
      3
    );
  end loop;
end $$;

update public.staff_shifts ss
set
  staff_profile_id = scm.staff_profile_id,
  home_clinic_id = coalesce(ss.home_clinic_id, scm.clinic_id),
  assignment_type = case
    when coalesce(ss.home_clinic_id, scm.clinic_id) = ss.clinic_id then 'regular'
    else 'help'
  end,
  source_shift_request_id = coalesce(ss.source_shift_request_id, sr.id)
from public.staff_clinic_memberships scm
left join public.shift_requests sr
  on sr.converted_shift_id = ss.id
where ss.staff_id = scm.resource_id
  and ss.staff_profile_id is null;

create trigger update_staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.update_updated_at_column();

create trigger update_staff_clinic_memberships_updated_at
before update on public.staff_clinic_memberships
for each row execute function public.update_updated_at_column();

alter table public.staff_profiles enable row level security;
alter table public.staff_clinic_memberships enable row level security;

create policy "staff_profiles_select_scoped"
on public.staff_profiles
for select
using (
  app_private.get_current_role() = 'admin'
  or user_id = auth.uid()
  or exists (
    select 1
    from public.staff_clinic_memberships scm
    where scm.staff_profile_id = staff_profiles.id
      and app_private.can_access_clinic(scm.clinic_id)
  )
);

create policy "staff_profiles_write_admin_only"
on public.staff_profiles
for all
using (app_private.get_current_role() = 'admin')
with check (app_private.get_current_role() = 'admin');

create policy "staff_clinic_memberships_select_scoped"
on public.staff_clinic_memberships
for select
using (
  app_private.get_current_role() = 'admin'
  or app_private.can_access_clinic(clinic_id)
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = staff_clinic_memberships.staff_profile_id
      and sp.user_id = auth.uid()
  )
);

create policy "staff_clinic_memberships_write_admin_only"
on public.staff_clinic_memberships
for all
using (app_private.get_current_role() = 'admin')
with check (app_private.get_current_role() = 'admin');

grant select, insert, update, delete on public.staff_profiles to authenticated;
grant select, insert, update, delete on public.staff_clinic_memberships to authenticated;
grant all on public.staff_profiles to service_role;
grant all on public.staff_clinic_memberships to service_role;

do $$
begin
  if to_regclass('public.staff_profiles') is null then
    raise exception 'staff_profiles table was not created';
  end if;

  if to_regclass('public.staff_clinic_memberships') is null then
    raise exception 'staff_clinic_memberships table was not created';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_shifts'
      and column_name = 'assignment_type'
  ) then
    raise exception 'staff_shifts.assignment_type was not created';
  end if;
end $$;
