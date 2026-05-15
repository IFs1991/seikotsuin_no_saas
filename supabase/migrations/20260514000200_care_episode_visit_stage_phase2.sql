-- Care episode and visit stage Phase 2.
-- Rollback: supabase/rollbacks/20260514000200_care_episode_visit_stage_phase2_rollback.sql

create table if not exists public.care_episodes (
  id uuid default extensions.uuid_generate_v4() not null,
  clinic_id uuid not null,
  customer_id uuid not null,
  episode_name text,
  primary_problem_text text,
  started_on date not null,
  ended_on date,
  status text not null default 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_episodes_pkey primary key (id),
  constraint care_episodes_clinic_id_fkey
    foreign key (clinic_id) references public.clinics(id) on delete cascade,
  constraint care_episodes_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete cascade,
  constraint care_episodes_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint care_episodes_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint care_episodes_status_check
    check (status in ('active', 'paused', 'completed', 'cancelled')),
  constraint care_episodes_date_check
    check (ended_on is null or ended_on >= started_on)
);

create index if not exists idx_care_episodes_clinic_customer_status
  on public.care_episodes (clinic_id, customer_id, status);

create index if not exists idx_care_episodes_clinic_started_on
  on public.care_episodes (clinic_id, started_on);

drop trigger if exists update_care_episodes_updated_at
on public.care_episodes;

create trigger update_care_episodes_updated_at
before update on public.care_episodes
for each row execute function public.update_updated_at_column();

alter table public.care_episodes enable row level security;

drop policy if exists "care_episodes_select_for_staff"
on public.care_episodes;

create policy "care_episodes_select_for_staff"
on public.care_episodes
for select
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "care_episodes_insert_for_staff"
on public.care_episodes;

create policy "care_episodes_insert_for_staff"
on public.care_episodes
for insert
to authenticated
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

drop policy if exists "care_episodes_update_for_staff"
on public.care_episodes;

create policy "care_episodes_update_for_staff"
on public.care_episodes
for update
to authenticated
using (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.get_current_role() = any (
    array['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
  )
  and app_private.can_access_clinic(clinic_id)
);

revoke all on table public.care_episodes from anon;
grant select, insert, update on table public.care_episodes to authenticated;
grant all on table public.care_episodes to service_role;

create table if not exists public.visit_stage_definitions (
  code text primary key,
  name text not null,
  ordinal integer not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.visit_stage_definitions (
  code,
  name,
  ordinal,
  description,
  sort_order
)
values
  ('first_visit', '初診', 1, 'episode内の初回来院', 10),
  ('second_visit', '2回目', 2, 'episode内の2回目来院', 20),
  ('third_visit', '3回目', 3, 'episode内の3回目来院', 30),
  ('fifth_visit', '5回目', 5, 'episode内の5回目来院', 50),
  ('repeat', '継続', 999, '継続来院', 999)
on conflict (code) do update set
  name = excluded.name,
  ordinal = excluded.ordinal,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

drop trigger if exists update_visit_stage_definitions_updated_at
on public.visit_stage_definitions;

create trigger update_visit_stage_definitions_updated_at
before update on public.visit_stage_definitions
for each row execute function public.update_updated_at_column();

alter table public.visit_stage_definitions enable row level security;

drop policy if exists "visit_stage_definitions_select_for_authenticated"
on public.visit_stage_definitions;

create policy "visit_stage_definitions_select_for_authenticated"
on public.visit_stage_definitions
for select
to authenticated
using (true);

revoke all on table public.visit_stage_definitions from anon;
grant select on table public.visit_stage_definitions to authenticated;
grant all on table public.visit_stage_definitions to service_role;

alter table public.daily_report_items
  add column if not exists care_episode_id uuid,
  add column if not exists visit_ordinal_in_episode integer,
  add column if not exists visit_stage_code text;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_care_episode_id_fkey,
  add constraint daily_report_items_care_episode_id_fkey
    foreign key (care_episode_id)
    references public.care_episodes(id)
    on delete set null;

alter table public.daily_report_items
  drop constraint if exists daily_report_items_visit_stage_code_fkey,
  add constraint daily_report_items_visit_stage_code_fkey
    foreign key (visit_stage_code)
    references public.visit_stage_definitions(code);

alter table public.daily_report_items
  drop constraint if exists daily_report_items_visit_ordinal_check,
  add constraint daily_report_items_visit_ordinal_check
    check (
      visit_ordinal_in_episode is null
      or visit_ordinal_in_episode >= 1
    );

create index if not exists idx_daily_report_items_care_episode
  on public.daily_report_items (clinic_id, care_episode_id, report_date);

create index if not exists idx_daily_report_items_visit_stage
  on public.daily_report_items (clinic_id, visit_stage_code, report_date);

create or replace function public.validate_daily_report_items_analysis_refs()
returns trigger
language plpgsql
set search_path = public, auth, extensions
as $$
declare
  v_episode_clinic_id uuid;
  v_episode_customer_id uuid;
begin
  if new.care_episode_id is not null then
    select clinic_id, customer_id
    into v_episode_clinic_id, v_episode_customer_id
    from public.care_episodes
    where id = new.care_episode_id;

    if not found then
      raise exception 'care_episodes.id not found' using errcode = '23503';
    end if;

    if v_episode_clinic_id <> new.clinic_id then
      raise exception 'daily_report_items.care_episode_id clinic mismatch' using errcode = '23514';
    end if;

    if new.customer_id is not null and v_episode_customer_id <> new.customer_id then
      raise exception 'daily_report_items.care_episode_id customer mismatch' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists daily_report_items_analysis_ref_check
on public.daily_report_items;

create trigger daily_report_items_analysis_ref_check
before insert or update on public.daily_report_items
for each row execute function public.validate_daily_report_items_analysis_refs();

revoke execute on function public.validate_daily_report_items_analysis_refs()
from public, anon, authenticated;

grant execute on function public.validate_daily_report_items_analysis_refs()
to service_role;

comment on table public.care_episodes is 'Customer care episodes for long-term visit and revenue analysis.';
comment on table public.visit_stage_definitions is 'Canonical visit stage definitions for care episode analysis.';
comment on column public.daily_report_items.care_episode_id is 'Care episode attached to this daily report item.';
comment on column public.daily_report_items.visit_ordinal_in_episode is 'Visit ordinal within the attached care episode.';
comment on column public.daily_report_items.visit_stage_code is 'Canonical visit stage code within the attached care episode.';
