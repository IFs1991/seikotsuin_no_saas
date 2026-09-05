\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql
select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'rls_semantic',
  'state', 'current',
  'candidate_indexes_present', 0
) as experiment_phase;
\ir pr11-forward-rls-scope-semantic-probe.sql
\ir pr11-forward-experiment-preflight.sql
