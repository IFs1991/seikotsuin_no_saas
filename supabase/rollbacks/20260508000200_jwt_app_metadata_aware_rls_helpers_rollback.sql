-- Reverts supabase/migrations/20260508000200_jwt_app_metadata_aware_rls_helpers.sql.
-- Restores the previous public helper behavior that read top-level JWT claims
-- and user_permissions fallback.

begin;

set search_path = public, auth, extensions;

create or replace function public.get_current_role()
returns text
language plpgsql
stable
security definer
as $function$
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
$function$;

comment on function public.get_current_role() is
  '現在のユーザーのロールを取得。優先順位: JWT app_metadata > user_permissions テーブル。見つからない場合は空文字列を返す（最小権限原則）。';

create or replace function public.jwt_clinic_id()
returns uuid
language plpgsql
stable
security definer
as $function$
begin
  return (current_setting('request.jwt.claims', true)::json->>'clinic_id')::uuid;
exception when others then
  return null;
end;
$function$;

comment on function public.jwt_clinic_id() is
  'Returns clinic_id from JWT claims. O(1) performance, no DB lookup.';

create or replace function public.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
as $function$
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

  primary_clinic_id := public.jwt_clinic_id();

  if primary_clinic_id is null then
    return false;
  end if;

  return target_clinic_id = primary_clinic_id;
end;
$function$;

comment on function public.can_access_clinic(uuid) is
  'Checks if user can access target clinic using parent-scope model. Priority: clinic_scope_ids array > clinic_id fallback. Admin bypass REMOVED: admin is also scoped to their parent organization. O(1) JWT comparison, no DB lookup.';

commit;
