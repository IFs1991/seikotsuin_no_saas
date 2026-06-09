-- ================================================================
-- Migration: Manager assignment primary clinic metadata
-- Spec: docs/stabilization/spec-area-manager-clinic-assignments-v0.2.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

create or replace function public.replace_manager_clinic_assignments(
  p_manager_user_id uuid,
  p_clinic_ids uuid[],
  p_revoke_reason text,
  p_actor_user_id uuid,
  p_primary_clinic_id uuid default null
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
  v_effective_primary_clinic_id uuid := p_primary_clinic_id;
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

  if p_primary_clinic_id is not null
     and not (p_primary_clinic_id = any(v_target_clinic_ids)) then
    raise exception '所属拠点は担当店舗の中から選択してください'
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

  update public.user_permissions up
  set
    clinic_id = v_effective_primary_clinic_id,
    updated_at = v_now
  where up.staff_id = p_manager_user_id
    and up.role = 'manager'
    and up.clinic_id is distinct from v_effective_primary_clinic_id;

  update public.profiles p
  set
    clinic_id = v_effective_primary_clinic_id,
    updated_at = v_now
  where p.user_id = p_manager_user_id
    and p.clinic_id is distinct from v_effective_primary_clinic_id;
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
  v_current_primary_clinic_id uuid;
  v_requested_primary_clinic_id uuid;
begin
  select coalesce(array_agg(distinct requested.clinic_id), array[]::uuid[])
  into v_target_clinic_ids
  from unnest(p_clinic_ids) as requested(clinic_id);

  select up.clinic_id
  into v_current_primary_clinic_id
  from public.user_permissions up
  where up.staff_id = p_manager_user_id
    and up.role = 'manager'
  limit 1;

  v_requested_primary_clinic_id :=
    case
      when v_current_primary_clinic_id = any(v_target_clinic_ids)
        then v_current_primary_clinic_id
      else null
    end;

  perform public.replace_manager_clinic_assignments(
    p_manager_user_id,
    p_clinic_ids,
    p_revoke_reason,
    p_actor_user_id,
    v_requested_primary_clinic_id
  );
end;
$$;

revoke all on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid, uuid)
  to service_role;

revoke all on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)
  to service_role;

commit;
