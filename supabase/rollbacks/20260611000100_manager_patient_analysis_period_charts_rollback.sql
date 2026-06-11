-- ================================================================
-- Rollback: Manager patient analysis period charts
-- Spec: docs/stabilization/specmanagerpatientanalysisperiodchartsv0.2.md
-- ================================================================

begin;

set search_path = public, auth, extensions;

drop function if exists public.manager_patient_period_series(
  uuid[],
  timestamptz,
  timestamptz,
  text
);

drop function if exists public.manager_patient_period_totals(
  uuid[],
  timestamptz,
  timestamptz
);

commit;
