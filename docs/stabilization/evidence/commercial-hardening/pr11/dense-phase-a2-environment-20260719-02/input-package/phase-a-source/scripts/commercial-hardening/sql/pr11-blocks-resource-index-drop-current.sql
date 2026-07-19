\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

select jsonb_build_object(
  'kind', 'blocks_resource_index_performance_phase',
  'state', 'current',
  'canonical_probe_unchanged', true
) as phase_row;

\ir pr11-performance-probe.sql

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

