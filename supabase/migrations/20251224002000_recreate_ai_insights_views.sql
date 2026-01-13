-- =====================================================
-- AIインサイト用ビュー再作成マイグレーション
-- =====================================================
-- 作成日: 2025-12-24
-- 目的: 旧スキーマ(patients/visits/revenues)から
--       新スキーマ(customers/reservations/resources)への移行
--
-- 背景:
--   AIインサイト機能のビューが旧テーブルを参照しており、
--   現行アプリ(reservations等)のデータを取得できない問題を修正
-- =====================================================

-- 1. 既存ビューの削除
DROP VIEW IF EXISTS public.daily_revenue_summary;
DROP VIEW IF EXISTS public.staff_performance_summary;
DROP VIEW IF EXISTS public.patient_visit_summary;

-- =====================================================
-- 2. daily_revenue_summary ビュー作成
-- =====================================================
-- 日次収益サマリー: reservationsテーブルから日別売上を集計
--
-- 使用カラム (API互換):
--   - clinic_id: クリニックID
--   - revenue_date: 収益計上日
--   - total_revenue: 日次総売上
-- =====================================================
CREATE VIEW public.daily_revenue_summary AS
SELECT
    r.clinic_id,
    c.name AS clinic_name,
    DATE(r.start_time AT TIME ZONE 'Asia/Tokyo') AS revenue_date,
    COUNT(DISTINCT r.customer_id) AS unique_patients,
    COUNT(r.id) AS total_transactions,
    COALESCE(SUM(COALESCE(r.actual_price, r.price, 0)), 0) AS total_revenue,
    -- 保険/自費の区別は新スキーマでは困難なため、total_revenueと同値/0を設定
    COALESCE(SUM(COALESCE(r.actual_price, r.price, 0)), 0) AS insurance_revenue,
    0::DECIMAL(10,2) AS private_revenue,
    COALESCE(AVG(COALESCE(r.actual_price, r.price, 0)), 0) AS average_transaction_amount
FROM public.reservations r
INNER JOIN public.clinics c ON r.clinic_id = c.id
WHERE r.is_deleted = false
  AND r.status IN ('completed', 'arrived')
  AND r.clinic_id IS NOT NULL
GROUP BY r.clinic_id, c.name, DATE(r.start_time AT TIME ZONE 'Asia/Tokyo')
ORDER BY revenue_date DESC;

COMMENT ON VIEW public.daily_revenue_summary IS '日次収益サマリー（新スキーマ対応版）- reservationsテーブルから集計';

-- =====================================================
-- 3. staff_performance_summary ビュー作成
-- =====================================================
-- スタッフ成績サマリー: resourcesテーブル(type=staff)と
-- reservationsテーブルからスタッフ別実績を集計
--
-- 使用カラム (API互換):
--   - clinic_id: クリニックID
--   - staff_name: スタッフ名
--   - total_revenue_generated: スタッフ別総売上
--   - total_visits: スタッフ別来院数
-- =====================================================
CREATE VIEW public.staff_performance_summary AS
SELECT
    res.id AS staff_id,
    res.name AS staff_name,
    res.clinic_id,
    'staff' AS role,
    COUNT(DISTINCT rv.id) AS total_visits,
    COUNT(DISTINCT rv.customer_id) AS unique_patients,
    COALESCE(SUM(COALESCE(rv.actual_price, rv.price, 0)), 0) AS total_revenue_generated,
    -- satisfaction_scoreは新スキーマに存在しないためNULL
    NULL::DECIMAL(3,2) AS average_satisfaction_score,
    COUNT(DISTINCT DATE(rv.start_time AT TIME ZONE 'Asia/Tokyo')) AS working_days
FROM public.resources res
LEFT JOIN public.reservations rv
    ON res.id = rv.staff_id
    AND rv.is_deleted = false
    AND rv.status IN ('completed', 'arrived')
WHERE res.type = 'staff'
  AND res.is_deleted = false
  AND res.clinic_id IS NOT NULL
GROUP BY res.id, res.name, res.clinic_id;

COMMENT ON VIEW public.staff_performance_summary IS 'スタッフ成績サマリー（新スキーマ対応版）- resources/reservationsテーブルから集計';

-- =====================================================
-- 4. patient_visit_summary ビュー作成
-- =====================================================
-- 患者来院履歴サマリー: customersテーブルとreservationsテーブルから
-- 患者別の来院履歴を集計
--
-- 使用カラム (API互換):
--   - clinic_id: クリニックID
--   - first_visit_date: 初回来院日
--   - last_visit_date: 最終来院日
--   - visit_count: 来院回数
-- =====================================================
CREATE VIEW public.patient_visit_summary AS
SELECT
    cu.id AS patient_id,
    cu.name AS patient_name,
    cu.clinic_id,
    -- first_visit_date: 最初のcompleted/arrived予約日、なければcreated_at
    COALESCE(
        DATE(MIN(rv.start_time) AT TIME ZONE 'Asia/Tokyo'),
        DATE(cu.created_at AT TIME ZONE 'Asia/Tokyo')
    ) AS first_visit_date,
    -- last_visit_date: 最後のcompleted/arrived予約日
    DATE(MAX(rv.start_time) AT TIME ZONE 'Asia/Tokyo') AS last_visit_date,
    COUNT(rv.id) AS visit_count,
    COALESCE(SUM(COALESCE(rv.actual_price, rv.price, 0)), 0) AS total_revenue,
    COALESCE(AVG(COALESCE(rv.actual_price, rv.price, 0)), 0) AS average_revenue_per_visit,
    COALESCE(
        DATE(MAX(rv.start_time) AT TIME ZONE 'Asia/Tokyo') -
        DATE(MIN(rv.start_time) AT TIME ZONE 'Asia/Tokyo'),
        0
    ) AS treatment_period_days,
    CASE
        WHEN COUNT(rv.id) = 0 THEN '来院なし'
        WHEN COUNT(rv.id) = 1 THEN '初診のみ'
        WHEN COUNT(rv.id) BETWEEN 2 AND 5 THEN '軽度リピート'
        WHEN COUNT(rv.id) BETWEEN 6 AND 15 THEN '中度リピート'
        ELSE '高度リピート'
    END AS visit_category
FROM public.customers cu
LEFT JOIN public.reservations rv
    ON cu.id = rv.customer_id
    AND rv.is_deleted = false
    AND rv.status IN ('completed', 'arrived')
WHERE cu.is_deleted = false
  AND cu.clinic_id IS NOT NULL
GROUP BY cu.id, cu.name, cu.clinic_id, cu.created_at;

COMMENT ON VIEW public.patient_visit_summary IS '患者来院履歴サマリー（新スキーマ対応版）- customers/reservationsテーブルから集計';

-- =====================================================
-- 5. パフォーマンス向上用インデックス
-- =====================================================
-- 条件付きインデックスでクエリパフォーマンスを向上
CREATE INDEX IF NOT EXISTS idx_reservations_status_clinic
    ON public.reservations(clinic_id, status)
    WHERE is_deleted = false;

-- =====================================================
-- 6. ビューへのアクセス権限付与
-- =====================================================
GRANT SELECT ON public.daily_revenue_summary TO authenticated;
GRANT SELECT ON public.staff_performance_summary TO authenticated;
GRANT SELECT ON public.patient_visit_summary TO authenticated;

-- =====================================================
-- 7. 完了メッセージ
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'AIインサイト用ビューの再作成が完了しました。';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE '対象ビュー:';
    RAISE NOTICE '  - daily_revenue_summary (日次収益)';
    RAISE NOTICE '  - staff_performance_summary (スタッフ成績)';
    RAISE NOTICE '  - patient_visit_summary (患者来院履歴)';
    RAISE NOTICE '';
    RAISE NOTICE '参照テーブル（新スキーマ）:';
    RAISE NOTICE '  - customers (顧客)';
    RAISE NOTICE '  - reservations (予約)';
    RAISE NOTICE '  - resources (スタッフ/設備)';
    RAISE NOTICE '  - clinics (クリニック)';
    RAISE NOTICE '=====================================================';
END $$;
