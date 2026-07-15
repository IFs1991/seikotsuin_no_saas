-- PR-09 security-preserving rollback guard.
-- Restoring JWT-first authority would reopen stale-token tenant access, so
-- recovery is validation-only and requires a reviewed forward-fix.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, extensions, public;

create temporary table pr09_recovery_function_contract (
  function_signature text primary key,
  expected_volatility "char" not null,
  expected_definition_hash text not null
) on commit drop;

insert into pr09_recovery_function_contract values
  ('app_private.get_current_role()', 's', '9a958630dac186149cb53585160a291f'),
  ('app_private.get_current_clinic_id()', 's', '4e2ecfb113eac6a771e6d35ccbd638e5'),
  ('app_private.jwt_clinic_id()', 's', '5c4b23efd15e1eb23f23da668ef976c9'),
  ('app_private.jwt_is_admin()', 's', '6b2bbc12bb95c0d8433c20ce7d37b471'),
  ('app_private.is_admin()', 's', '801479a62893f00c92ce0135bac5df3f'),
  ('app_private.user_role()', 's', 'b0df57c18aa437b4e7b949d499cc12f5'),
  ('app_private.can_access_clinic(uuid)', 's', '32e8af7c8ec5a9422333a6a950f19a83'),
  ('app_private.belongs_to_clinic(uuid)', 's', '411efc27e35f99c51004a4a6240b2f67'),
  ('app_private.custom_access_token_hook(jsonb)', 'v', '1e352eb436e6669584737bae11a2f003');

create temporary table pr09_recovery_acl_contract (
  function_signature text not null,
  grantee_name text not null,
  is_grantable boolean not null,
  primary key (function_signature, grantee_name)
) on commit drop;

insert into pr09_recovery_acl_contract
select helper.function_signature, grantee.grantee_name, false
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
  'supabase_auth_admin',
  false;

create temporary table pr09_recovery_policy_contract (
  table_name text not null,
  policy_name text not null,
  policy_command text not null,
  policy_permissive text not null,
  requires_role_helper boolean not null,
  requires_clinic_helper boolean not null,
  requires_owner_uid boolean not null,
  expected_expression_hash text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into pr09_recovery_policy_contract values
  ('notifications', 'Users can view their own notifications', 'SELECT', 'PERMISSIVE', true, true, true, '49ece1bf0bd8fc8da144400c3cba6efb'),
  ('beta_feedback', 'Admins can update feedback', 'UPDATE', 'PERMISSIVE', true, true, false, '1cd591bd68d9b50c1ed5d003b0a6901f'),
  ('beta_feedback', 'Admins can view all feedback', 'SELECT', 'PERMISSIVE', true, true, false, '2f7550f81c457a4385010c25d3e727fb'),
  ('beta_feedback', 'Users can insert their clinic feedback', 'INSERT', 'PERMISSIVE', false, true, false, '6f95dac25b45f0bb1ef43f6e267e065e'),
  ('beta_feedback', 'Users can view their clinic feedback', 'SELECT', 'PERMISSIVE', false, true, false, 'da44b69234ce8cbdf5aa8b6ddc6f8721'),
  ('beta_usage_metrics', 'Admins can view all metrics', 'SELECT', 'PERMISSIVE', true, true, false, '2f7550f81c457a4385010c25d3e727fb'),
  ('beta_usage_metrics', 'Users can view their clinic metrics', 'SELECT', 'PERMISSIVE', false, true, false, 'da44b69234ce8cbdf5aa8b6ddc6f8721'),
  ('critical_incidents', 'Admins can manage incidents', 'ALL', 'PERMISSIVE', true, true, false, '9c9428691af76f50c162e41fe1e41fdd'),
  ('critical_incidents', 'Affected clinics can view their incidents', 'SELECT', 'PERMISSIVE', false, true, false, '5fe378f476e085b37d9805eed056c81d'),
  ('improvement_backlog', 'improvement_backlog_admin_delete', 'DELETE', 'PERMISSIVE', true, true, false, 'a965838c92043aa98d401e2145887c8f'),
  ('improvement_backlog', 'improvement_backlog_admin_insert', 'INSERT', 'PERMISSIVE', true, true, false, '0eb56b13100f18efa57f95b1de4da38b'),
  ('improvement_backlog', 'improvement_backlog_admin_update', 'UPDATE', 'PERMISSIVE', true, true, false, 'bd74f94c881b36a9bbb1a6313e29fc12'),
  ('mfa_usage_stats', 'mfa_usage_stats_select_policy', 'SELECT', 'PERMISSIVE', true, true, false, '5df9ad5e1f8906bcbc6a3a101377df42'),
  ('user_mfa_settings', 'user_mfa_settings_select_policy', 'SELECT', 'PERMISSIVE', true, true, true, '0fa19a4e337cba39f9ee6a12b324320b'),
  ('staff_profiles', 'staff_profiles_select_scoped', 'SELECT', 'PERMISSIVE', true, false, true, '22a1bf04c479778807f495969721eb60'),
  ('staff_clinic_memberships', 'staff_clinic_memberships_select_scoped', 'SELECT', 'PERMISSIVE', false, true, false, 'da44b69234ce8cbdf5aa8b6ddc6f8721'),
  ('clinic_feature_flags', 'clinic_feature_flags_select_scoped', 'SELECT', 'PERMISSIVE', false, true, false, 'da44b69234ce8cbdf5aa8b6ddc6f8721');

create temporary table pr09_recovery_retired_policy_contract (
  table_name text not null,
  policy_name text not null,
  primary key (table_name, policy_name)
) on commit drop;

insert into pr09_recovery_retired_policy_contract values
  ('staff_profiles', 'staff_profiles_write_admin_only'),
  (
    'staff_clinic_memberships',
    'staff_clinic_memberships_write_admin_only'
  ),
  ('clinic_feature_flags', 'clinic_feature_flags_write_admin_only');

do $pr09_recovery_guard$
declare
  unsafe_policy_count bigint;
  acl_drift_count bigint;
  role_definition text;
  clinic_definition text;
  can_access_definition text;
  hook_definition text;
begin
  if exists (
    select 1
    from pr09_recovery_function_contract expected
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
       or md5(pg_get_functiondef(routine.oid))
          is distinct from expected.expected_definition_hash
  ) then
    raise exception
      'PR-09 recovery guard: authority function definition/owner/config drift; stop rollout and use a reviewed forward-fix';
  end if;

  with actual as (
    select
      routine.oid::regprocedure::text as function_signature,
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname::text end
        as grantee_name,
      acl.is_grantable
    from pg_proc routine
    join pr09_recovery_function_contract expected
      on routine.oid = to_regprocedure(expected.function_signature)
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where acl.grantee <> routine.proowner
      and acl.privilege_type = 'EXECUTE'
  ), drift as (
    (select * from pr09_recovery_acl_contract except select * from actual)
    union all
    (select * from actual except select * from pr09_recovery_acl_contract)
  )
  select count(*) into acl_drift_count from drift;

  if acl_drift_count <> 0 then
    raise exception
      'PR-09 recovery guard: authority function ACL drift; stop rollout and use a reviewed forward-fix';
  end if;

  if exists (
    select 1
    from pr09_recovery_policy_contract expected
    left join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = expected.table_name
     and actual.policyname = expected.policy_name
    where actual.policyname is null
       or actual.roles <> array['authenticated']::name[]
       or actual.cmd <> expected.policy_command
       or actual.permissive <> expected.policy_permissive
       or md5(
         coalesce(actual.qual, '<NULL>')
         || chr(10)
         || coalesce(actual.with_check, '<NULL>')
       ) is distinct from expected.expected_expression_hash
       or (
         expected.requires_role_helper
         and position(
           'app_private.get_current_role' in lower(
             concat_ws(' ', actual.qual, actual.with_check)
           )
         ) = 0
       )
       or (
         expected.requires_clinic_helper
         and position(
           'app_private.can_access_clinic' in lower(
             concat_ws(' ', actual.qual, actual.with_check)
           )
         ) = 0
       )
       or (
         expected.requires_owner_uid
         and position(
           'auth.uid' in lower(concat_ws(' ', actual.qual, actual.with_check))
         ) = 0
       )
  ) then
    raise exception
      'PR-09 recovery guard: policy identity/role/command/expression drift; stop rollout and use a reviewed forward-fix';
  end if;

  if exists (
    select 1
    from pr09_recovery_retired_policy_contract retired
    join pg_policies actual
      on actual.schemaname = 'public'
     and actual.tablename = retired.table_name
     and actual.policyname = retired.policy_name
  ) then
    raise exception
      'PR-09 recovery guard: retired global admin policy returned; stop rollout and use a reviewed forward-fix';
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
    raise exception
      'PR-09 recovery guard: staff or feature policy set drift; stop rollout and use a reviewed forward-fix';
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
    raise exception
      'PR-09 recovery guard: authenticated staff or feature write ACL returned; stop rollout and use a reviewed forward-fix';
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
    raise exception
      'PR-09 recovery guard: authenticated staff or feature column write ACL returned; stop rollout and use a reviewed forward-fix';
  end if;

  select lower(pg_get_functiondef('app_private.get_current_role()'::regprocedure))
    into role_definition;
  select lower(pg_get_functiondef('app_private.get_current_clinic_id()'::regprocedure))
    into clinic_definition;
  select lower(pg_get_functiondef('app_private.can_access_clinic(uuid)'::regprocedure))
    into can_access_definition;
  select lower(pg_get_functiondef('app_private.custom_access_token_hook(jsonb)'::regprocedure))
    into hook_definition;

  if position('public.user_permissions' in role_definition) = 0
     or position('public.profiles' in role_definition) = 0
     or position('request.jwt.claims' in role_definition) > 0
     or position('auth.jwt()' in role_definition) > 0
     or position('public.user_permissions' in clinic_definition) = 0
     or position('public.profiles' in clinic_definition) = 0
     or position('request.jwt.claims' in clinic_definition) > 0
     or position('auth.jwt()' in clinic_definition) > 0
  then
    raise exception
      'PR-09 recovery guard: role/clinic helper is no longer DB-authoritative';
  end if;

  if position('public.user_permissions' in can_access_definition) = 0
     or position('public.profiles' in can_access_definition) = 0
     or position('if v_database_allows is distinct from true' in can_access_definition) = 0
     or position('request.jwt.claims' in can_access_definition) = 0
     or position('if v_database_allows is distinct from true' in can_access_definition)
        > position('request.jwt.claims' in can_access_definition)
  then
    raise exception
      'PR-09 recovery guard: clinic helper lost DB-first JWT intersection';
  end if;

  if position('event ->> ''user_id''' in hook_definition) = 0
     or position('event -> ''claims'' ->> ''sub''' in hook_definition) = 0
     or position('v_user_id <> v_subject_id' in hook_definition) = 0
     or position('v_claims := v_claims - ''user_role''' in hook_definition) = 0
     or position('v_claims := v_claims - ''clinic_id''' in hook_definition) = 0
     or position('v_claims := v_claims - ''clinic_scope_ids''' in hook_definition) = 0
     or position('public.user_permissions' in hook_definition) = 0
     or position('public.profiles' in hook_definition) = 0
  then
    raise exception
      'PR-09 recovery guard: token hook subject/stale-clear contract drift';
  end if;

  select count(*)
  into unsafe_policy_count
  from pg_policies policy_data
  cross join lateral (
    select lower(concat_ws(' ', policy_data.qual, policy_data.with_check))
      as policy_text
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
      'PR-09 recovery guard: direct token/profile authority returned; stop rollout and use a reviewed forward-fix';
  end if;
end
$pr09_recovery_guard$;

rollback;
