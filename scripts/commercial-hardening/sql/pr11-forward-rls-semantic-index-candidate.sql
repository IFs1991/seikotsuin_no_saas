\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql
begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
\ir pr11-forward-rls-statement-scope-candidate.sql
select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'rls_semantic',
  'state', 'candidate',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true
) as experiment_phase;
\ir pr11-forward-rls-scope-semantic-probe.sql
\ir pr11-forward-experiment-preflight.sql
