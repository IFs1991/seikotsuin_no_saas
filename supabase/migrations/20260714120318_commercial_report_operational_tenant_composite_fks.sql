-- Commercial hardening PR-06: report and operational tenant composite FKs.
-- @spec docs/stabilization/spec-commercial-report-operational-tenant-composite-fks-v1.0.md
-- @rollback supabase/rollbacks/20260714120318_commercial_report_operational_tenant_composite_fks_rollback.sql
--
-- This migration is data-preserving and fail-closed. It never guesses tenant
-- ownership. It aborts on catalog drift, null tenant keys, orphans,
-- cross-clinic mismatches, duplicate parent keys, or security metadata drift.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr06_fk_contract (
  ordinal integer primary key,
  final_constraint_name text not null unique,
  temporary_constraint_name text not null unique,
  child_table regclass not null,
  child_column text not null,
  child_nullable boolean not null,
  parent_table regclass not null,
  delete_action text not null check (delete_action in ('c', 'n')),
  delete_set_column text,
  check (
    (delete_action = 'c' and delete_set_column is null)
    or
    (delete_action = 'n' and delete_set_column = child_column)
  )
) on commit drop;

insert into pr06_fk_contract (
  ordinal,
  final_constraint_name,
  temporary_constraint_name,
  child_table,
  child_column,
  child_nullable,
  parent_table,
  delete_action,
  delete_set_column
)
values
  (1, 'daily_report_items_daily_report_id_fkey', 'dri_daily_report_clinic_pr06_fkey', 'public.daily_report_items', 'daily_report_id', false, 'public.daily_reports', 'c', null),
  (2, 'daily_report_items_reservation_id_fkey', 'dri_reservation_clinic_pr06_fkey', 'public.daily_report_items', 'reservation_id', true, 'public.reservations', 'n', 'reservation_id'),
  (3, 'daily_report_items_customer_id_fkey', 'dri_customer_clinic_pr06_fkey', 'public.daily_report_items', 'customer_id', true, 'public.customers', 'n', 'customer_id'),
  (4, 'daily_report_items_care_episode_id_fkey', 'dri_care_episode_clinic_pr06_fkey', 'public.daily_report_items', 'care_episode_id', true, 'public.care_episodes', 'n', 'care_episode_id'),
  (5, 'daily_report_items_customer_insurance_coverage_id_fkey', 'dri_insurance_coverage_clinic_pr06_fkey', 'public.daily_report_items', 'customer_insurance_coverage_id', true, 'public.customer_insurance_coverages', 'n', 'customer_insurance_coverage_id'),
  (6, 'daily_report_items_menu_id_fkey', 'dri_menu_clinic_pr06_fkey', 'public.daily_report_items', 'menu_id', true, 'public.menus', 'n', 'menu_id'),
  (7, 'daily_report_items_menu_billing_profile_id_fkey', 'dri_menu_billing_profile_clinic_pr06_fkey', 'public.daily_report_items', 'menu_billing_profile_id', true, 'public.menu_billing_profiles', 'n', 'menu_billing_profile_id'),
  (8, 'daily_report_items_staff_resource_id_fkey', 'dri_staff_resource_clinic_pr06_fkey', 'public.daily_report_items', 'staff_resource_id', true, 'public.resources', 'n', 'staff_resource_id'),
  (9, 'daily_report_item_tags_item_id_fkey', 'drit_item_clinic_pr06_fkey', 'public.daily_report_item_tags', 'daily_report_item_id', false, 'public.daily_report_items', 'c', null),
  (10, 'reservation_history_reservation_id_fkey', 'reservation_history_reservation_clinic_pr06_fkey', 'public.reservation_history', 'reservation_id', false, 'public.reservations', 'c', null),
  (11, 'reservation_notifications_reservation_id_fkey', 'reservation_notifications_reservation_clinic_pr06_fkey', 'public.reservation_notifications', 'reservation_id', false, 'public.reservations', 'c', null);

create temporary table pr06_parent_contract (
  constraint_name text primary key,
  parent_table regclass not null unique,
  existed_before boolean not null
) on commit drop;

insert into pr06_parent_contract (
  constraint_name,
  parent_table,
  existed_before
)
values
  ('daily_reports_id_clinic_unique', 'public.daily_reports', false),
  ('reservations_id_clinic_unique', 'public.reservations', true),
  ('customers_id_clinic_unique', 'public.customers', true),
  ('care_episodes_id_clinic_unique', 'public.care_episodes', false),
  ('customer_insurance_coverages_id_clinic_unique', 'public.customer_insurance_coverages', false),
  ('menus_id_clinic_unique', 'public.menus', true),
  ('menu_billing_profiles_id_clinic_unique', 'public.menu_billing_profiles', false),
  ('resources_id_clinic_unique', 'public.resources', true),
  ('daily_report_items_id_clinic_unique', 'public.daily_report_items', false);

create temporary table pr06_index_contract (
  index_name text primary key,
  child_table regclass not null,
  index_columns text[] not null
) on commit drop;

insert into pr06_index_contract (index_name, child_table, index_columns)
values
  ('daily_report_items_daily_report_clinic_idx', 'public.daily_report_items', array['daily_report_id', 'clinic_id']),
  ('daily_report_items_reservation_clinic_idx', 'public.daily_report_items', array['reservation_id', 'clinic_id']),
  ('daily_report_items_customer_clinic_idx', 'public.daily_report_items', array['customer_id', 'clinic_id']),
  ('daily_report_items_care_episode_clinic_idx', 'public.daily_report_items', array['care_episode_id', 'clinic_id']),
  ('daily_report_items_customer_insurance_coverage_clinic_idx', 'public.daily_report_items', array['customer_insurance_coverage_id', 'clinic_id']),
  ('daily_report_items_menu_clinic_idx', 'public.daily_report_items', array['menu_id', 'clinic_id']),
  ('daily_report_items_menu_billing_profile_clinic_idx', 'public.daily_report_items', array['menu_billing_profile_id', 'clinic_id']),
  ('daily_report_items_staff_resource_clinic_idx', 'public.daily_report_items', array['staff_resource_id', 'clinic_id']),
  ('daily_report_item_tags_item_clinic_idx', 'public.daily_report_item_tags', array['daily_report_item_id', 'clinic_id']),
  ('reservation_history_reservation_clinic_idx', 'public.reservation_history', array['reservation_id', 'clinic_id']),
  ('reservation_notifications_reservation_clinic_idx', 'public.reservation_notifications', array['reservation_id', 'clinic_id']);

create temporary table pr06_required_columns (
  table_oid regclass not null,
  column_name text not null,
  preflight_not_null boolean not null,
  postflight_not_null boolean not null,
  primary key (table_oid, column_name)
) on commit drop;

insert into pr06_required_columns (
  table_oid,
  column_name,
  preflight_not_null,
  postflight_not_null
)
values
  ('public.daily_reports', 'id', true, true),
  ('public.daily_reports', 'clinic_id', false, true),
  ('public.reservations', 'id', true, true),
  ('public.reservations', 'clinic_id', true, true),
  ('public.customers', 'id', true, true),
  ('public.customers', 'clinic_id', true, true),
  ('public.care_episodes', 'id', true, true),
  ('public.care_episodes', 'clinic_id', true, true),
  ('public.customer_insurance_coverages', 'id', true, true),
  ('public.customer_insurance_coverages', 'clinic_id', true, true),
  ('public.menus', 'id', true, true),
  ('public.menus', 'clinic_id', true, true),
  ('public.menu_billing_profiles', 'id', true, true),
  ('public.menu_billing_profiles', 'clinic_id', true, true),
  ('public.resources', 'id', true, true),
  ('public.resources', 'clinic_id', true, true),
  ('public.daily_report_items', 'id', true, true),
  ('public.daily_report_items', 'clinic_id', true, true),
  ('public.daily_report_items', 'daily_report_id', true, true),
  ('public.daily_report_items', 'reservation_id', false, false),
  ('public.daily_report_items', 'customer_id', false, false),
  ('public.daily_report_items', 'care_episode_id', false, false),
  ('public.daily_report_items', 'customer_insurance_coverage_id', false, false),
  ('public.daily_report_items', 'menu_id', false, false),
  ('public.daily_report_items', 'menu_billing_profile_id', false, false),
  ('public.daily_report_items', 'staff_resource_id', false, false),
  ('public.daily_report_item_tags', 'daily_report_item_id', true, true),
  ('public.daily_report_item_tags', 'clinic_id', true, true),
  ('public.reservation_history', 'reservation_id', true, true),
  ('public.reservation_history', 'clinic_id', true, true),
  ('public.reservation_notifications', 'reservation_id', true, true),
  ('public.reservation_notifications', 'clinic_id', true, true);

create temporary table pr06_table_security_snapshot on commit drop as
select
  table_list.table_oid,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  coalesce(relation.relacl::text, '<null>') as relation_acl
from (
  select distinct child_table as table_oid from pr06_fk_contract
  union
  select distinct parent_table as table_oid from pr06_fk_contract
) table_list
join pg_class relation on relation.oid = table_list.table_oid;

create temporary table pr06_policy_snapshot on commit drop as
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
  select table_oid from pr06_table_security_snapshot
);

create temporary table pr06_trigger_snapshot on commit drop as
select
  trigger_data.tgrelid as table_oid,
  trigger_data.tgname::text as trigger_name,
  trigger_data.tgfoid as function_oid,
  trigger_data.tgtype,
  trigger_data.tgenabled::text as enabled_state,
  pg_get_triggerdef(trigger_data.oid) as definition
from pg_trigger trigger_data
where trigger_data.tgrelid in (
  select table_oid from pr06_table_security_snapshot
)
  and not trigger_data.tgisinternal;

do $preflight$
declare
  drift text;
  relation_contract record;
  parent_contract record;
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  duplicate_count bigint;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260714041848'
  ) then
    raise exception
      'PR-06 preflight failed: required PR-05 migration 20260714041848 is absent';
  end if;

  select string_agg(table_oid::text, ', ' order by table_oid::text)
  into drift
  from pr06_table_security_snapshot snapshot
  join pg_class relation on relation.oid = snapshot.table_oid
  where relation.relkind <> 'r'
     or relation.relispartition;

  if drift is not null then
    raise exception
      'PR-06 preflight failed: target must be an ordinary non-partitioned table: %',
      drift;
  end if;

  select string_agg(
    required.table_oid::text || '.' || required.column_name,
    ', ' order by required.table_oid::text, required.column_name
  )
  into drift
  from pr06_required_columns required
  left join pg_attribute attribute
    on attribute.attrelid = required.table_oid
   and attribute.attname = required.column_name
   and not attribute.attisdropped
   and attribute.atttypid = 'uuid'::regtype
   and attribute.attnotnull = required.preflight_not_null
  where attribute.attnum is null;

  if drift is not null then
    raise exception
      'PR-06 preflight failed: required UUID column drift: %',
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
    delete_set_columns,
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
      null::text[],
      's',
      true,
      false
    from pr06_fk_contract
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
      and constraint_data.conname in (
        select final_constraint_name from pr06_fk_contract
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
    raise exception 'PR-06 preflight failed: existing FK catalog drift: %', drift;
  end if;

  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into drift
  from pg_constraint constraint_data
  join pr06_fk_contract expected
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
      'PR-06 preflight failed: duplicate structural target FK: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conname::text,
    ', ' order by constraint_data.conname::text
  )
  into drift
  from pg_constraint constraint_data
  join pr06_fk_contract expected
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
      'PR-06 preflight failed: target composite FK already exists: %',
      drift;
  end if;

  with expected as (
    select constraint_name, parent_table
    from pr06_parent_contract
    where existed_before
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as parent_table
    from pg_constraint constraint_data
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
      'PR-06 preflight failed: existing parent unique catalog drift: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into drift
  from pg_constraint constraint_data
  join pr06_parent_contract expected
    on expected.parent_table = constraint_data.conrelid
   and not expected.existed_before
  join lateral (
    select array_agg(attribute.attname::text order by keys.ordinality) as columns
    from unnest(constraint_data.conkey) with ordinality keys(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_data.conrelid
     and attribute.attnum = keys.attnum
  ) columns on true
  where constraint_data.contype = 'u'
    and columns.columns = array['id', 'clinic_id'];

  if drift is not null then
    raise exception
      'PR-06 preflight failed: unexpected future parent tenant unique constraint: %',
      drift;
  end if;

  select string_agg(object_name, ', ' order by object_name)
  into drift
  from (
    select constraint_data.conname::text as object_name
    from pg_constraint constraint_data
    where constraint_data.conname in (
      select temporary_constraint_name from pr06_fk_contract
      union all
      select constraint_name
      from pr06_parent_contract
      where not existed_before
    )
    union all
    select index_class.relname::text
    from pg_class index_class
    join pg_namespace namespace_data on namespace_data.oid = index_class.relnamespace
    where namespace_data.nspname = 'public'
      and index_class.relname in (
        select index_name from pr06_index_contract
        union all
        select constraint_name
        from pr06_parent_contract
        where not existed_before
      )
  ) conflicts;

  if drift is not null then
    raise exception 'PR-06 preflight failed: future object name conflict: %', drift;
  end if;

  for relation_contract in
    select * from pr06_fk_contract order by ordinal
  loop
    execute format(
      'select count(*) from %s child where child.clinic_id is null or (%L = false and child.%I is null)',
      relation_contract.child_table,
      relation_contract.child_nullable,
      relation_contract.child_column
    ) into null_count;

    if null_count <> 0 then
      raise exception
        'PR-06 preflight failed: null tenant relation %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count;
    end if;

    execute format(
      'select count(*) from %s child left join %s parent on parent.id = child.%I where child.%I is not null and parent.id is null',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column,
      relation_contract.child_column
    ) into orphan_count;

    if orphan_count <> 0 then
      raise exception
        'PR-06 preflight failed: orphan %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        orphan_count;
    end if;

    execute format(
      'select count(*) from %s child join %s parent on parent.id = child.%I where child.%I is not null and child.clinic_id is distinct from parent.clinic_id',
      relation_contract.child_table,
      relation_contract.parent_table,
      relation_contract.child_column,
      relation_contract.child_column
    ) into mismatch_count;

    if mismatch_count <> 0 then
      raise exception
        'PR-06 preflight failed: cross-clinic mismatch %.% count=%',
        relation_contract.child_table,
        relation_contract.child_column,
        mismatch_count;
    end if;
  end loop;

  for parent_contract in
    select * from pr06_parent_contract order by constraint_name
  loop
    execute format(
      'select count(*) from %s parent where parent.id is null or parent.clinic_id is null',
      parent_contract.parent_table
    ) into null_count;

    if null_count <> 0 then
      raise exception
        'PR-06 preflight failed: parent tenant key null %. count=%',
        parent_contract.parent_table,
        null_count;
    end if;

    execute format(
      'select count(*) from (select id, clinic_id from %s group by id, clinic_id having count(*) > 1) duplicate_keys',
      parent_contract.parent_table
    ) into duplicate_count;

    if duplicate_count <> 0 then
      raise exception
        'PR-06 preflight failed: duplicate parent key %. count=%',
        parent_contract.parent_table,
        duplicate_count;
    end if;
  end loop;
end
$preflight$;

alter table public.daily_reports
  alter column clinic_id set not null;

alter table public.daily_reports
  add constraint daily_reports_id_clinic_unique unique (id, clinic_id);

alter table public.care_episodes
  add constraint care_episodes_id_clinic_unique unique (id, clinic_id);

alter table public.customer_insurance_coverages
  add constraint customer_insurance_coverages_id_clinic_unique
  unique (id, clinic_id);

alter table public.menu_billing_profiles
  add constraint menu_billing_profiles_id_clinic_unique unique (id, clinic_id);

alter table public.daily_report_items
  add constraint daily_report_items_id_clinic_unique unique (id, clinic_id);

create index daily_report_items_daily_report_clinic_idx
  on public.daily_report_items (daily_report_id, clinic_id);

create index daily_report_items_reservation_clinic_idx
  on public.daily_report_items (reservation_id, clinic_id);

create index daily_report_items_customer_clinic_idx
  on public.daily_report_items (customer_id, clinic_id);

create index daily_report_items_care_episode_clinic_idx
  on public.daily_report_items (care_episode_id, clinic_id);

create index daily_report_items_customer_insurance_coverage_clinic_idx
  on public.daily_report_items (customer_insurance_coverage_id, clinic_id);

create index daily_report_items_menu_clinic_idx
  on public.daily_report_items (menu_id, clinic_id);

create index daily_report_items_menu_billing_profile_clinic_idx
  on public.daily_report_items (menu_billing_profile_id, clinic_id);

create index daily_report_items_staff_resource_clinic_idx
  on public.daily_report_items (staff_resource_id, clinic_id);

create index daily_report_item_tags_item_clinic_idx
  on public.daily_report_item_tags (daily_report_item_id, clinic_id);

create index reservation_history_reservation_clinic_idx
  on public.reservation_history (reservation_id, clinic_id);

create index reservation_notifications_reservation_clinic_idx
  on public.reservation_notifications (reservation_id, clinic_id);

alter table public.daily_report_items
  add constraint dri_daily_report_clinic_pr06_fkey
  foreign key (daily_report_id, clinic_id)
  references public.daily_reports (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_reservation_clinic_pr06_fkey
  foreign key (reservation_id, clinic_id)
  references public.reservations (id, clinic_id)
  match simple
  on update no action
  on delete set null (reservation_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_customer_clinic_pr06_fkey
  foreign key (customer_id, clinic_id)
  references public.customers (id, clinic_id)
  match simple
  on update no action
  on delete set null (customer_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_care_episode_clinic_pr06_fkey
  foreign key (care_episode_id, clinic_id)
  references public.care_episodes (id, clinic_id)
  match simple
  on update no action
  on delete set null (care_episode_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_insurance_coverage_clinic_pr06_fkey
  foreign key (customer_insurance_coverage_id, clinic_id)
  references public.customer_insurance_coverages (id, clinic_id)
  match simple
  on update no action
  on delete set null (customer_insurance_coverage_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_menu_clinic_pr06_fkey
  foreign key (menu_id, clinic_id)
  references public.menus (id, clinic_id)
  match simple
  on update no action
  on delete set null (menu_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_menu_billing_profile_clinic_pr06_fkey
  foreign key (menu_billing_profile_id, clinic_id)
  references public.menu_billing_profiles (id, clinic_id)
  match simple
  on update no action
  on delete set null (menu_billing_profile_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  add constraint dri_staff_resource_clinic_pr06_fkey
  foreign key (staff_resource_id, clinic_id)
  references public.resources (id, clinic_id)
  match simple
  on update no action
  on delete set null (staff_resource_id)
  not deferrable initially immediate
  not valid;

alter table public.daily_report_item_tags
  add constraint drit_item_clinic_pr06_fkey
  foreign key (daily_report_item_id, clinic_id)
  references public.daily_report_items (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.reservation_history
  add constraint reservation_history_reservation_clinic_pr06_fkey
  foreign key (reservation_id, clinic_id)
  references public.reservations (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.reservation_notifications
  add constraint reservation_notifications_reservation_clinic_pr06_fkey
  foreign key (reservation_id, clinic_id)
  references public.reservations (id, clinic_id)
  match simple
  on update no action
  on delete cascade
  not deferrable initially immediate
  not valid;

alter table public.daily_report_items
  validate constraint dri_daily_report_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_reservation_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_customer_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_care_episode_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_insurance_coverage_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_menu_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_menu_billing_profile_clinic_pr06_fkey;

alter table public.daily_report_items
  validate constraint dri_staff_resource_clinic_pr06_fkey;

alter table public.daily_report_item_tags
  validate constraint drit_item_clinic_pr06_fkey;

alter table public.reservation_history
  validate constraint reservation_history_reservation_clinic_pr06_fkey;

alter table public.reservation_notifications
  validate constraint reservation_notifications_reservation_clinic_pr06_fkey;

alter table public.daily_report_items
  drop constraint daily_report_items_daily_report_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_reservation_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_customer_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_care_episode_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_customer_insurance_coverage_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_menu_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_menu_billing_profile_id_fkey;
alter table public.daily_report_items
  drop constraint daily_report_items_staff_resource_id_fkey;
alter table public.daily_report_item_tags
  drop constraint daily_report_item_tags_item_id_fkey;
alter table public.reservation_history
  drop constraint reservation_history_reservation_id_fkey;
alter table public.reservation_notifications
  drop constraint reservation_notifications_reservation_id_fkey;

alter table public.daily_report_items
  rename constraint dri_daily_report_clinic_pr06_fkey
  to daily_report_items_daily_report_id_fkey;

alter table public.daily_report_items
  rename constraint dri_reservation_clinic_pr06_fkey
  to daily_report_items_reservation_id_fkey;

alter table public.daily_report_items
  rename constraint dri_customer_clinic_pr06_fkey
  to daily_report_items_customer_id_fkey;

alter table public.daily_report_items
  rename constraint dri_care_episode_clinic_pr06_fkey
  to daily_report_items_care_episode_id_fkey;

alter table public.daily_report_items
  rename constraint dri_insurance_coverage_clinic_pr06_fkey
  to daily_report_items_customer_insurance_coverage_id_fkey;

alter table public.daily_report_items
  rename constraint dri_menu_clinic_pr06_fkey
  to daily_report_items_menu_id_fkey;

alter table public.daily_report_items
  rename constraint dri_menu_billing_profile_clinic_pr06_fkey
  to daily_report_items_menu_billing_profile_id_fkey;

alter table public.daily_report_items
  rename constraint dri_staff_resource_clinic_pr06_fkey
  to daily_report_items_staff_resource_id_fkey;

alter table public.daily_report_item_tags
  rename constraint drit_item_clinic_pr06_fkey
  to daily_report_item_tags_item_id_fkey;

alter table public.reservation_history
  rename constraint reservation_history_reservation_clinic_pr06_fkey
  to reservation_history_reservation_id_fkey;

alter table public.reservation_notifications
  rename constraint reservation_notifications_reservation_clinic_pr06_fkey
  to reservation_notifications_reservation_id_fkey;

do $postflight$
declare
  drift text;
  relation_contract record;
  parent_contract record;
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  duplicate_count bigint;
begin
  select string_agg(
    required.table_oid::text || '.' || required.column_name,
    ', ' order by required.table_oid::text, required.column_name
  )
  into drift
  from pr06_required_columns required
  left join pg_attribute attribute
    on attribute.attrelid = required.table_oid
   and attribute.attname = required.column_name
   and not attribute.attisdropped
   and attribute.atttypid = 'uuid'::regtype
   and attribute.attnotnull = required.postflight_not_null
  where attribute.attnum is null;

  if drift is not null then
    raise exception
      'PR-06 postflight failed: required UUID column drift: %',
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
    delete_set_columns,
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
      case
        when delete_set_column is null then null::text[]
        else array[delete_set_column]
      end,
      's',
      true,
      false
    from pr06_fk_contract
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
      and constraint_data.conname in (
        select final_constraint_name from pr06_fk_contract
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
    raise exception 'PR-06 postflight failed: composite FK catalog drift: %', drift;
  end if;

  select string_agg(
    expected.final_constraint_name,
    ', ' order by expected.final_constraint_name
  )
  into drift
  from pr06_fk_contract expected
  join pg_constraint constraint_data
    on constraint_data.conrelid = expected.child_table
   and constraint_data.conname = expected.final_constraint_name
  left join lateral (
    select array_agg(attribute.attname::text order by keys.ordinality) as columns
    from unnest(constraint_data.confdelsetcols) with ordinality keys(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_data.conrelid
     and attribute.attnum = keys.attnum
  ) delete_set_columns on true
  where delete_set_columns.columns is distinct from (
    case
      when expected.delete_set_column is null then null::text[]
      else array[expected.delete_set_column]
    end
  );

  if drift is not null then
    raise exception
      'PR-06 postflight failed: delete SET column drift: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conrelid::regclass::text || ':' || constraint_data.conname,
    ', ' order by constraint_data.conrelid::regclass::text, constraint_data.conname
  )
  into drift
  from pg_constraint constraint_data
  join pr06_fk_contract expected
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
      'PR-06 postflight failed: duplicate structural target FK remains: %',
      drift;
  end if;

  select string_agg(
    constraint_data.conname::text,
    ', ' order by constraint_data.conname::text
  )
  into drift
  from pg_constraint constraint_data
  join pr06_fk_contract expected
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
      'PR-06 postflight failed: FK RI trigger state drift: %',
      drift;
  end if;

  with expected as (
    select constraint_name, parent_table
    from pr06_parent_contract
  ),
  actual as (
    select
      constraint_data.conname::text as constraint_name,
      constraint_data.conrelid as parent_table
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
      and constraint_data.convalidated
      and constraint_data.conname in (select constraint_name from expected)
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
    raise exception 'PR-06 postflight failed: parent unique catalog drift: %', drift;
  end if;

  with expected as (
    select index_name, child_table, index_columns
    from pr06_index_contract
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
    raise exception 'PR-06 postflight failed: child index catalog drift: %', drift;
  end if;

  for relation_contract in
    select * from pr06_fk_contract order by ordinal
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
        'PR-06 postflight failed: relation %.% null=% orphan=% cross-clinic mismatch=%',
        relation_contract.child_table,
        relation_contract.child_column,
        null_count,
        orphan_count,
        mismatch_count;
    end if;
  end loop;

  for parent_contract in
    select * from pr06_parent_contract order by constraint_name
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
        'PR-06 postflight failed: parent %. null=% duplicate parent key=%',
        parent_contract.parent_table,
        null_count,
        duplicate_count;
    end if;
  end loop;

  with current_state as (
    select
      snapshot.table_oid,
      relation.relrowsecurity,
      relation.relforcerowsecurity,
      coalesce(relation.relacl::text, '<null>') as relation_acl
    from pr06_table_security_snapshot snapshot
    join pg_class relation on relation.oid = snapshot.table_oid
  ),
  security_drift as (
    select * from pr06_table_security_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr06_table_security_snapshot
  )
  select string_agg(table_oid::text, ', ' order by table_oid::text)
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-06 postflight failed: table RLS/ACL drift: %', drift;
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
    where policy.polrelid in (select table_oid from pr06_table_security_snapshot)
  ),
  security_drift as (
    select * from pr06_policy_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr06_policy_snapshot
  )
  select string_agg(
    table_oid::text || ':' || policy_name,
    ', ' order by table_oid::text, policy_name
  )
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-06 postflight failed: RLS policy drift: %', drift;
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
    where trigger_data.tgrelid in (select table_oid from pr06_table_security_snapshot)
      and not trigger_data.tgisinternal
  ),
  security_drift as (
    select * from pr06_trigger_snapshot except select * from current_state
    union all
    select * from current_state except select * from pr06_trigger_snapshot
  )
  select string_agg(
    table_oid::text || ':' || trigger_name,
    ', ' order by table_oid::text, trigger_name
  )
  into drift
  from security_drift;

  if drift is not null then
    raise exception 'PR-06 postflight failed: user trigger drift: %', drift;
  end if;
end
$postflight$;

commit;
