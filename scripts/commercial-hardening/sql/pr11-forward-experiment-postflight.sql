-- PR-11 transaction-only forward-fix experiment exact postflight.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-paired-postflight.sql
\ir pr11-forward-experiment-preflight.sql

select jsonb_build_object(
  'kind', 'experiment_postflight',
  'candidate_indexes_present', 0,
  'blocks_trigger_enabled', true,
  'contract_pass', true
) as postflight_result;

\echo PR11_FORWARD_EXPERIMENT_POSTFLIGHT_PASS
