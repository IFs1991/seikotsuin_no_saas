-- PR-05 security-preserving rollback / forward-fix guard.
--
-- Preconditions:
--   * Explicit operator approval is required before running this file.
-- Code compatibility: PR-04 application code remains compatible because the
--   seven stable FK names are preserved by PR-05.
-- Data loss: none. This file performs catalog and data checks only.
-- Security regression: none. It never drops composite FKs, parent uniqueness,
--   or supporting indexes and never restores the single-column-only model.
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
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
begin
  with expected(
    constraint_name,
    child_table,
    child_columns,
    parent_table,
    parent_columns,
    delete_action
  ) as (
    values
      ('reservations_customer_id_fkey', 'public.reservations'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'r'),
      ('reservations_menu_id_fkey', 'public.reservations'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'r'),
      ('reservations_staff_id_fkey', 'public.reservations'::regclass, array['staff_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'r'),
      ('blocks_resource_id_fkey', 'public.blocks'::regclass, array['resource_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'c'),
      ('care_episodes_customer_id_fkey', 'public.care_episodes'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'c'),
      ('customer_insurance_coverages_customer_id_fkey', 'public.customer_insurance_coverages'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'c'),
      ('menu_billing_profiles_menu_id_fkey', 'public.menu_billing_profiles'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'c')
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as child_table,
      child_columns.columns as child_columns,
      constraint_data.confrelid as parent_table,
      parent_columns.columns as parent_columns,
      constraint_data.confdeltype::text as delete_action
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
    where constraint_data.contype = 'f'
      and constraint_data.convalidated
      and constraint_data.confupdtype = 'a'
      and constraint_data.confmatchtype = 's'
      and not constraint_data.condeferrable
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
    raise exception 'PR-05 rollback refused: core composite FK drift: %', drift;
  end if;

  with expected(
    constraint_name,
    child_table,
    child_column,
    parent_table
  ) as (
    values
      ('reservations_customer_id_fkey', 'public.reservations'::regclass, 'customer_id', 'public.customers'::regclass),
      ('reservations_menu_id_fkey', 'public.reservations'::regclass, 'menu_id', 'public.menus'::regclass),
      ('reservations_staff_id_fkey', 'public.reservations'::regclass, 'staff_id', 'public.resources'::regclass),
      ('blocks_resource_id_fkey', 'public.blocks'::regclass, 'resource_id', 'public.resources'::regclass),
      ('care_episodes_customer_id_fkey', 'public.care_episodes'::regclass, 'customer_id', 'public.customers'::regclass),
      ('customer_insurance_coverages_customer_id_fkey', 'public.customer_insurance_coverages'::regclass, 'customer_id', 'public.customers'::regclass),
      ('menu_billing_profiles_menu_id_fkey', 'public.menu_billing_profiles'::regclass, 'menu_id', 'public.menus'::regclass)
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
      'PR-05 rollback refused: duplicate structural target FK: %',
      drift;
  end if;

  with expected(constraint_name, child_table) as (
    values
      ('reservations_customer_id_fkey', 'public.reservations'::regclass),
      ('reservations_menu_id_fkey', 'public.reservations'::regclass),
      ('reservations_staff_id_fkey', 'public.reservations'::regclass),
      ('blocks_resource_id_fkey', 'public.blocks'::regclass),
      ('care_episodes_customer_id_fkey', 'public.care_episodes'::regclass),
      ('customer_insurance_coverages_customer_id_fkey', 'public.customer_insurance_coverages'::regclass),
      ('menu_billing_profiles_menu_id_fkey', 'public.menu_billing_profiles'::regclass)
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
    raise exception 'PR-05 rollback refused: FK RI trigger state drift: %', drift;
  end if;

  with expected(constraint_name, parent_table, parent_columns, validated) as (
    values
      ('customers_id_clinic_unique', 'public.customers'::regclass, array['id', 'clinic_id'], true),
      ('menus_id_clinic_unique', 'public.menus'::regclass, array['id', 'clinic_id'], true),
      ('resources_id_clinic_unique', 'public.resources'::regclass, array['id', 'clinic_id'], true)
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as parent_table,
      columns.columns as parent_columns,
      constraint_data.convalidated as validated
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
      and constraint_data.conname in (select constraint_name from expected)
      and namespace_data.nspname = 'public'
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
      'PR-05 rollback refused: parent tenant uniqueness drift: %',
      drift;
  end if;

  with expected(index_name, child_table, index_columns) as (
    values
      ('reservations_customer_clinic_idx', 'public.reservations'::regclass, array['customer_id', 'clinic_id']),
      ('reservations_menu_clinic_idx', 'public.reservations'::regclass, array['menu_id', 'clinic_id']),
      ('reservations_staff_clinic_idx', 'public.reservations'::regclass, array['staff_id', 'clinic_id']),
      ('blocks_resource_clinic_idx', 'public.blocks'::regclass, array['resource_id', 'clinic_id']),
      ('care_episodes_customer_clinic_idx', 'public.care_episodes'::regclass, array['customer_id', 'clinic_id']),
      ('customer_insurance_coverages_customer_clinic_idx', 'public.customer_insurance_coverages'::regclass, array['customer_id', 'clinic_id']),
      ('menu_billing_profiles_menu_clinic_idx', 'public.menu_billing_profiles'::regclass, array['menu_id', 'clinic_id'])
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
    raise exception 'PR-05 rollback refused: supporting index drift: %', drift;
  end if;

  with expected(table_oid, column_name) as (
    values
      ('public.reservations'::regclass, 'customer_id'),
      ('public.reservations'::regclass, 'menu_id'),
      ('public.reservations'::regclass, 'staff_id'),
      ('public.reservations'::regclass, 'clinic_id'),
      ('public.blocks'::regclass, 'resource_id'),
      ('public.blocks'::regclass, 'clinic_id'),
      ('public.care_episodes'::regclass, 'customer_id'),
      ('public.care_episodes'::regclass, 'clinic_id'),
      ('public.customer_insurance_coverages'::regclass, 'customer_id'),
      ('public.customer_insurance_coverages'::regclass, 'clinic_id'),
      ('public.menu_billing_profiles'::regclass, 'menu_id'),
      ('public.menu_billing_profiles'::regclass, 'clinic_id'),
      ('public.customers'::regclass, 'id'),
      ('public.customers'::regclass, 'clinic_id'),
      ('public.menus'::regclass, 'id'),
      ('public.menus'::regclass, 'clinic_id'),
      ('public.resources'::regclass, 'id'),
      ('public.resources'::regclass, 'clinic_id')
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
   and attribute.attnotnull
  where attribute.attnum is null;

  if drift is not null then
    raise exception
      'PR-05 rollback refused: required non-null UUID column drift: %',
      drift;
  end if;

  for relation_contract in
    select *
    from (
      values
        ('public.reservations'::regclass, 'customer_id', 'public.customers'::regclass),
        ('public.reservations'::regclass, 'menu_id', 'public.menus'::regclass),
        ('public.reservations'::regclass, 'staff_id', 'public.resources'::regclass),
        ('public.blocks'::regclass, 'resource_id', 'public.resources'::regclass),
        ('public.care_episodes'::regclass, 'customer_id', 'public.customers'::regclass),
        ('public.customer_insurance_coverages'::regclass, 'customer_id', 'public.customers'::regclass),
        ('public.menu_billing_profiles'::regclass, 'menu_id', 'public.menus'::regclass)
    ) relation_data(child_table, child_column, parent_table)
  loop
    execute format(
      'select count(*) from %s child where child.%I is null or child.clinic_id is null',
      relation_contract.child_table,
      relation_contract.child_column
    ) into null_count;

    execute format(
      'select count(*) from %s child left join %s parent on parent.id = child.%I where parent.id is null',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column
    ) into orphan_count;

    execute format(
      'select count(*) from %s child join %s parent on parent.id = child.%I where child.clinic_id is distinct from parent.clinic_id',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column
    ) into mismatch_count;

    if null_count <> 0 or orphan_count <> 0 or mismatch_count <> 0 then
      raise exception
        'PR-05 rollback refused: data drift on %.% (null=%, orphan=%, mismatch=%)',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count,
        orphan_count,
        mismatch_count;
    end if;
  end loop;

  if exists (
    select 1
    from pg_class relation
    where relation.oid in (
      'public.reservations'::regclass,
      'public.customers'::regclass,
      'public.menus'::regclass,
      'public.resources'::regclass,
      'public.blocks'::regclass,
      'public.care_episodes'::regclass,
      'public.customer_insurance_coverages'::regclass,
      'public.menu_billing_profiles'::regclass
    )
      and not relation.relrowsecurity
  ) then
    raise exception 'PR-05 rollback refused: RLS is disabled on a target table';
  end if;

  raise notice
    'PR-05 rollback is intentionally validation-only; no constraint or index was changed. Use a reviewed forward-fix.';
end
$security_preserving_rollback$;

commit;
