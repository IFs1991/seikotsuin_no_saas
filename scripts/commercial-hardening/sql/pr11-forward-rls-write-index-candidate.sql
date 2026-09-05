-- Candidate 2,000-row write sample. Index build WAL/time is outside EXPLAIN.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

\ir pr11-forward-rls-statement-scope-candidate.sql

select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'rls_write',
  'state', 'candidate',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true
) as experiment_phase;

\ir pr11-forward-rls-write-probe.sql

\ir pr11-forward-experiment-preflight.sql
