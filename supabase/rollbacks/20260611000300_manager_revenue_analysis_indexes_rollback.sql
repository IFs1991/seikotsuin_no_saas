-- Rollback: Manager revenue analysis supporting indexes
-- Spec: docs/stabilization/spec-manager-revenue-analysis-v0.2.md (PR-04)

begin;

drop index if exists public.idx_revenue_estimate_lines_estimate_id;

create index if not exists idx_daily_reports_clinic_date
  on public.daily_reports (clinic_id, report_date);

commit;
