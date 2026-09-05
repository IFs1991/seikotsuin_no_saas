-- PR-11 dense Phase A2 read-only environment and database preflight.

\set ON_ERROR_STOP on
\pset pager off

do $phase_a2_preflight$
begin
  if current_database() <> 'postgres'
    or current_setting('server_version_num') <> '170006'
    or (select system_identifier::text from pg_control_system())
      <> '7662783869098430503'
  then
    raise exception 'PR-11 Phase A2 refused: local database identity drift';
  end if;

  if (
    select max(version)
    from supabase_migrations.schema_migrations
  ) <> '20260718011731' then
    raise exception 'PR-11 Phase A2 refused: migration head drift';
  end if;

  if to_regclass('public.idx_blocks_resource_id') is null
    or md5(pg_get_indexdef('public.idx_blocks_resource_id'::regclass))
      <> '7a4092df4bfffa0e82d7936ba6384362'
  then
    raise exception 'PR-11 Phase A2 refused: singleton index drift';
  end if;
end
$phase_a2_preflight$;

select jsonb_build_object(
  'kind', 'pr11_phase_a2_database_preflight',
  'captured_at_utc', clock_timestamp() at time zone 'UTC',
  'database', current_database(),
  'server_version_num', current_setting('server_version_num'),
  'system_identifier', (
    select system_identifier::text from pg_control_system()
  ),
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'singleton_present',
    to_regclass('public.idx_blocks_resource_id') is not null,
  'singleton_oid',
    to_regclass('public.idx_blocks_resource_id')::oid,
  'singleton_definition_md5', md5(pg_get_indexdef(
    'public.idx_blocks_resource_id'::regclass
  )),
  'active_other_clients', (
    select count(*)
    from pg_stat_activity
    where pid <> pg_backend_pid()
      and datname = current_database()
      and backend_type = 'client backend'
      and state = 'active'
  ),
  'blocked_other_clients', (
    select count(*)
    from pg_stat_activity
    where pid <> pg_backend_pid()
      and datname = current_database()
      and backend_type = 'client backend'
      and cardinality(pg_blocking_pids(pid)) > 0
  ),
  'idle_in_transaction_other_clients', (
    select count(*)
    from pg_stat_activity
    where pid <> pg_backend_pid()
      and datname = current_database()
      and backend_type = 'client backend'
      and state like 'idle in transaction%'
  ),
  'vacuum_progress_count', (
    select count(*)
    from pg_stat_progress_vacuum
    where datid = (
      select oid from pg_database where datname = current_database()
    )
  ),
  'create_index_progress_count', (
    select count(*)
    from pg_stat_progress_create_index
    where datid = (
      select oid from pg_database where datname = current_database()
    )
  ),
  'guc', jsonb_build_object(
    'jit', current_setting('jit'),
    'shared_buffers', current_setting('shared_buffers'),
    'effective_cache_size', current_setting('effective_cache_size'),
    'work_mem', current_setting('work_mem'),
    'maintenance_work_mem', current_setting('maintenance_work_mem'),
    'wal_buffers', current_setting('wal_buffers'),
    'max_wal_size', current_setting('max_wal_size'),
    'synchronous_commit', current_setting('synchronous_commit'),
    'track_io_timing', current_setting('track_io_timing'),
    'shared_preload_libraries', current_setting('shared_preload_libraries')
  ),
  'checkpointer', (
    select to_jsonb(checkpointer_data)
    from pg_stat_checkpointer checkpointer_data
  ),
  'wal', (
    select to_jsonb(wal_data)
    from pg_stat_wal wal_data
  )
) as phase_a2_preflight;
