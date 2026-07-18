-- Run the existing 52-case PR-11 pgTAP contract with candidate indexes
-- present only in the outer transaction.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql

begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create extension if not exists pgtap with schema extensions;
\ir pr11-forward-rls-statement-scope-candidate.sql

\ir ../../../supabase/tests/commercial_pr11_performance_rls_test.sql

\ir pr11-forward-experiment-preflight.sql
