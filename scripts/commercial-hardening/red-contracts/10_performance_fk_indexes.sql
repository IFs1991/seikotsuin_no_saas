do $contract$
declare
  uncovered_targets text;
  residual_drift text;
begin
  perform pg_catalog.set_config(
    'search_path',
    'pg_catalog, extensions, public',
    true
  );

  with expected(index_name) as (
    values
      ('blocks_created_by_idx'),
      ('blocks_deleted_by_idx'),
      ('care_episodes_created_by_idx'),
      ('care_episodes_updated_by_idx'),
      ('clinic_line_credentials_updated_by_idx'),
      ('customer_insurance_coverages_created_by_idx'),
      ('customer_insurance_coverages_updated_by_idx'),
      ('customer_insurance_coverages_verified_by_idx'),
      ('customers_created_by_idx'),
      ('customers_deleted_by_idx'),
      ('daily_report_item_tags_created_by_idx'),
      ('daily_report_item_tags_tag_code_idx'),
      ('daily_report_item_tags_updated_by_idx'),
      ('daily_report_items_created_by_idx'),
      ('daily_report_items_revenue_context_code_idx'),
      ('daily_report_items_updated_by_idx'),
      ('daily_report_items_visit_stage_code_idx'),
      ('daily_reports_staff_id_idx'),
      ('manager_clinic_assignments_assigned_by_idx'),
      ('manager_clinic_assignments_revoked_by_idx'),
      ('menu_billing_profiles_created_by_idx'),
      ('menu_billing_profiles_revenue_context_code_idx'),
      ('menu_billing_profiles_source_template_profile_id_idx'),
      ('menu_billing_profiles_updated_by_idx'),
      ('menus_created_by_idx'),
      ('menus_deleted_by_idx'),
      ('patient_outreach_campaigns_created_by_idx'),
      ('patient_outreach_recipients_booked_reservation_clinic_idx'),
      ('reservation_history_created_by_idx'),
      ('reservation_notifications_email_outbox_id_idx'),
      ('reservations_created_by_idx'),
      ('reservations_deleted_by_idx'),
      ('resources_created_by_idx'),
      ('resources_deleted_by_idx'),
      ('shift_requests_reviewed_by_idx'),
      ('shift_requests_staff_id_idx'),
      ('shift_requests_submitted_by_idx'),
      ('staff_shifts_created_by_idx'),
      ('staff_shifts_home_clinic_id_idx'),
      ('staff_shifts_source_shift_request_id_idx'),
      ('staff_shifts_staff_profile_id_idx')
  ), actual as (
    select
      expected.index_name,
      constraint_data.convalidated,
      constraint_data.confmatchtype,
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
      index_data.indexprs is null as has_no_expressions,
      obj_description(index_data.indexrelid, 'pg_class') as intent_comment
    from expected
    left join pg_class index_class
      on index_class.oid = to_regclass(format('public.%I', expected.index_name))
    left join pg_index index_data on index_data.indexrelid = index_class.oid
    left join pg_am access_method on access_method.oid = index_class.relam
    left join pg_constraint constraint_data
      on constraint_data.conrelid = index_data.indrelid
     and constraint_data.conname = regexp_replace(
       expected.index_name,
       '_idx$',
       '_fkey'
     )
     and constraint_data.contype = 'f'
    left join lateral (
      select
        array_agg(attribute_data.attname::name order by keys.ordinality)
          as columns,
        case
          when bool_or(not attribute_data.attnotnull) then string_agg(
            attribute_data.attname::text || 'isnotnull',
            'and' order by keys.ordinality
          )
          else null
        end as expected_predicate
      from unnest(constraint_data.conkey)
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = constraint_data.conrelid
       and attribute_data.attnum = keys.attnum
    ) fk_columns on true
    left join lateral (
      select array_agg(attribute_data.attname::name order by keys.ordinality)
        filter (where keys.ordinality <= index_data.indnkeyatts) as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = index_data.indrelid
       and attribute_data.attnum = keys.attnum
    ) index_columns on true
  )
  select string_agg(index_name, ', ' order by index_name)
  into uncovered_targets
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
     or intent_comment is distinct from format(
       'PR-11: supports %s with reviewed %s B-tree coverage.',
       regexp_replace(index_name, '_idx$', '_fkey'),
       case when expected_predicate is null then 'full' else 'partial' end
     )
     or convalidated is null;

  if uncovered_targets is not null then
    raise exception
      'RED COMM-PERF-001: classified FK performance index contract is missing or unsafe: %',
      uncovered_targets;
  end if;

  if not exists (
    select 1
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    where index_class.oid =
      'public.patient_outreach_recipients_campaign_idx'::regclass
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
  ) or not exists (
    select 1
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    where index_class.oid =
      'public.patient_outreach_recipients_customer_idx'::regclass
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
  ) or not exists (
    select 1
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    where index_class.oid = 'public.reservations_campaign_id_idx'::regclass
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and regexp_replace(
        lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
        '[()[:space:]\"]',
        '',
        'g'
      ) = 'campaign_idisnotnull'
  ) then
    raise exception
      'RED COMM-PERF-001: reviewed existing FK index path is missing or changed';
  end if;

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
      table_data.relname::text as table_name,
      constraint_data.conname::text as constraint_name,
      string_agg(
        attribute_data.attname::text,
        '+' order by keys.ordinality
      ) as key_columns
    from pg_constraint constraint_data
    join pg_class table_data on table_data.oid = constraint_data.conrelid
    join unnest(constraint_data.conkey)
      with ordinality keys(attnum, ordinality) on true
    join pg_attribute attribute_data
      on attribute_data.attrelid = constraint_data.conrelid
     and attribute_data.attnum = keys.attnum
    where constraint_data.contype = 'f'
      and constraint_data.connamespace = 'public'::regnamespace
      and not exists (
        select 1
        from pg_index index_data
        where index_data.indrelid = constraint_data.conrelid
          and index_data.indisvalid
          and index_data.indisready
          and index_data.indnkeyatts >= cardinality(constraint_data.conkey)
          and (
            select array_agg(keys.attnum order by keys.ordinality)
            from unnest(index_data.indkey::smallint[])
              with ordinality keys(attnum, ordinality)
            where keys.ordinality <= cardinality(constraint_data.conkey)
          ) = constraint_data.conkey
      )
    group by table_data.relname, constraint_data.conname
  ), drift_rows as (
    (select
       'missing:' || table_name || '.' || constraint_name || '(' || key_columns || ')'
         as finding
     from expected
     except
     select 'missing:' || table_name || '.' || constraint_name || '(' || key_columns || ')'
     from actual)
    union all
    (select
       'unexpected:' || table_name || '.' || constraint_name || '(' || key_columns || ')'
     from actual
     except
     select 'unexpected:' || table_name || '.' || constraint_name || '(' || key_columns || ')'
     from expected)
  )
  select string_agg(finding, ', ' order by finding)
  into residual_drift
  from drift_rows;

  if residual_drift is not null then
    raise exception
      'RED COMM-PERF-001: reviewed residual FK warning identity drift (%)',
      residual_drift;
  end if;
end
$contract$;
