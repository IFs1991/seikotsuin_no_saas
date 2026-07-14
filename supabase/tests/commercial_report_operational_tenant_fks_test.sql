begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(81);

select is(
  (
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
      select * from expected except select * from actual
      union all
      select * from actual except select * from expected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the exact eleven validated report/operational tenant FK definitions are present'
);

select is(
  (
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
    select count(*)
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
      )
  ),
  0::bigint,
  'no alternate single-column or composite counterpart remains'
);

select is(
  (
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
    select coalesce(sum(trigger_state.trigger_count), 0)
    from pg_constraint constraint_data
    join expected
      on expected.child_table = constraint_data.conrelid
     and expected.constraint_name = constraint_data.conname
    join lateral (
      select count(*) as trigger_count
      from pg_trigger trigger_data
      where trigger_data.tgconstraint = constraint_data.oid
        and trigger_data.tgisinternal
        and trigger_data.tgenabled = 'O'
    ) trigger_state on true
  ),
  44::numeric,
  'all 44 internal RI triggers for the eleven FKs are enabled'
);

select is(
  (
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
      select constraint_data.conname::text as constraint_name, constraint_data.conrelid as parent_table
      from pg_constraint constraint_data
      join pg_index index_data on index_data.indexrelid = constraint_data.conindid
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
        and columns.columns = array['id', 'clinic_id']
        and index_data.indisunique
        and index_data.indisvalid
        and index_data.indisready
        and index_data.indislive
        and index_data.indpred is null
        and index_data.indexprs is null
    ),
    drift as (
      select * from expected except select * from actual
      union all
      select * from actual except select * from expected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the nine exact parent tenant unique constraints are valid'
);

select is(
  (
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
      select index_class.relname::text as index_name, index_data.indrelid as child_table, columns.columns as index_columns
      from pg_index index_data
      join pg_class index_class on index_class.oid = index_data.indexrelid
      join pg_namespace namespace_data on namespace_data.oid = index_class.relnamespace
      join pg_am access_method on access_method.oid = index_class.relam
      join lateral (
        select array_agg(attribute.attname::text order by keys.ordinality) as columns
        from unnest(index_data.indkey::smallint[]) with ordinality keys(attnum, ordinality)
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
    drift as (
      select * from expected except select * from actual
      union all
      select * from actual except select * from expected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the eleven full child indexes are valid and ordered for FK checks'
);

select is(
  (
    with expected(table_oid, column_name, is_not_null) as (
      values
        ('public.daily_reports'::regclass, 'clinic_id', true),
        ('public.daily_report_items'::regclass, 'daily_report_id', true),
        ('public.daily_report_items'::regclass, 'clinic_id', true),
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
    select count(*)
    from expected
    left join pg_attribute attribute
      on attribute.attrelid = expected.table_oid
     and attribute.attname = expected.column_name
     and not attribute.attisdropped
     and attribute.atttypid = 'uuid'::regtype
     and attribute.attnotnull = expected.is_not_null
    where attribute.attnum is null
  ),
  0::bigint,
  'the report tenant key and child UUID nullability contract are exact'
);

select is(
  (
    (select count(*) from public.daily_report_items child left join public.daily_reports parent on parent.id = child.daily_report_id where parent.id is null or child.clinic_id is distinct from parent.clinic_id) +
    (select count(*) from public.daily_report_items child left join public.reservations parent on parent.id = child.reservation_id where child.reservation_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.customers parent on parent.id = child.customer_id where child.customer_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.care_episodes parent on parent.id = child.care_episode_id where child.care_episode_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.customer_insurance_coverages parent on parent.id = child.customer_insurance_coverage_id where child.customer_insurance_coverage_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.menus parent on parent.id = child.menu_id where child.menu_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.menu_billing_profiles parent on parent.id = child.menu_billing_profile_id where child.menu_billing_profile_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_items child left join public.resources parent on parent.id = child.staff_resource_id where child.staff_resource_id is not null and (parent.id is null or child.clinic_id is distinct from parent.clinic_id)) +
    (select count(*) from public.daily_report_item_tags child left join public.daily_report_items parent on parent.id = child.daily_report_item_id where parent.id is null or child.clinic_id is distinct from parent.clinic_id) +
    (select count(*) from public.reservation_history child left join public.reservations parent on parent.id = child.reservation_id where parent.id is null or child.clinic_id is distinct from parent.clinic_id) +
    (select count(*) from public.reservation_notifications child left join public.reservations parent on parent.id = child.reservation_id where parent.id is null or child.clinic_id is distinct from parent.clinic_id)
  ),
  0::bigint,
  'all current report and operational relations have zero orphan or clinic mismatch rows'
);

select is(
  (
    select count(*)
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
  ),
  0::bigint,
  'RLS remains enabled on every target child and parent table'
);

alter table public.daily_report_items
  disable trigger daily_report_items_clinic_ref_check;
alter table public.daily_report_items
  disable trigger daily_report_items_analysis_ref_check;
alter table public.daily_report_items
  disable trigger daily_report_items_pricing_ref_check;
alter table public.daily_report_item_tags
  disable trigger daily_report_item_tags_ref_check;
alter table public.reservation_history
  disable trigger reservation_history_clinic_ref_check;
alter table public.reservations disable trigger reservation_created_log;
alter table public.reservations disable trigger reservation_updated_log;
alter table public.reservations disable trigger reservation_deleted_log;

set local role service_role;

insert into public.clinics (id, name)
values
  ('f6060000-0000-4000-8000-000000000001', 'pr06-clinic-a'),
  ('f6060000-0000-4000-8000-000000000002', 'pr06-clinic-b');

insert into public.customers (id, clinic_id, name, phone)
values
  ('f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000001', 'pr06-customer-a1', '09060600100'),
  ('f6060000-0000-4000-8000-000000000101', 'f6060000-0000-4000-8000-000000000001', 'pr06-customer-a2', '09060600101'),
  ('f6060000-0000-4000-8000-000000000200', 'f6060000-0000-4000-8000-000000000002', 'pr06-customer-b1', '09060600200'),
  ('f6060000-0000-4000-8000-000000000201', 'f6060000-0000-4000-8000-000000000002', 'pr06-customer-b2', '09060600201'),
  ('f6060000-0000-4000-8000-000000003002', 'f6060000-0000-4000-8000-000000000001', 'pr06-customer-rehome', '09060603002'),
  ('f6060000-0000-4000-8000-000000004102', 'f6060000-0000-4000-8000-000000000001', 'pr06-customer-delete', '09060604102');

insert into public.menus (id, clinic_id, name, price, duration_minutes)
values
  ('f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000001', 'pr06-menu-a1', 1000, 30),
  ('f6060000-0000-4000-8000-000000000301', 'f6060000-0000-4000-8000-000000000001', 'pr06-menu-a2', 1100, 30),
  ('f6060000-0000-4000-8000-000000000400', 'f6060000-0000-4000-8000-000000000002', 'pr06-menu-b1', 1200, 30),
  ('f6060000-0000-4000-8000-000000000401', 'f6060000-0000-4000-8000-000000000002', 'pr06-menu-b2', 1300, 30),
  ('f6060000-0000-4000-8000-000000003005', 'f6060000-0000-4000-8000-000000000001', 'pr06-menu-rehome', 1400, 30),
  ('f6060000-0000-4000-8000-000000004105', 'f6060000-0000-4000-8000-000000000001', 'pr06-menu-delete', 1500, 30);

insert into public.resources (id, clinic_id, name, type)
values
  ('f6060000-0000-4000-8000-000000000500', 'f6060000-0000-4000-8000-000000000001', 'pr06-resource-a1', 'staff'),
  ('f6060000-0000-4000-8000-000000000501', 'f6060000-0000-4000-8000-000000000001', 'pr06-resource-a2', 'staff'),
  ('f6060000-0000-4000-8000-000000000600', 'f6060000-0000-4000-8000-000000000002', 'pr06-resource-b1', 'staff'),
  ('f6060000-0000-4000-8000-000000000601', 'f6060000-0000-4000-8000-000000000002', 'pr06-resource-b2', 'staff'),
  ('f6060000-0000-4000-8000-000000003007', 'f6060000-0000-4000-8000-000000000001', 'pr06-resource-rehome', 'staff'),
  ('f6060000-0000-4000-8000-000000004107', 'f6060000-0000-4000-8000-000000000001', 'pr06-resource-delete', 'staff');

insert into public.daily_reports (id, clinic_id, report_date)
values
  ('f6060000-0000-4000-8000-000000000900', 'f6060000-0000-4000-8000-000000000001', '2096-06-01'),
  ('f6060000-0000-4000-8000-000000000901', 'f6060000-0000-4000-8000-000000000001', '2096-06-02'),
  ('f6060000-0000-4000-8000-000000001000', 'f6060000-0000-4000-8000-000000000002', '2096-06-01'),
  ('f6060000-0000-4000-8000-000000001001', 'f6060000-0000-4000-8000-000000000002', '2096-06-02'),
  ('f6060000-0000-4000-8000-000000003000', 'f6060000-0000-4000-8000-000000000001', '2096-07-01'),
  ('f6060000-0000-4000-8000-000000004100', 'f6060000-0000-4000-8000-000000000001', '2096-08-01');

insert into public.reservations (
  id,
  clinic_id,
  customer_id,
  menu_id,
  staff_id,
  start_time,
  end_time
)
values
  ('f6060000-0000-4000-8000-000000000700', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-10T00:00:00Z', '2096-06-10T00:30:00Z'),
  ('f6060000-0000-4000-8000-000000000701', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000101', 'f6060000-0000-4000-8000-000000000301', 'f6060000-0000-4000-8000-000000000501', '2096-06-10T01:00:00Z', '2096-06-10T01:30:00Z'),
  ('f6060000-0000-4000-8000-000000000800', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000200', 'f6060000-0000-4000-8000-000000000400', 'f6060000-0000-4000-8000-000000000600', '2096-06-10T02:00:00Z', '2096-06-10T02:30:00Z'),
  ('f6060000-0000-4000-8000-000000000801', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000201', 'f6060000-0000-4000-8000-000000000401', 'f6060000-0000-4000-8000-000000000601', '2096-06-10T03:00:00Z', '2096-06-10T03:30:00Z'),
  ('f6060000-0000-4000-8000-000000003001', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-11T00:00:00Z', '2096-06-11T00:30:00Z'),
  ('f6060000-0000-4000-8000-000000003009', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-11T01:00:00Z', '2096-06-11T01:30:00Z'),
  ('f6060000-0000-4000-8000-000000003010', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-11T02:00:00Z', '2096-06-11T02:30:00Z'),
  ('f6060000-0000-4000-8000-000000004101', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-12T00:00:00Z', '2096-06-12T00:30:00Z'),
  ('f6060000-0000-4000-8000-000000004109', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-12T01:00:00Z', '2096-06-12T01:30:00Z'),
  ('f6060000-0000-4000-8000-000000004110', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 'f6060000-0000-4000-8000-000000000300', 'f6060000-0000-4000-8000-000000000500', '2096-06-12T02:00:00Z', '2096-06-12T02:30:00Z');

insert into public.care_episodes (id, clinic_id, customer_id, started_on)
values
  ('f6060000-0000-4000-8000-000000001100', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', '2096-01-01'),
  ('f6060000-0000-4000-8000-000000001101', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000101', '2096-01-02'),
  ('f6060000-0000-4000-8000-000000001200', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000200', '2096-01-01'),
  ('f6060000-0000-4000-8000-000000001201', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000201', '2096-01-02'),
  ('f6060000-0000-4000-8000-000000003003', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', '2096-02-01'),
  ('f6060000-0000-4000-8000-000000004103', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', '2096-02-02');

insert into public.customer_insurance_coverages (
  id,
  clinic_id,
  customer_id,
  patient_burden_rate,
  effective_from,
  verification_status
)
values
  ('f6060000-0000-4000-8000-000000001300', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 10, '2096-01-01', 'needs_review'),
  ('f6060000-0000-4000-8000-000000001301', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000101', 10, '2096-01-02', 'needs_review'),
  ('f6060000-0000-4000-8000-000000001400', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000200', 10, '2096-01-01', 'needs_review'),
  ('f6060000-0000-4000-8000-000000001401', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000201', 10, '2096-01-02', 'needs_review'),
  ('f6060000-0000-4000-8000-000000003004', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 10, '2096-02-01', 'needs_review'),
  ('f6060000-0000-4000-8000-000000004104', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000100', 10, '2096-02-02', 'needs_review');

insert into public.menu_billing_profiles (
  id,
  clinic_id,
  menu_id,
  revenue_context_code,
  calculation_method,
  effective_from
)
values
  ('f6060000-0000-4000-8000-000000001500', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000300', 'private', 'manual_estimate', '2096-01-01'),
  ('f6060000-0000-4000-8000-000000001501', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000301', 'private', 'manual_estimate', '2096-01-02'),
  ('f6060000-0000-4000-8000-000000001600', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000400', 'private', 'manual_estimate', '2096-01-01'),
  ('f6060000-0000-4000-8000-000000001601', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000000401', 'private', 'manual_estimate', '2096-01-02'),
  ('f6060000-0000-4000-8000-000000003006', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000300', 'private', 'manual_estimate', '2096-02-01'),
  ('f6060000-0000-4000-8000-000000004106', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000300', 'private', 'manual_estimate', '2096-02-02');

insert into public.daily_report_items (
  id,
  clinic_id,
  daily_report_id,
  report_date,
  reservation_id,
  customer_id,
  care_episode_id,
  customer_insurance_coverage_id,
  menu_id,
  menu_billing_profile_id,
  staff_resource_id,
  patient_name,
  treatment_name
)
values
  ('f6060000-0000-4000-8000-000000002100', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-report', 'test'),
  ('f6060000-0000-4000-8000-000000002101', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-reservation', 'test'),
  ('f6060000-0000-4000-8000-000000002102', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-customer', 'test'),
  ('f6060000-0000-4000-8000-000000002103', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-care', 'test'),
  ('f6060000-0000-4000-8000-000000002104', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-coverage', 'test'),
  ('f6060000-0000-4000-8000-000000002105', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-menu', 'test'),
  ('f6060000-0000-4000-8000-000000002106', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-profile', 'test'),
  ('f6060000-0000-4000-8000-000000002107', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'update-resource', 'test'),
  ('f6060000-0000-4000-8000-000000002400', 'f6060000-0000-4000-8000-000000000002', 'f6060000-0000-4000-8000-000000001000', '2096-06-01', null, null, null, null, null, null, null, 'clinic-b-item', 'test'),
  ('f6060000-0000-4000-8000-000000003100', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000003000', '2096-07-01', null, null, null, null, null, null, null, 'rehome-report', 'test'),
  ('f6060000-0000-4000-8000-000000003101', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000003001', null, null, null, null, null, null, 'rehome-reservation', 'test'),
  ('f6060000-0000-4000-8000-000000003102', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, 'f6060000-0000-4000-8000-000000003002', null, null, null, null, null, 'rehome-customer', 'test'),
  ('f6060000-0000-4000-8000-000000003103', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, 'f6060000-0000-4000-8000-000000003003', null, null, null, null, 'rehome-care', 'test'),
  ('f6060000-0000-4000-8000-000000003104', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, 'f6060000-0000-4000-8000-000000003004', null, null, null, 'rehome-coverage', 'test'),
  ('f6060000-0000-4000-8000-000000003105', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, 'f6060000-0000-4000-8000-000000003005', null, null, 'rehome-menu', 'test'),
  ('f6060000-0000-4000-8000-000000003106', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, 'f6060000-0000-4000-8000-000000003006', null, 'rehome-profile', 'test'),
  ('f6060000-0000-4000-8000-000000003107', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, 'f6060000-0000-4000-8000-000000003007', 'rehome-resource', 'test'),
  ('f6060000-0000-4000-8000-000000003108', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'rehome-item', 'test'),
  ('f6060000-0000-4000-8000-000000004200', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000004100', '2096-08-01', null, null, null, null, null, null, null, 'delete-report', 'test'),
  ('f6060000-0000-4000-8000-000000004201', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000004101', null, null, null, null, null, null, 'delete-reservation', 'test'),
  ('f6060000-0000-4000-8000-000000004202', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, 'f6060000-0000-4000-8000-000000004102', null, null, null, null, null, 'delete-customer', 'test'),
  ('f6060000-0000-4000-8000-000000004203', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, 'f6060000-0000-4000-8000-000000004103', null, null, null, null, 'delete-care', 'test'),
  ('f6060000-0000-4000-8000-000000004204', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, 'f6060000-0000-4000-8000-000000004104', null, null, null, 'delete-coverage', 'test'),
  ('f6060000-0000-4000-8000-000000004205', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, 'f6060000-0000-4000-8000-000000004105', null, null, 'delete-menu', 'test'),
  ('f6060000-0000-4000-8000-000000004206', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, 'f6060000-0000-4000-8000-000000004106', null, 'delete-profile', 'test'),
  ('f6060000-0000-4000-8000-000000004207', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, 'f6060000-0000-4000-8000-000000004107', 'delete-resource', 'test'),
  ('f6060000-0000-4000-8000-000000004208', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', null, null, null, null, null, null, null, 'delete-item', 'test');

insert into public.daily_report_item_tags (
  id,
  clinic_id,
  daily_report_item_id,
  tag_code
)
values
  ('f6060000-0000-4000-8000-000000003208', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000003108', 'MANUAL_CLASSIFICATION'),
  ('f6060000-0000-4000-8000-000000004208', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000004208', 'MANUAL_CLASSIFICATION');

insert into public.reservation_history (
  id,
  reservation_id,
  action,
  clinic_id
)
values
  ('f6060000-0000-4000-8000-000000003209', 'f6060000-0000-4000-8000-000000003009', 'created', 'f6060000-0000-4000-8000-000000000001'),
  ('f6060000-0000-4000-8000-000000004209', 'f6060000-0000-4000-8000-000000004109', 'created', 'f6060000-0000-4000-8000-000000000001');

insert into public.reservation_notifications (
  id,
  clinic_id,
  reservation_id,
  notification_type
)
values
  ('f6060000-0000-4000-8000-000000003210', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000003010', 'confirmed'),
  ('f6060000-0000-4000-8000-000000004210', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000004110', 'cancelled');

select lives_ok(test_sql, description)
from (
  values
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002000', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'same-report', 'test')$sql$, 'same-clinic daily report item -> daily report insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, reservation_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002001', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000700', 'same-reservation', 'test')$sql$, 'same-clinic daily report item -> reservation insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, customer_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002002', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000100', 'same-customer', 'test')$sql$, 'same-clinic daily report item -> customer insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, care_episode_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002003', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001100', 'same-care', 'test')$sql$, 'same-clinic daily report item -> care episode insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, customer_insurance_coverage_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002004', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001300', 'same-coverage', 'test')$sql$, 'same-clinic daily report item -> insurance coverage insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, menu_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002005', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000300', 'same-menu', 'test')$sql$, 'same-clinic daily report item -> menu insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, menu_billing_profile_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002006', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001500', 'same-profile', 'test')$sql$, 'same-clinic daily report item -> billing profile insert succeeds'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, staff_resource_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002007', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000500', 'same-resource', 'test')$sql$, 'same-clinic daily report item -> resource insert succeeds')
) tests(test_sql, description);

select lives_ok(test_sql, description)
from (
  values
    ($sql$insert into public.daily_report_item_tags (id, clinic_id, daily_report_item_id, tag_code) values ('f6060000-0000-4000-8000-000000002008', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000002000', 'MANUAL_CLASSIFICATION')$sql$, 'same-clinic daily report item tag insert succeeds'),
    ($sql$insert into public.reservation_history (id, reservation_id, action, clinic_id) values ('f6060000-0000-4000-8000-000000002009', 'f6060000-0000-4000-8000-000000000700', 'created', 'f6060000-0000-4000-8000-000000000001')$sql$, 'same-clinic reservation history insert succeeds'),
    ($sql$insert into public.reservation_notifications (id, clinic_id, reservation_id, notification_type) values ('f6060000-0000-4000-8000-000000002010', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000700', 'received')$sql$, 'same-clinic reservation notification insert succeeds')
) tests(test_sql, description);

insert into public.reservation_history (id, reservation_id, action, clinic_id)
values ('f6060000-0000-4000-8000-000000002200', 'f6060000-0000-4000-8000-000000000700', 'created', 'f6060000-0000-4000-8000-000000000001');

insert into public.reservation_notifications (id, clinic_id, reservation_id, notification_type)
values ('f6060000-0000-4000-8000-000000002201', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000700', 'reminder_day_before');

select lives_ok(test_sql, description)
from (
  values
    ($sql$update public.daily_report_items set daily_report_id = 'f6060000-0000-4000-8000-000000000901', report_date = '2096-06-02' where id = 'f6060000-0000-4000-8000-000000002100'$sql$, 'same-clinic daily report relation update succeeds'),
    ($sql$update public.daily_report_items set reservation_id = 'f6060000-0000-4000-8000-000000000701' where id = 'f6060000-0000-4000-8000-000000002101'$sql$, 'same-clinic reservation relation update succeeds'),
    ($sql$update public.daily_report_items set customer_id = 'f6060000-0000-4000-8000-000000000101' where id = 'f6060000-0000-4000-8000-000000002102'$sql$, 'same-clinic customer relation update succeeds'),
    ($sql$update public.daily_report_items set care_episode_id = 'f6060000-0000-4000-8000-000000001101' where id = 'f6060000-0000-4000-8000-000000002103'$sql$, 'same-clinic care episode relation update succeeds'),
    ($sql$update public.daily_report_items set customer_insurance_coverage_id = 'f6060000-0000-4000-8000-000000001301' where id = 'f6060000-0000-4000-8000-000000002104'$sql$, 'same-clinic insurance coverage relation update succeeds'),
    ($sql$update public.daily_report_items set menu_id = 'f6060000-0000-4000-8000-000000000301' where id = 'f6060000-0000-4000-8000-000000002105'$sql$, 'same-clinic menu relation update succeeds'),
    ($sql$update public.daily_report_items set menu_billing_profile_id = 'f6060000-0000-4000-8000-000000001501' where id = 'f6060000-0000-4000-8000-000000002106'$sql$, 'same-clinic billing profile relation update succeeds'),
    ($sql$update public.daily_report_items set staff_resource_id = 'f6060000-0000-4000-8000-000000000501' where id = 'f6060000-0000-4000-8000-000000002107'$sql$, 'same-clinic resource relation update succeeds')
) tests(test_sql, description);

select lives_ok(test_sql, description)
from (
  values
    ($sql$update public.daily_report_item_tags set daily_report_item_id = 'f6060000-0000-4000-8000-000000002100' where id = 'f6060000-0000-4000-8000-000000002008'$sql$, 'same-clinic tag relation update succeeds'),
    ($sql$update public.reservation_history set reservation_id = 'f6060000-0000-4000-8000-000000000701' where id = 'f6060000-0000-4000-8000-000000002200'$sql$, 'same-clinic history relation update succeeds'),
    ($sql$update public.reservation_notifications set reservation_id = 'f6060000-0000-4000-8000-000000000701' where id = 'f6060000-0000-4000-8000-000000002201'$sql$, 'same-clinic notification relation update succeeds')
) tests(test_sql, description);

select throws_ok(
  test_sql,
  '23503',
  format(
    'insert or update on table "%s" violates foreign key constraint "%s"',
    child_table,
    constraint_name
  ),
  description
)
from (
  values
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002300', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000001000', '2096-06-01', 'cross-report', 'test')$sql$, 'daily_report_items', 'daily_report_items_daily_report_id_fkey', 'cross-clinic daily report insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, reservation_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002301', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000800', 'cross-reservation', 'test')$sql$, 'daily_report_items', 'daily_report_items_reservation_id_fkey', 'cross-clinic reservation insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, customer_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002302', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000200', 'cross-customer', 'test')$sql$, 'daily_report_items', 'daily_report_items_customer_id_fkey', 'cross-clinic customer insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, care_episode_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002303', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001200', 'cross-care', 'test')$sql$, 'daily_report_items', 'daily_report_items_care_episode_id_fkey', 'cross-clinic care episode insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, customer_insurance_coverage_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002304', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001400', 'cross-coverage', 'test')$sql$, 'daily_report_items', 'daily_report_items_customer_insurance_coverage_id_fkey', 'cross-clinic coverage insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, menu_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002305', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000400', 'cross-menu', 'test')$sql$, 'daily_report_items', 'daily_report_items_menu_id_fkey', 'cross-clinic menu insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, menu_billing_profile_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002306', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000001600', 'cross-profile', 'test')$sql$, 'daily_report_items', 'daily_report_items_menu_billing_profile_id_fkey', 'cross-clinic billing profile insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_items (id, clinic_id, daily_report_id, report_date, staff_resource_id, patient_name, treatment_name) values ('f6060000-0000-4000-8000-000000002307', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000900', '2096-06-01', 'f6060000-0000-4000-8000-000000000600', 'cross-resource', 'test')$sql$, 'daily_report_items', 'daily_report_items_staff_resource_id_fkey', 'cross-clinic resource insert is rejected by the exact FK'),
    ($sql$insert into public.daily_report_item_tags (id, clinic_id, daily_report_item_id, tag_code) values ('f6060000-0000-4000-8000-000000002308', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000002400', 'MANUAL_CLASSIFICATION')$sql$, 'daily_report_item_tags', 'daily_report_item_tags_item_id_fkey', 'cross-clinic item tag insert is rejected by the exact FK'),
    ($sql$insert into public.reservation_history (id, reservation_id, action, clinic_id) values ('f6060000-0000-4000-8000-000000002309', 'f6060000-0000-4000-8000-000000000800', 'created', 'f6060000-0000-4000-8000-000000000001')$sql$, 'reservation_history', 'reservation_history_reservation_id_fkey', 'cross-clinic history insert is rejected by the exact FK'),
    ($sql$insert into public.reservation_notifications (id, clinic_id, reservation_id, notification_type) values ('f6060000-0000-4000-8000-000000002310', 'f6060000-0000-4000-8000-000000000001', 'f6060000-0000-4000-8000-000000000800', 'confirmed')$sql$, 'reservation_notifications', 'reservation_notifications_reservation_id_fkey', 'cross-clinic notification insert is rejected by the exact FK')
) tests(test_sql, child_table, constraint_name, description);

select throws_ok(
  test_sql,
  '23503',
  format(
    'insert or update on table "%s" violates foreign key constraint "%s"',
    child_table,
    constraint_name
  ),
  description
)
from (
  values
    ($sql$update public.daily_report_items set daily_report_id = 'f6060000-0000-4000-8000-000000001001', report_date = '2096-06-02' where id = 'f6060000-0000-4000-8000-000000002100'$sql$, 'daily_report_items', 'daily_report_items_daily_report_id_fkey', 'cross-clinic daily report update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set reservation_id = 'f6060000-0000-4000-8000-000000000800' where id = 'f6060000-0000-4000-8000-000000002101'$sql$, 'daily_report_items', 'daily_report_items_reservation_id_fkey', 'cross-clinic reservation update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set customer_id = 'f6060000-0000-4000-8000-000000000200' where id = 'f6060000-0000-4000-8000-000000002102'$sql$, 'daily_report_items', 'daily_report_items_customer_id_fkey', 'cross-clinic customer update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set care_episode_id = 'f6060000-0000-4000-8000-000000001200' where id = 'f6060000-0000-4000-8000-000000002103'$sql$, 'daily_report_items', 'daily_report_items_care_episode_id_fkey', 'cross-clinic care episode update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set customer_insurance_coverage_id = 'f6060000-0000-4000-8000-000000001400' where id = 'f6060000-0000-4000-8000-000000002104'$sql$, 'daily_report_items', 'daily_report_items_customer_insurance_coverage_id_fkey', 'cross-clinic coverage update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set menu_id = 'f6060000-0000-4000-8000-000000000400' where id = 'f6060000-0000-4000-8000-000000002105'$sql$, 'daily_report_items', 'daily_report_items_menu_id_fkey', 'cross-clinic menu update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set menu_billing_profile_id = 'f6060000-0000-4000-8000-000000001600' where id = 'f6060000-0000-4000-8000-000000002106'$sql$, 'daily_report_items', 'daily_report_items_menu_billing_profile_id_fkey', 'cross-clinic billing profile update is rejected by the exact FK'),
    ($sql$update public.daily_report_items set staff_resource_id = 'f6060000-0000-4000-8000-000000000600' where id = 'f6060000-0000-4000-8000-000000002107'$sql$, 'daily_report_items', 'daily_report_items_staff_resource_id_fkey', 'cross-clinic resource update is rejected by the exact FK'),
    ($sql$update public.daily_report_item_tags set daily_report_item_id = 'f6060000-0000-4000-8000-000000002400' where id = 'f6060000-0000-4000-8000-000000002008'$sql$, 'daily_report_item_tags', 'daily_report_item_tags_item_id_fkey', 'cross-clinic tag update is rejected by the exact FK'),
    ($sql$update public.reservation_history set reservation_id = 'f6060000-0000-4000-8000-000000000800' where id = 'f6060000-0000-4000-8000-000000002200'$sql$, 'reservation_history', 'reservation_history_reservation_id_fkey', 'cross-clinic history update is rejected by the exact FK'),
    ($sql$update public.reservation_notifications set reservation_id = 'f6060000-0000-4000-8000-000000000800' where id = 'f6060000-0000-4000-8000-000000002201'$sql$, 'reservation_notifications', 'reservation_notifications_reservation_id_fkey', 'cross-clinic notification update is rejected by the exact FK')
) tests(test_sql, child_table, constraint_name, description);

select lives_ok(test_sql, description)
from (
  values
    ($sql$update public.daily_report_items set reservation_id = null where id = 'f6060000-0000-4000-8000-000000002101'$sql$, 'nullable reservation reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set customer_id = null where id = 'f6060000-0000-4000-8000-000000002102'$sql$, 'nullable customer reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set care_episode_id = null where id = 'f6060000-0000-4000-8000-000000002103'$sql$, 'nullable care episode reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set customer_insurance_coverage_id = null where id = 'f6060000-0000-4000-8000-000000002104'$sql$, 'nullable insurance coverage reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set menu_id = null where id = 'f6060000-0000-4000-8000-000000002105'$sql$, 'nullable menu reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set menu_billing_profile_id = null where id = 'f6060000-0000-4000-8000-000000002106'$sql$, 'nullable billing profile reference remains valid with clinic_id present'),
    ($sql$update public.daily_report_items set staff_resource_id = null where id = 'f6060000-0000-4000-8000-000000002107'$sql$, 'nullable resource reference remains valid with clinic_id present')
) tests(test_sql, description);

select throws_ok(
  test_sql,
  '23503',
  format(
    'update or delete on table "%s" violates foreign key constraint "%s" on table "%s"',
    parent_table,
    constraint_name,
    child_table
  ),
  description
)
from (
  values
    ($sql$update public.daily_reports set clinic_id = 'f6060000-0000-4000-8000-000000000002' where id = 'f6060000-0000-4000-8000-000000003000'$sql$, 'daily_reports', 'daily_report_items_daily_report_id_fkey', 'daily_report_items', 'referenced daily report clinic rehome is rejected by the exact FK'),
    ($sql$update public.reservations set clinic_id = 'f6060000-0000-4000-8000-000000000002', customer_id = 'f6060000-0000-4000-8000-000000000200', menu_id = 'f6060000-0000-4000-8000-000000000400', staff_id = 'f6060000-0000-4000-8000-000000000600' where id = 'f6060000-0000-4000-8000-000000003001'$sql$, 'reservations', 'daily_report_items_reservation_id_fkey', 'daily_report_items', 'referenced reservation clinic rehome for report item is rejected by the exact FK'),
    ($sql$update public.customers set clinic_id = 'f6060000-0000-4000-8000-000000000002' where id = 'f6060000-0000-4000-8000-000000003002'$sql$, 'customers', 'daily_report_items_customer_id_fkey', 'daily_report_items', 'referenced customer clinic rehome is rejected by the exact FK'),
    ($sql$update public.care_episodes set clinic_id = 'f6060000-0000-4000-8000-000000000002', customer_id = 'f6060000-0000-4000-8000-000000000200' where id = 'f6060000-0000-4000-8000-000000003003'$sql$, 'care_episodes', 'daily_report_items_care_episode_id_fkey', 'daily_report_items', 'referenced care episode clinic rehome is rejected by the exact FK'),
    ($sql$update public.customer_insurance_coverages set clinic_id = 'f6060000-0000-4000-8000-000000000002', customer_id = 'f6060000-0000-4000-8000-000000000200' where id = 'f6060000-0000-4000-8000-000000003004'$sql$, 'customer_insurance_coverages', 'daily_report_items_customer_insurance_coverage_id_fkey', 'daily_report_items', 'referenced insurance coverage clinic rehome is rejected by the exact FK'),
    ($sql$update public.menus set clinic_id = 'f6060000-0000-4000-8000-000000000002' where id = 'f6060000-0000-4000-8000-000000003005'$sql$, 'menus', 'daily_report_items_menu_id_fkey', 'daily_report_items', 'referenced menu clinic rehome is rejected by the exact FK'),
    ($sql$update public.menu_billing_profiles set clinic_id = 'f6060000-0000-4000-8000-000000000002', menu_id = 'f6060000-0000-4000-8000-000000000400' where id = 'f6060000-0000-4000-8000-000000003006'$sql$, 'menu_billing_profiles', 'daily_report_items_menu_billing_profile_id_fkey', 'daily_report_items', 'referenced billing profile clinic rehome is rejected by the exact FK'),
    ($sql$update public.resources set clinic_id = 'f6060000-0000-4000-8000-000000000002' where id = 'f6060000-0000-4000-8000-000000003007'$sql$, 'resources', 'daily_report_items_staff_resource_id_fkey', 'daily_report_items', 'referenced resource clinic rehome is rejected by the exact FK'),
    ($sql$update public.daily_report_items set clinic_id = 'f6060000-0000-4000-8000-000000000002', daily_report_id = 'f6060000-0000-4000-8000-000000001000' where id = 'f6060000-0000-4000-8000-000000003108'$sql$, 'daily_report_items', 'daily_report_item_tags_item_id_fkey', 'daily_report_item_tags', 'referenced daily report item clinic rehome is rejected by the exact FK'),
    ($sql$update public.reservations set clinic_id = 'f6060000-0000-4000-8000-000000000002', customer_id = 'f6060000-0000-4000-8000-000000000200', menu_id = 'f6060000-0000-4000-8000-000000000400', staff_id = 'f6060000-0000-4000-8000-000000000600' where id = 'f6060000-0000-4000-8000-000000003009'$sql$, 'reservations', 'reservation_history_reservation_id_fkey', 'reservation_history', 'referenced reservation clinic rehome for history is rejected by the exact FK'),
    ($sql$update public.reservations set clinic_id = 'f6060000-0000-4000-8000-000000000002', customer_id = 'f6060000-0000-4000-8000-000000000200', menu_id = 'f6060000-0000-4000-8000-000000000400', staff_id = 'f6060000-0000-4000-8000-000000000600' where id = 'f6060000-0000-4000-8000-000000003010'$sql$, 'reservations', 'reservation_notifications_reservation_id_fkey', 'reservation_notifications', 'referenced reservation clinic rehome for notification is rejected by the exact FK')
) tests(test_sql, parent_table, constraint_name, child_table, description);

delete from public.reservations
where id = 'f6060000-0000-4000-8000-000000004101';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004201'
      and reservation_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'reservation delete nulls only reservation_id and preserves the report item tenant key'
);

delete from public.customers
where id = 'f6060000-0000-4000-8000-000000004102';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004202'
      and customer_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'customer delete nulls only customer_id and preserves the report item tenant key'
);

delete from public.care_episodes
where id = 'f6060000-0000-4000-8000-000000004103';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004203'
      and care_episode_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'care episode delete nulls only care_episode_id and preserves the report item tenant key'
);

delete from public.customer_insurance_coverages
where id = 'f6060000-0000-4000-8000-000000004104';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004204'
      and customer_insurance_coverage_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'coverage delete nulls only coverage id and preserves the report item tenant key'
);

delete from public.menus
where id = 'f6060000-0000-4000-8000-000000004105';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004205'
      and menu_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'menu delete nulls only menu_id and preserves the report item tenant key'
);

delete from public.menu_billing_profiles
where id = 'f6060000-0000-4000-8000-000000004106';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004206'
      and menu_billing_profile_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'billing profile delete nulls only profile id and preserves the report item tenant key'
);

delete from public.resources
where id = 'f6060000-0000-4000-8000-000000004107';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004207'
      and staff_resource_id is null
      and clinic_id = 'f6060000-0000-4000-8000-000000000001'
      and daily_report_id = 'f6060000-0000-4000-8000-000000000900'
  ),
  1::bigint,
  'resource delete nulls only staff_resource_id and preserves the report item tenant key'
);

delete from public.daily_reports
where id = 'f6060000-0000-4000-8000-000000004100';

select is(
  (
    select count(*)
    from public.daily_report_items
    where id = 'f6060000-0000-4000-8000-000000004200'
  ),
  0::bigint,
  'daily report delete cascades to its report item'
);

delete from public.daily_report_items
where id = 'f6060000-0000-4000-8000-000000004208';

select is(
  (
    select count(*)
    from public.daily_report_item_tags
    where id = 'f6060000-0000-4000-8000-000000004208'
  ),
  0::bigint,
  'daily report item delete cascades to its tag'
);

delete from public.reservations
where id = 'f6060000-0000-4000-8000-000000004109';

select is(
  (
    select count(*)
    from public.reservation_history
    where id = 'f6060000-0000-4000-8000-000000004209'
  ),
  0::bigint,
  'reservation delete cascades to history without audit-trigger interference'
);

delete from public.reservations
where id = 'f6060000-0000-4000-8000-000000004110';

select is(
  (
    select count(*)
    from public.reservation_notifications
    where id = 'f6060000-0000-4000-8000-000000004210'
  ),
  0::bigint,
  'reservation delete cascades to notification without audit-trigger interference'
);

reset role;

alter table public.daily_report_items
  enable trigger daily_report_items_clinic_ref_check;
alter table public.daily_report_items
  enable trigger daily_report_items_analysis_ref_check;
alter table public.daily_report_items
  enable trigger daily_report_items_pricing_ref_check;
alter table public.daily_report_item_tags
  enable trigger daily_report_item_tags_ref_check;
alter table public.reservation_history
  enable trigger reservation_history_clinic_ref_check;
alter table public.reservations enable trigger reservation_created_log;
alter table public.reservations enable trigger reservation_updated_log;
alter table public.reservations enable trigger reservation_deleted_log;

select * from finish();

rollback;
