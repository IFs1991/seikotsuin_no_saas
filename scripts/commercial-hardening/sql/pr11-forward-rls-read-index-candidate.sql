-- Candidate authenticated RLS read sample. The helper, two policies, and two
-- indexes exist only inside this transaction. The canonical probe is unchanged.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

\ir pr11-forward-rls-statement-scope-candidate.sql

select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'rls_read',
  'state', 'candidate',
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true
) as experiment_phase;

\ir pr11-rls-plan-probe.sql

\ir pr11-forward-experiment-preflight.sql
