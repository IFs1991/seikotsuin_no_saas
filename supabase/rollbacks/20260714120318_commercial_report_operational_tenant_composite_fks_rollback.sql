-- PR-06 security-preserving rollback / forward-fix guard.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
-- Code compatibility: stable FK names are preserved by PR-06.
-- Data loss: none. This file performs catalog and data checks only.
-- Security regression: none. It never weakens tenant constraints, makes the
--   report tenant key nullable, or restores a single-column-only FK model.
-- Lock risk: catalog and bounded data reads only, bounded by transaction-local
--   timeouts before the validation DO statement begins.
-- Forward-fix: disable the affected write path, preserve the hardened tenant
--   boundary, and ship a reviewed forward-fix.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, auth, extensions;

do $security_preserving_rollback$
declare
  drift text;
  relation_contract record;
  parent_contract record;
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  duplicate_count bigint;
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
  catalog_drift as (
    select * from expected except select * from actual
    union all
    select * from actual except select * from expected
  )
  select string_agg(constraint_name, ', ' order by constraint_name)
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception
      'PR-06 rollback refused: report/operational composite FK drift: %',
      drift;
  end if;

  with expected(constraint_name, child_table, delete_set_columns) as (
    values
      ('daily_report_items_daily_report_id_fkey', 'public.daily_report_items'::regclass, null::text[]),
      ('daily_report_items_reservation_id_fkey', 'public.daily_report_items'::regclass, array['reservation_id']),
      ('daily_report_items_customer_id_fkey', 'public.daily_report_items'::regclass, array['customer_id']),
      ('daily_report_items_care_episode_id_fkey', 'public.daily_report_items'::regclass, array['care_episode_id']),
      ('daily_report_items_customer_insurance_coverage_id_fkey', 'public.daily_report_items'::regclass, array['customer_insurance_coverage_id']),
      ('daily_report_items_menu_id_fkey', 'public.daily_report_items'::regclass, array['menu_id']),
      ('daily_report_items_menu_billing_profile_id_fkey', 'public.daily_report_items'::regclass, array['menu_billing_profile_id']),
      ('daily_report_items_staff_resource_id_fkey', 'public.daily_report_items'::regclass, array['staff_resource_id']),
      ('daily_report_item_tags_item_id_fkey', 'public.daily_report_item_tags'::regclass, null::text[]),
      ('reservation_history_reservation_id_fkey', 'public.reservation_history'::regclass, null::text[]),
      ('reservation_notifications_reservation_id_fkey', 'public.reservation_notifications'::regclass, null::text[])
  )
  select string_agg(expected.constraint_name, ', ' order by expected.constraint_name)
  into drift
  from expected
  join pg_constraint constraint_data
    on constraint_data.conrelid = expected.child_table
   and constraint_data.conname = expected.constraint_name
  left join lateral (
    select array_agg(attribute.attname::text order by keys.ordinality) as columns
    from unnest(constraint_data.confdelsetcols) with ordinality keys(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_data.conrelid
     and attribute.attnum = keys.attnum
  ) delete_set_columns on true
  where delete_set_columns.columns is distinct from expected.delete_set_columns;

  if drift is not null then
    raise exception 'PR-06 rollback refused: delete SET column drift: %', drift;
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
  into drift
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

  if drift is not null then
    raise exception
      'PR-06 rollback refused: duplicate structural target FK: %',
      drift;
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
  into drift
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

  if drift is not null then
    raise exception 'PR-06 rollback refused: FK RI trigger state drift: %', drift;
  end if;

  with expected(constraint_name, parent_table) as (
    values
      ('daily_reports_id_clinic_unique', 'public.daily_reports'::regclass),
      ('reservations_id_clinic_unique', 'public.reservations'::regclass),
      ('customers_id_clinic_unique', 'public.customers'::regclass),
      ('care_episodes_id_clinic_unique', 'public.care_episodes'::regclass),
      ('customer_insurance_coverages_id_clinic_unique', 'public.customer_insurance_coverages'::regclass),
      ('menus_id_clinic_unique', 'public.menus'::regclass),
      ('menu_billing_profiles_id_clinic_unique', 'public.menu_billing_profiles'::regclass),
      ('resources_id_clinic_unique', 'public.resources'::regclass),
      ('daily_report_items_id_clinic_unique', 'public.daily_report_items'::regclass)
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as parent_table
    from pg_constraint constraint_data
    join pg_index index_data on index_data.indexrelid = constraint_data.conindid
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_namespace namespace_data on namespace_data.oid = index_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.conrelid
       and attribute.attnum = keys.attnum
    ) columns on true
    where constraint_data.contype = 'u'
      and constraint_data.convalidated
      and constraint_data.conname in (select constraint_name from expected)
      and namespace_data.nspname = 'public'
      and columns.columns = array['id', 'clinic_id']
      and index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and index_data.indpred is null
      and index_data.indexprs is null
      and access_method.amname = 'btree'
  ),
  catalog_drift as (
    select * from expected except select * from actual
    union all
    select * from actual except select * from expected
  )
  select string_agg(constraint_name, ', ' order by constraint_name)
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception
      'PR-06 rollback refused: parent tenant uniqueness drift: %',
      drift;
  end if;

  with expected(index_name, child_table, index_columns) as (
    values
      ('daily_report_items_daily_report_clinic_idx', 'public.daily_report_items'::regclass, array['daily_report_id', 'clinic_id']),
      ('daily_report_items_reservation_clinic_idx', 'public.daily_report_items'::regclass, array['reservation_id', 'clinic_id']),
      ('daily_report_items_customer_clinic_idx', 'public.daily_report_items'::regclass, array['customer_id', 'clinic_id']),
      ('daily_report_items_care_episode_clinic_idx', 'public.daily_report_items'::regclass, array['care_episode_id', 'clinic_id']),
      ('daily_report_items_customer_insurance_coverage_clinic_idx', 'public.daily_report_items'::regclass, array['customer_insurance_coverage_id', 'clinic_id']),
      ('daily_report_items_menu_clinic_idx', 'public.daily_report_items'::regclass, array['menu_id', 'clinic_id']),
      ('daily_report_items_menu_billing_profile_clinic_idx', 'public.daily_report_items'::regclass, array['menu_billing_profile_id', 'clinic_id']),
      ('daily_report_items_staff_resource_clinic_idx', 'public.daily_report_items'::regclass, array['staff_resource_id', 'clinic_id']),
      ('daily_report_item_tags_item_clinic_idx', 'public.daily_report_item_tags'::regclass, array['daily_report_item_id', 'clinic_id']),
      ('reservation_history_reservation_clinic_idx', 'public.reservation_history'::regclass, array['reservation_id', 'clinic_id']),
      ('reservation_notifications_reservation_clinic_idx', 'public.reservation_notifications'::regclass, array['reservation_id', 'clinic_id'])
  ),
  actual as (
    select
      index_class.relname::text as index_name,
      index_data.indrelid as child_table,
      columns.columns as index_columns
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_namespace namespace_data on namespace_data.oid = index_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = index_data.indrelid
       and attribute.attnum = keys.attnum
      where keys.ordinality <= index_data.indnkeyatts
    ) columns on true
    where namespace_data.nspname = 'public'
      and index_class.relname in (select index_name from expected)
      and access_method.amname = 'btree'
      and index_data.indnkeyatts = 2
      and not index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and index_data.indpred is null
      and index_data.indexprs is null
  ),
  catalog_drift as (
    select * from expected except select * from actual
    union all
    select * from actual except select * from expected
  )
  select string_agg(index_name, ', ' order by index_name)
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-06 rollback refused: supporting index drift: %', drift;
  end if;

  with expected(table_oid, column_name, is_not_null) as (
    values
      ('public.daily_reports'::regclass, 'id', true),
      ('public.daily_reports'::regclass, 'clinic_id', true),
      ('public.reservations'::regclass, 'id', true),
      ('public.reservations'::regclass, 'clinic_id', true),
      ('public.customers'::regclass, 'id', true),
      ('public.customers'::regclass, 'clinic_id', true),
      ('public.care_episodes'::regclass, 'id', true),
      ('public.care_episodes'::regclass, 'clinic_id', true),
      ('public.customer_insurance_coverages'::regclass, 'id', true),
      ('public.customer_insurance_coverages'::regclass, 'clinic_id', true),
      ('public.menus'::regclass, 'id', true),
      ('public.menus'::regclass, 'clinic_id', true),
      ('public.menu_billing_profiles'::regclass, 'id', true),
      ('public.menu_billing_profiles'::regclass, 'clinic_id', true),
      ('public.resources'::regclass, 'id', true),
      ('public.resources'::regclass, 'clinic_id', true),
      ('public.daily_report_items'::regclass, 'id', true),
      ('public.daily_report_items'::regclass, 'clinic_id', true),
      ('public.daily_report_items'::regclass, 'daily_report_id', true),
      ('public.daily_report_items'::regclass, 'reservation_id', false),
      ('public.daily_report_items'::regclass, 'customer_id', false),
      ('public.daily_report_items'::regclass, 'care_episode_id', false),
      ('public.daily_report_items'::regclass, 'customer_insurance_coverage_id', false),
      ('public.daily_report_items'::regclass, 'menu_id', false),
      ('public.daily_report_items'::regclass, 'menu_billing_profile_id', false),
      ('public.daily_report_items'::regclass, 'staff_resource_id', false),
      ('public.daily_report_item_tags'::regclass, 'daily_report_item_id', true),
      ('public.daily_report_item_tags'::regclass, 'clinic_id', true),
      ('public.reservation_history'::regclass, 'reservation_id', true),
      ('public.reservation_history'::regclass, 'clinic_id', true),
      ('public.reservation_notifications'::regclass, 'reservation_id', true),
      ('public.reservation_notifications'::regclass, 'clinic_id', true)
  )
  select string_agg(
    expected.table_oid::text || '.' || expected.column_name,
    ', ' order by expected.table_oid::text, expected.column_name
  )
  into drift
  from expected
  left join pg_attribute attribute
    on attribute.attrelid = expected.table_oid
   and attribute.attname = expected.column_name
   and not attribute.attisdropped
   and attribute.atttypid = 'uuid'::regtype
   and attribute.attnotnull = expected.is_not_null
  where attribute.attnum is null;

  if drift is not null then
    raise exception 'PR-06 rollback refused: required UUID column drift: %', drift;
  end if;

  for relation_contract in
    select *
    from (
      values
        ('public.daily_report_items'::regclass, 'daily_report_id', false, 'public.daily_reports'::regclass),
        ('public.daily_report_items'::regclass, 'reservation_id', true, 'public.reservations'::regclass),
        ('public.daily_report_items'::regclass, 'customer_id', true, 'public.customers'::regclass),
        ('public.daily_report_items'::regclass, 'care_episode_id', true, 'public.care_episodes'::regclass),
        ('public.daily_report_items'::regclass, 'customer_insurance_coverage_id', true, 'public.customer_insurance_coverages'::regclass),
        ('public.daily_report_items'::regclass, 'menu_id', true, 'public.menus'::regclass),
        ('public.daily_report_items'::regclass, 'menu_billing_profile_id', true, 'public.menu_billing_profiles'::regclass),
        ('public.daily_report_items'::regclass, 'staff_resource_id', true, 'public.resources'::regclass),
        ('public.daily_report_item_tags'::regclass, 'daily_report_item_id', false, 'public.daily_report_items'::regclass),
        ('public.reservation_history'::regclass, 'reservation_id', false, 'public.reservations'::regclass),
        ('public.reservation_notifications'::regclass, 'reservation_id', false, 'public.reservations'::regclass)
    ) relation_data(child_table, child_column, child_nullable, parent_table)
  loop
    execute format(
      'select count(*) from %s child where child.clinic_id is null or (%L = false and child.%I is null)',
      relation_contract.child_table,
      relation_contract.child_nullable,
      relation_contract.child_column
    ) into null_count;

    execute format(
      'select count(*) from %s child left join %s parent on parent.id = child.%I where child.%I is not null and parent.id is null',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column,
      relation_contract.child_column
    ) into orphan_count;

    execute format(
      'select count(*) from %s child join %s parent on parent.id = child.%I where child.%I is not null and child.clinic_id is distinct from parent.clinic_id',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column,
      relation_contract.child_column
    ) into mismatch_count;

    if null_count <> 0 or orphan_count <> 0 or mismatch_count <> 0 then
      raise exception
        'PR-06 rollback refused: data drift on %.% (null=%, orphan=%, mismatch=%)',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count,
        orphan_count,
        mismatch_count;
    end if;
  end loop;

  for parent_contract in
    select *
    from (
      values
        ('public.daily_reports'::regclass),
        ('public.reservations'::regclass),
        ('public.customers'::regclass),
        ('public.care_episodes'::regclass),
        ('public.customer_insurance_coverages'::regclass),
        ('public.menus'::regclass),
        ('public.menu_billing_profiles'::regclass),
        ('public.resources'::regclass),
        ('public.daily_report_items'::regclass)
    ) parent_data(parent_table)
  loop
    execute format(
      'select count(*) from %s parent where parent.id is null or parent.clinic_id is null',
      parent_contract.parent_table
    ) into null_count;

    execute format(
      'select count(*) from (select id, clinic_id from %s group by id, clinic_id having count(*) > 1) duplicate_keys',
      parent_contract.parent_table
    ) into duplicate_count;

    if null_count <> 0 or duplicate_count <> 0 then
      raise exception
        'PR-06 rollback refused: parent %. null=% duplicate=%',
        parent_contract.parent_table,
        null_count,
        duplicate_count;
    end if;
  end loop;

  if exists (
    select 1
    from pg_class relation
    where relation.oid in (
      'public.daily_reports'::regclass,
      'public.daily_report_items'::regclass,
      'public.daily_report_item_tags'::regclass,
      'public.reservations'::regclass,
      'public.reservation_history'::regclass,
      'public.reservation_notifications'::regclass,
      'public.customers'::regclass,
      'public.care_episodes'::regclass,
      'public.customer_insurance_coverages'::regclass,
      'public.menus'::regclass,
      'public.menu_billing_profiles'::regclass,
      'public.resources'::regclass
    )
      and not relation.relrowsecurity
  ) then
    raise exception 'PR-06 rollback refused: RLS is disabled on a target table';
  end if;

  raise notice
    'PR-06 rollback is intentionally validation-only; no tenant constraint, column, or index was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;
