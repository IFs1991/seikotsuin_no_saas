-- Phase A exact guard for the rollback-only blocks resource index experiment.

\set ON_ERROR_STOP on
\pset pager off

do $pr11_blocks_resource_index_preflight$
declare
  drift text;
begin
  if current_database() <> 'postgres'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
    or current_setting('server_version_num') <> '170006'
    or (
      select max(version)
      from supabase_migrations.schema_migrations
    ) <> '20260718011731'
  then
    raise exception
      'PR-11 blocks resource index experiment refused: local database identity or migration head drift';
  end if;

  if (
    select count(*)
    from pg_stat_activity activity
    where activity.pid <> pg_backend_pid()
      and activity.datname = current_database()
      and activity.backend_type = 'client backend'
      and activity.xact_start is not null
  ) <> 0
    or exists (
      select 1
      from pg_stat_progress_create_index progress
      where progress.datid = (
        select oid from pg_database where datname = current_database()
      )
    )
  then
    raise exception
      'PR-11 blocks resource index experiment refused: concurrent transaction or index build';
  end if;

  if (
    select count(*)
    from pg_class relation_data
    join pg_namespace namespace_data
      on namespace_data.oid = relation_data.relnamespace
    where namespace_data.nspname = 'public'
      and relation_data.relname = 'blocks'
      and relation_data.relkind = 'r'
      and not relation_data.relispartition
      and pg_total_relation_size(relation_data.oid) <= 64 * 1024 * 1024
  ) <> 1
  then
    raise exception
      'PR-11 blocks resource index experiment refused: blocks relation shape or size drift';
  end if;

  with expected(index_name) as (
    values
      ('blocks_created_by_idx'),
      ('blocks_deleted_by_idx'),
      ('blocks_pkey'),
      ('blocks_resource_clinic_idx'),
      ('idx_blocks_clinic_id'),
      ('idx_blocks_clinic_time'),
      ('idx_blocks_end_time'),
      ('idx_blocks_is_active'),
      ('idx_blocks_resource_id'),
      ('idx_blocks_resource_time'),
      ('idx_blocks_start_time')
  ), actual as (
    select index_class.relname::text as index_name
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    where index_data.indrelid = 'public.blocks'::regclass
  ), drift_rows as (
    (select index_name from expected except select index_name from actual)
    union all
    (select index_name from actual except select index_name from expected)
  )
  select string_agg(index_name, ', ' order by index_name)
  into drift
  from drift_rows;

  if drift is not null then
    raise exception
      'PR-11 blocks resource index experiment refused: exact blocks index inventory drift: %',
      drift;
  end if;

  if (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_namespace index_namespace
      on index_namespace.oid = index_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    join lateral (
      select array_agg(attribute_data.attname::text order by keys.ordinality)
        as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = index_data.indrelid
       and attribute_data.attnum = keys.attnum
      where keys.ordinality <= index_data.indnkeyatts
    ) key_data on true
    where index_class.relname = 'idx_blocks_resource_id'
      and index_namespace.nspname = 'public'
      and index_data.indrelid = 'public.blocks'::regclass
      and key_data.columns = array['resource_id']
      and index_data.indnkeyatts = 1
      and index_data.indnatts = 1
      and access_method.amname = 'btree'
      and not index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and index_data.indpred is null
      and index_data.indexprs is null
  ) <> 1
  then
    raise exception
      'PR-11 blocks resource index experiment refused: singleton index definition drift';
  end if;

  if (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_namespace index_namespace
      on index_namespace.oid = index_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    join lateral (
      select array_agg(attribute_data.attname::text order by keys.ordinality)
        as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = index_data.indrelid
       and attribute_data.attnum = keys.attnum
      where keys.ordinality <= index_data.indnkeyatts
    ) key_data on true
    where index_class.relname = 'blocks_resource_clinic_idx'
      and index_namespace.nspname = 'public'
      and index_data.indrelid = 'public.blocks'::regclass
      and key_data.columns = array['resource_id', 'clinic_id']
      and index_data.indnkeyatts = 2
      and index_data.indnatts = 2
      and access_method.amname = 'btree'
      and not index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and index_data.indpred is null
      and index_data.indexprs is null
  ) <> 1
  then
    raise exception
      'PR-11 blocks resource index experiment refused: replacement composite index drift';
  end if;

  if (
    select count(*)
    from pg_constraint constraint_data
    join lateral (
      select array_agg(attribute_data.attname::text order by keys.ordinality)
        as columns
      from unnest(constraint_data.conkey)
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = constraint_data.conrelid
       and attribute_data.attnum = keys.attnum
    ) child_key on true
    join lateral (
      select array_agg(attribute_data.attname::text order by keys.ordinality)
        as columns
      from unnest(constraint_data.confkey)
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = constraint_data.confrelid
       and attribute_data.attnum = keys.attnum
    ) parent_key on true
    join lateral (
      select
        count(*) as trigger_count,
        count(*) filter (where trigger_data.tgenabled = 'O') as enabled_count
      from pg_trigger trigger_data
      where trigger_data.tgconstraint = constraint_data.oid
        and trigger_data.tgisinternal
    ) trigger_state on true
    where constraint_data.conname = 'blocks_resource_id_fkey'
      and constraint_data.conrelid = 'public.blocks'::regclass
      and constraint_data.confrelid = 'public.resources'::regclass
      and constraint_data.contype = 'f'
      and child_key.columns = array['resource_id', 'clinic_id']
      and parent_key.columns = array['id', 'clinic_id']
      and constraint_data.confupdtype = 'a'
      and constraint_data.confdeltype = 'c'
      and constraint_data.confmatchtype = 's'
      and constraint_data.convalidated
      and not constraint_data.condeferrable
      and not constraint_data.condeferred
      and trigger_state.trigger_count = 4
      and trigger_state.enabled_count = 4
  ) <> 1
  then
    raise exception
      'PR-11 blocks resource index experiment refused: composite FK or RI trigger drift';
  end if;

  if (
    select count(*)
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.blocks'::regclass
      and trigger_data.tgname = 'blocks_clinic_ref_check'
      and not trigger_data.tgisinternal
      and trigger_data.tgenabled = 'O'
      and trigger_data.tgfoid =
        'public.validate_blocks_clinic_refs()'::regprocedure
  ) <> 1
    or to_regclass('public.blocks_created_by_idx') is null
    or to_regclass('public.blocks_deleted_by_idx') is null
  then
    raise exception
      'PR-11 blocks resource index experiment refused: blocks trigger or audit index drift';
  end if;
end
$pr11_blocks_resource_index_preflight$;

select jsonb_build_object(
  'kind', 'blocks_resource_index_drop_preflight',
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'target_present', to_regclass('public.idx_blocks_resource_id') is not null,
  'target_definition_md5', md5(pg_get_indexdef(
    'public.idx_blocks_resource_id'::regclass
  )),
  'replacement_definition_md5', md5(pg_get_indexdef(
    'public.blocks_resource_clinic_idx'::regclass
  )),
  'fk_definition_md5', (
    select md5(pg_get_constraintdef(constraint_data.oid))
    from pg_constraint constraint_data
    where constraint_data.conrelid = 'public.blocks'::regclass
      and constraint_data.conname = 'blocks_resource_id_fkey'
  ),
  'blocks_index_count', (
    select count(*) from pg_index
    where indrelid = 'public.blocks'::regclass
  ),
  'contract_pass', true
) as preflight_row;

