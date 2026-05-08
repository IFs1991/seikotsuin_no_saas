-- ================================================================
-- Migration: app_private JWT app_metadata aware RLS helpers
-- ================================================================
-- Purpose:
--   1. Fix RLS helper functions used by current policies after RPC hardening.
--   2. Read Supabase JWT custom claims from claims.app_metadata.* first.
--   3. Preserve legacy top-level user_role / clinic_id compatibility.
--   4. Keep helper functions in app_private, outside exposed Data API schemas.
-- Related:
--   - docs/handover-revenue-aggregation-2026-05-08.md
--   - docs/stabilization/spec-revenue-rls-app-private-jwt-2026-05-08.md
--   - docs/stabilization/DoD-v0.1.md DOD-08
-- ================================================================

begin;

create schema if not exists app_private;

grant usage on schema app_private to postgres;
grant usage on schema app_private to service_role;
grant usage on schema app_private to anon;
grant usage on schema app_private to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant usage on schema app_private to supabase_auth_admin';
  end if;
end
$$;

create or replace function app_private.jwt_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  cid text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    cid := coalesce(
      claims -> 'app_metadata' ->> 'clinic_id',
      claims ->> 'clinic_id'
    );

    if cid is not null and cid <> '' then
      return cid::uuid;
    end if;
  exception when others then
    null;
  end;

  return null;
end;
$$;

create or replace function app_private.jwt_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  role_val text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    role_val := coalesce(
      claims -> 'app_metadata' ->> 'user_role',
      claims -> 'app_metadata' ->> 'role',
      claims ->> 'user_role'
    );

    return role_val = 'admin';
  exception when others then
    return false;
  end;
end;
$$;

create or replace function app_private.get_current_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  jwt_clinic_id uuid;
  db_clinic_id uuid;
begin
  jwt_clinic_id := app_private.jwt_clinic_id();
  if jwt_clinic_id is not null then
    return jwt_clinic_id;
  end if;

  select up.clinic_id
  into db_clinic_id
  from public.user_permissions up
  where up.staff_id = auth.uid()
  limit 1;

  if db_clinic_id is not null then
    return db_clinic_id;
  end if;

  select p.clinic_id
  into db_clinic_id
  from public.profiles p
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  return db_clinic_id;
end;
$$;

create or replace function app_private.get_current_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  role_val text;
  db_role text;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;

    role_val := claims -> 'app_metadata' ->> 'user_role';
    if role_val is not null and role_val <> '' then
      return role_val;
    end if;

    role_val := claims -> 'app_metadata' ->> 'role';
    if role_val is not null and role_val <> '' then
      return role_val;
    end if;

    role_val := claims ->> 'user_role';
    if role_val is not null and role_val <> '' then
      return role_val;
    end if;

    -- Do not return the standard Supabase top-level role value
    -- (`authenticated` / `anon`) as an application role.
    role_val := claims ->> 'role';
    if role_val = any (array['admin', 'clinic_admin', 'manager', 'therapist', 'staff', 'customer']) then
      return role_val;
    end if;
  exception when others then
    null;
  end;

  select up.role
  into db_role
  from public.user_permissions up
  where up.staff_id = auth.uid()
  limit 1;

  if db_role is not null and db_role <> '' then
    return db_role;
  end if;

  select p.role
  into db_role
  from public.profiles p
  where p.user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  return coalesce(db_role, '');
end;
$$;

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
begin
  if target_clinic_id is null then
    return false;
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

create or replace function app_private.belongs_to_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
begin
  return app_private.can_access_clinic(target_clinic_id);
end;
$$;

create or replace function app_private.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
begin
  return app_private.get_current_role() = 'admin';
end;
$$;

create or replace function app_private.user_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  user_role_val text;
begin
  user_role_val := app_private.get_current_role();
  if user_role_val is null or user_role_val = '' then
    return 'anon';
  end if;
  return user_role_val;
end;
$$;

grant execute on function app_private.jwt_clinic_id() to anon, authenticated;
grant execute on function app_private.jwt_is_admin() to anon, authenticated;
grant execute on function app_private.get_current_clinic_id() to anon, authenticated;
grant execute on function app_private.get_current_role() to anon, authenticated;
grant execute on function app_private.can_access_clinic(uuid) to anon, authenticated;
grant execute on function app_private.belongs_to_clinic(uuid) to anon, authenticated;
grant execute on function app_private.is_admin() to anon, authenticated;
grant execute on function app_private.user_role() to anon, authenticated;

do $$
declare
  probe_claims text := '{
    "role": "authenticated",
    "app_metadata": {
      "user_role": "clinic_admin",
      "clinic_id": "a330cd56-2120-4930-84b6-1bb3cd7b986b",
      "clinic_scope_ids": ["a330cd56-2120-4930-84b6-1bb3cd7b986b"]
    }
  }';
begin
  perform set_config('request.jwt.claims', probe_claims, true);

  if app_private.get_current_role() <> 'clinic_admin' then
    raise exception 'app_private.get_current_role() did not read app_metadata.user_role';
  end if;

  if app_private.jwt_clinic_id() <> 'a330cd56-2120-4930-84b6-1bb3cd7b986b'::uuid then
    raise exception 'app_private.jwt_clinic_id() did not read app_metadata.clinic_id';
  end if;

  if app_private.can_access_clinic('a330cd56-2120-4930-84b6-1bb3cd7b986b'::uuid) is not true then
    raise exception 'app_private.can_access_clinic() did not read app_metadata.clinic_scope_ids';
  end if;

  perform set_config('request.jwt.claims', '', true);
end
$$;

commit;
