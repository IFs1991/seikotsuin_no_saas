\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'rls_semantic',
  'state', 'after'
) as postapply_phase;

\ir pr11-forward-rls-scope-semantic-probe.sql

\ir pr11-postapply-permanent-state.sql
