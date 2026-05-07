-- ================================================================
-- Migration: Security Advisor RPC Hardening
-- ================================================================
-- Purpose:
--   1. Remove public Data API EXECUTE exposure from SECURITY DEFINER functions.
--   2. Move RLS/auth helper execution behind a non-exposed app_private schema.
--   3. Fix mutable search_path on remaining trigger helper functions.
--   4. Keep tenant isolation semantics unchanged.
-- Related:
--   - Supabase Performance Security Lints (qnanuoqveidwvacvbhqp).csv
--   - docs/operations/supabase-advisor-security-lints-2026-05-07.md
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

-- ----------------------------------------------------------------
-- Private helpers used by RLS policies and auth hooks.
-- app_private is not included in supabase/config.toml [api].schemas, so these
-- functions are not exposed through /rest/v1/rpc.
-- ----------------------------------------------------------------
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

create or replace function app_private.get_sibling_clinic_ids(clinic_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  parent uuid;
  siblings uuid[];
begin
  select c.parent_id
  into parent
  from public.clinics c
  where c.id = clinic_id;

  if parent is null then
    select array_agg(c.id)
    into siblings
    from public.clinics c
    where c.parent_id = clinic_id or c.id = clinic_id;
  else
    select array_agg(c.id)
    into siblings
    from public.clinics c
    where c.parent_id = parent or c.id = parent;
  end if;

  return coalesce(siblings, array[clinic_id]);
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

create or replace function app_private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  claims jsonb;
  user_clinic_id uuid;
  user_role_val text;
  parent_clinic_id uuid;
  scope_ids uuid[];
  has_parent_id_column boolean;
begin
  claims := event->'claims';

  select up.clinic_id, up.role
  into user_clinic_id, user_role_val
  from public.user_permissions up
  where up.staff_id = (event->>'user_id')::uuid
  limit 1;

  if user_clinic_id is not null then
    claims := jsonb_set(claims, '{clinic_id}', to_jsonb(user_clinic_id));
  end if;

  if user_role_val is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val));
  end if;

  if user_clinic_id is not null then
    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'clinics'
        and column_name = 'parent_id'
    )
    into has_parent_id_column;

    if has_parent_id_column then
      select parent_id
      into parent_clinic_id
      from public.clinics
      where id = user_clinic_id;

      if parent_clinic_id is not null then
        select array_agg(c.id)
        into scope_ids
        from public.clinics c
        where c.parent_id = parent_clinic_id or c.id = parent_clinic_id;
      else
        select array_agg(c.id)
        into scope_ids
        from public.clinics c
        where c.parent_id = user_clinic_id or c.id = user_clinic_id;
      end if;
    else
      scope_ids := array[user_clinic_id];
    end if;

    if scope_ids is null then
      scope_ids := array[user_clinic_id];
    end if;
  end if;

  if scope_ids is not null and array_length(scope_ids, 1) > 0 then
    claims := jsonb_set(claims, '{clinic_scope_ids}', to_jsonb(scope_ids));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ----------------------------------------------------------------
-- Point policies at app_private helpers. This preserves the policy logic while
-- removing SECURITY DEFINER helper functions from the exposed public API schema.
-- ----------------------------------------------------------------
do $$
declare
  rec record;
  new_qual text;
  new_with_check text;
begin
  for rec in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%public.%'
        or coalesce(qual, '') like '%"public"%'
        or coalesce(with_check, '') like '%public.%'
        or coalesce(with_check, '') like '%"public"%'
      )
  loop
    new_qual := rec.qual;
    new_with_check := rec.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'public.get_current_role()', 'app_private.get_current_role()');
      new_qual := replace(new_qual, '"public"."get_current_role"()', '"app_private"."get_current_role"()');
      new_qual := replace(new_qual, 'public.get_current_clinic_id()', 'app_private.get_current_clinic_id()');
      new_qual := replace(new_qual, '"public"."get_current_clinic_id"()', '"app_private"."get_current_clinic_id"()');
      new_qual := replace(new_qual, 'public.can_access_clinic(', 'app_private.can_access_clinic(');
      new_qual := replace(new_qual, '"public"."can_access_clinic"(', '"app_private"."can_access_clinic"(');
      new_qual := replace(new_qual, 'public.belongs_to_clinic(', 'app_private.belongs_to_clinic(');
      new_qual := replace(new_qual, '"public"."belongs_to_clinic"(', '"app_private"."belongs_to_clinic"(');
      new_qual := replace(new_qual, 'public.is_admin()', 'app_private.is_admin()');
      new_qual := replace(new_qual, '"public"."is_admin"()', '"app_private"."is_admin"()');
      new_qual := replace(new_qual, 'public.jwt_clinic_id()', 'app_private.jwt_clinic_id()');
      new_qual := replace(new_qual, '"public"."jwt_clinic_id"()', '"app_private"."jwt_clinic_id"()');
      new_qual := replace(new_qual, 'public.jwt_is_admin()', 'app_private.jwt_is_admin()');
      new_qual := replace(new_qual, '"public"."jwt_is_admin"()', '"app_private"."jwt_is_admin"()');
      new_qual := replace(new_qual, 'public.user_role()', 'app_private.user_role()');
      new_qual := replace(new_qual, '"public"."user_role"()', '"app_private"."user_role"()');
    end if;

    if new_with_check is not null then
      new_with_check := replace(new_with_check, 'public.get_current_role()', 'app_private.get_current_role()');
      new_with_check := replace(new_with_check, '"public"."get_current_role"()', '"app_private"."get_current_role"()');
      new_with_check := replace(new_with_check, 'public.get_current_clinic_id()', 'app_private.get_current_clinic_id()');
      new_with_check := replace(new_with_check, '"public"."get_current_clinic_id"()', '"app_private"."get_current_clinic_id"()');
      new_with_check := replace(new_with_check, 'public.can_access_clinic(', 'app_private.can_access_clinic(');
      new_with_check := replace(new_with_check, '"public"."can_access_clinic"(', '"app_private"."can_access_clinic"(');
      new_with_check := replace(new_with_check, 'public.belongs_to_clinic(', 'app_private.belongs_to_clinic(');
      new_with_check := replace(new_with_check, '"public"."belongs_to_clinic"(', '"app_private"."belongs_to_clinic"(');
      new_with_check := replace(new_with_check, 'public.is_admin()', 'app_private.is_admin()');
      new_with_check := replace(new_with_check, '"public"."is_admin"()', '"app_private"."is_admin"()');
      new_with_check := replace(new_with_check, 'public.jwt_clinic_id()', 'app_private.jwt_clinic_id()');
      new_with_check := replace(new_with_check, '"public"."jwt_clinic_id"()', '"app_private"."jwt_clinic_id"()');
      new_with_check := replace(new_with_check, 'public.jwt_is_admin()', 'app_private.jwt_is_admin()');
      new_with_check := replace(new_with_check, '"public"."jwt_is_admin"()', '"app_private"."jwt_is_admin"()');
      new_with_check := replace(new_with_check, 'public.user_role()', 'app_private.user_role()');
      new_with_check := replace(new_with_check, '"public"."user_role"()', '"app_private"."user_role"()');
    end if;

    if coalesce(new_qual, '') <> coalesce(rec.qual, '')
       or coalesce(new_with_check, '') <> coalesce(rec.with_check, '') then
      if new_qual is not null and new_with_check is not null then
        execute format(
          'alter policy %I on %I.%I using (%s) with check (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_qual,
          new_with_check
        );
      elsif new_qual is not null then
        execute format(
          'alter policy %I on %I.%I using (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_qual
        );
      elsif new_with_check is not null then
        execute format(
          'alter policy %I on %I.%I with check (%s)',
          rec.policyname,
          rec.schemaname,
          rec.tablename,
          new_with_check
        );
      end if;
    end if;
  end loop;
end
$$;

-- ----------------------------------------------------------------
-- Fix mutable search_path warnings.
-- ----------------------------------------------------------------
alter function public.update_email_outbox_updated_at()
  set search_path = public, auth, extensions;

alter function public.validate_daily_report_items_clinic_refs()
  set search_path = public, auth, extensions;

-- ----------------------------------------------------------------
-- Remove public Data API EXECUTE exposure for SECURITY DEFINER functions
-- flagged by Supabase Advisor. The loop tolerates environment drift such as
-- rls_auto_enable() existing in production but not in a local squashed dump.
-- ----------------------------------------------------------------
do $$
declare
  target_functions text[] := array[
    'accept_invite',
    'aggregate_mfa_stats',
    'belongs_to_clinic',
    'can_access_clinic',
    'create_clinic_with_admin',
    'custom_access_token_hook',
    'decrypt_mfa_secret',
    'encrypt_mfa_secret',
    'get_clinic_settings',
    'get_current_clinic_id',
    'get_current_role',
    'get_invite_by_token',
    'get_sibling_clinic_ids',
    'is_admin',
    'jwt_clinic_id',
    'jwt_is_admin',
    'log_reservation_created',
    'log_reservation_deleted',
    'log_reservation_updated',
    'recalculate_daily_report_totals',
    'refresh_daily_stats',
    'rls_auto_enable',
    'sync_arrived_reservation_daily_report_item',
    'sync_daily_report_item_totals',
    'update_customer_stats',
    'update_email_outbox_updated_at',
    'upsert_clinic_settings',
    'user_role'
  ];
  rec record;
begin
  for rec in
    select p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_functions)
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      rec.function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      rec.function_signature
    );
  end loop;
end
$$;

grant execute on all functions in schema app_private to service_role;
grant execute on function app_private.jwt_clinic_id() to anon, authenticated;
grant execute on function app_private.jwt_is_admin() to anon, authenticated;
grant execute on function app_private.get_current_clinic_id() to anon, authenticated;
grant execute on function app_private.get_current_role() to anon, authenticated;
grant execute on function app_private.can_access_clinic(uuid) to anon, authenticated;
grant execute on function app_private.belongs_to_clinic(uuid) to anon, authenticated;
grant execute on function app_private.get_sibling_clinic_ids(uuid) to authenticated;
grant execute on function app_private.is_admin() to anon, authenticated;
grant execute on function app_private.user_role() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function app_private.custom_access_token_hook(jsonb) to supabase_auth_admin';
  end if;
end
$$;

commit;
