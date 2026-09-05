\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'blocks',
  'state', 'after'
) as postapply_phase;
select jsonb_build_object(
  'kind', 'blocks_fast_path_candidate_catalog',
  'function', 'public.validate_blocks_clinic_refs()',
  'trigger_enabled', true,
  'composite_fk_preserved', true,
  'contract_pass', true
) as candidate_catalog;

\ir pr11-performance-probe.sql

\ir pr11-postapply-permanent-state.sql
