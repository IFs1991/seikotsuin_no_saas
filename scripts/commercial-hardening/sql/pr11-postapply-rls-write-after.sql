\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'rls_write',
  'state', 'after',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true
) as postapply_phase;

\ir pr11-forward-rls-write-probe.sql

\ir pr11-postapply-permanent-state.sql
