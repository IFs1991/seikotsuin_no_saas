-- ================================================================
-- Migration: Manager shift request workflow v0.2
-- Spec: docs/stabilization/spec-manager-shift-request-workflow-v0.2-tdd-reviewed.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

-- Preflight hardening: remove the legacy permissive staff_preferences INSERT
-- policy. The reviewed workflow must not reuse staff_preferences for
-- therapist/staff self-submit.
drop policy if exists "staff_preferences_insert" on public.staff_preferences;

create table public.shift_request_periods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  title text not null,
  period_start date not null,
  period_end date not null,
  submission_deadline timestamptz not null,
  status text not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_request_periods_date_check
    check (period_end >= period_start),
  constraint shift_request_periods_status_check
    check (status in ('draft', 'open', 'closed', 'finalized', 'cancelled'))
);

create table public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  period_id uuid not null references public.shift_request_periods(id) on delete cascade,
  staff_id uuid not null references public.resources(id) on delete restrict,
  request_type text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  priority integer not null default 3,
  status text not null default 'submitted',
  note text,
  submitted_by uuid not null references auth.users(id),
  submitted_for_role text not null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  converted_shift_id uuid references public.staff_shifts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_requests_time_check
    check (end_time > start_time),
  constraint shift_requests_priority_check
    check (priority between 1 and 5),
  constraint shift_requests_request_type_check
    check (request_type in ('available', 'preferred', 'unavailable', 'day_off')),
  constraint shift_requests_status_check
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'withdrawn', 'converted')),
  constraint shift_requests_submitted_for_role_check
    check (submitted_for_role in ('clinic_admin', 'therapist', 'staff')),
  constraint shift_requests_converted_state_check
    check (
      (
        status = 'converted'
        and request_type in ('available', 'preferred')
        and converted_shift_id is not null
      )
      or (
        status <> 'converted'
        and converted_shift_id is null
      )
    ),
  constraint shift_requests_rejection_reason_check
    check (status <> 'rejected' or nullif(btrim(coalesce(rejection_reason, '')), '') is not null)
);

create table public.shift_request_audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  period_id uuid references public.shift_request_periods(id) on delete set null,
  request_id uuid references public.shift_requests(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  actor_role text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index shift_request_periods_clinic_range_idx
  on public.shift_request_periods (clinic_id, period_start, period_end);

create index shift_request_periods_clinic_status_deadline_idx
  on public.shift_request_periods (clinic_id, status, submission_deadline);

create index shift_requests_clinic_period_status_idx
  on public.shift_requests (clinic_id, period_id, status);

create index shift_requests_clinic_staff_time_idx
  on public.shift_requests (clinic_id, staff_id, start_time, end_time);

create index shift_requests_period_staff_idx
  on public.shift_requests (period_id, staff_id);

create index shift_requests_converted_shift_idx
  on public.shift_requests (converted_shift_id)
  where converted_shift_id is not null;

create index shift_requests_clinic_type_status_idx
  on public.shift_requests (clinic_id, request_type, status);

create index shift_requests_convertible_idx
  on public.shift_requests (clinic_id, period_id, staff_id, start_time, end_time)
  where status = 'approved'
    and request_type in ('available', 'preferred')
    and converted_shift_id is null;

create index shift_requests_approved_constraints_idx
  on public.shift_requests (clinic_id, period_id, staff_id, start_time, end_time)
  where status = 'approved'
    and request_type in ('unavailable', 'day_off');

create index staff_shifts_conversion_overlap_idx
  on public.staff_shifts (clinic_id, staff_id, start_time, end_time)
  where status <> 'cancelled';

create index shift_request_audit_logs_clinic_created_idx
  on public.shift_request_audit_logs (clinic_id, created_at desc);

create index shift_request_audit_logs_period_created_idx
  on public.shift_request_audit_logs (period_id, created_at desc);

create index shift_request_audit_logs_request_created_idx
  on public.shift_request_audit_logs (request_id, created_at desc);

create index shift_request_audit_logs_actor_created_idx
  on public.shift_request_audit_logs (actor_user_id, created_at desc);

create or replace function public.validate_shift_requests_clinic_refs()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_period_clinic_id uuid;
  v_staff_clinic_id uuid;
  v_resource_type text;
  v_resource_is_deleted boolean;
begin
  if new.clinic_id is null then
    raise exception 'shift_requests.clinic_id is required' using errcode = '23514';
  end if;

  select clinic_id
  into v_period_clinic_id
  from public.shift_request_periods
  where id = new.period_id;

  if not found then
    raise exception 'shift_request_periods.id not found' using errcode = '23503';
  end if;

  if v_period_clinic_id <> new.clinic_id then
    raise exception 'shift_requests.period_id clinic mismatch' using errcode = '23514';
  end if;

  select clinic_id, type, is_deleted
  into v_staff_clinic_id, v_resource_type, v_resource_is_deleted
  from public.resources
  where id = new.staff_id;

  if not found then
    raise exception 'resources.id not found' using errcode = '23503';
  end if;

  if v_staff_clinic_id <> new.clinic_id then
    raise exception 'shift_requests.staff_id clinic mismatch' using errcode = '23514';
  end if;

  if v_resource_type <> 'staff' then
    raise exception 'shift_requests.staff_id must reference resources(type=staff)' using errcode = '23514';
  end if;

  if coalesce(v_resource_is_deleted, false) = true then
    raise exception 'shift_requests.staff_id references deleted resource' using errcode = '23514';
  end if;

  if new.request_type in ('unavailable', 'day_off') then
    if new.status = 'converted' or new.converted_shift_id is not null then
      raise exception 'unavailable/day_off request cannot be converted' using errcode = '23514';
    end if;
  end if;

  if new.converted_shift_id is not null
     and not (new.status = 'converted' and new.request_type in ('available', 'preferred')) then
    raise exception 'converted_shift_id is allowed only for converted available/preferred requests' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_shift_requests_clinic_refs_trigger
before insert or update on public.shift_requests
for each row execute function public.validate_shift_requests_clinic_refs();

create trigger update_shift_request_periods_updated_at
before update on public.shift_request_periods
for each row execute function public.update_updated_at_column();

create trigger update_shift_requests_updated_at
before update on public.shift_requests
for each row execute function public.update_updated_at_column();

alter table public.shift_request_periods enable row level security;
alter table public.shift_requests enable row level security;
alter table public.shift_request_audit_logs enable row level security;

create policy "shift_request_periods_select_scoped"
on public.shift_request_periods
for select
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin', 'therapist', 'staff'])
  and app_private.can_access_clinic(clinic_id)
);

create policy "shift_request_periods_insert_managers"
on public.shift_request_periods
for insert
to authenticated
with check (
  app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

create policy "shift_request_periods_update_managers"
on public.shift_request_periods
for update
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
)
with check (
  app_private.can_access_clinic(clinic_id)
  and (
    app_private.get_current_role() = any (array['admin', 'manager'])
    or (
      app_private.get_current_role() = 'clinic_admin'
      and status in ('draft', 'open', 'closed')
    )
  )
);

create policy "shift_requests_select_scoped"
on public.shift_requests
for select
to authenticated
using (
  (
    app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = auth.uid()
  )
);

create policy "shift_requests_insert_scoped"
on public.shift_requests
for insert
to authenticated
with check (
  (
    app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = auth.uid()
    and submitted_by = auth.uid()
    and submitted_for_role = app_private.get_current_role()
  )
);

create policy "shift_requests_update_scoped"
on public.shift_requests
for update
to authenticated
using (
  (
    app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = auth.uid()
  )
)
with check (
  (
    app_private.get_current_role() = any (array['admin', 'manager'])
    and app_private.can_access_clinic(clinic_id)
  )
  or (
    app_private.get_current_role() = 'clinic_admin'
    and app_private.can_access_clinic(clinic_id)
    and status <> 'converted'
  )
  or (
    app_private.get_current_role() = any (array['therapist', 'staff'])
    and app_private.can_access_clinic(clinic_id)
    and staff_id = auth.uid()
    and status in ('draft', 'submitted', 'rejected', 'withdrawn')
    and converted_shift_id is null
  )
);

create policy "shift_request_audit_logs_select_scoped"
on public.shift_request_audit_logs
for select
to authenticated
using (
  app_private.get_current_role() = any (array['admin', 'manager', 'clinic_admin'])
  and app_private.can_access_clinic(clinic_id)
);

grant select, insert, update on public.shift_request_periods to authenticated;
grant select, insert, update on public.shift_requests to authenticated;
grant select on public.shift_request_audit_logs to authenticated;

grant all on public.shift_request_periods to service_role;
grant all on public.shift_requests to service_role;
grant all on public.shift_request_audit_logs to service_role;

create or replace function public.convert_shift_requests(
  p_clinic_id uuid,
  p_period_id uuid,
  p_request_ids uuid[] default null,
  p_mode text default 'selected',
  p_actor_user_id uuid default auth.uid(),
  p_actor_role text default app_private.get_current_role()
)
returns table(converted_request_id uuid, converted_shift_id uuid)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_period_status text;
  v_requested_count integer := 0;
  v_candidate_count integer := 0;
begin
  if p_actor_user_id is null then
    raise exception 'actor user id is required' using errcode = '23514';
  end if;

  if p_actor_role is null or p_actor_role <> all (array['admin', 'manager']) then
    raise exception 'only manager/admin can convert shift requests' using errcode = '42501';
  end if;

  if p_mode not in ('selected', 'all_approved') then
    raise exception 'invalid conversion mode' using errcode = '23514';
  end if;

  select status
  into v_period_status
  from public.shift_request_periods
  where id = p_period_id
    and clinic_id = p_clinic_id;

  if not found then
    raise exception 'shift request period not found' using errcode = '23503';
  end if;

  if v_period_status in ('finalized', 'cancelled') then
    raise exception 'shift request period is not convertible' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text), hashtext(p_period_id::text));

  drop table if exists pg_temp.shift_request_conversion_candidates;

  if p_mode = 'selected' then
    if coalesce(array_length(p_request_ids, 1), 0) = 0 then
      raise exception 'request_ids are required for selected conversion' using errcode = '23514';
    end if;

    create temporary table shift_request_conversion_candidates on commit drop as
    with requested as (
      select distinct unnest(p_request_ids) as request_id
    )
    select
      sr.id as request_id,
      sr.clinic_id,
      sr.period_id,
      sr.staff_id,
      sr.start_time,
      sr.end_time,
      sr.note,
      sr.request_type,
      sr.status,
      to_jsonb(sr.*) as before_data
    from public.shift_requests sr
    join requested r on r.request_id = sr.id
    where sr.clinic_id = p_clinic_id
      and sr.period_id = p_period_id
      and sr.status = 'approved'
      and sr.request_type in ('available', 'preferred')
      and sr.converted_shift_id is null
    for update of sr;

    select count(*)
    into v_requested_count
    from (select distinct unnest(p_request_ids) as request_id) requested;

    select count(*)
    into v_candidate_count
    from shift_request_conversion_candidates;

    if v_requested_count <> v_candidate_count then
      raise exception 'selected request_ids include non-convertible requests' using errcode = '23514';
    end if;
  else
    create temporary table shift_request_conversion_candidates on commit drop as
    select
      sr.id as request_id,
      sr.clinic_id,
      sr.period_id,
      sr.staff_id,
      sr.start_time,
      sr.end_time,
      sr.note,
      sr.request_type,
      sr.status,
      to_jsonb(sr.*) as before_data
    from public.shift_requests sr
    where sr.clinic_id = p_clinic_id
      and sr.period_id = p_period_id
      and sr.status = 'approved'
      and sr.request_type in ('available', 'preferred')
      and sr.converted_shift_id is null
    for update of sr;

    select count(*)
    into v_candidate_count
    from shift_request_conversion_candidates;
  end if;

  if v_candidate_count = 0 then
    return;
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates c1
    join shift_request_conversion_candidates c2
      on c1.staff_id = c2.staff_id
     and c1.request_id::text < c2.request_id::text
     and c1.start_time < c2.end_time
     and c1.end_time > c2.start_time
  ) then
    raise exception 'conversion candidates overlap internally' using errcode = '23514';
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates c
    join public.staff_shifts ss
      on ss.clinic_id = c.clinic_id
     and ss.staff_id = c.staff_id
     and ss.status <> 'cancelled'
     and ss.start_time < c.end_time
     and ss.end_time > c.start_time
  ) then
    raise exception 'conversion candidates overlap existing staff_shifts' using errcode = '23514';
  end if;

  if exists (
    select 1
    from shift_request_conversion_candidates c
    join public.shift_requests blocker
      on blocker.clinic_id = c.clinic_id
     and blocker.period_id = c.period_id
     and blocker.staff_id = c.staff_id
     and blocker.status = 'approved'
     and blocker.request_type in ('unavailable', 'day_off')
     and blocker.start_time < c.end_time
     and blocker.end_time > c.start_time
  ) then
    raise exception 'conversion candidates overlap approved unavailable/day_off requests' using errcode = '23514';
  end if;

  drop table if exists pg_temp.shift_request_conversion_map;
  create temporary table shift_request_conversion_map on commit drop as
  select
    c.request_id,
    gen_random_uuid() as shift_id
  from shift_request_conversion_candidates c;

  insert into public.staff_shifts (
    id,
    clinic_id,
    staff_id,
    start_time,
    end_time,
    status,
    notes,
    created_by
  )
  select
    m.shift_id,
    c.clinic_id,
    c.staff_id,
    c.start_time,
    c.end_time,
    'confirmed',
    c.note,
    p_actor_user_id
  from shift_request_conversion_candidates c
  join shift_request_conversion_map m on m.request_id = c.request_id;

  update public.shift_requests sr
  set
    status = 'converted',
    converted_shift_id = m.shift_id,
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    updated_at = now()
  from shift_request_conversion_map m
  where sr.id = m.request_id;

  insert into public.shift_request_audit_logs (
    clinic_id,
    period_id,
    request_id,
    actor_user_id,
    actor_role,
    action,
    before_data,
    after_data
  )
  select
    c.clinic_id,
    c.period_id,
    c.request_id,
    p_actor_user_id,
    p_actor_role,
    'request_convert',
    c.before_data,
    jsonb_build_object(
      'status', 'converted',
      'converted_shift_id', m.shift_id
    )
  from shift_request_conversion_candidates c
  join shift_request_conversion_map m on m.request_id = c.request_id;

  return query
  select
    m.request_id as converted_request_id,
    m.shift_id as converted_shift_id
  from shift_request_conversion_map m
  order by m.request_id;
end;
$$;

revoke all on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  to service_role;

comment on function public.convert_shift_requests(uuid, uuid, uuid[], text, uuid, text)
  is 'Atomically converts approved available/preferred shift_requests to confirmed staff_shifts. day_off/unavailable are excluded in every mode.';

commit;
