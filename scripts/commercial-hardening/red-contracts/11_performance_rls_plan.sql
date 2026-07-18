do $contract$
declare
  residual_drift text;
begin
  perform pg_catalog.set_config(
    'search_path',
    'pg_catalog, extensions, public',
    true
  );

  if (select count(*) from pg_policies where schemaname = 'public') <> 183 then
    raise exception
      'RED COMM-PERF-002: reviewed public policy count is not 183';
  end if;

  if exists (
    select 1
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and (policy_data.tablename, policy_data.policyname) in (
        values
          (
            'customer_insurance_coverages',
            'customer_insurance_coverages_write_for_clinic_pricing_admin'
          ),
          (
            'menu_billing_profiles',
            'menu_billing_profiles_write_for_clinic_pricing_admin'
          )
      )
  ) then
    raise exception 'RED COMM-PERF-002: reviewed ALL policy remains';
  end if;

  if exists (
    with expected(table_name, policy_name, command_name) as (
      values
        ('customer_insurance_coverages', 'customer_insurance_coverages_insert_for_clinic_pricing_admin', 'INSERT'),
        ('customer_insurance_coverages', 'customer_insurance_coverages_update_for_clinic_pricing_admin', 'UPDATE'),
        ('customer_insurance_coverages', 'customer_insurance_coverages_delete_for_clinic_pricing_admin', 'DELETE'),
        ('menu_billing_profiles', 'menu_billing_profiles_insert_for_clinic_pricing_admin', 'INSERT'),
        ('menu_billing_profiles', 'menu_billing_profiles_update_for_clinic_pricing_admin', 'UPDATE'),
        ('menu_billing_profiles', 'menu_billing_profiles_delete_for_clinic_pricing_admin', 'DELETE')
    ), components as (
      select
        expected.table_name as tablename,
        policy_data.policyname,
        policy_data.permissive,
        policy_data.roles,
        policy_data.cmd,
        policy_data.qual,
        policy_data.with_check,
        obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
      from expected
      left join pg_policies policy_data
        on policy_data.schemaname = 'public'
       and policy_data.tablename = expected.table_name
       and policy_data.policyname = expected.policy_name
      left join pg_class table_catalog
        on table_catalog.oid = format(
          'public.%I',
          expected.table_name
        )::regclass
      left join pg_policy policy_catalog
        on policy_catalog.polrelid = table_catalog.oid
       and policy_catalog.polname = expected.policy_name
    ), grouped as (
      select
        tablename,
        max(qual) filter (where cmd = 'UPDATE') as update_qual,
        max(with_check) filter (where cmd = 'UPDATE') as update_check,
        max(with_check) filter (where cmd = 'INSERT') as insert_check,
        max(qual) filter (where cmd = 'DELETE') as delete_qual,
        count(*) as policy_count,
        count(*) filter (
          where permissive = 'PERMISSIVE'
            and roles = array['authenticated']::name[]
            and intent_comment ~ '^PR-11:'
        ) as valid_metadata_count,
        count(*) filter (
          where (cmd = 'INSERT' and qual is null and with_check is not null)
             or (
               cmd = 'UPDATE'
               and qual is not null
               and with_check is not null
             )
             or (cmd = 'DELETE' and qual is not null and with_check is null)
        ) as valid_shape_count
      from components
      group by tablename
    )
    select 1
    from grouped
    where policy_count <> 3
       or valid_metadata_count <> 3
       or valid_shape_count <> 3
       or update_qual is distinct from update_check
       or insert_check is distinct from update_check
       or delete_qual is distinct from update_qual
       or md5(
         coalesce(update_qual, '<NULL>')
         || chr(10)
         || coalesce(update_check, '<NULL>')
       ) <> '90836fd21bf2ea809a99a9fe167a69a5'
  ) then
    raise exception
      'RED COMM-PERF-002: split policy role/predicate/comment contract drift';
  end if;

  if (
    select count(*)
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and (policy_data.tablename, policy_data.policyname) in (
        values
          (
            'customer_insurance_coverages',
            'customer_insurance_coverages_select_for_staff'
          ),
          (
            'menu_billing_profiles',
            'menu_billing_profiles_select_for_staff'
          )
      )
      and policy_data.permissive = 'PERMISSIVE'
      and policy_data.roles = array['authenticated']::name[]
      and policy_data.cmd = 'SELECT'
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '633cd3f3b42e72d9ffdc0127f68b1a89'
  ) <> 2 then
    raise exception
      'RED COMM-PERF-002: permanent statement-scope SELECT policy drift';
  end if;

  if (
    select count(*)
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and policy_data.permissive = 'PERMISSIVE'
      and policy_data.roles = array['authenticated']::name[]
      and (
        (policy_data.tablename = 'calendar_feed_tokens'
          and policy_data.policyname in (
            'calendar_feed_tokens_select_scoped',
            'calendar_feed_tokens_write_admin_only'
          ))
        or (policy_data.tablename = 'menus'
          and policy_data.policyname in (
            'menus_select_for_managers',
            'menus_select_for_staff'
          ))
      )
  ) <> 4 then
    raise exception
      'RED COMM-PERF-002: reviewed calendar/menu residual exception drift';
  end if;

  with expected(
    tablename,
    role_name,
    action_name,
    policy_names,
    policy_hashes
  ) as (
    values
      ('beta_feedback', 'authenticated', 'SELECT', 'Admins can view all feedback+Users can view their clinic feedback', '45f1d3e186c8e595c8057be5b26a568a+a6c4eda2103083a93eba244c2e930ba6'),
      ('beta_usage_metrics', 'authenticated', 'SELECT', 'Admins can view all metrics+Users can view their clinic metrics', '45f1d3e186c8e595c8057be5b26a568a+a6c4eda2103083a93eba244c2e930ba6'),
      ('calendar_feed_tokens', 'authenticated', 'SELECT', 'calendar_feed_tokens_select_scoped+calendar_feed_tokens_write_admin_only', '6807f37694ae6d95184dc674e6ec9a56+31b34b8a1c9b0d7d92bc4c5a32a764fa'),
      ('critical_incidents', 'authenticated', 'SELECT', 'Admins can manage incidents+Affected clinics can view their incidents', '692f50f85a3197c6df642119822bed22+7fa4176911622b7c0a87c8ff75d928e6'),
      ('menu_template_billing_profiles', 'authenticated', 'SELECT', 'menu_template_billing_profiles_select_for_managers+menu_template_billing_profiles_write_for_admin', '92b406ded0f3c4ae3bc3782c1422a324+05028cf3f1d70543e1872e24d518bb2c'),
      ('menus', 'authenticated', 'SELECT', 'menus_select_for_managers+menus_select_for_staff', 'cab20c8990cb470ed3c9302dcfa3b3e2+94f2432e007692bbf19548caa7a21957'),
      ('profiles', 'authenticated', 'SELECT', 'profiles_admin_select+profiles_self_select', 'c53d6792df6caf79f57a88848b7c9f81+b427e1895a53a153b8d73b1cb7974183'),
      ('registered_devices', 'authenticated', 'SELECT', 'registered_devices_admin_select+registered_devices_self_all', 'd4cc0631b3915f6f7fb81aceea4c6f70+8caf319316f93ac13f954e7024a8133d'),
      ('revenue_estimate_lines', 'authenticated', 'SELECT', 'revenue_estimate_lines_select_for_staff+revenue_estimate_lines_write_for_staff', '57472d058f7cc37bffe2fd9c33ec038c+109771e5857cff00a6f9494517bd442c'),
      ('revenue_estimate_warnings', 'authenticated', 'SELECT', 'revenue_estimate_warnings_select_for_staff+revenue_estimate_warnings_write_for_staff', '57472d058f7cc37bffe2fd9c33ec038c+109771e5857cff00a6f9494517bd442c'),
      ('revenue_estimates', 'authenticated', 'SELECT', 'revenue_estimates_select_for_staff+revenue_estimates_write_for_staff', '57472d058f7cc37bffe2fd9c33ec038c+109771e5857cff00a6f9494517bd442c'),
      ('security_events', 'authenticated', 'SELECT', 'security_events_admin_select+security_events_self_select', 'bc79e165cb135e0dd2d6c383a7f85103+c6a7a718b285d23adf95abaa5c6a924e'),
      ('session_policies', 'authenticated', 'SELECT', 'session_policies_admin_all+session_policies_staff_select', '9c905d933138cffbb4ba7fb218bd4dec+feddbfcf0a4b5c14377ca4843aa55550'),
      ('staff_invites', 'authenticated', 'SELECT', 'staff_invites_clinic_admin_select+staff_invites_creator_select', 'cab20c8990cb470ed3c9302dcfa3b3e2+e085bbfdb64557e00417cea47cdf9c54'),
      ('user_permissions', 'authenticated', 'SELECT', 'user_permissions_admin_manage+user_permissions_self_select', '9c905d933138cffbb4ba7fb218bd4dec+de42500678e4bb0e42026c6be18e840d'),
      ('user_sessions', 'authenticated', 'SELECT', 'user_sessions_admin_select+user_sessions_self_select', 'd4cc0631b3915f6f7fb81aceea4c6f70+f21313a175009038bfef70de8781777a')
  ), expanded as (
    select
      policy_data.tablename,
      role_name::text as role_name,
      action_name,
      policy_data.policyname,
      md5(
        policy_data.permissive
        || chr(10)
        || array_to_string(policy_data.roles, ',')
        || chr(10)
        || policy_data.cmd
        || chr(10)
        || coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) as policy_hash
    from pg_policies policy_data
    cross join lateral unnest(policy_data.roles) roles(role_name)
    cross join lateral unnest(
      case policy_data.cmd
        when 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
        else array[policy_data.cmd]::text[]
      end
    ) actions(action_name)
    where policy_data.schemaname = 'public'
      and policy_data.permissive = 'PERMISSIVE'
  ), actual as (
    select
      tablename,
      role_name,
      action_name,
      string_agg(policyname, '+' order by policyname) as policy_names,
      string_agg(policy_hash, '+' order by policyname) as policy_hashes
    from expanded
    group by tablename, role_name, action_name
    having count(*) > 1
  ), drift_rows as (
    (select * from expected except select * from actual)
    union all
    (select * from actual except select * from expected)
  )
  select string_agg(
    tablename || '/' || role_name || '/' || action_name,
    ', ' order by tablename, role_name, action_name
  )
  into residual_drift
  from drift_rows;

  if residual_drift is not null then
    raise exception
      'RED COMM-PERF-002: multiple-permissive residual identity drift (%)',
      residual_drift;
  end if;
end
$contract$;
