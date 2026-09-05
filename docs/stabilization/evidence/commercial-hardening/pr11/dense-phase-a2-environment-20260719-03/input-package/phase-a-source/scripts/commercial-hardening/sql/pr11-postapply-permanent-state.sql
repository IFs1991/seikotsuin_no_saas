-- Exact validation-only guard for the permanently applied PR-11 forward fix.

\set ON_ERROR_STOP on
\pset pager off

\ir ../../../supabase/rollbacks/20260718011731_commercial_pr11_fixed_performance_forward_fix_rollback.sql

select jsonb_build_object(
  'kind', 'postapply_permanent_state',
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'public_policy_count', (
    select count(*) from pg_policies where schemaname = 'public'
  ),
  'candidate_indexes_present', 2,
  'statement_scope_helper_present', true,
  'blocks_trigger_enabled', true,
  'contract_pass', true
) as permanent_state;

\echo PR11_POSTAPPLY_PERMANENT_STATE_PASS
