-- PR-11 read-only physical/catalog snapshot for paired benchmark evidence.

\set ON_ERROR_STOP on
\pset pager off

select jsonb_build_object(
  'kind', 'runtime',
  'captured_at_utc', clock_timestamp() at time zone 'UTC',
  'postmaster_started_at', pg_postmaster_start_time(),
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
  'other_client_activity', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'pid', activity.pid,
        'application_name', activity.application_name,
        'state', activity.state,
        'wait_event_type', activity.wait_event_type,
        'wait_event', activity.wait_event,
        'blocking_pids', pg_blocking_pids(activity.pid)
      ) order by activity.pid
    ), '[]'::jsonb)
    from pg_stat_activity activity
    where activity.pid <> pg_backend_pid()
      and activity.datname = current_database()
      and activity.backend_type = 'client backend'
      and (
        activity.state = 'active'
        or cardinality(pg_blocking_pids(activity.pid)) > 0
      )
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
  'checkpointer', (
    select to_jsonb(checkpointer_data)
    from pg_stat_checkpointer checkpointer_data
  ),
  'guc', jsonb_build_object(
    'jit', current_setting('jit'),
    'shared_buffers', current_setting('shared_buffers'),
    'effective_cache_size', current_setting('effective_cache_size'),
    'work_mem', current_setting('work_mem'),
    'maintenance_work_mem', current_setting('maintenance_work_mem'),
    'max_parallel_workers_per_gather',
      current_setting('max_parallel_workers_per_gather'),
    'synchronous_commit', current_setting('synchronous_commit'),
    'track_io_timing', current_setting('track_io_timing')
  )
) as snapshot_row;

select jsonb_build_object(
  'kind', 'table',
  'schema', namespace_catalog.nspname,
  'name', table_catalog.relname,
  'heap_bytes', pg_relation_size(table_catalog.oid),
  'index_bytes', pg_indexes_size(table_catalog.oid),
  'total_bytes', pg_total_relation_size(table_catalog.oid),
  'relpages', table_catalog.relpages,
  'reltuples', table_catalog.reltuples,
  'n_live_tup', coalesce(table_stats.n_live_tup, 0),
  'n_dead_tup', coalesce(table_stats.n_dead_tup, 0)
) as snapshot_row
from pg_class table_catalog
join pg_namespace namespace_catalog
  on namespace_catalog.oid = table_catalog.relnamespace
left join pg_stat_all_tables table_stats
  on table_stats.relid = table_catalog.oid
where namespace_catalog.nspname in ('public', 'auth')
  and table_catalog.relkind in ('r', 'p')
order by namespace_catalog.nspname, table_catalog.relname;

select jsonb_build_object(
  'kind', 'index',
  'schema', namespace_catalog.nspname,
  'table', table_catalog.relname,
  'name', index_catalog.relname,
  'bytes', pg_relation_size(index_catalog.oid),
  'relpages', index_catalog.relpages,
  'reltuples', index_catalog.reltuples,
  'valid', index_data.indisvalid,
  'ready', index_data.indisready,
  'live', index_data.indislive,
  'definition_md5', md5(pg_get_indexdef(index_catalog.oid))
) as snapshot_row
from pg_index index_data
join pg_class index_catalog on index_catalog.oid = index_data.indexrelid
join pg_class table_catalog on table_catalog.oid = index_data.indrelid
join pg_namespace namespace_catalog
  on namespace_catalog.oid = table_catalog.relnamespace
where namespace_catalog.nspname in ('public', 'auth')
order by
  namespace_catalog.nspname,
  table_catalog.relname,
  index_catalog.relname;
