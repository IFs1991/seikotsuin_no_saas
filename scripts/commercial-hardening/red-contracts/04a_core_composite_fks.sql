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
    match_type,
    validated,
    is_deferrable
  ) as (
    values
      ('reservations_customer_id_fkey', 'public.reservations'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'a', 'r', 's', true, false),
      ('reservations_menu_id_fkey', 'public.reservations'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'a', 'r', 's', true, false),
      ('reservations_staff_id_fkey', 'public.reservations'::regclass, array['staff_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'a', 'r', 's', true, false),
      ('blocks_resource_id_fkey', 'public.blocks'::regclass, array['resource_id', 'clinic_id'], 'public.resources'::regclass, array['id', 'clinic_id'], 'a', 'c', 's', true, false),
      ('care_episodes_customer_id_fkey', 'public.care_episodes'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'a', 'c', 's', true, false),
      ('customer_insurance_coverages_customer_id_fkey', 'public.customer_insurance_coverages'::regclass, array['customer_id', 'clinic_id'], 'public.customers'::regclass, array['id', 'clinic_id'], 'a', 'c', 's', true, false),
      ('menu_billing_profiles_menu_id_fkey', 'public.menu_billing_profiles'::regclass, array['menu_id', 'clinic_id'], 'public.menus'::regclass, array['id', 'clinic_id'], 'a', 'c', 's', true, false)
  ),
  actual as (
    select
      con.conname::text as constraint_name,
      con.conrelid as child_table,
      child_columns.columns as child_columns,
      con.confrelid as parent_table,
      parent_columns.columns as parent_columns,
      con.confupdtype::text as update_action,
      con.confdeltype::text as delete_action,
      con.confmatchtype::text as match_type,
      con.convalidated as validated,
      con.condeferrable as is_deferrable
    from pg_constraint con
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = keys.attnum
    ) child_columns on true
    join lateral (
      select array_agg(att.attname::text order by keys.ordinality) as columns
      from unnest(con.confkey) with ordinality keys(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.confrelid
       and att.attnum = keys.attnum
    ) parent_columns on true
    where con.contype = 'f'
      and con.conname in (select constraint_name from expected)
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
      '%s:%s(%s)->%s(%s):delete=%s',
      drift_type,
      child_table::regclass,
      array_to_string(child_columns, ','),
      parent_table::regclass,
      array_to_string(parent_columns, ','),
      delete_action
    ),
    '; ' order by drift_type, constraint_name
  )
  into contract_drift
  from drift;

  if contract_drift is not null then
    raise exception 'RED COMM-FK-003: core tenant FK contract drift: %', contract_drift;
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
    con.conrelid::regclass::text || ':' || con.conname,
    ', ' order by con.conrelid::regclass::text, con.conname
  )
  into contract_drift
  from pg_constraint con
  join expected
    on expected.child_table = con.conrelid
   and expected.parent_table = con.confrelid
  join lateral (
    select array_agg(att.attname::text order by keys.ordinality) as columns
    from unnest(con.conkey) with ordinality keys(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = keys.attnum
  ) child_columns on true
  join lateral (
    select array_agg(att.attname::text order by keys.ordinality) as columns
    from unnest(con.confkey) with ordinality keys(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.confrelid
     and att.attnum = keys.attnum
  ) parent_columns on true
  where con.contype = 'f'
    and con.conname <> expected.constraint_name
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
      'RED COMM-FK-003: duplicate structural core tenant FK: %',
      contract_drift;
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
    con.conname::text,
    ', ' order by con.conname::text
  )
  into contract_drift
  from pg_constraint con
  join expected
    on expected.child_table = con.conrelid
   and expected.constraint_name = con.conname
  join lateral (
    select
      count(*) as trigger_count,
      count(*) filter (where trigger_data.tgenabled = 'O') as enabled_count
    from pg_trigger trigger_data
    where trigger_data.tgconstraint = con.oid
      and trigger_data.tgisinternal
  ) trigger_state on true
  where con.contype = 'f'
    and (
      trigger_state.trigger_count <> 4
      or trigger_state.enabled_count <> 4
    );

  if contract_drift is not null then
    raise exception
      'RED COMM-FK-003: core tenant FK RI trigger drift: %',
      contract_drift;
  end if;
end
$commercial_red$;
