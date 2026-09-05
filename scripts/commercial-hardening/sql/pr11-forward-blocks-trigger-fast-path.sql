-- Candidate blocks performance sample. The exact-compatible function body
-- exists only inside the outer transaction; the canonical probe rolls it back.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

\ir pr11-forward-blocks-trigger-fast-path-ddl.sql

select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'blocks',
  'state', 'candidate',
  'blocks_trigger_enabled', true,
  'blocks_candidate_kind', 'exact-compatible-fast-path-v1'
) as experiment_phase;

\ir pr11-performance-probe.sql

-- The canonical probe ends with ROLLBACK, restoring the original body.
\ir pr11-forward-experiment-preflight.sql
