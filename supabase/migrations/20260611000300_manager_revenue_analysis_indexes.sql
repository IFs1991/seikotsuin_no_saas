-- ================================================================
-- Migration: Manager revenue analysis supporting indexes
-- Spec: docs/stabilization/spec-manager-revenue-analysis-v0.2.md (PR-04)
-- ================================================================

begin;

-- daily_report_revenue_breakdown_summary / daily_report_revenue_estimate_summary の
-- rel.revenue_estimate_id = re.id 結合は、既存の
-- idx_revenue_estimate_lines_estimate (clinic_id, revenue_estimate_id, sort_order)
-- では先頭列が合わず使えない。manager 収益分析 RPC の読み出しと、
-- revenue_estimates 削除時の FK カスケード走査の両方を高速化する。
create index if not exists idx_revenue_estimate_lines_estimate_id
  on public.revenue_estimate_lines (revenue_estimate_id);

-- daily_reports には UNIQUE (clinic_id, report_date) 制約
-- （daily_reports_clinic_id_report_date_key）の暗黙インデックスが存在し、
-- idx_daily_reports_clinic_date は完全に重複している。
-- 重複分の書き込みコスト（日報 insert/update ごとの二重メンテナンス）を除去する。
drop index if exists public.idx_daily_reports_clinic_date;

commit;
