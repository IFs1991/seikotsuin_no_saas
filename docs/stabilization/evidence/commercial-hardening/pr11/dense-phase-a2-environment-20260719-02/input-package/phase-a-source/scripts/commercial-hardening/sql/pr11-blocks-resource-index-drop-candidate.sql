\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

\ir pr11-blocks-resource-index-drop-ddl.sql

select jsonb_build_object(
  'kind', 'blocks_resource_index_performance_phase',
  'state', 'candidate',
  'canonical_probe_unchanged', true,
  'rollback_required', true
) as phase_row;

-- The canonical probe owns the final ROLLBACK, restoring the dropped index.
\ir pr11-performance-probe.sql

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

