\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql
begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create extension if not exists pgtap with schema extensions;
\ir ../../../supabase/tests/commercial_pr11_performance_rls_test.sql
\ir pr11-postapply-permanent-state.sql
