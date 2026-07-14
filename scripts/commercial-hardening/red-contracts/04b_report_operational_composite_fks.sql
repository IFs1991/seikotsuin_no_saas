do $commercial_red$
declare
  contract_drift text;
begin
  with expected(
    constraint_name,
    child_table,
    child_columns,
    parent_table,
    parent_columns,
    update_action,
    delete_action,
    delete_set_columns,
    match_type,
    validated,
    is_deferrable
  ) as (
    values
      ('daily_report_items_daily_report_id_fkey', 'public.daily_report_items'::regclass, array['daily_report_id', 'clinic_id'], 'public.daily_reports'::regclass, array['id', 'clinic_id'], 'a', 'c', null::text[], 's', true, false),
      ('daily_report_items_reservation_id_fkey', 'public.daily_report_items'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'a', 'n', array['reservation_id'], 's', true, false),
      ('daily_report_items_customer_id_fkey', 'public.daily_report_items'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'a', 'n', array['customer_id'], 's', true, false),
      ('daily_report_items_care_episode_id_fkey', 'public.daily_report_items'::regclass, array['care_episode_id', 'clinic_id'], 'public.care_episodes'::regclass, array['id', 'clinic_id'], 'a', 'n', array['care_episode_id'], 's', true, false),
      ('daily_report_items_customer_insurance_coverage_id_fkey', 'public.daily_report_items'::regclass, array['customer_insurance_coverage_id', 'clinic_id'], 'public.customer_insurance_coverages'::regclass, array['id', 'clinic_id'], 'a', 'n', array['customer_insurance_coverage_id'], 's', true, false),
      ('daily_report_items_menu_id_fkey', 'public.daily_report_items'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'a', 'n', array['menu_id'], 's', true, false),
      ('daily_report_items_menu_billing_profile_id_fkey', 'public.daily_report_items'::regclass, array['menu_billing_profile_id', 'clinic_id'], 'public.menu_billing_profiles'::regclass, array['id', 'clinic_id'], 'a', 'n', array['menu_billing_profile_id'], 's', true, false),
      ('daily_report_items_staff_resource_id_fkey', 'public.daily_report_items'::regclass, array['staff_resource_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'a', 'n', array['staff_resource_id'], 's', true, false),
      ('daily_report_item_tags_item_id_fkey', 'public.daily_report_item_tags'::regclass, array['daily_report_item_id', 'clinic_id'], 'public.daily_report_items'::regclass, array['id', 'clinic_id'], 'a', 'c', null::text[], 's', true, false),
      ('reservation_history_reservation_id_fkey', 'public.reservation_history'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'a', 'c', null::text[], 's', true, false),
      ('reservation_notifications_reservation_id_fkey', 'public.reservation_notifications'::regclass, array['reservation_id', 'clinic_id'], 'public.reservations'::regclass, array['id', 'clinic_id'], 'a', 'c', null::text[], 's', true, false)
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as child_table,
      child_columns.columns as child_columns,
      constraint_data.confrelid as parent_table,
      parent_columns.columns as parent_columns,
      constraint_data.confupdtype::text as update_action,
      constraint_data.confdeltype::text as delete_action,
      delete_set_columns.columns as delete_set_columns,
      constraint_data.confmatchtype::text as match_type,
      constraint_data.convalidated as validated,
      constraint_data.condeferrable as is_deferrable
    from pg_constraint constraint_data
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.conrelid
       and attribute.attnum = keys.attnum
    ) child_columns on true
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.confkey) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.confrelid
       and attribute.attnum = keys.attnum
    ) parent_columns on true
    left join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.confdelsetcols) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.conrelid
       and attribute.attnum = keys.attnum
    ) delete_set_columns on true
    where constraint_data.contype = 'f'
      and constraint_data.conname in (select constraint_name from expected)
  ),
  drift as (
    select 'missing' as drift_type, expected.*
    from (select * from expected except select * from actual) expected
    union all
    select 'unexpected' as drift_type, actual.*
    from (select * from actual except select * from expected) actual
  )
  select string_agg(
    format(
      '%s:%s(%s)->%s(%s):delete=%s:setcols=%s',
      drift_type,
      child_table::regclass,
      array_to_string(child_columns, ','),
      parent_table::regclass,
      array_to_string(parent_columns, ','),
      delete_action,
      coalesce(array_to_string(delete_set_columns, ','), '<null>')
    ),
    '; ' order by drift_type, constraint_name
  )
  into contract_drift
  from drift;

  if contract_drift is not null then
    raise exception
      'RED COMM-FK-004: report/operational tenant FK contract drift: %',
      contract_drift;
  end if;

  with expected(constraint_name, child_table, child_column, parent_table) as (
    values
      ('daily_report_items_daily_report_id_fkey', 'public.daily_report_items'::regclass, 'daily_report_id', 'public.daily_reports'::regclass),
      ('daily_report_items_reservation_id_fkey', 'public.daily_report_items'::regclass, 'reservation_id', 'public.reservations'::regclass),
      ('daily_report_items_customer_id_fkey', 'public.daily_report_items'::regclass, 'customer_id', 'public.customers'::regclass),
      ('daily_report_items_care_episode_id_fkey', 'public.daily_report_items'::regclass, 'care_episode_id', 'public.care_episodes'::regclass),
      ('daily_report_items_customer_insurance_coverage_id_fkey', 'public.daily_report_items'::regclass, 'customer_insurance_coverage_id', 'public.customer_insurance_coverages'::regclass),
      ('daily_report_items_menu_id_fkey', 'public.daily_report_items'::regclass, 'menu_id', 'public.menus'::regclass),
      ('daily_report_items_menu_billing_profile_id_fkey', 'public.daily_report_items'::regclass, 'menu_billing_profile_id', 'public.menu_billing_profiles'::regclass),
      ('daily_report_items_staff_resource_id_fkey', 'public.daily_report_items'::regclass, 'staff_resource_id', 'public.resources'::regclass),
      ('daily_report_item_tags_item_id_fkey', 'public.daily_report_item_tags'::regclass, 'daily_report_item_id', 'public.daily_report_items'::regclass),
      ('reservation_history_reservation_id_fkey', 'public.reservation_history'::regclass, 'reservation_id', 'public.reservations'::regclass),
      ('reservation_notifications_reservation_id_fkey', 'public.reservation_notifications'::regclass, 'reservation_id', 'public.reservations'::regclass)
  )
  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into contract_drift
  from pg_constraint constraint_data
  join expected
    on expected.child_table = constraint_data.conrelid
   and expected.parent_table = constraint_data.confrelid
  join lateral (
    select array_agg(attribute.attname::text order by keys.ordinality) as columns
    from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_data.conrelid
     and attribute.attnum = keys.attnum
  ) child_columns on true
  join lateral (
    select array_agg(attribute.attname::text order by keys.ordinality) as columns
    from unnest(constraint_data.confkey) with ordinality keys(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_data.confrelid
     and attribute.attnum = keys.attnum
  ) parent_columns on true
  where constraint_data.contype = 'f'
    and constraint_data.conname <> expected.constraint_name
    and (
      (
        child_columns.columns = array[expected.child_column]
        and parent_columns.columns = array['id']
      )
      or (
        cardinality(child_columns.columns) = 2
        and child_columns.columns @> array[expected.child_column, 'clinic_id']
        and child_columns.columns <@ array[expected.child_column, 'clinic_id']
        and cardinality(parent_columns.columns) = 2
        and parent_columns.columns @> array['id', 'clinic_id']
        and parent_columns.columns <@ array['id', 'clinic_id']
      )
    );

  if contract_drift is not null then
    raise exception
      'RED COMM-FK-004: duplicate structural report/operational tenant FK: %',
      contract_drift;
  end if;

  with expected(constraint_name, child_table) as (
    values
      ('daily_report_items_daily_report_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_reservation_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_customer_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_care_episode_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_customer_insurance_coverage_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_menu_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_menu_billing_profile_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_items_staff_resource_id_fkey', 'public.daily_report_items'::regclass),
      ('daily_report_item_tags_item_id_fkey', 'public.daily_report_item_tags'::regclass),
      ('reservation_history_reservation_id_fkey', 'public.reservation_history'::regclass),
      ('reservation_notifications_reservation_id_fkey', 'public.reservation_notifications'::regclass)
  )
  select string_agg(
    constraint_data.conname::text,
    ', ' order by constraint_data.conname::text
  )
  into contract_drift
  from pg_constraint constraint_data
  join expected
    on expected.child_table = constraint_data.conrelid
   and expected.constraint_name = constraint_data.conname
  join lateral (
    select
      count(*) as trigger_count,
      count(*) filter (where trigger_data.tgenabled = 'O') as enabled_count
    from pg_trigger trigger_data
    where trigger_data.tgconstraint = constraint_data.oid
      and trigger_data.tgisinternal
  ) trigger_state on true
  where constraint_data.contype = 'f'
    and (
      trigger_state.trigger_count <> 4
      or trigger_state.enabled_count <> 4
    );

  if contract_drift is not null then
    raise exception
      'RED COMM-FK-004: report/operational tenant FK RI trigger drift: %',
      contract_drift;
  end if;
end
$commercial_red$;
