-- Commercial hardening PR-09: DB-authoritative authentication and clinic scope.
-- @spec docs/stabilization/spec-commercial-auth-authority-v1.0.md
-- @rollback supabase/rollbacks/20260715083609_commercial_auth_authority_fail_closed_rollback.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, extensions, public;

do $pr09_preflight$
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260715043358'
  ) then
    raise exception 'PR-09 preflight: PR-08 migration 20260715043358 is required';
  end if;

  if to_regprocedure('app_private.get_current_role()') is null
     or to_regprocedure('app_private.get_current_clinic_id()') is null
     or to_regprocedure('app_private.jwt_clinic_id()') is null
     or to_regprocedure('app_private.jwt_is_admin()') is null
     or to_regprocedure('app_private.can_access_clinic(uuid)') is null
     or to_regprocedure('app_private.custom_access_token_hook(jsonb)') is null
  then
    raise exception 'PR-09 preflight: required app_private authority helpers are missing';
  end if;

  if to_regclass('public.user_permissions') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.clinics') is null
     or to_regclass('public.manager_clinic_assignments') is null
  then
    raise exception 'PR-09 preflight: required authority relations are missing';
  end if;
end
$pr09_preflight$;

create temporary table pr09_policy_authority_contract (
  table_name text not null,
  policy_name text not null,
  policy_command text not null,
  policy_permissive text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into pr09_policy_authority_contract (
  table_name,
  policy_name,
  policy_command,
  policy_permissive
)
values
  ('notifications', 'Users can view their own notifications', 'SELECT', 'PERMISSIVE'),
  ('beta_feedback', 'Admins can update feedback', 'UPDATE', 'PERMISSIVE'),
  ('beta_feedback', 'Admins can view all feedback', 'SELECT', 'PERMISSIVE'),
  ('beta_feedback', 'Users can insert their clinic feedback', 'INSERT', 'PERMISSIVE'),
  ('beta_feedback', 'Users can view their clinic feedback', 'SELECT', 'PERMISSIVE'),
  ('beta_usage_metrics', 'Admins can view all metrics', 'SELECT', 'PERMISSIVE'),
  ('beta_usage_metrics', 'Users can view their clinic metrics', 'SELECT', 'PERMISSIVE'),
  ('critical_incidents', 'Admins can manage incidents', 'ALL', 'PERMISSIVE'),
  ('critical_incidents', 'Affected clinics can view their incidents', 'SELECT', 'PERMISSIVE'),
  ('improvement_backlog', 'improvement_backlog_admin_delete', 'DELETE', 'PERMISSIVE'),
  ('improvement_backlog', 'improvement_backlog_admin_insert', 'INSERT', 'PERMISSIVE'),
  ('improvement_backlog', 'improvement_backlog_admin_update', 'UPDATE', 'PERMISSIVE'),
  ('mfa_usage_stats', 'mfa_usage_stats_select_policy', 'SELECT', 'PERMISSIVE'),
  ('user_mfa_settings', 'user_mfa_settings_select_policy', 'SELECT', 'PERMISSIVE'),
  ('staff_profiles', 'staff_profiles_select_scoped', 'SELECT', 'PERMISSIVE'),
  (
    'staff_clinic_memberships',
    'staff_clinic_memberships_select_scoped',
    'SELECT',
    'PERMISSIVE'
  ),
  (
    'clinic_feature_flags',
    'clinic_feature_flags_select_scoped',
    'SELECT',
    'PERMISSIVE'
  );

create temporary table pr09_retired_policy_contract (
  table_name text not null,
  policy_name text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into pr09_retired_policy_contract values
  ('staff_profiles', 'staff_profiles_write_admin_only'),
  (
    'staff_clinic_memberships',
    'staff_clinic_memberships_write_admin_only'
  ),
  ('clinic_feature_flags', 'clinic_feature_flags_write_admin_only');

do $pr09_policy_preflight$
begin
  if exists (
    select 1
    from pr09_policy_authority_contract expected
    left join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = expected.table_name
     and actual.policyname = expected.policy_name
    where actual.policyname is null
       or actual.cmd <> expected.policy_command
       or actual.permissive <> expected.policy_permissive
  ) then
    raise exception 'PR-09 preflight: reviewed authority policy identity/command drift';
  end if;

  if exists (
    select 1
    from pr09_retired_policy_contract expected
    left join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = expected.table_name
     and actual.policyname = expected.policy_name
    where actual.policyname is null
       or actual.cmd <> 'ALL'
       or actual.permissive <> 'PERMISSIVE'
  ) then
    raise exception 'PR-09 preflight: reviewed global write policy drift';
  end if;
end
$pr09_policy_preflight$;

-- Role is authoritative only when both the permission row and an explicitly
-- active profile exist for the current Auth subject.
create or replace function app_private.get_current_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (
      select case up.role::text
        when 'clinic_manager' then 'clinic_admin'
        else up.role::text
      end
      from public.user_permissions up
      join public.profiles p
        on p.user_id = up.staff_id
       and p.is_active is true
      where up.staff_id = (select auth.uid())
      limit 1
    ),
    ''::text
  )
$function$;

create or replace function app_private.get_current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select (
    select up.clinic_id
    from public.user_permissions up
    join public.profiles p
      on p.user_id = up.staff_id
     and p.is_active is true
    where up.staff_id = (select auth.uid())
    limit 1
  )
$function$;

-- Legacy names remain callable by existing policies but no longer read JWT
-- role or clinic claims.
create or replace function app_private.jwt_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select app_private.get_current_clinic_id()
$function$;

create or replace function app_private.jwt_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select app_private.get_current_role() = 'admin'
$function$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select app_private.get_current_role() = 'admin'
$function$;

create or replace function app_private.user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(nullif(app_private.get_current_role(), ''), 'anon')
$function$;

create or replace function app_private.can_access_clinic(target_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_primary_clinic_id uuid;
  v_parent_clinic_id uuid;
  v_root_clinic_id uuid;
  v_database_allows boolean := false;
  v_claims_text text;
  v_claims jsonb;
  v_jwt_scope jsonb;
  v_scope_ids uuid[];
begin
  if v_user_id is null or target_clinic_id is null then
    return false;
  end if;

  select
    case up.role::text
      when 'clinic_manager' then 'clinic_admin'
      else up.role::text
    end,
    up.clinic_id
  into v_role, v_primary_clinic_id
  from public.user_permissions up
  join public.profiles p
    on p.user_id = up.staff_id
   and p.is_active is true
  where up.staff_id = v_user_id
  limit 1;

  if not found or v_role is null or v_role = '' then
    return false;
  end if;

  if v_role = 'manager' then
    select exists (
      select 1
      from public.manager_clinic_assignments mca
      where mca.manager_user_id = v_user_id
        and mca.clinic_id = target_clinic_id
        and mca.revoked_at is null
    )
    into v_database_allows;
  elsif v_role = any (array['admin', 'clinic_admin']) then
    if v_primary_clinic_id is null then
      return false;
    end if;

    select c.parent_id
    into v_parent_clinic_id
    from public.clinics c
    where c.id = v_primary_clinic_id;

    if not found then
      return false;
    end if;

    v_root_clinic_id := coalesce(
      v_parent_clinic_id,
      v_primary_clinic_id
    );

    select exists (
      select 1
      from public.clinics c
      where c.id = target_clinic_id
        and (
          c.id = v_root_clinic_id
          or c.parent_id = v_root_clinic_id
        )
    )
    into v_database_allows;
  elsif v_role = any (array['therapist', 'staff']) then
    v_database_allows := target_clinic_id = v_primary_clinic_id;
  else
    return false;
  end if;

  if v_database_allows is distinct from true then
    return false;
  end if;

  -- JWT clinic scope intersection: an absent claim preserves DB scope; a
  -- present claim may only narrow it. Empty or malformed claims deny.
  v_claims_text := nullif(
    current_setting('request.jwt.claims', true),
    ''
  );

  if v_claims_text is null then
    return true;
  end if;

  begin
    v_claims := v_claims_text::jsonb;
  exception
    when invalid_text_representation then
      return false;
  end;

  if jsonb_typeof(v_claims -> 'app_metadata') = 'object'
     and (v_claims -> 'app_metadata') ? 'clinic_scope_ids'
  then
    v_jwt_scope := v_claims -> 'app_metadata' -> 'clinic_scope_ids';
  elsif v_claims ? 'clinic_scope_ids' then
    v_jwt_scope := v_claims -> 'clinic_scope_ids';
  else
    return true;
  end if;

  if jsonb_typeof(v_jwt_scope) <> 'array'
     or jsonb_array_length(v_jwt_scope) = 0
  then
    return false;
  end if;

  begin
    select array_agg(scope_value.value::uuid order by scope_value.value)
    into v_scope_ids
    from jsonb_array_elements_text(v_jwt_scope) scope_value(value);
  exception
    when invalid_text_representation then
      return false;
  end;

  if v_scope_ids is null
     or array_position(v_scope_ids, null::uuid) is not null
  then
    return false;
  end if;

  return target_clinic_id = any(v_scope_ids);
end
$function$;

create or replace function app_private.belongs_to_clinic(
  target_clinic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select app_private.can_access_clinic(target_clinic_id)
$function$;

create or replace function app_private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_claims jsonb;
  v_app_metadata jsonb;
  v_user_id uuid;
  v_subject_id uuid;
  v_user_role text;
  v_user_clinic_id uuid;
  v_parent_clinic_id uuid;
  v_root_clinic_id uuid;
  v_scope_ids uuid[];
begin
  if jsonb_typeof(event) <> 'object'
     or jsonb_typeof(event -> 'claims') <> 'object'
  then
    raise exception 'invalid custom access token hook event'
      using errcode = '22023';
  end if;

  begin
    v_user_id := (event ->> 'user_id')::uuid;
    v_subject_id := (event -> 'claims' ->> 'sub')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid custom access token hook subject'
        using errcode = '22023';
  end;

  if v_user_id is null
     or v_subject_id is null
     or v_user_id <> v_subject_id
  then
    raise exception 'custom access token hook subject mismatch'
      using errcode = '22023';
  end if;

  v_claims := event -> 'claims';
  v_app_metadata := case
    when jsonb_typeof(v_claims -> 'app_metadata') = 'object'
      then v_claims -> 'app_metadata'
    else '{}'::jsonb
  end;

  -- Clear stale custom authority before any DB lookup. Standard top-level
  -- role=authenticated and provider metadata remain untouched.
  v_claims := v_claims - 'user_role';
  v_claims := v_claims - 'clinic_id';
  v_claims := v_claims - 'clinic_scope_ids';
  v_app_metadata :=
    v_app_metadata
    - 'user_role'
    - 'role'
    - 'clinic_id'
    - 'clinic_scope_ids';
  v_claims := jsonb_set(
    v_claims,
    '{app_metadata}',
    v_app_metadata,
    true
  );

  select
    case up.role::text
      when 'clinic_manager' then 'clinic_admin'
      else up.role::text
    end,
    up.clinic_id
  into v_user_role, v_user_clinic_id
  from public.user_permissions up
  join public.profiles p
    on p.user_id = up.staff_id
   and p.is_active is true
  where up.staff_id = v_user_id
  limit 1;

  if not found
     or v_user_role is null
     or v_user_role not in (
       'admin',
       'clinic_admin',
       'manager',
       'therapist',
       'staff'
     )
  then
    return jsonb_set(event, '{claims}', v_claims, true);
  end if;

  if v_user_role = 'manager' then
    select array_agg(mca.clinic_id order by mca.clinic_id)
    into v_scope_ids
    from public.manager_clinic_assignments mca
    where mca.manager_user_id = v_user_id
      and mca.revoked_at is null;
  elsif v_user_role = any (array['admin', 'clinic_admin'])
        and v_user_clinic_id is not null
  then
    select c.parent_id
    into v_parent_clinic_id
    from public.clinics c
    where c.id = v_user_clinic_id;

    if found then
      v_root_clinic_id := coalesce(
        v_parent_clinic_id,
        v_user_clinic_id
      );

      select array_agg(c.id order by c.id)
      into v_scope_ids
      from public.clinics c
      where c.id = v_root_clinic_id
         or c.parent_id = v_root_clinic_id;
    end if;
  elsif v_user_clinic_id is not null then
    v_scope_ids := array[v_user_clinic_id];
  end if;

  if coalesce(array_length(v_scope_ids, 1), 0) = 0 then
    return jsonb_set(event, '{claims}', v_claims, true);
  end if;

  v_claims := jsonb_set(
    v_claims,
    '{user_role}',
    to_jsonb(v_user_role),
    true
  );
  v_app_metadata := jsonb_set(
    v_app_metadata,
    '{user_role}',
    to_jsonb(v_user_role),
    true
  );

  if v_user_clinic_id is not null then
    v_claims := jsonb_set(
      v_claims,
      '{clinic_id}',
      to_jsonb(v_user_clinic_id),
      true
    );
    v_app_metadata := jsonb_set(
      v_app_metadata,
      '{clinic_id}',
      to_jsonb(v_user_clinic_id),
      true
    );
  end if;

  v_claims := jsonb_set(
    v_claims,
    '{clinic_scope_ids}',
    to_jsonb(v_scope_ids),
    true
  );
  v_app_metadata := jsonb_set(
    v_app_metadata,
    '{clinic_scope_ids}',
    to_jsonb(v_scope_ids),
    true
  );

  v_claims := jsonb_set(
    v_claims,
    '{app_metadata}',
    v_app_metadata,
    true
  );
  return jsonb_set(event, '{claims}', v_claims, true);
end
$function$;

comment on function app_private.get_current_role() is
  'PR-09 DB-authoritative application role; requires active profile and user_permissions.';
comment on function app_private.get_current_clinic_id() is
  'PR-09 DB-authoritative primary clinic; requires active profile and user_permissions.';
comment on function app_private.jwt_clinic_id() is
  'Legacy name retained as a DB-authoritative alias. It does not read JWT clinic claims.';
comment on function app_private.jwt_is_admin() is
  'Legacy name retained as a DB-authoritative alias. It does not read JWT role claims.';
comment on function app_private.can_access_clinic(uuid) is
  'PR-09 DB-authoritative clinic access with optional JWT scope intersection only.';
comment on function app_private.custom_access_token_hook(jsonb) is
  'PR-09 hook that clears stale authority and issues claims only from active DB authority rows.';

-- Preserve the exact PR-04 execution matrix while removing inherited grants.
revoke all on function app_private.get_current_role()
  from public, anon, authenticated, service_role;
grant execute on function app_private.get_current_role()
  to anon, authenticated, service_role;

revoke all on function app_private.get_current_clinic_id()
  from public, anon, authenticated, service_role;
grant execute on function app_private.get_current_clinic_id()
  to anon, authenticated, service_role;

revoke all on function app_private.jwt_clinic_id()
  from public, anon, authenticated, service_role;
grant execute on function app_private.jwt_clinic_id()
  to anon, authenticated, service_role;

revoke all on function app_private.jwt_is_admin()
  from public, anon, authenticated, service_role;
grant execute on function app_private.jwt_is_admin()
  to anon, authenticated, service_role;

revoke all on function app_private.is_admin()
  from public, anon, authenticated, service_role;
grant execute on function app_private.is_admin()
  to anon, authenticated, service_role;

revoke all on function app_private.user_role()
  from public, anon, authenticated, service_role;
grant execute on function app_private.user_role()
  to anon, authenticated, service_role;

revoke all on function app_private.can_access_clinic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.can_access_clinic(uuid)
  to anon, authenticated, service_role;

revoke all on function app_private.belongs_to_clinic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.belongs_to_clinic(uuid)
  to anon, authenticated, service_role;

revoke all on function app_private.custom_access_token_hook(jsonb)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function app_private.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- Remove the last policy-level direct JWT authority path.
alter policy "Users can view their own notifications"
on public.notifications
to authenticated
using (
  (select app_private.get_current_role()) <> ''
  and (
    (select auth.uid()) = user_id
    or (
      clinic_id is not null
      and (select app_private.get_current_role()) = any (
        array['admin'::text, 'clinic_admin'::text]
      )
      and app_private.can_access_clinic(clinic_id)
    )
  )
);

-- Replace profile.role / profile.clinic_id policy authority with the same
-- active DB permission helpers used by every other commercial policy.
alter policy "Admins can update feedback"
on public.beta_feedback
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and app_private.can_access_clinic(beta_feedback.clinic_id)
)
with check (
  (select app_private.get_current_role()) = 'admin'
  and app_private.can_access_clinic(beta_feedback.clinic_id)
);

alter policy "Admins can view all feedback"
on public.beta_feedback
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and app_private.can_access_clinic(beta_feedback.clinic_id)
);

alter policy "Users can insert their clinic feedback"
on public.beta_feedback
to authenticated
with check (app_private.can_access_clinic(beta_feedback.clinic_id));

alter policy "Users can view their clinic feedback"
on public.beta_feedback
to authenticated
using (app_private.can_access_clinic(beta_feedback.clinic_id));

alter policy "Admins can view all metrics"
on public.beta_usage_metrics
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and app_private.can_access_clinic(beta_usage_metrics.clinic_id)
);

alter policy "Users can view their clinic metrics"
on public.beta_usage_metrics
to authenticated
using (app_private.can_access_clinic(beta_usage_metrics.clinic_id));

alter policy "Admins can manage incidents"
on public.critical_incidents
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(critical_incidents.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(critical_incidents.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
)
with check (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(critical_incidents.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(critical_incidents.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
);

alter policy "Affected clinics can view their incidents"
on public.critical_incidents
to authenticated
using (
  exists (
    select 1
    from unnest(critical_incidents.affected_clinics) affected_clinic(clinic_id)
    where app_private.can_access_clinic(affected_clinic.clinic_id)
  )
);

alter policy improvement_backlog_admin_delete
on public.improvement_backlog
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(improvement_backlog.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(improvement_backlog.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
);

alter policy improvement_backlog_admin_insert
on public.improvement_backlog
to authenticated
with check (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(improvement_backlog.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(improvement_backlog.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
);

alter policy improvement_backlog_admin_update
on public.improvement_backlog
to authenticated
using (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(improvement_backlog.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(improvement_backlog.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
)
with check (
  (select app_private.get_current_role()) = 'admin'
  and coalesce(cardinality(improvement_backlog.affected_clinics), 0) > 0
  and not exists (
    select 1
    from unnest(improvement_backlog.affected_clinics) affected_clinic(clinic_id)
    where not app_private.can_access_clinic(affected_clinic.clinic_id)
  )
);

alter policy mfa_usage_stats_select_policy
on public.mfa_usage_stats
to authenticated
using (
  (select app_private.get_current_role()) = any (
    array['admin'::text, 'clinic_admin'::text, 'manager'::text]
  )
  and app_private.can_access_clinic(mfa_usage_stats.clinic_id)
);

alter policy user_mfa_settings_select_policy
on public.user_mfa_settings
to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.get_current_role()) <> ''
  )
  or (
    (select app_private.get_current_role()) = any (
      array['admin'::text, 'clinic_admin'::text, 'manager'::text]
    )
    and app_private.can_access_clinic(user_mfa_settings.clinic_id)
  )
);

-- These legacy permissive policies let an admin role bypass the canonical
-- clinic scope. Keep direct staff-profile reads self-only, keep clinic keyed
-- reads behind can_access_clinic(), and retire authenticated write policies.
-- All reviewed management writes already use a canonical-scope-bound service
-- client; a staff_profiles row has no clinic_id from which a safe direct
-- INSERT policy could derive tenant authority.
alter policy staff_profiles_select_scoped
on public.staff_profiles
to authenticated
using (
  (select app_private.get_current_role()) <> ''
  and user_id = (select auth.uid())
);

comment on policy staff_profiles_select_scoped
on public.staff_profiles is
  'PR-03: authenticated self-service staff identity read. PR-09 restricts it to an active linked subject.';

drop policy staff_profiles_write_admin_only
on public.staff_profiles;

alter policy staff_clinic_memberships_select_scoped
on public.staff_clinic_memberships
to authenticated
using (app_private.can_access_clinic(clinic_id));

comment on policy staff_clinic_memberships_select_scoped
on public.staff_clinic_memberships is
  'PR-03: authenticated clinic-scoped membership read. PR-09 removes global admin and owner bypasses.';

drop policy staff_clinic_memberships_write_admin_only
on public.staff_clinic_memberships;

alter policy clinic_feature_flags_select_scoped
on public.clinic_feature_flags
to authenticated
using (app_private.can_access_clinic(clinic_id));

comment on policy clinic_feature_flags_select_scoped
on public.clinic_feature_flags is
  'PR-03: authenticated clinic entitlement read. PR-09 removes the global admin bypass.';

drop policy clinic_feature_flags_write_admin_only
on public.clinic_feature_flags;

create temporary table pr09_function_contract (
  function_signature text primary key,
  expected_volatility "char" not null
) on commit drop;

insert into pr09_function_contract (
  function_signature,
  expected_volatility
)
values
  ('app_private.get_current_role()', 's'),
  ('app_private.get_current_clinic_id()', 's'),
  ('app_private.jwt_clinic_id()', 's'),
  ('app_private.jwt_is_admin()', 's'),
  ('app_private.is_admin()', 's'),
  ('app_private.user_role()', 's'),
  ('app_private.can_access_clinic(uuid)', 's'),
  ('app_private.belongs_to_clinic(uuid)', 's'),
  ('app_private.custom_access_token_hook(jsonb)', 'v');

create temporary table pr09_function_acl_contract (
  function_signature text not null,
  grantee_name text not null,
  primary key (function_signature, grantee_name)
) on commit drop;

insert into pr09_function_acl_contract (function_signature, grantee_name)
select helper.function_signature, grantee.grantee_name
from (
  values
    ('app_private.get_current_role()'),
    ('app_private.get_current_clinic_id()'),
    ('app_private.jwt_clinic_id()'),
    ('app_private.jwt_is_admin()'),
    ('app_private.is_admin()'),
    ('app_private.user_role()'),
    ('app_private.can_access_clinic(uuid)'),
    ('app_private.belongs_to_clinic(uuid)')
) helper(function_signature)
cross join (
  values ('anon'), ('authenticated'), ('service_role')
) grantee(grantee_name)
union all
select
  'app_private.custom_access_token_hook(jsonb)',
  'supabase_auth_admin';

do $pr09_postflight$
declare
  unsafe_policy_count bigint;
  acl_drift_count bigint;
begin
  if exists (
    select 1
    from pr09_function_contract expected
    left join pg_proc routine
      on routine.oid = to_regprocedure(expected.function_signature)
    left join pg_roles owner_role
      on owner_role.oid = routine.proowner
    where routine.oid is null
       or not routine.prosecdef
       or routine.provolatile <> expected.expected_volatility
       or routine.proconfig is distinct from
          array['search_path=pg_catalog']::text[]
       or owner_role.rolname <> 'postgres'
  ) then
    raise exception 'PR-09 postflight: function security contract drift';
  end if;

  with actual as (
    select
      routine.oid::regprocedure::text as function_signature,
      case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname::text
      end as grantee_name
    from pg_proc routine
    join pr09_function_contract expected
      on routine.oid = to_regprocedure(expected.function_signature)
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> routine.proowner
      and acl.privilege_type = 'EXECUTE'
  ), drift as (
    select *
    from (
      select * from pr09_function_acl_contract
      except
      select * from actual
    ) missing
    union all
    select *
    from (
      select * from actual
      except
      select * from pr09_function_acl_contract
    ) unexpected
  )
  select count(*) into acl_drift_count from drift;

  if acl_drift_count <> 0 then
    raise exception 'PR-09 postflight: function EXECUTE ACL drift';
  end if;

  if exists (
    select 1
    from pr09_policy_authority_contract expected
    left join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = expected.table_name
     and actual.policyname = expected.policy_name
    where actual.policyname is null
       or actual.roles <> array['authenticated']::name[]
       or actual.cmd <> expected.policy_command
       or actual.permissive <> expected.policy_permissive
  ) then
    raise exception 'PR-09 postflight: policy identity/role/command drift';
  end if;

  if exists (
    select 1
    from pr09_retired_policy_contract retired
    join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = retired.table_name
     and actual.policyname = retired.policy_name
  ) then
    raise exception 'PR-09 postflight: global admin write policy remains';
  end if;

  if exists (
    with expected (
      table_name,
      policy_name,
      policy_command,
      policy_permissive,
      policy_roles
    ) as (
      values
        (
          'staff_profiles',
          'staff_profiles_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'staff_clinic_memberships',
          'staff_clinic_memberships_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        ),
        (
          'clinic_feature_flags',
          'clinic_feature_flags_select_scoped',
          'SELECT',
          'PERMISSIVE',
          array['authenticated']::name[]
        )
    ), actual as (
      select
        policy_data.tablename,
        policy_data.policyname,
        policy_data.cmd,
        policy_data.permissive,
        policy_data.roles
      from pg_policies policy_data
      where policy_data.schemaname = 'public'
        and policy_data.tablename in (
          'staff_profiles',
          'staff_clinic_memberships',
          'clinic_feature_flags'
        )
    ), drift as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from drift
  ) then
    raise exception 'PR-09 postflight: staff or feature policy set drift';
  end if;

  if exists (
    select 1
    from pg_policies actual
    cross join lateral (
      select lower(coalesce(actual.qual, '')) as expression_text
    ) normalized
    where actual.schemaname = 'public'
      and (
        (
          actual.tablename = 'staff_profiles'
          and actual.policyname = 'staff_profiles_select_scoped'
          and (
            position('app_private.get_current_role' in normalized.expression_text) = 0
            or position('auth.uid' in normalized.expression_text) = 0
            or position('app_private.can_access_clinic' in normalized.expression_text) > 0
            or position(' or ' in normalized.expression_text) > 0
          )
        )
        or (
          (actual.tablename, actual.policyname) in (
            values
              (
                'staff_clinic_memberships',
                'staff_clinic_memberships_select_scoped'
              ),
              (
                'clinic_feature_flags',
                'clinic_feature_flags_select_scoped'
              )
          )
          and (
            position('app_private.can_access_clinic' in normalized.expression_text) = 0
            or position('app_private.get_current_role' in normalized.expression_text) > 0
            or position('auth.uid' in normalized.expression_text) > 0
            or position(' or ' in normalized.expression_text) > 0
          )
        )
      )
  ) then
    raise exception 'PR-09 postflight: staff or feature policy scope drift';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.staff_profiles'),
        ('public.staff_clinic_memberships'),
        ('public.clinic_feature_flags')
    ) relation(table_name)
    cross join (
      values ('INSERT'), ('UPDATE'), ('DELETE')
    ) privilege(privilege_name)
    where has_table_privilege(
      'authenticated',
      relation.table_name,
      privilege.privilege_name
    )
  ) then
    raise exception 'PR-09 postflight: authenticated staff or feature write ACL remains';
  end if;

  if exists (
    select 1
    from information_schema.columns column_data
    cross join (
      values ('INSERT'), ('UPDATE')
    ) privilege(privilege_name)
    where column_data.table_schema = 'public'
      and column_data.table_name in (
        'staff_profiles',
        'staff_clinic_memberships',
        'clinic_feature_flags'
      )
      and has_column_privilege(
        'authenticated',
        format('%I.%I', column_data.table_schema, column_data.table_name),
        column_data.column_name,
        privilege.privilege_name
      )
  ) then
    raise exception 'PR-09 postflight: authenticated staff or feature column write ACL remains';
  end if;

  select count(*)
  into unsafe_policy_count
  from pg_policies policy_data
  cross join lateral (
    select lower(
      concat_ws(' ', policy_data.qual, policy_data.with_check)
    ) as policy_text
  ) normalized
  where policy_data.schemaname = 'public'
    and (
      position('auth.jwt()' in normalized.policy_text) > 0
      or position('request.jwt.claims' in normalized.policy_text) > 0
      or position('profiles.role' in normalized.policy_text) > 0
      or position('profiles.clinic_id' in normalized.policy_text) > 0
      or normalized.policy_text ~ '\m(p|profiles)\.(role|clinic_id)\M'
    );

  if unsafe_policy_count <> 0 then
    raise exception
      'PR-09 postflight: % direct JWT/profile authority policies remain',
      unsafe_policy_count;
  end if;

  if position(
    'request.jwt.claims'
    in lower(pg_get_functiondef(
      'app_private.get_current_role()'::regprocedure
    ))
  ) > 0
     or position(
       'request.jwt.claims'
       in lower(pg_get_functiondef(
         'app_private.get_current_clinic_id()'::regprocedure
       ))
     ) > 0
     or position(
       'request.jwt.claims'
       in lower(pg_get_functiondef(
         'app_private.jwt_clinic_id()'::regprocedure
       ))
     ) > 0
     or position(
       'request.jwt.claims'
       in lower(pg_get_functiondef(
         'app_private.jwt_is_admin()'::regprocedure
       ))
     ) > 0
  then
    raise exception 'PR-09 postflight: role/clinic helper still reads JWT authority';
  end if;
end
$pr09_postflight$;

commit;
