-- Current-state blocks performance sample. Canonical probe is unchanged.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-forward-experiment-preflight.sql

select jsonb_build_object(
  'kind', 'experiment_phase',
  'family', 'blocks',
  'state', 'current',
  'blocks_trigger_enabled', true
) as experiment_phase;

\ir pr11-performance-probe.sql

\ir pr11-forward-experiment-preflight.sql
