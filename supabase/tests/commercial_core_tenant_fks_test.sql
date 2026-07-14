begin;

set local search_path = pg_catalog, extensions, public, auth;

select plan(40);

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
      select * from expected except select * from actual
      union all
      select * from actual except select * from expected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the exact seven validated core tenant FK definitions are present'
);

select is(
  (
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
    select count(*)
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
      )
  ),
  0::bigint,
  'no duplicate single-column or composite counterpart remains for a core tenant FK'
);

select is(
  (
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
    select count(*)
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
      )
  ),
  0::bigint,
  'all 28 internal RI triggers for the seven core tenant FKs are enabled'
);

select is(
  (
    with expected(constraint_name, parent_table, parent_columns, validated) as (
      values
        ('customers_id_clinic_unique', 'public.customers'::regclass, array['id', 'clinic_id'], true),
        ('menus_id_clinic_unique', 'public.menus'::regclass, array['id', 'clinic_id'], true),
        ('resources_id_clinic_unique', 'public.resources'::regclass, array['id', 'clinic_id'], true)
    ),
    actual as (
      select
        con.conname::text as constraint_name,
        con.conrelid as parent_table,
        columns.columns as parent_columns,
        con.convalidated as validated
      from pg_constraint con
      join lateral (
        select array_agg(att.attname::text order by keys.ordinality) as columns
        from unnest(con.conkey) with ordinality keys(attnum, ordinality)
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = keys.attnum
      ) columns on true
      where con.contype = 'u'
        and con.conname in (select constraint_name from expected)
    ),
    drift as (
      select * from expected except select * from actual
      union all
      select * from actual except select * from expected
    )
    select count(*) from drift
  ),
  0::bigint,
  'the three exact parent tenant unique constraints are validated'
);

select is(
  (
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
      join pg_am access_method on access_method.oid = index_class.relam
      join lateral (
        select array_agg(att.attname::text order by keys.ordinality) as columns
        from unnest(index_data.indkey::smallint[])
          with ordinality keys(attnum, ordinality)
        join pg_attribute att
          on att.attrelid = index_data.indrelid
         and att.attnum = keys.attnum
        where keys.ordinality <= index_data.indnkeyatts
      ) columns on true
      where index_class.relname in (select index_name from expected)
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
  'the seven full child FK indexes are valid and ready in exact column order'
);

select is(
  (
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
    select count(*)
    from expected
    left join pg_attribute att
      on att.attrelid = expected.table_oid
     and att.attname = expected.column_name
     and not att.attisdropped
     and att.atttypid = 'uuid'::regtype
     and att.attnotnull
    where att.attnum is null
  ),
  0::bigint,
  'all involved tenant relationship columns are non-null UUIDs'
);

select is(
  (
    (select count(*) from public.reservations c join public.customers p on p.id = c.customer_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.reservations c join public.menus p on p.id = c.menu_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.reservations c join public.resources p on p.id = c.staff_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.blocks c join public.resources p on p.id = c.resource_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.care_episodes c join public.customers p on p.id = c.customer_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.customer_insurance_coverages c join public.customers p on p.id = c.customer_id where c.clinic_id is distinct from p.clinic_id) +
    (select count(*) from public.menu_billing_profiles c join public.menus p on p.id = c.menu_id where c.clinic_id is distinct from p.clinic_id)
  ),
  0::bigint,
  'all seven current child-parent relations have zero cross-clinic mismatches'
);

select is(
  (
    (select count(*) from public.reservations c left join public.customers p on p.id = c.customer_id where c.customer_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.reservations c left join public.menus p on p.id = c.menu_id where c.menu_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.reservations c left join public.resources p on p.id = c.staff_id where c.staff_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.blocks c left join public.resources p on p.id = c.resource_id where c.resource_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.care_episodes c left join public.customers p on p.id = c.customer_id where c.customer_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.customer_insurance_coverages c left join public.customers p on p.id = c.customer_id where c.customer_id is null or c.clinic_id is null or p.id is null) +
    (select count(*) from public.menu_billing_profiles c left join public.menus p on p.id = c.menu_id where c.menu_id is null or c.clinic_id is null or p.id is null)
  ),
  0::bigint,
  'all seven current child-parent relations have zero nulls and orphans'
);

select is(
  (
    select sum(duplicate_count)
    from (
      select count(*) as duplicate_count
      from (select id, clinic_id from public.customers group by id, clinic_id having count(*) > 1) duplicates
      union all
      select count(*)
      from (select id, clinic_id from public.menus group by id, clinic_id having count(*) > 1) duplicates
      union all
      select count(*)
      from (select id, clinic_id from public.resources group by id, clinic_id having count(*) > 1) duplicates
    ) counts
  ),
  0::numeric,
  'all three parent relations have zero duplicate tenant keys'
);

insert into public.clinics (id, name)
values
  ('f5050000-0000-4000-8000-000000000001', 'pr05-clinic-a'),
  ('f5050000-0000-4000-8000-000000000002', 'pr05-clinic-b');

insert into public.customers (id, clinic_id, name, phone)
values
  ('f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000001', 'pr05-customer-a1', '09050500010'),
  ('f5050000-0000-4000-8000-000000000011', 'f5050000-0000-4000-8000-000000000002', 'pr05-customer-b', '09050500011'),
  ('f5050000-0000-4000-8000-000000000012', 'f5050000-0000-4000-8000-000000000001', 'pr05-customer-a2', '09050500012');

insert into public.menus (id, clinic_id, name, price, duration_minutes)
values
  ('f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000001', 'pr05-menu-a1', 1000, 30),
  ('f5050000-0000-4000-8000-000000000021', 'f5050000-0000-4000-8000-000000000002', 'pr05-menu-b', 1000, 30),
  ('f5050000-0000-4000-8000-000000000022', 'f5050000-0000-4000-8000-000000000001', 'pr05-menu-a2', 1000, 30);

insert into public.resources (id, clinic_id, name, type)
values
  ('f5050000-0000-4000-8000-000000000030', 'f5050000-0000-4000-8000-000000000001', 'pr05-resource-a1', 'staff'),
  ('f5050000-0000-4000-8000-000000000031', 'f5050000-0000-4000-8000-000000000002', 'pr05-resource-b', 'staff'),
  ('f5050000-0000-4000-8000-000000000032', 'f5050000-0000-4000-8000-000000000001', 'pr05-resource-a2', 'staff');

alter table public.reservations disable trigger reservations_clinic_ref_check;
alter table public.blocks disable trigger blocks_clinic_ref_check;
alter table public.customer_insurance_coverages
  disable trigger customer_insurance_coverages_ref_check;
alter table public.menu_billing_profiles
  disable trigger menu_billing_profiles_ref_check;

select lives_ok(
  $$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000100', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000030', '2095-05-05T00:00:00Z', '2095-05-05T00:30:00Z', 'cancelled')$$,
  'same-clinic reservation customer relation inserts'
);

select lives_ok(
  $$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000101', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000030', '2095-05-05T01:00:00Z', '2095-05-05T01:30:00Z', 'cancelled')$$,
  'same-clinic reservation menu relation inserts'
);

select lives_ok(
  $$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000102', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000030', '2095-05-05T02:00:00Z', '2095-05-05T02:30:00Z', 'cancelled')$$,
  'same-clinic reservation staff relation inserts'
);

select lives_ok(
  $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time) values ('f5050000-0000-4000-8000-000000000110', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000030', '2095-05-06T00:00:00Z', '2095-05-06T01:00:00Z')$$,
  'same-clinic block resource relation inserts'
);

select lives_ok(
  $$insert into public.care_episodes (id, clinic_id, customer_id, started_on) values ('f5050000-0000-4000-8000-000000000120', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', '2095-05-05')$$,
  'same-clinic care episode customer relation inserts'
);

select lives_ok(
  $$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('f5050000-0000-4000-8000-000000000130', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 10, '2095-05-05', 'needs_review')$$,
  'same-clinic insurance coverage customer relation inserts'
);

select lives_ok(
  $$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('f5050000-0000-4000-8000-000000000140', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000020', 'private', 'manual_estimate', '2095-05-05')$$,
  'same-clinic menu billing relation inserts'
);

select lives_ok($$update public.reservations set customer_id = 'f5050000-0000-4000-8000-000000000012' where id = 'f5050000-0000-4000-8000-000000000100'$$, 'same-clinic reservation customer relation updates');
select lives_ok($$update public.reservations set menu_id = 'f5050000-0000-4000-8000-000000000022' where id = 'f5050000-0000-4000-8000-000000000101'$$, 'same-clinic reservation menu relation updates');
select lives_ok($$update public.reservations set staff_id = 'f5050000-0000-4000-8000-000000000032' where id = 'f5050000-0000-4000-8000-000000000102'$$, 'same-clinic reservation staff relation updates');
select lives_ok($$update public.blocks set resource_id = 'f5050000-0000-4000-8000-000000000032' where id = 'f5050000-0000-4000-8000-000000000110'$$, 'same-clinic block resource relation updates');
select lives_ok($$update public.care_episodes set customer_id = 'f5050000-0000-4000-8000-000000000012' where id = 'f5050000-0000-4000-8000-000000000120'$$, 'same-clinic care episode customer relation updates');
select lives_ok($$update public.customer_insurance_coverages set customer_id = 'f5050000-0000-4000-8000-000000000012' where id = 'f5050000-0000-4000-8000-000000000130'$$, 'same-clinic insurance coverage customer relation updates');
select lives_ok($$update public.menu_billing_profiles set menu_id = 'f5050000-0000-4000-8000-000000000022' where id = 'f5050000-0000-4000-8000-000000000140'$$, 'same-clinic menu billing relation updates');

select throws_ok($$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000200', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000011', 'f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000030', '2095-05-07T00:00:00Z', '2095-05-07T00:30:00Z', 'cancelled')$$, '23503', null::text, 'cross-clinic reservation customer insert is rejected by the FK');
select throws_ok($$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000201', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000021', 'f5050000-0000-4000-8000-000000000030', '2095-05-07T01:00:00Z', '2095-05-07T01:30:00Z', 'cancelled')$$, '23503', null::text, 'cross-clinic reservation menu insert is rejected by the FK');
select throws_ok($$insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status) values ('f5050000-0000-4000-8000-000000000202', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000010', 'f5050000-0000-4000-8000-000000000020', 'f5050000-0000-4000-8000-000000000031', '2095-05-07T02:00:00Z', '2095-05-07T02:30:00Z', 'cancelled')$$, '23503', null::text, 'cross-clinic reservation staff insert is rejected by the FK');
select throws_ok($$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time) values ('f5050000-0000-4000-8000-000000000203', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000031', '2095-05-08T00:00:00Z', '2095-05-08T01:00:00Z')$$, '23503', null::text, 'cross-clinic block resource insert is rejected by the FK');
select throws_ok($$insert into public.care_episodes (id, clinic_id, customer_id, started_on) values ('f5050000-0000-4000-8000-000000000204', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000011', '2095-05-06')$$, '23503', null::text, 'cross-clinic care episode customer insert is rejected by the FK');
select throws_ok($$insert into public.customer_insurance_coverages (id, clinic_id, customer_id, patient_burden_rate, effective_from, verification_status) values ('f5050000-0000-4000-8000-000000000205', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000011', 10, '2095-05-06', 'needs_review')$$, '23503', null::text, 'cross-clinic coverage customer insert is rejected by the FK');
select throws_ok($$insert into public.menu_billing_profiles (id, clinic_id, menu_id, revenue_context_code, calculation_method, effective_from) values ('f5050000-0000-4000-8000-000000000206', 'f5050000-0000-4000-8000-000000000001', 'f5050000-0000-4000-8000-000000000021', 'private', 'manual_estimate', '2095-05-06')$$, '23503', null::text, 'cross-clinic menu billing insert is rejected by the FK');

select throws_ok($$update public.reservations set customer_id = 'f5050000-0000-4000-8000-000000000011' where id = 'f5050000-0000-4000-8000-000000000100'$$, '23503', null::text, 'cross-clinic reservation customer update is rejected by the FK');
select throws_ok($$update public.reservations set menu_id = 'f5050000-0000-4000-8000-000000000021' where id = 'f5050000-0000-4000-8000-000000000101'$$, '23503', null::text, 'cross-clinic reservation menu update is rejected by the FK');
select throws_ok($$update public.reservations set staff_id = 'f5050000-0000-4000-8000-000000000031' where id = 'f5050000-0000-4000-8000-000000000102'$$, '23503', null::text, 'cross-clinic reservation staff update is rejected by the FK');
select throws_ok($$update public.blocks set resource_id = 'f5050000-0000-4000-8000-000000000031' where id = 'f5050000-0000-4000-8000-000000000110'$$, '23503', null::text, 'cross-clinic block resource update is rejected by the FK');
select throws_ok($$update public.care_episodes set customer_id = 'f5050000-0000-4000-8000-000000000011' where id = 'f5050000-0000-4000-8000-000000000120'$$, '23503', null::text, 'cross-clinic care episode customer update is rejected by the FK');
select throws_ok($$update public.customer_insurance_coverages set customer_id = 'f5050000-0000-4000-8000-000000000011' where id = 'f5050000-0000-4000-8000-000000000130'$$, '23503', null::text, 'cross-clinic coverage customer update is rejected by the FK');
select throws_ok($$update public.menu_billing_profiles set menu_id = 'f5050000-0000-4000-8000-000000000021' where id = 'f5050000-0000-4000-8000-000000000140'$$, '23503', null::text, 'cross-clinic menu billing update is rejected by the FK');

alter table public.reservations enable trigger reservations_clinic_ref_check;
alter table public.blocks enable trigger blocks_clinic_ref_check;
alter table public.customer_insurance_coverages
  enable trigger customer_insurance_coverages_ref_check;
alter table public.menu_billing_profiles
  enable trigger menu_billing_profiles_ref_check;

select throws_ok($$update public.customers set clinic_id = 'f5050000-0000-4000-8000-000000000002' where id = 'f5050000-0000-4000-8000-000000000012'$$, '23503', null::text, 'referenced customer clinic rehome is rejected');
select throws_ok($$update public.menus set clinic_id = 'f5050000-0000-4000-8000-000000000002' where id = 'f5050000-0000-4000-8000-000000000022'$$, '23503', null::text, 'referenced menu clinic rehome is rejected');
select throws_ok($$update public.resources set clinic_id = 'f5050000-0000-4000-8000-000000000002' where id = 'f5050000-0000-4000-8000-000000000032'$$, '23503', null::text, 'referenced resource clinic rehome is rejected');

select * from finish();

rollback;
