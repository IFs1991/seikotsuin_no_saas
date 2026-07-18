\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'rls_read',
  'state', 'after',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true
) as postapply_phase;
select jsonb_build_object(
  'kind', 'rls_scope_candidate_catalog',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true,
  'contract_pass', true
) as candidate_catalog;

\ir pr11-rls-plan-probe.sql

\ir pr11-postapply-permanent-state.sql
