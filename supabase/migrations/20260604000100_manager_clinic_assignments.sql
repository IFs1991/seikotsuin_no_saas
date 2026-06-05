-- ================================================================
-- Migration: Manager clinic assignments v0.2 PR-01
-- Spec: docs/stabilization/spec-area-manager-clinic-assignments-v0.2.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

create table public.manager_clinic_assignments (
  id uuid primary key default gen_random_uuid(),

  manager_user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),

  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint manager_clinic_assignments_revoke_reason_length
    check (revoke_reason is null or char_length(revoke_reason) <= 500)
);

create unique index manager_clinic_assignments_active_unique
on public.manager_clinic_assignments (manager_user_id, clinic_id)
where revoked_at is null;

-- The active unique index also covers manager_user_id active lookups, so avoid
-- maintaining a duplicate non-unique partial index on the same hot write path.

create index manager_clinic_assignments_clinic_active_idx
on public.manager_clinic_assignments (clinic_id, manager_user_id)
where revoked_at is null;

create index manager_clinic_assignments_assigned_at_idx
on public.manager_clinic_assignments (assigned_at desc);

create index manager_clinic_assignments_revoked_at_idx
on public.manager_clinic_assignments (revoked_at)
where revoked_at is not null;

create or replace function app_private.assert_manager_clinic_assignment_valid()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_manager_has_role boolean;
  v_clinic_is_active boolean;
  v_clinic_parent_id uuid;
begin
  select exists (
    select 1
    from public.user_permissions up
    where up.staff_id = new.manager_user_id
      and up.role = 'manager'
  )
  into v_manager_has_role;

  if v_manager_has_role is distinct from true then
    raise exception 'manager_user_id must have manager role'
      using errcode = '23514';
  end if;

  select c.is_active, c.parent_id
  into v_clinic_is_active, v_clinic_parent_id
  from public.clinics c
  where c.id = new.clinic_id
  limit 1;

  if not found then
    raise exception 'clinic_id must reference an existing clinic'
      using errcode = '23503';
  end if;

  if v_clinic_is_active is distinct from true then
    raise exception 'clinic must be active'
      using errcode = '23514';
  end if;

  if v_clinic_parent_id is null then
    raise exception 'clinic assignment target must be a child clinic, not parent tenant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assert_manager_clinic_assignment_valid_insert
before insert on public.manager_clinic_assignments
for each row
execute function app_private.assert_manager_clinic_assignment_valid();

create trigger assert_manager_clinic_assignment_valid_update
before update of manager_user_id, clinic_id, revoked_at
on public.manager_clinic_assignments
for each row
when (new.revoked_at is null)
execute function app_private.assert_manager_clinic_assignment_valid();

create trigger update_manager_clinic_assignments_updated_at
before update on public.manager_clinic_assignments
for each row execute function public.update_updated_at_column();

alter table public.manager_clinic_assignments enable row level security;

create policy "manager_clinic_assignments_select_admin_or_self_active"
on public.manager_clinic_assignments
for select
to authenticated
using (
  app_private.get_current_role() = 'admin'
  or (
    manager_user_id = auth.uid()
    and revoked_at is null
  )
);

create policy "manager_clinic_assignments_insert_admin_only"
on public.manager_clinic_assignments
for insert
to authenticated
with check (
  app_private.get_current_role() = 'admin'
);

create policy "manager_clinic_assignments_update_admin_only"
on public.manager_clinic_assignments
for update
to authenticated
using (
  app_private.get_current_role() = 'admin'
)
with check (
  app_private.get_current_role() = 'admin'
);

create policy "manager_clinic_assignments_delete_admin_only"
on public.manager_clinic_assignments
for delete
to authenticated
using (
  app_private.get_current_role() = 'admin'
);

create or replace function app_private.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
  v_current_role text;
begin
  if target_clinic_id is null then
    return false;
  end if;

  v_current_role := app_private.get_current_role();

  -- Manager clinic access must come from active DB assignments only.
  -- Do not use JWT clinic_scope_ids or primary clinic fallback for managers.
  if v_current_role = 'manager' then
    return exists (
      select 1
      from public.manager_clinic_assignments mca
      where mca.manager_user_id = auth.uid()
        and mca.clinic_id = target_clinic_id
        and mca.revoked_at is null
    );
  end if;

  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    scope_ids_json := coalesce(
      claims -> 'app_metadata' -> 'clinic_scope_ids',
      claims -> 'clinic_scope_ids'
    );

    if scope_ids_json is not null
       and jsonb_typeof(scope_ids_json) = 'array'
       and jsonb_array_length(scope_ids_json) > 0
    then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;

      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then
    null;
  end;

  primary_clinic_id := app_private.get_current_clinic_id();

  if primary_clinic_id is null then
    return false;
  end if;

  return target_clinic_id = primary_clinic_id;
end;
$$;

create or replace function public.replace_manager_clinic_assignments(
  p_manager_user_id uuid,
  p_clinic_ids uuid[],
  p_revoke_reason text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_target_clinic_ids uuid[] := array[]::uuid[];
  v_revoke_reason text := nullif(btrim(p_revoke_reason), '');
  v_now timestamptz := now();
  v_manager_has_role boolean;
  v_actor_is_admin boolean;
begin
  if p_manager_user_id is null then
    raise exception 'manager_user_id is required'
      using errcode = '23514';
  end if;

  if p_actor_user_id is null then
    raise exception 'actor_user_id is required'
      using errcode = '23514';
  end if;

  if p_clinic_ids is null then
    raise exception 'clinic_ids are required'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(p_clinic_ids) as requested(clinic_id)
    where requested.clinic_id is null
  ) then
    raise exception 'clinic_ids cannot contain null values'
      using errcode = '23514';
  end if;

  if char_length(v_revoke_reason) > 500 then
    raise exception 'revoke_reason must be 500 characters or fewer'
      using errcode = '23514';
  end if;

  select
    coalesce(
      bool_or(up.staff_id = p_manager_user_id and up.role = 'manager'),
      false
    ),
    coalesce(
      bool_or(up.staff_id = p_actor_user_id and up.role = 'admin'),
      false
    )
  into v_manager_has_role, v_actor_is_admin
  from public.user_permissions up
  where up.staff_id in (p_manager_user_id, p_actor_user_id);

  if v_manager_has_role is distinct from true then
    raise exception 'manager_user_id must have manager role'
      using errcode = '23514';
  end if;

  if v_actor_is_admin is distinct from true then
    raise exception 'only admin can replace manager clinic assignments'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('manager_clinic_assignments'),
    hashtext(p_manager_user_id::text)
  );

  select coalesce(array_agg(distinct requested.clinic_id), array[]::uuid[])
  into v_target_clinic_ids
  from unnest(p_clinic_ids) as requested(clinic_id);

  if exists (
    select 1
    from unnest(v_target_clinic_ids) as requested(clinic_id)
    left join public.clinics c on c.id = requested.clinic_id
    where c.id is null
       or c.is_active is distinct from true
       or c.parent_id is null
  ) then
    raise exception 'clinic_ids must reference active child clinics'
      using errcode = '23514';
  end if;

  update public.manager_clinic_assignments mca
  set
    revoked_at = v_now,
    revoked_by = p_actor_user_id,
    revoke_reason = v_revoke_reason,
    updated_at = v_now
  where mca.manager_user_id = p_manager_user_id
    and mca.revoked_at is null
    and not (mca.clinic_id = any(v_target_clinic_ids));

  insert into public.manager_clinic_assignments (
    manager_user_id,
    clinic_id,
    assigned_by,
    assigned_at
  )
  select
    p_manager_user_id,
    requested.clinic_id,
    p_actor_user_id,
    v_now
  from unnest(v_target_clinic_ids) as requested(clinic_id)
  where not exists (
    select 1
    from public.manager_clinic_assignments active_mca
    where active_mca.manager_user_id = p_manager_user_id
      and active_mca.clinic_id = requested.clinic_id
      and active_mca.revoked_at is null
  );
end;
$$;

grant select, insert, update, delete on public.manager_clinic_assignments to authenticated;
grant all on public.manager_clinic_assignments to service_role;

revoke all on function app_private.assert_manager_clinic_assignment_valid()
  from public, anon, authenticated;
grant execute on function app_private.assert_manager_clinic_assignment_valid()
  to service_role;

revoke all on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)
  to service_role;

grant execute on function app_private.can_access_clinic(uuid) to anon, authenticated;

do $$
declare
  v_can_access_clinic_def text;
begin
  if to_regclass('public.manager_clinic_assignments') is null then
    raise exception 'manager_clinic_assignments table was not created';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'manager_clinic_assignments'
      and indexname = 'manager_clinic_assignments_active_unique'
  ) then
    raise exception 'manager_clinic_assignments_active_unique index was not created';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manager_clinic_assignments'
      and policyname = 'manager_clinic_assignments_select_admin_or_self_active'
  ) then
    raise exception 'manager_clinic_assignments select policy was not created';
  end if;

  select pg_get_functiondef(p.oid)
  into v_can_access_clinic_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname = 'can_access_clinic'
    and pg_get_function_arguments(p.oid) = 'target_clinic_id uuid';

  if v_can_access_clinic_def is null
     or position('manager_clinic_assignments' in v_can_access_clinic_def) = 0 then
    raise exception 'app_private.can_access_clinic does not reference manager assignments';
  end if;
end;
$$;

commit;
