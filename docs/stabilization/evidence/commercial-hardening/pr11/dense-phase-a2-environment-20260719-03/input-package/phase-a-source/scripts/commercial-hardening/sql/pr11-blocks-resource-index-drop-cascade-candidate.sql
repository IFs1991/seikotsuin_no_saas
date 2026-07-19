\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

\ir pr11-blocks-resource-index-drop-ddl.sql
\set pr11_resource_index_state candidate
\ir pr11-blocks-resource-index-drop-cascade-probe.sql

rollback;

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql
