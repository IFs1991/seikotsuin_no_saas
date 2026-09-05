begin;

set local search_path = pg_catalog, extensions, public;
set local role postgres;

grant usage on schema extensions
  to session_user, anon, authenticated, service_role;

-- The production ACL remains SELECT-only. These transaction-local grants make
-- the test exercise the split RLS predicates themselves rather than stop first
-- at the table privilege boundary; the final ROLLBACK removes every grant.
grant insert, update, delete
on table
  public.customer_insurance_coverages,
  public.menu_billing_profiles
to authenticated;

reset role;

select plan(52);

select is(
  (
    select count(*)
    from pg_class index_catalog
    join pg_namespace namespace_catalog
      on namespace_catalog.oid = index_catalog.relnamespace
    where namespace_catalog.nspname = 'public'
      and index_catalog.relkind = 'i'
      and obj_description(index_catalog.oid, 'pg_class') like 'PR-11:%'
  ),
  41::bigint,
  'PR-11 creates exactly 41 provenance-tagged FK indexes'
);

select is(
  (
    with actual as (
      select
        index_catalog.relname,
        constraint_catalog.convalidated,
        constraint_catalog.confmatchtype,
        fk_columns.columns as fk_columns,
        fk_columns.expected_predicate,
        index_columns.columns as index_columns,
        case
          when index_data.indpred is null then null
          else regexp_replace(
            lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
            '[()[:space:]\"]',
            '',
            'g'
          )
        end as predicate_fingerprint,
        access_method.amname,
        index_data.indisunique,
        index_data.indisvalid,
        index_data.indisready,
        index_data.indislive,
        index_data.indexprs is null as has_no_expressions
      from pg_class index_catalog
      join pg_namespace namespace_catalog
        on namespace_catalog.oid = index_catalog.relnamespace
      join pg_index index_data on index_data.indexrelid = index_catalog.oid
      join pg_am access_method on access_method.oid = index_catalog.relam
      left join pg_constraint constraint_catalog
        on constraint_catalog.conrelid = index_data.indrelid
       and constraint_catalog.conname = regexp_replace(
         index_catalog.relname,
         '_idx$',
         '_fkey'
       )
       and constraint_catalog.contype = 'f'
      left join lateral (
        select
          array_agg(attribute_catalog.attname::name order by keys.ordinality)
            as columns,
          case
            when bool_or(not attribute_catalog.attnotnull) then string_agg(
              attribute_catalog.attname::text || 'isnotnull',
              'and' order by keys.ordinality
            )
            else null
          end as expected_predicate
        from unnest(constraint_catalog.conkey)
          with ordinality keys(attnum, ordinality)
        join pg_attribute attribute_catalog
          on attribute_catalog.attrelid = constraint_catalog.conrelid
         and attribute_catalog.attnum = keys.attnum
      ) fk_columns on true
      left join lateral (
        select array_agg(
          attribute_catalog.attname::name order by keys.ordinality
        ) filter (
          where keys.ordinality <= index_data.indnkeyatts
        ) as columns
        from unnest(index_data.indkey::smallint[])
          with ordinality keys(attnum, ordinality)
        join pg_attribute attribute_catalog
          on attribute_catalog.attrelid = index_data.indrelid
         and attribute_catalog.attnum = keys.attnum
      ) index_columns on true
      where namespace_catalog.nspname = 'public'
        and obj_description(index_catalog.oid, 'pg_class') like 'PR-11:%'
    )
    select count(*)
    from actual
    where not convalidated
       or confmatchtype <> 's'
       or fk_columns <> index_columns
       or predicate_fingerprint is distinct from expected_predicate
       or amname <> 'btree'
       or indisunique
       or not indisvalid
       or not indisready
       or not indislive
       or not has_no_expressions
       or convalidated is null
  ),
  0::bigint,
  'all 41 indexes exactly cover validated MATCH SIMPLE FKs with reviewed full/partial predicates'
);

select is(
  (
    with expected(table_name, constraint_name, key_columns) as (
      values
        ('appointments', 'appointments_cancelled_by_fkey', 'cancelled_by'),
        ('appointments', 'appointments_created_by_fkey', 'created_by'),
        ('clinic_feature_flags', 'clinic_feature_flags_updated_by_fkey', 'updated_by'),
        ('clinic_settings', 'clinic_settings_updated_by_fkey', 'updated_by'),
        ('csp_violations', 'csp_violations_reviewed_by_fkey', 'reviewed_by'),
        ('insurance_fee_items', 'insurance_fee_items_source_id_fkey', 'source_id'),
        ('insurance_fee_items', 'insurance_fee_items_source_snapshot_fkey', 'source_id+source_snapshot_hash'),
        ('insurance_fee_revision_diffs', 'insurance_fee_revision_diffs_new_schedule_fkey', 'new_schedule_code'),
        ('insurance_fee_revision_diffs', 'insurance_fee_revision_diffs_reviewed_by_fkey', 'reviewed_by'),
        ('insurance_fee_schedules', 'insurance_fee_schedules_replacement_fkey', 'replacement_schedule_code'),
        ('insurance_fee_schedules', 'insurance_fee_schedules_source_id_fkey', 'source_id'),
        ('insurance_fee_schedules', 'insurance_fee_schedules_source_snapshot_fkey', 'source_id+source_snapshot_hash'),
        ('insurance_fee_schedules', 'insurance_fee_schedules_supersedes_fkey', 'supersedes_schedule_code'),
        ('menu_template_billing_profiles', 'menu_template_billing_profiles_created_by_fkey', 'created_by'),
        ('menu_template_billing_profiles', 'menu_template_billing_profiles_menu_template_id_fkey', 'menu_template_id'),
        ('menu_template_billing_profiles', 'menu_template_billing_profiles_revenue_context_code_fkey', 'revenue_context_code'),
        ('menu_template_billing_profiles', 'menu_template_billing_profiles_updated_by_fkey', 'updated_by'),
        ('menu_templates', 'menu_templates_created_by_fkey', 'created_by'),
        ('mfa_setup_sessions', 'fk_mfa_setup_clinic', 'clinic_id'),
        ('patient_outreach_recipients', 'patient_outreach_recipients_campaign_clinic_fkey', 'campaign_id+clinic_id'),
        ('patient_outreach_recipients', 'patient_outreach_recipients_customer_clinic_fkey', 'customer_id+clinic_id'),
        ('reservations', 'reservations_campaign_clinic_fkey', 'campaign_id+clinic_id'),
        ('revenue_estimate_lines', 'revenue_estimate_lines_source_snapshot_hash_fkey', 'source_snapshot_hash'),
        ('revenue_estimate_overrides', 'revenue_estimate_overrides_created_by_fkey', 'created_by'),
        ('revenue_estimate_overrides', 'revenue_estimate_overrides_estimate_id_fkey', 'revenue_estimate_id'),
        ('revenue_estimates', 'revenue_estimates_context_fkey', 'revenue_context_code'),
        ('revenue_estimates', 'revenue_estimates_created_by_fkey', 'created_by'),
        ('revenue_estimates', 'revenue_estimates_source_snapshot_hash_fkey', 'source_snapshot_hash'),
        ('revenue_estimates', 'revenue_estimates_updated_by_fkey', 'updated_by'),
        ('revenue_estimates', 'revenue_estimates_used_schedule_code_fkey', 'used_schedule_code'),
        ('revenues', 'revenues_category_id_fkey', 'category_id'),
        ('revenues', 'revenues_patient_id_fkey', 'patient_id'),
        ('revenues', 'revenues_patient_type_id_fkey', 'patient_type_id'),
        ('revenues', 'revenues_payment_method_id_fkey', 'payment_method_id'),
        ('revenues', 'revenues_visit_id_fkey', 'visit_id'),
        ('security_alerts', 'security_alerts_resolved_by_fkey', 'resolved_by'),
        ('security_events', 'security_events_session_id_fkey', 'session_id'),
        ('session_policies', 'session_policies_created_by_fkey', 'created_by'),
        ('session_policies', 'session_policies_updated_by_fkey', 'updated_by'),
        ('shift_request_periods', 'shift_request_periods_created_by_fkey', 'created_by'),
        ('staff_invites', 'staff_invites_accepted_by_fkey', 'accepted_by'),
        ('staff_performance', 'staff_performance_clinic_id_fkey', 'clinic_id'),
        ('stripe_webhook_events', 'stripe_webhook_events_related_org_root_clinic_id_fkey', 'related_org_root_clinic_id'),
        ('treatments', 'treatments_clinic_id_fkey', 'clinic_id'),
        ('treatments', 'treatments_patient_id_fkey', 'patient_id'),
        ('treatments', 'treatments_primary_staff_id_fkey', 'primary_staff_id'),
        ('user_sessions', 'user_sessions_created_by_fkey', 'created_by'),
        ('user_sessions', 'user_sessions_revoked_by_fkey', 'revoked_by'),
        ('visits', 'visits_patient_id_fkey', 'patient_id'),
        ('visits', 'visits_therapist_id_fkey', 'therapist_id')
    ), actual as (
      select
        table_catalog.relname::text as table_name,
        constraint_catalog.conname::text as constraint_name,
        string_agg(
          attribute_catalog.attname::text,
          '+' order by keys.ordinality
        ) as key_columns
      from pg_constraint constraint_catalog
      join pg_class table_catalog on table_catalog.oid = constraint_catalog.conrelid
      join unnest(constraint_catalog.conkey)
        with ordinality keys(attnum, ordinality) on true
      join pg_attribute attribute_catalog
        on attribute_catalog.attrelid = constraint_catalog.conrelid
       and attribute_catalog.attnum = keys.attnum
      where constraint_catalog.contype = 'f'
        and constraint_catalog.connamespace = 'public'::regnamespace
        and not exists (
          select 1
          from pg_index index_data
          where index_data.indrelid = constraint_catalog.conrelid
            and index_data.indisvalid
            and index_data.indisready
            and index_data.indnkeyatts >= cardinality(constraint_catalog.conkey)
            and (
              select array_agg(keys.attnum order by keys.ordinality)
              from unnest(index_data.indkey::smallint[])
                with ordinality keys(attnum, ordinality)
              where keys.ordinality <= cardinality(constraint_catalog.conkey)
            ) = constraint_catalog.conkey
        )
      group by table_catalog.relname, constraint_catalog.conname
    ), drift_rows as (
      (select table_name, constraint_name, key_columns from expected
       except select table_name, constraint_name, key_columns from actual)
      union all
      (select table_name, constraint_name, key_columns from actual
       except select table_name, constraint_name, key_columns from expected)
    )
    select count(*) from drift_rows
  ),
  0::bigint,
  'unindexed FK residual is exactly the reviewed 3 active paths plus 12 legacy and 35 unclassified constraints'
);

create function pg_temp.pr11_explain(statement_text text)
returns jsonb
language plpgsql
security invoker
as $function$
declare
  result_data jsonb;
begin
  execute 'explain (costs off, format json) ' || statement_text
    into result_data;
  return result_data;
end
$function$;

set local enable_seqscan = off;

select alike(
  pg_temp.pr11_explain($query$
    select customer_id, clinic_id
    from public.patient_outreach_recipients
    where customer_id = 'fb110000-0000-4000-8000-000000000010'::uuid
      and clinic_id = 'fb110000-0000-4000-8000-000000000001'::uuid
  $query$)::text,
  '%patient_outreach_recipients_customer_idx%',
  'the reviewed reverse customer/clinic index remains plan-eligible'
);

select alike(
  pg_temp.pr11_explain($query$
    select campaign_id, clinic_id
    from public.patient_outreach_recipients
    where campaign_id = 'fb110000-0000-4000-8000-000000000010'::uuid
  $query$)::text,
  '%patient_outreach_recipients_campaign_idx%',
  'the globally unique campaign prefix remains plan-eligible for recipients'
);

select alike(
  pg_temp.pr11_explain($query$
    select campaign_id, clinic_id
    from public.reservations
    where campaign_id = 'fb110000-0000-4000-8000-000000000010'::uuid
  $query$)::text,
  '%reservations_campaign_id_idx%',
  'the existing partial campaign index remains plan-eligible for reservations'
);

reset enable_seqscan;

select is(
  (select count(*) from pg_policies where schemaname = 'public'),
  183::bigint,
  'public policy count is the reviewed PR-11 total'
);

select is(
  (
    select count(*)
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
  ),
  0::bigint,
  'the two reviewed ALL policies are retired'
);

select is(
  (
    with components as (
      select
        policy_data.tablename,
        policy_data.permissive,
        policy_data.roles,
        policy_data.cmd,
        policy_data.qual,
        policy_data.with_check,
        obj_description(policy_catalog.oid, 'pg_policy') as intent_comment
      from pg_policies policy_data
      join pg_class table_catalog
        on table_catalog.oid = format(
          '%I.%I',
          policy_data.schemaname,
          policy_data.tablename
        )::regclass
      join pg_policy policy_catalog
        on policy_catalog.polrelid = table_catalog.oid
       and policy_catalog.polname = policy_data.policyname
      where policy_data.schemaname = 'public'
        and policy_data.tablename in (
          'customer_insurance_coverages',
          'menu_billing_profiles'
        )
        and policy_data.policyname like '%_for_clinic_pricing_admin'
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
    select count(*)
    from grouped
    where policy_count = 3
      and valid_metadata_count = 3
      and valid_shape_count = 3
      and update_qual = update_check
      and insert_check = update_check
      and delete_qual = update_qual
      and md5(
        coalesce(update_qual, '<NULL>')
        || chr(10)
        || coalesce(update_check, '<NULL>')
      ) = '90836fd21bf2ea809a99a9fe167a69a5'
  ),
  2::bigint,
  'both split policy sets preserve the exact retired write predicate'
);

select is(
  (
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
      and policy_data.cmd = 'SELECT'
      and policy_data.roles = array['authenticated']::name[]
      and policy_data.with_check is null
      and md5(
        coalesce(policy_data.qual, '<NULL>')
        || chr(10)
        || coalesce(policy_data.with_check, '<NULL>')
      ) = '633cd3f3b42e72d9ffdc0127f68b1a89'
  ),
  2::bigint,
  'the broader staff SELECT policies match the exact permanent statement-scope state'
);

select is(
  (
    select count(*)
    from pg_proc function_data
    join pg_roles owner_data on owner_data.oid = function_data.proowner
    join pg_language language_data on language_data.oid = function_data.prolang
    where function_data.oid =
        'app_private.get_current_accessible_clinic_ids()'::regprocedure
      and owner_data.rolname = 'postgres'
      and language_data.lanname = 'sql'
      and function_data.provolatile = 's'
      and function_data.proparallel = 'u'
      and function_data.prosecdef
      and function_data.proconfig =
        array['search_path=pg_catalog']::text[]
      and md5(pg_get_functiondef(function_data.oid)) =
        'bae22e5fdf92404e1202dd2f891a359a'
      and md5(coalesce(array_to_string(function_data.proacl, ','), '<NULL>')) =
        'dd8ce70fc976f9580b16e8826c5ecaa0'
  ),
  1::bigint,
  'statement-scope helper has the exact definition, owner, config, and ACL'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.get_current_accessible_clinic_ids()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'app_private.get_current_accessible_clinic_ids()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.get_current_accessible_clinic_ids()',
    'EXECUTE'
  ),
  'statement-scope helper is executable only by authenticated clients'
);

select is(
  (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_class table_class on table_class.oid = index_data.indrelid
    join pg_namespace namespace_data
      on namespace_data.oid = table_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    where namespace_data.nspname = 'public'
      and index_class.relname in (
        'customer_insurance_coverages_clinic_id_id_idx',
        'menu_billing_profiles_clinic_id_id_idx'
      )
      and access_method.amname = 'btree'
      and not index_data.indisunique
      and index_data.indpred is null
      and index_data.indexprs is null
      and index_data.indnkeyatts = 2
      and index_data.indnatts = 2
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and obj_description(index_data.indexrelid, 'pg_class') =
        'PR-11-FIX: statement-scope SELECT support ordered by clinic_id and id.'
      and (
        select array_agg(
          attribute_data.attname::text
          order by key_data.ordinality
        )
        from unnest(index_data.indkey::smallint[])
          with ordinality key_data(attnum, ordinality)
        join pg_attribute attribute_data
          on attribute_data.attrelid = index_data.indrelid
         and attribute_data.attnum = key_data.attnum
      ) = array['clinic_id', 'id']::text[]
  ),
  2::bigint,
  'both permanent statement-scope indexes have the exact plain B-tree contract'
);

select is(
  (
    select count(*)
    from pg_policy policy_catalog
    join pg_class table_catalog on table_catalog.oid = policy_catalog.polrelid
    join pg_namespace namespace_catalog
      on namespace_catalog.oid = table_catalog.relnamespace
    where namespace_catalog.nspname = 'public'
      and coalesce(obj_description(policy_catalog.oid, 'pg_policy'), '')
          !~ '^PR-(03|11):'
  ),
  0::bigint,
  'all policies retain reviewed PR-03 or PR-11 provenance comments'
);

select is(
  (
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
    select count(*) from drift_rows
  ),
  0::bigint,
  'exactly the 16 reviewed multiple-permissive policy identities remain'
);

select is(
  (
    select count(*)
    from pg_policies policy_data
    where policy_data.schemaname = 'public'
      and policy_data.permissive = 'PERMISSIVE'
      and policy_data.roles = array['authenticated']::name[]
      and (
        (
          policy_data.tablename = 'calendar_feed_tokens'
          and policy_data.policyname in (
            'calendar_feed_tokens_select_scoped',
            'calendar_feed_tokens_write_admin_only'
          )
        )
        or (
          policy_data.tablename = 'menus'
          and policy_data.policyname in (
            'menus_select_for_managers',
            'menus_select_for_staff'
          )
        )
      )
  ),
  4::bigint,
  'calendar owner-decision and menu role-split exceptions remain unchanged'
);

select is(
  (
    select count(*)
    from pg_class table_catalog
    where table_catalog.oid in (
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and not table_catalog.relrowsecurity
  ),
  0::bigint,
  'RLS remains enabled on both split-policy tables'
);

set local role anon;

select throws_ok(
  'select * from public.customer_insurance_coverages limit 0',
  '42501',
  null::text,
  'anon cannot access insurance coverage directly'
);

select throws_ok(
  'select * from public.menu_billing_profiles limit 0',
  '42501',
  null::text,
  'anon cannot access menu billing profiles directly'
);

reset role;
set local role postgres;

insert into public.clinics (id, name, parent_id)
values
  (
    'fb110000-0000-4000-8000-000000001000',
    '__commercial_pr11_tenant_a__',
    null
  ),
  (
    'fb110000-0000-4000-8000-000000002000',
    '__commercial_pr11_tenant_b__',
    null
  ),
  (
    'fb110000-0000-4000-8000-000000001001',
    '__commercial_pr11_clinic_a__',
    'fb110000-0000-4000-8000-000000001000'
  ),
  (
    'fb110000-0000-4000-8000-000000001002',
    '__commercial_pr11_clinic_b__',
    'fb110000-0000-4000-8000-000000002000'
  );

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
select
  actor.id,
  actor.email,
  extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  'authenticated'
from (
  values
    (
      'fb110000-0000-4000-8000-000000001010'::uuid,
      'commercial-pr11-clinic-admin@example.invalid'
    ),
    (
      'fb110000-0000-4000-8000-000000001020'::uuid,
      'commercial-pr11-manager@example.invalid'
    ),
    (
      'fb110000-0000-4000-8000-000000001030'::uuid,
      'commercial-pr11-therapist@example.invalid'
    ),
    (
      'fb110000-0000-4000-8000-000000001040'::uuid,
      'commercial-pr11-staff@example.invalid'
    )
) actor(id, email);

insert into public.profiles (
  user_id,
  clinic_id,
  email,
  full_name,
  role,
  is_active
)
select id, 'fb110000-0000-4000-8000-000000001001', email, full_name, role, true
from (
  values
    ('fb110000-0000-4000-8000-000000001010'::uuid, 'commercial-pr11-clinic-admin@example.invalid', 'PR11 Clinic Admin', 'clinic_admin'),
    ('fb110000-0000-4000-8000-000000001020'::uuid, 'commercial-pr11-manager@example.invalid', 'PR11 Manager', 'manager'),
    ('fb110000-0000-4000-8000-000000001030'::uuid, 'commercial-pr11-therapist@example.invalid', 'PR11 Therapist', 'therapist'),
    ('fb110000-0000-4000-8000-000000001040'::uuid, 'commercial-pr11-staff@example.invalid', 'PR11 Staff', 'staff')
) actor(id, email, full_name, role);

insert into public.staff (id, clinic_id, name, role, email, password_hash)
select id, 'fb110000-0000-4000-8000-000000001001', full_name, role, email, 'not-used'
from (
  values
    ('fb110000-0000-4000-8000-000000001010'::uuid, 'commercial-pr11-clinic-admin@example.invalid', 'PR11 Clinic Admin', 'clinic_admin'),
    ('fb110000-0000-4000-8000-000000001020'::uuid, 'commercial-pr11-manager@example.invalid', 'PR11 Manager', 'manager'),
    ('fb110000-0000-4000-8000-000000001030'::uuid, 'commercial-pr11-therapist@example.invalid', 'PR11 Therapist', 'therapist'),
    ('fb110000-0000-4000-8000-000000001040'::uuid, 'commercial-pr11-staff@example.invalid', 'PR11 Staff', 'staff')
) actor(id, email, full_name, role);

insert into public.user_permissions (
  staff_id,
  username,
  hashed_password,
  role,
  clinic_id
)
select id, username, 'not-used', role, 'fb110000-0000-4000-8000-000000001001'
from (
  values
    ('fb110000-0000-4000-8000-000000001010'::uuid, 'commercial-pr11-clinic-admin', 'clinic_admin'),
    ('fb110000-0000-4000-8000-000000001020'::uuid, 'commercial-pr11-manager', 'manager'),
    ('fb110000-0000-4000-8000-000000001030'::uuid, 'commercial-pr11-therapist', 'therapist'),
    ('fb110000-0000-4000-8000-000000001040'::uuid, 'commercial-pr11-staff', 'staff')
) actor(id, username, role);

insert into public.manager_clinic_assignments (
  manager_user_id,
  clinic_id,
  assigned_by
)
values (
  'fb110000-0000-4000-8000-000000001020',
  'fb110000-0000-4000-8000-000000001001',
  'fb110000-0000-4000-8000-000000001020'
);

insert into public.customers (id, name, phone, clinic_id)
values
  (
    'fb110000-0000-4000-8000-000000001100',
    'PR11 Customer A',
    '05000001100',
    'fb110000-0000-4000-8000-000000001001'
  ),
  (
    'fb110000-0000-4000-8000-000000001200',
    'PR11 Customer B',
    '05000001200',
    'fb110000-0000-4000-8000-000000001002'
  );

insert into public.menus (
  id,
  name,
  price,
  duration_minutes,
  clinic_id,
  is_active,
  is_deleted
)
values
  (
    'fb110000-0000-4000-8000-000000001300',
    'PR11 Menu A',
    1000,
    30,
    'fb110000-0000-4000-8000-000000001001',
    true,
    false
  ),
  (
    'fb110000-0000-4000-8000-000000001400',
    'PR11 Menu B',
    1000,
    30,
    'fb110000-0000-4000-8000-000000001002',
    true,
    false
  );

insert into public.customer_insurance_coverages (
  id,
  clinic_id,
  customer_id,
  patient_burden_rate,
  effective_from,
  verification_status
)
values
  (
    'fb110000-0000-4000-8000-000000001500',
    'fb110000-0000-4000-8000-000000001001',
    'fb110000-0000-4000-8000-000000001100',
    10,
    '2099-11-01',
    'needs_review'
  ),
  (
    'fb110000-0000-4000-8000-000000001600',
    'fb110000-0000-4000-8000-000000001002',
    'fb110000-0000-4000-8000-000000001200',
    10,
    '2099-11-01',
    'needs_review'
  );

insert into public.menu_billing_profiles (
  id,
  clinic_id,
  menu_id,
  revenue_context_code,
  calculation_method,
  effective_from
)
values
  (
    'fb110000-0000-4000-8000-000000001700',
    'fb110000-0000-4000-8000-000000001001',
    'fb110000-0000-4000-8000-000000001300',
    'private',
    'manual_estimate',
    '2099-11-01'
  ),
  (
    'fb110000-0000-4000-8000-000000001800',
    'fb110000-0000-4000-8000-000000001002',
    'fb110000-0000-4000-8000-000000001400',
    'private',
    'manual_estimate',
    '2099-11-01'
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000001010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000001001')
    )
  )::text,
  true
);

-- Do not reuse a postgres-created PL/pgSQL helper after SET ROLE. The pinned
-- local Supabase Postgres 17.6.1.104 image was observed to terminate the
-- backend while planning nested RLS EXPLAIN in that cross-role helper path.
-- Create both RLS helpers under the same database role that executes them; the
-- standalone psql plan probe exercises the same plans.
drop function pg_temp.pr11_explain(text);
set local role authenticated;

create function pg_temp.pr11_explain(statement_text text)
returns jsonb
language plpgsql
security invoker
as $function$
declare
  result_data jsonb;
begin
  execute 'explain (costs off, format json) ' || statement_text
    into result_data;
  return result_data;
end
$function$;

create function pg_temp.pr11_lower_role_write_denials(
  coverage_a_id uuid,
  coverage_b_id uuid,
  profile_a_id uuid,
  profile_b_id uuid,
  effective_date date
)
returns integer
language plpgsql
security invoker
as $function$
declare
  denied_count integer := 0;
  affected_rows bigint;
begin
  begin
    insert into public.customer_insurance_coverages (
      id,
      clinic_id,
      customer_id,
      patient_burden_rate,
      effective_from,
      verification_status
    ) values (
      coverage_a_id,
      'fb110000-0000-4000-8000-000000001001',
      'fb110000-0000-4000-8000-000000001100',
      10,
      effective_date,
      'needs_review'
    );
  exception when sqlstate '42501' then
    denied_count := denied_count + 1;
  end;

  begin
    insert into public.customer_insurance_coverages (
      id,
      clinic_id,
      customer_id,
      patient_burden_rate,
      effective_from,
      verification_status
    ) values (
      coverage_b_id,
      'fb110000-0000-4000-8000-000000001002',
      'fb110000-0000-4000-8000-000000001200',
      10,
      effective_date,
      'needs_review'
    );
  exception when sqlstate '23503' then
    denied_count := denied_count + 1;
  end;

  update public.customer_insurance_coverages
  set notes = 'must-remain-blocked-a'
  where id = 'fb110000-0000-4000-8000-000000001500';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  update public.customer_insurance_coverages
  set notes = 'must-remain-blocked-b'
  where id = 'fb110000-0000-4000-8000-000000001600';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  delete from public.customer_insurance_coverages
  where id = 'fb110000-0000-4000-8000-000000001500';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  delete from public.customer_insurance_coverages
  where id = 'fb110000-0000-4000-8000-000000001600';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  begin
    insert into public.menu_billing_profiles (
      id,
      clinic_id,
      menu_id,
      revenue_context_code,
      calculation_method,
      effective_from
    ) values (
      profile_a_id,
      'fb110000-0000-4000-8000-000000001001',
      'fb110000-0000-4000-8000-000000001300',
      'private',
      'manual_estimate',
      effective_date
    );
  exception when sqlstate '42501' then
    denied_count := denied_count + 1;
  end;

  begin
    insert into public.menu_billing_profiles (
      id,
      clinic_id,
      menu_id,
      revenue_context_code,
      calculation_method,
      effective_from
    ) values (
      profile_b_id,
      'fb110000-0000-4000-8000-000000001002',
      'fb110000-0000-4000-8000-000000001400',
      'private',
      'manual_estimate',
      effective_date
    );
  exception when sqlstate '23503' then
    denied_count := denied_count + 1;
  end;

  update public.menu_billing_profiles
  set profession_type = 'must-remain-blocked-a'
  where id = 'fb110000-0000-4000-8000-000000001700';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  update public.menu_billing_profiles
  set profession_type = 'must-remain-blocked-b'
  where id = 'fb110000-0000-4000-8000-000000001800';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  delete from public.menu_billing_profiles
  where id = 'fb110000-0000-4000-8000-000000001700';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  delete from public.menu_billing_profiles
  where id = 'fb110000-0000-4000-8000-000000001800';
  get diagnostics affected_rows = row_count;
  denied_count := denied_count + case when affected_rows = 0 then 1 else 0 end;

  return denied_count;
end
$function$;

select ok(
  position(
    $needle$'{admin,clinic_admin,manager,therapist,staff}'::text[]$needle$
    in pg_temp.pr11_explain($query$
      select id
      from public.customer_insurance_coverages
      where clinic_id = 'fb110000-0000-4000-8000-000000001001'
    $query$)::text
  ) > 0
  and position(
    $needle$'{admin,clinic_admin}'::text[]$needle$
    in pg_temp.pr11_explain($query$
      select id
      from public.customer_insurance_coverages
      where clinic_id = 'fb110000-0000-4000-8000-000000001001'
    $query$)::text
  ) = 0,
  'authenticated insurance SELECT plan keeps the broader role filter and drops the retired narrow ALL filter'
);

select ok(
  position(
    $needle$'{admin,clinic_admin,manager,therapist,staff}'::text[]$needle$
    in pg_temp.pr11_explain($query$
      select id
      from public.menu_billing_profiles
      where clinic_id = 'fb110000-0000-4000-8000-000000001001'
    $query$)::text
  ) > 0
  and position(
    $needle$'{admin,clinic_admin}'::text[]$needle$
    in pg_temp.pr11_explain($query$
      select id
      from public.menu_billing_profiles
      where clinic_id = 'fb110000-0000-4000-8000-000000001001'
    $query$)::text
  ) = 0,
  'authenticated menu billing SELECT plan keeps the broader role filter and drops the retired narrow ALL filter'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000001020',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000001001')
    )
  )::text,
  true
);

set local role authenticated;

select results_eq(
  $$select clinic_id::text from public.customer_insurance_coverages order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'manager reads insurance coverage for assigned tenant A only'
);

select results_eq(
  $$select clinic_id::text from public.menu_billing_profiles order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'manager reads menu billing profile for assigned tenant A only'
);

select throws_ok(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('fb110000-0000-4000-8000-000000002020', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001100', 10, '2099-12-01', 'needs_review')$$,
  '42501',
  null::text,
  'manager cannot insert tenant A insurance coverage'
);

select throws_ok(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('fb110000-0000-4000-8000-000000002021', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001300', 'private', 'manual_estimate', '2099-12-01')$$,
  '42501',
  null::text,
  'manager cannot insert tenant A menu billing profile'
);

select is(
  pg_temp.pr11_lower_role_write_denials(
    'fb110000-0000-4000-8000-000000003100',
    'fb110000-0000-4000-8000-000000003101',
    'fb110000-0000-4000-8000-000000003102',
    'fb110000-0000-4000-8000-000000003103',
    '2099-12-21'
  ),
  12,
  'manager cannot INSERT UPDATE or DELETE either protected table in tenant A or B'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000001030',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000001001')
    )
  )::text,
  true
);

set local role authenticated;

select results_eq(
  $$select clinic_id::text from public.customer_insurance_coverages order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'therapist reads insurance coverage for tenant A only'
);

select results_eq(
  $$select clinic_id::text from public.menu_billing_profiles order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'therapist reads menu billing profile for tenant A only'
);

select throws_ok(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('fb110000-0000-4000-8000-000000002030', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001100', 10, '2099-12-02', 'needs_review')$$,
  '42501',
  null::text,
  'therapist cannot insert tenant A insurance coverage'
);

select throws_ok(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('fb110000-0000-4000-8000-000000002031', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001300', 'private', 'manual_estimate', '2099-12-02')$$,
  '42501',
  null::text,
  'therapist cannot insert tenant A menu billing profile'
);

select is(
  pg_temp.pr11_lower_role_write_denials(
    'fb110000-0000-4000-8000-000000003200',
    'fb110000-0000-4000-8000-000000003201',
    'fb110000-0000-4000-8000-000000003202',
    'fb110000-0000-4000-8000-000000003203',
    '2099-12-22'
  ),
  12,
  'therapist cannot INSERT UPDATE or DELETE either protected table in tenant A or B'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000001040',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000001001')
    )
  )::text,
  true
);

set local role authenticated;

select results_eq(
  $$select clinic_id::text from public.customer_insurance_coverages order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'staff reads insurance coverage for tenant A only'
);

select results_eq(
  $$select clinic_id::text from public.menu_billing_profiles order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'staff reads menu billing profile for tenant A only'
);

select throws_ok(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('fb110000-0000-4000-8000-000000002040', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001100', 10, '2099-12-03', 'needs_review')$$,
  '42501',
  null::text,
  'staff cannot insert tenant A insurance coverage'
);

select throws_ok(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('fb110000-0000-4000-8000-000000002041', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001300', 'private', 'manual_estimate', '2099-12-03')$$,
  '42501',
  null::text,
  'staff cannot insert tenant A menu billing profile'
);

select results_eq(
  $$update public.customer_insurance_coverages set notes = 'blocked' where id = 'fb110000-0000-4000-8000-000000001500' returning id::text$$,
  $$select null::text where false$$,
  'staff cannot update tenant A insurance coverage'
);

select results_eq(
  $$delete from public.menu_billing_profiles where id = 'fb110000-0000-4000-8000-000000001700' returning id::text$$,
  $$select null::text where false$$,
  'staff cannot delete tenant A menu billing profile'
);

select is(
  pg_temp.pr11_lower_role_write_denials(
    'fb110000-0000-4000-8000-000000003300',
    'fb110000-0000-4000-8000-000000003301',
    'fb110000-0000-4000-8000-000000003302',
    'fb110000-0000-4000-8000-000000003303',
    '2099-12-23'
  ),
  12,
  'staff cannot INSERT UPDATE or DELETE either protected table in tenant A or B'
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fb110000-0000-4000-8000-000000001010',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'clinic_scope_ids',
      jsonb_build_array('fb110000-0000-4000-8000-000000001001')
    )
  )::text,
  true
);

set local role authenticated;

select results_eq(
  $$select clinic_id::text from public.customer_insurance_coverages order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'clinic admin reads insurance coverage for tenant A only'
);

select results_eq(
  $$select clinic_id::text from public.menu_billing_profiles order by clinic_id$$,
  $$values ('fb110000-0000-4000-8000-000000001001'::text)$$,
  'clinic admin reads menu billing profile for tenant A only'
);

select results_eq(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('fb110000-0000-4000-8000-000000002010', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001100', 10, '2099-12-10', 'needs_review') returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002010'::text)$$,
  'clinic admin inserts tenant A insurance coverage'
);

select throws_ok(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('fb110000-0000-4000-8000-000000002011', 'fb110000-0000-4000-8000-000000001002', 'fb110000-0000-4000-8000-000000001200', 10, '2099-12-10', 'needs_review')$$,
  '23503',
  null::text,
  'clinic admin cannot insert tenant B insurance coverage'
);

select results_eq(
  $$update public.customer_insurance_coverages set notes = 'allowed-a' where id = 'fb110000-0000-4000-8000-000000002010' returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002010'::text)$$,
  'clinic admin updates tenant A insurance coverage'
);

select throws_ok(
  $$update public.customer_insurance_coverages set clinic_id = 'fb110000-0000-4000-8000-000000001002', customer_id = 'fb110000-0000-4000-8000-000000001200' where id = 'fb110000-0000-4000-8000-000000002010'$$,
  '23503',
  null::text,
  'clinic admin cannot re-home insurance coverage from tenant A to B'
);

select results_eq(
  $$delete from public.customer_insurance_coverages where id = 'fb110000-0000-4000-8000-000000002010' returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002010'::text)$$,
  'clinic admin deletes tenant A insurance coverage'
);

select results_eq(
  $$delete from public.customer_insurance_coverages where id = 'fb110000-0000-4000-8000-000000001600' returning id::text$$,
  $$select null::text where false$$,
  'clinic admin cannot delete tenant B insurance coverage'
);

select results_eq(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('fb110000-0000-4000-8000-000000002012', 'fb110000-0000-4000-8000-000000001001', 'fb110000-0000-4000-8000-000000001300', 'private', 'manual_estimate', '2099-12-10') returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002012'::text)$$,
  'clinic admin inserts tenant A menu billing profile'
);

select throws_ok(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('fb110000-0000-4000-8000-000000002013', 'fb110000-0000-4000-8000-000000001002', 'fb110000-0000-4000-8000-000000001400', 'private', 'manual_estimate', '2099-12-10')$$,
  '23503',
  null::text,
  'clinic admin cannot insert tenant B menu billing profile'
);

select results_eq(
  $$update public.menu_billing_profiles set profession_type = 'allowed-a' where id = 'fb110000-0000-4000-8000-000000002012' returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002012'::text)$$,
  'clinic admin updates tenant A menu billing profile'
);

select throws_ok(
  $$update public.menu_billing_profiles set clinic_id = 'fb110000-0000-4000-8000-000000001002', menu_id = 'fb110000-0000-4000-8000-000000001400' where id = 'fb110000-0000-4000-8000-000000002012'$$,
  '23503',
  null::text,
  'clinic admin cannot re-home menu billing profile from tenant A to B'
);

select results_eq(
  $$delete from public.menu_billing_profiles where id = 'fb110000-0000-4000-8000-000000002012' returning id::text$$,
  $$values ('fb110000-0000-4000-8000-000000002012'::text)$$,
  'clinic admin deletes tenant A menu billing profile'
);

select results_eq(
  $$delete from public.menu_billing_profiles where id = 'fb110000-0000-4000-8000-000000001800' returning id::text$$,
  $$select null::text where false$$,
  'clinic admin cannot delete tenant B menu billing profile'
);

reset role;

select * from finish();

rollback;
