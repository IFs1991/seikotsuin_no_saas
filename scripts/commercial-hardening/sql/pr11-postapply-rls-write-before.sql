\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

begin;
set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
drop index public.customer_insurance_coverages_clinic_id_id_idx;
drop index public.menu_billing_profiles_clinic_id_id_idx;

select jsonb_build_object(
  'kind', 'postapply_phase',
  'family', 'rls_write',
  'state', 'before',
  'candidate_indexes_present', 0
) as postapply_phase;

\ir pr11-forward-rls-write-probe.sql

\ir pr11-postapply-permanent-state.sql
