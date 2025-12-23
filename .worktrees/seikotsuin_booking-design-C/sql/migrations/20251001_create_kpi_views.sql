-- ================================================================
-- KPIビューおよびステージング補助スキーマ
-- 作成日: 2025-10-01
-- 説明: Dashboard/患者分析/日報APIが参照するビューと補助テーブルを整備
-- ================================================================
BEGIN;

-- ステージングスキーマ
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.stg_monthly_kpi_snapshot (
  clinic_external_id TEXT NOT NULL,
  clinic_name TEXT,
  kpi_month DATE NOT NULL,
  gross_revenue NUMERIC,
  treatment_count INTEGER,
  new_patients INTEGER,
  repeat_patients INTEGER,
  churn_alerts INTEGER,
  avg_ltv NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE staging.stg_monthly_kpi_snapshot IS 'DWHから取り込む月次KPIサマリーの一時置き場';
CREATE INDEX IF NOT EXISTS idx_stg_kpi_snapshot_month ON staging.stg_monthly_kpi_snapshot (kpi_month);

-- DWHとSupabase IDを紐付けるマッピングテーブル
CREATE TABLE IF NOT EXISTS public.clinic_mapping (
  external_id TEXT PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  clinic_code TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.clinic_mapping IS '外部システムのクリニック識別子とSupabase UUIDのマッピング';

-- 互換性維持のためのビュー定義
CREATE OR REPLACE VIEW public.daily_revenue_summary AS
SELECT
  r.clinic_id,
  r.revenue_date,
  SUM(r.total_amount) AS total_revenue,
  SUM(r.insurance_coverage_amount) AS insurance_revenue,
  SUM(r.patient_payment_amount) AS private_revenue,
  COUNT(*) AS revenue_count
FROM public.revenues r
GROUP BY r.clinic_id, r.revenue_date;

COMMENT ON VIEW public.daily_revenue_summary IS '日次の売上サマリー。既存API互換用ビュー';

CREATE OR REPLACE VIEW public.daily_ai_comments AS
SELECT
  a.id,
  a.clinic_id,
  a.comment_date,
  a.summary,
  COALESCE(a.good_points[1], '') AS good_points,
  COALESCE(a.improvement_points[1], '') AS improvement_points,
  COALESCE(a.recommendations[1], '') AS suggestion_for_tomorrow,
  a.raw_ai_response,
  a.created_at
FROM public.ai_comments a
WHERE a.comment_type = 'daily_summary';

COMMENT ON VIEW public.daily_ai_comments IS '日次AIコメント互換ビュー (旧daily_ai_commentsテーブル相当)';

CREATE OR REPLACE VIEW public.visits AS
SELECT
  t.id,
  t.clinic_id,
  t.patient_id,
  t.treatment_date AS visit_date,
  t.primary_staff_id AS staff_id,
  t.status,
  t.created_at,
  t.updated_at
FROM public.treatments t;

COMMENT ON VIEW public.visits IS '施術記録(treatments)を来院履歴として公開する互換ビュー';
CREATE INDEX IF NOT EXISTS idx_visits_clinic_date ON public.visits (clinic_id, visit_date);

-- 時間帯別来院パターン (API互換)
CREATE OR REPLACE FUNCTION public.get_hourly_visit_pattern(clinic_uuid UUID)
RETURNS TABLE (
  hour_of_day INTEGER,
  patient_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM t.start_time)::int AS hour_of_day,
    COUNT(*) AS patient_count
  FROM public.treatments t
  WHERE t.clinic_id = clinic_uuid
    AND t.start_time IS NOT NULL
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_hourly_visit_pattern(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hourly_visit_pattern(UUID) TO authenticated;

-- 月次KPIマテリアライズドビュー
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_kpi_summary AS
SELECT
  r.clinic_id,
  DATE_TRUNC('month', r.revenue_date)::date AS kpi_month,
  SUM(r.total_amount) AS gross_revenue,
  SUM(r.insurance_coverage_amount) AS insurance_revenue,
  SUM(r.patient_payment_amount) AS private_revenue,
  COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', p.first_visit_date) = DATE_TRUNC('month', r.revenue_date) THEN p.id END) AS new_patients,
  COUNT(DISTINCT r.patient_id) AS total_patients,
  COALESCE(dr.submitted_reports, 0) AS submitted_reports,
  COALESCE(dr.expected_reports, 0) AS expected_reports
FROM public.revenues r
LEFT JOIN public.patients p ON p.id = r.patient_id
LEFT JOIN (
  SELECT
    clinic_id,
    DATE_TRUNC('month', report_date)::date AS kpi_month,
    COUNT(*) FILTER (WHERE status = 'submitted') AS submitted_reports,
    COUNT(*) AS expected_reports
  FROM public.daily_reports
  GROUP BY clinic_id, DATE_TRUNC('month', report_date)
) dr ON dr.clinic_id = r.clinic_id AND dr.kpi_month = DATE_TRUNC('month', r.revenue_date)::date
GROUP BY r.clinic_id, DATE_TRUNC('month', r.revenue_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_kpi_key ON public.mv_monthly_kpi_summary (clinic_id, kpi_month);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_patient_repeat_metrics AS
SELECT
  t.clinic_id,
  t.patient_id,
  COUNT(*) AS total_visits,
  MIN(t.treatment_date) AS first_visit_date,
  MAX(t.treatment_date) AS last_visit_date,
  AVG(EXTRACT(EPOCH FROM (t.treatment_date::timestamp - LAG(t.treatment_date) OVER (PARTITION BY t.patient_id ORDER BY t.treatment_date))) / 86400) AS avg_visit_interval_days
FROM public.treatments t
GROUP BY t.clinic_id, t.patient_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_patient_repeat_key ON public.mv_patient_repeat_metrics (clinic_id, patient_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_staff_productivity AS
SELECT
  t.clinic_id,
  t.primary_staff_id AS staff_id,
  DATE_TRUNC('day', t.treatment_date)::date AS summary_date,
  COUNT(*) AS treatment_count,
  SUM(r.total_amount) AS total_revenue,
  AVG(EXTRACT(EPOCH FROM (COALESCE(t.end_time, t.start_time + INTERVAL '30 minutes') - t.start_time)) / 60) AS avg_duration_minutes
FROM public.treatments t
LEFT JOIN public.revenues r ON r.treatment_id = t.id
GROUP BY t.clinic_id, t.primary_staff_id, DATE_TRUNC('day', t.treatment_date);

CREATE INDEX IF NOT EXISTS idx_mv_staff_productivity_key ON public.mv_staff_productivity (clinic_id, staff_id, summary_date);

COMMENT ON MATERIALIZED VIEW public.mv_monthly_kpi_summary IS '月次KPIサマリー（売上・患者・日報提出率）';
COMMENT ON MATERIALIZED VIEW public.mv_patient_repeat_metrics IS '患者ごとの再来指標（来院回数・平均間隔）';
COMMENT ON MATERIALIZED VIEW public.mv_staff_productivity IS '施術者ごとの稼働指標（施術件数・売上）';

ALTER TABLE staging.stg_monthly_kpi_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_snapshot_service_role
ON staging.stg_monthly_kpi_snapshot
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY clinic_mapping_admin_read
ON public.clinic_mapping
FOR SELECT
USING (auth.is_admin() OR auth.role() = 'service_role');

CREATE POLICY clinic_mapping_admin_write
ON public.clinic_mapping
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMIT;
