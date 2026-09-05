\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;
\ir pr11-postapply-rls-before-ddl.sql

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'rls_semantic',
  'state', 'before'
) as postapply_phase;

\ir pr11-forward-rls-scope-semantic-probe.sql

\ir pr11-postapply-permanent-state.sql
