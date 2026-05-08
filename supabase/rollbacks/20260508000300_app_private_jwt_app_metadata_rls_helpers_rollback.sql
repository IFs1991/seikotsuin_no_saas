-- ================================================================
-- Rollback: app_private JWT app_metadata aware RLS helpers
-- ================================================================
-- Target:
--   supabase/migrations/20260508000300_app_private_jwt_app_metadata_rls_helpers.sql
-- Restores the app_private helper definitions introduced by
-- 20260507000200_security_advisor_rpc_hardening.sql.
-- ================================================================

begin;

create or replace function app_private.jwt_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
begin
  return (current_setting('request.jwt.claims', true)::json->>'clinic_id')::uuid;
exception when others then
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
  role_val text;
begin
  role_val := current_setting('request.jwt.claims', true)::json->>'user_role';
  if role_val is null then
    role_val := current_setting('request.jwt.claims', true)::json->>'role';
  end if;
  return role_val = 'admin';
exception when others then
  return false;
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
  begin
    jwt_clinic_id := (current_setting('request.jwt.claims', true)::json->>'clinic_id')::uuid;
    if jwt_clinic_id is not null then
      return jwt_clinic_id;
    end if;
  exception when others then
    null;
  end;

  select clinic_id
  into db_clinic_id
  from public.user_permissions
  where staff_id = auth.uid()
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
  jwt_role text;
  jwt_role_legacy text;
  db_role text;
begin
  begin
    jwt_role := current_setting('request.jwt.claims', true)::json->>'user_role';
    if jwt_role is not null and jwt_role <> '' then
      return jwt_role;
    end if;
  exception when others then
    null;
  end;

  begin
    jwt_role_legacy := current_setting('request.jwt.claims', true)::json->>'role';
    if jwt_role_legacy is not null and jwt_role_legacy <> '' then
      return jwt_role_legacy;
    end if;
  exception when others then
    null;
  end;

  select role
  into db_role
  from public.user_permissions
  where staff_id = auth.uid()
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
  scope_ids_json jsonb;
  scope_ids uuid[];
  primary_clinic_id uuid;
begin
  begin
    scope_ids_json := current_setting('request.jwt.claims', true)::jsonb->'clinic_scope_ids';

    if scope_ids_json is not null and jsonb_array_length(scope_ids_json) > 0 then
      select array_agg(elem::text::uuid)
      into scope_ids
      from jsonb_array_elements_text(scope_ids_json) as elem;

      return target_clinic_id = any(scope_ids);
    end if;
  exception when others then
    null;
  end;

  primary_clinic_id := app_private.jwt_clinic_id();

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

commit;
