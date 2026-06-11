-- Rollback: Manager revenue analysis RPCs
-- Spec: docs/stabilization/spec-manager-revenue-analysis-v0.2.md

begin;

drop function if exists public.manager_revenue_context_breakdown(uuid[], date, date);
drop function if exists public.manager_revenue_period_series(uuid[], date, date, text);
drop function if exists public.manager_revenue_period_totals(uuid[], date, date);

commit;
