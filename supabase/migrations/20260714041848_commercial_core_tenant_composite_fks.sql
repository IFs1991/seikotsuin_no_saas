-- Commercial hardening PR-05: core tenant composite foreign keys.
-- @spec docs/stabilization/spec-commercial-core-tenant-composite-fks-v1.0.md
-- @rollback supabase/rollbacks/20260714041848_commercial_core_tenant_composite_fks_rollback.sql
--
-- This migration is intentionally data-preserving and fail-closed. It aborts
-- on catalog drift, nulls, orphans, cross-clinic mismatches, or duplicate
-- parent tenant keys. Existing FK names and delete behavior remain stable.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr05_fk_contract (
  ordinal integer primary key,
  final_constraint_name text not null unique,
  temporary_constraint_name text not null unique,
  child_table regclass not null,
  child_column text not null,
  parent_table regclass not null,
  delete_action text not null check (delete_action in ('r', 'c'))
) on commit drop;

insert into pr05_fk_contract (
  ordinal,
  final_constraint_name,
  temporary_constraint_name,
  child_table,
  child_column,
  parent_table,
  delete_action
)
values
  (1, 'reservations_customer_id_fkey', 'reservations_customer_clinic_pr05_fkey', 'public.reservations', 'customer_id', 'public.customers', 'r'),
  (2, 'reservations_menu_id_fkey', 'reservations_menu_clinic_pr05_fkey', 'public.reservations', 'menu_id', 'public.menus', 'r'),
  (3, 'reservations_staff_id_fkey', 'reservations_staff_clinic_pr05_fkey', 'public.reservations', 'staff_id', 'public.resources', 'r'),
  (4, 'blocks_resource_id_fkey', 'blocks_resource_clinic_pr05_fkey', 'public.blocks', 'resource_id', 'public.resources', 'c'),
  (5, 'care_episodes_customer_id_fkey', 'care_episodes_customer_clinic_pr05_fkey', 'public.care_episodes', 'customer_id', 'public.customers', 'c'),
  (6, 'customer_insurance_coverages_customer_id_fkey', 'customer_insurance_coverages_customer_clinic_pr05_fkey', 'public.customer_insurance_coverages', 'customer_id', 'public.customers', 'c'),
  (7, 'menu_billing_profiles_menu_id_fkey', 'menu_billing_profiles_menu_clinic_pr05_fkey', 'public.menu_billing_profiles', 'menu_id', 'public.menus', 'c');

create temporary table pr05_index_contract (
  index_name text primary key,
  child_table regclass not null,
  index_columns text[] not null
) on commit drop;

insert into pr05_index_contract (index_name, child_table, index_columns)
values
  ('reservations_customer_clinic_idx', 'public.reservations', array['customer_id', 'clinic_id']),
  ('reservations_menu_clinic_idx', 'public.reservations', array['menu_id', 'clinic_id']),
  ('reservations_staff_clinic_idx', 'public.reservations', array['staff_id', 'clinic_id']),
  ('blocks_resource_clinic_idx', 'public.blocks', array['resource_id', 'clinic_id']),
  ('care_episodes_customer_clinic_idx', 'public.care_episodes', array['customer_id', 'clinic_id']),
  ('customer_insurance_coverages_customer_clinic_idx', 'public.customer_insurance_coverages', array['customer_id', 'clinic_id']),
  ('menu_billing_profiles_menu_clinic_idx', 'public.menu_billing_profiles', array['menu_id', 'clinic_id']);

create temporary table pr05_required_columns (
  table_oid regclass not null,
  column_name text not null,
  primary key (table_oid, column_name)
) on commit drop;

insert into pr05_required_columns (table_oid, column_name)
values
  ('public.reservations', 'customer_id'),
  ('public.reservations', 'menu_id'),
  ('public.reservations', 'staff_id'),
  ('public.reservations', 'clinic_id'),
  ('public.blocks', 'resource_id'),
  ('public.blocks', 'clinic_id'),
  ('public.care_episodes', 'customer_id'),
  ('public.care_episodes', 'clinic_id'),
  ('public.customer_insurance_coverages', 'customer_id'),
  ('public.customer_insurance_coverages', 'clinic_id'),
  ('public.menu_billing_profiles', 'menu_id'),
  ('public.menu_billing_profiles', 'clinic_id'),
  ('public.customers', 'id'),
  ('public.customers', 'clinic_id'),
  ('public.menus', 'id'),
  ('public.menus', 'clinic_id'),
  ('public.resources', 'id'),
  ('public.resources', 'clinic_id');

create temporary table pr05_table_security_snapshot on commit drop as
select
  table_list.table_oid,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  coalesce(relation.relacl::text, '<null>') as relation_acl
from (
  select distinct child_table as table_oid from pr05_fk_contract
  union
  select distinct parent_table as table_oid from pr05_fk_contract
) table_list
join pg_class relation on relation.oid = table_list.table_oid;

create temporary table pr05_policy_snapshot on commit drop as
select
  policy.polrelid as table_oid,
  policy.polname::text as policy_name,
  policy.polcmd::text as command,
  policy.polpermissive,
  policy.polroles::text as target_roles,
  coalesce(pg_get_expr(policy.polqual, policy.polrelid), '<null>') as using_expression,
  coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '<null>') as check_expression
from pg_policy policy
where policy.polrelid in (
  select table_oid from pr05_table_security_snapshot
);

create temporary table pr05_trigger_snapshot on commit drop as
select
  trigger_data.tgrelid as table_oid,
  trigger_data.tgname::text as trigger_name,
  trigger_data.tgfoid as function_oid,
  trigger_data.tgtype,
  trigger_data.tgenabled::text as enabled_state,
  pg_get_triggerdef(trigger_data.oid) as definition
from pg_trigger trigger_data
where trigger_data.tgrelid in (
  select table_oid from pr05_table_security_snapshot
)
  and not trigger_data.tgisinternal;

do $preflight$
declare
  drift text;
  relation_contract record;
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  duplicate_count bigint;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260713004754'
  ) then
    raise exception
      'PR-05 preflight failed: required PR-04 migration 20260713004754 is absent';
  end if;

  select string_agg(table_oid::text, ', ' order by table_oid::text)
  into drift
  from pr05_table_security_snapshot snapshot
  join pg_class relation on relation.oid = snapshot.table_oid
  where relation.relkind <> 'r'
     or relation.relispartition;

  if drift is not null then
    raise exception
      'PR-05 preflight failed: target must be an ordinary non-partitioned table: %',
      drift;
  end if;

  select string_agg(
    required.table_oid::text || '.' || required.column_name,
    ', ' order by required.table_oid::text, required.column_name
  )
  into drift
  from pr05_required_columns required
  left join pg_attribute attribute
    on attribute.attrelid = required.table_oid
   and attribute.attname = required.column_name
   and not attribute.attisdropped
   and attribute.atttypid = 'uuid'::regtype
   and attribute.attnotnull
  where attribute.attnum is null;

  if drift is not null then
    raise exception
      'PR-05 preflight failed: required non-null UUID column drift: %',
      drift;
  end if;

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
    select
      final_constraint_name,
      child_table,
      array[child_column],
      parent_table,
      array['id'],
      'a',
      delete_action,
      's',
      true,
      false
    from pr05_fk_contract
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
    where constraint_data.contype = 'f'
      and constraint_data.conname in (
        select final_constraint_name from pr05_fk_contract
      )
  ),
  catalog_drift as (
    select 'missing' as drift_type, expected.*
    from (select * from expected except select * from actual) expected
    union all
    select 'unexpected' as drift_type, actual.*
    from (select * from actual except select * from expected) actual
  )
  select string_agg(
    drift_type || ':' || constraint_name,
    ', ' order by drift_type, constraint_name
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-05 preflight failed: existing FK catalog drift: %', drift;
  end if;

  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into drift
  from pg_constraint constraint_data
  join pr05_fk_contract expected
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
    and constraint_data.conname <> expected.final_constraint_name
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
      'PR-05 preflight failed: duplicate structural target FK: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conname::text,
    ', ' order by constraint_data.conname::text
  )
  into drift
  from pg_constraint constraint_data
  join pr05_fk_contract expected
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
    and child_columns.columns = array[expected.child_column, 'clinic_id']
    and parent_columns.columns = array['id', 'clinic_id'];

  if drift is not null then
    raise exception
      'PR-05 preflight failed: target composite FK already exists: %',
      drift;
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_data
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.conrelid
       and attribute.attnum = keys.attnum
    ) columns on true
    where constraint_data.conrelid = 'public.customers'::regclass
      and constraint_data.conname = 'customers_id_clinic_unique'
      and constraint_data.contype = 'u'
      and constraint_data.convalidated
      and columns.columns = array['id', 'clinic_id']
  ) then
    raise exception
      'PR-05 preflight failed: customers_id_clinic_unique catalog drift';
  end if;

  if exists (
    select 1
    from pg_constraint constraint_data
    join lateral (
      select array_agg(attribute.attname::text order by keys.ordinality) as columns
      from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
      join pg_attribute attribute
        on attribute.attrelid = constraint_data.conrelid
       and attribute.attnum = keys.attnum
    ) columns on true
    where constraint_data.conrelid in (
      'public.menus'::regclass,
      'public.resources'::regclass
    )
      and constraint_data.contype = 'u'
      and columns.columns = array['id', 'clinic_id']
  ) then
    raise exception
      'PR-05 preflight failed: unexpected menu/resource tenant unique constraint';
  end if;

  select string_agg(object_name, ', ' order by object_name)
  into drift
  from (
    select constraint_data.conname::text as object_name
    from pg_constraint constraint_data
    where constraint_data.conname in (
      select temporary_constraint_name from pr05_fk_contract
      union all
      select 'menus_id_clinic_unique'
      union all
      select 'resources_id_clinic_unique'
    )
    union all
    select index_class.relname::text
    from pg_class index_class
    join pg_namespace namespace_data on namespace_data.oid = index_class.relnamespace
    where namespace_data.nspname = 'public'
      and index_class.relname in (
        select index_name from pr05_index_contract
        union all
        select 'menus_id_clinic_unique'
        union all
        select 'resources_id_clinic_unique'
      )
  ) conflicts;

  if drift is not null then
    raise exception 'PR-05 preflight failed: future object name conflict: %', drift;
  end if;

  for relation_contract in
    select * from pr05_fk_contract order by ordinal
  loop
    execute format(
      'select count(*) from %s child where child.%I is null or child.clinic_id is null',
      relation_contract.child_table,
      relation_contract.child_column
    ) into null_count;

    if null_count <> 0 then
      raise exception
        'PR-05 preflight failed: null tenant relation %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count;
    end if;

    execute format(
      'select count(*) from %s child left join %s parent on parent.id = child.%I where parent.id is null',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column
    ) into orphan_count;

    if orphan_count <> 0 then
      raise exception
        'PR-05 preflight failed: orphan %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        orphan_count;
    end if;

    execute format(
      'select count(*) from %s child join %s parent on parent.id = child.%I where child.clinic_id is distinct from parent.clinic_id',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column
    ) into mismatch_count;

    if mismatch_count <> 0 then
      raise exception
        'PR-05 preflight failed: cross-clinic mismatch %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        mismatch_count;
    end if;
  end loop;

  select sum(parent_drift_count)
  into null_count
  from (
    select count(*) as parent_drift_count
    from public.customers where id is null or clinic_id is null
    union all
    select count(*) from public.menus where id is null or clinic_id is null
    union all
    select count(*) from public.resources where id is null or clinic_id is null
  ) parent_nulls;

  if null_count <> 0 then
    raise exception 'PR-05 preflight failed: parent tenant key null count=%', null_count;
  end if;

  select sum(parent_duplicate_count)
  into duplicate_count
  from (
    select count(*) as parent_duplicate_count
    from (
      select id, clinic_id from public.customers
      group by id, clinic_id having count(*) > 1
    ) duplicate_keys
    union all
    select count(*)
    from (
      select id, clinic_id from public.menus
      group by id, clinic_id having count(*) > 1
    ) duplicate_keys
    union all
    select count(*)
    from (
      select id, clinic_id from public.resources
      group by id, clinic_id having count(*) > 1
    ) duplicate_keys
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception
      'PR-05 preflight failed: duplicate parent key count=%',
      duplicate_count;
  end if;
end
$preflight$;

alter table public.menus
  add constraint menus_id_clinic_unique unique (id, clinic_id);

alter table public.resources
  add constraint resources_id_clinic_unique unique (id, clinic_id);

create index reservations_customer_clinic_idx
  on public.reservations (customer_id, clinic_id);

create index reservations_menu_clinic_idx
  on public.reservations (menu_id, clinic_id);

create index reservations_staff_clinic_idx
  on public.reservations (staff_id, clinic_id);

create index blocks_resource_clinic_idx
  on public.blocks (resource_id, clinic_id);

create index care_episodes_customer_clinic_idx
  on public.care_episodes (customer_id, clinic_id);

create index customer_insurance_coverages_customer_clinic_idx
  on public.customer_insurance_coverages (customer_id, clinic_id);

create index menu_billing_profiles_menu_clinic_idx
  on public.menu_billing_profiles (menu_id, clinic_id);

alter table public.reservations
  add constraint reservations_customer_clinic_pr05_fkey
  foreign key (customer_id, clinic_id)
  references public.customers (id, clinic_id)
  match simple
  on update no action
  on delete restrict
  not deferrable initially immediate
  not valid;

alter table public.reservations
  add constraint reservations_menu_clinic_pr05_fkey
  foreign key (menu_id, clinic_id)
  references public.menus (id, clinic_id)
  match simple
  on update no action
  on delete restrict
  not deferrable initially immediate
  not valid;

alter table public.reservations
  add constraint reservations_staff_clinic_pr05_fkey
  foreign key (staff_id, clinic_id)
  references public.resources (id, clinic_id)
  match simple
  on update no action
  on delete restrict
  not deferrable initially immediate
  not valid;

alter table public.blocks
  add constraint blocks_resource_clinic_pr05_fkey
  foreign key (resource_id, clinic_id)
  references public.resources (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.care_episodes
  add constraint care_episodes_customer_clinic_pr05_fkey
  foreign key (customer_id, clinic_id)
  references public.customers (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.customer_insurance_coverages
  add constraint customer_insurance_coverages_customer_clinic_pr05_fkey
  foreign key (customer_id, clinic_id)
  references public.customers (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.menu_billing_profiles
  add constraint menu_billing_profiles_menu_clinic_pr05_fkey
  foreign key (menu_id, clinic_id)
  references public.menus (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.reservations
  validate constraint reservations_customer_clinic_pr05_fkey;

alter table public.reservations
  validate constraint reservations_menu_clinic_pr05_fkey;

alter table public.reservations
  validate constraint reservations_staff_clinic_pr05_fkey;

alter table public.blocks
  validate constraint blocks_resource_clinic_pr05_fkey;

alter table public.care_episodes
  validate constraint care_episodes_customer_clinic_pr05_fkey;

alter table public.customer_insurance_coverages
  validate constraint customer_insurance_coverages_customer_clinic_pr05_fkey;

alter table public.menu_billing_profiles
  validate constraint menu_billing_profiles_menu_clinic_pr05_fkey;

alter table public.reservations drop constraint reservations_customer_id_fkey;
alter table public.reservations drop constraint reservations_menu_id_fkey;
alter table public.reservations drop constraint reservations_staff_id_fkey;
alter table public.blocks drop constraint blocks_resource_id_fkey;
alter table public.care_episodes drop constraint care_episodes_customer_id_fkey;
alter table public.customer_insurance_coverages
  drop constraint customer_insurance_coverages_customer_id_fkey;
alter table public.menu_billing_profiles
  drop constraint menu_billing_profiles_menu_id_fkey;

alter table public.reservations
  rename constraint reservations_customer_clinic_pr05_fkey
  to reservations_customer_id_fkey;

alter table public.reservations
  rename constraint reservations_menu_clinic_pr05_fkey
  to reservations_menu_id_fkey;

alter table public.reservations
  rename constraint reservations_staff_clinic_pr05_fkey
  to reservations_staff_id_fkey;

alter table public.blocks
  rename constraint blocks_resource_clinic_pr05_fkey
  to blocks_resource_id_fkey;

alter table public.care_episodes
  rename constraint care_episodes_customer_clinic_pr05_fkey
  to care_episodes_customer_id_fkey;

alter table public.customer_insurance_coverages
  rename constraint customer_insurance_coverages_customer_clinic_pr05_fkey
  to customer_insurance_coverages_customer_id_fkey;

alter table public.menu_billing_profiles
  rename constraint menu_billing_profiles_menu_clinic_pr05_fkey
  to menu_billing_profiles_menu_id_fkey;

do $postflight$
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
    update_action,
    delete_action,
    match_type,
    validated,
    is_deferrable
  ) as (
    select
      final_constraint_name,
      child_table,
      array[child_column, 'clinic_id'],
      parent_table,
      array['id', 'clinic_id'],
      'a',
      delete_action,
      's',
      true,
      false
    from pr05_fk_contract
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
    where constraint_data.contype = 'f'
      and constraint_data.conname in (
        select final_constraint_name from pr05_fk_contract
      )
  ),
  catalog_drift as (
    select 'missing' as drift_type, expected.*
    from (select * from expected except select * from actual) expected
    union all
    select 'unexpected' as drift_type, actual.*
    from (select * from actual except select * from expected) actual
  )
  select string_agg(
    drift_type || ':' || constraint_name,
    ', ' order by drift_type, constraint_name
  )
  into drift
  from catalog_drift;

  if drift is not null then
    raise exception 'PR-05 postflight failed: composite FK catalog drift: %', drift;
  end if;

  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into drift
  from pg_constraint constraint_data
  join pr05_fk_contract expected
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
    and constraint_data.conname <> expected.final_constraint_name
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
      'PR-05 postflight failed: duplicate structural target FK remains: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conname::text,
    ', ' order by constraint_data.conname::text
  )
  into drift
  from pg_constraint constraint_data
  join pr05_fk_contract expected
    on expected.child_table = constraint_data.conrelid
   and expected.final_constraint_name = constraint_data.conname
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
    raise exception
      'PR-05 postflight failed: FK RI trigger state drift: %',
      drift;
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
      and index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
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
    raise exception 'PR-05 postflight failed: parent unique catalog drift: %', drift;
  end if;

  with expected as (
    select index_name, child_table, index_columns
    from pr05_index_contract
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
    raise exception 'PR-05 postflight failed: child index catalog drift: %', drift;
  end if;

  for relation_contract in
    select * from pr05_fk_contract order by ordinal
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
        'PR-05 postflight failed: relation %.% null=% orphan=% cross-clinic mismatch=%',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count,
        orphan_count,
        mismatch_count;
    end if;
  end loop;

  with current_state as (
    select
      snapshot.table_oid,
      relation.relrowsecurity,
      relation.relforcerowsecurity,
      coalesce(relation.relacl::text, '<null>') as relation_acl
    from pr05_table_security_snapshot snapshot
    join pg_class relation on relation.oid = snapshot.table_oid
  ),
  security_drift as (
    select * from pr05_table_security_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr05_table_security_snapshot
  )
  select string_agg(table_oid::text, ', ' order by table_oid::text)
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-05 postflight failed: table RLS/ACL drift: %', drift;
  end if;

  with current_state as (
    select
      policy.polrelid as table_oid,
      policy.polname::text as policy_name,
      policy.polcmd::text as command,
      policy.polpermissive,
      policy.polroles::text as target_roles,
      coalesce(pg_get_expr(policy.polqual, policy.polrelid), '<null>') as using_expression,
      coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '<null>') as check_expression
    from pg_policy policy
    where policy.polrelid in (select table_oid from pr05_table_security_snapshot)
  ),
  security_drift as (
    select * from pr05_policy_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr05_policy_snapshot
  )
  select string_agg(
    table_oid::text || ':' || policy_name,
    ', ' order by table_oid::text, policy_name
  )
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-05 postflight failed: RLS policy drift: %', drift;
  end if;

  with current_state as (
    select
      trigger_data.tgrelid as table_oid,
      trigger_data.tgname::text as trigger_name,
      trigger_data.tgfoid as function_oid,
      trigger_data.tgtype,
      trigger_data.tgenabled::text as enabled_state,
      pg_get_triggerdef(trigger_data.oid) as definition
    from pg_trigger trigger_data
    where trigger_data.tgrelid in (select table_oid from pr05_table_security_snapshot)
      and not trigger_data.tgisinternal
  ),
  security_drift as (
    select * from pr05_trigger_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr05_trigger_snapshot
  )
  select string_agg(
    table_oid::text || ':' || trigger_name,
    ', ' order by table_oid::text, trigger_name
  )
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-05 postflight failed: user trigger drift: %', drift;
  end if;
end
$postflight$;

commit;
