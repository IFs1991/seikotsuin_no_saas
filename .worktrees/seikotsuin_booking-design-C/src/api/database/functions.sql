-- 時間帯別来院パターン取得関数
CREATE OR REPLACE FUNCTION get_hourly_visit_pattern(clinic_uuid UUID)
RETURNS TABLE(
    hour_of_day INTEGER,
    day_of_week INTEGER,
    visit_count INTEGER,
    avg_revenue DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM v.visit_date)::INTEGER as hour_of_day,
        EXTRACT(DOW FROM v.visit_date)::INTEGER as day_of_week,
        COUNT(v.id)::INTEGER as visit_count,
        AVG(r.amount)::DECIMAL(10,2) as avg_revenue
    FROM visits v
    LEFT JOIN revenues r ON v.id = r.visit_id
    WHERE v.clinic_id = clinic_uuid
    AND v.visit_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY 
        EXTRACT(HOUR FROM v.visit_date),
        EXTRACT(DOW FROM v.visit_date)
    ORDER BY day_of_week, hour_of_day;
END;
$$ LANGUAGE plpgsql;

-- 時間帯別収益パターン取得関数
CREATE OR REPLACE FUNCTION get_hourly_revenue_pattern(clinic_uuid UUID)
RETURNS TABLE(
    hour_of_day INTEGER,
    total_revenue DECIMAL(10,2),
    transaction_count INTEGER,
    avg_transaction_amount DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM r.created_at)::INTEGER as hour_of_day,
        SUM(r.amount)::DECIMAL(10,2) as total_revenue,
        COUNT(r.id)::INTEGER as transaction_count,
        AVG(r.amount)::DECIMAL(10,2) as avg_transaction_amount
    FROM revenues r
    WHERE r.clinic_id = clinic_uuid
    AND r.revenue_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY EXTRACT(HOUR FROM r.created_at)
    ORDER BY hour_of_day;
END;
$$ LANGUAGE plpgsql;

-- 患者セグメント分析関数
CREATE OR REPLACE FUNCTION analyze_patient_segments(clinic_uuid UUID)
RETURNS TABLE(
    segment_type VARCHAR(50),
    segment_value VARCHAR(100),
    patient_count INTEGER,
    total_revenue DECIMAL(10,2),
    avg_ltv DECIMAL(10,2)
) AS $$
BEGIN
    -- 年齢層別セグメント
    RETURN QUERY
    SELECT 
        'age_group'::VARCHAR(50) as segment_type,
        CASE 
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 30 THEN '20代以下'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 40 THEN '30代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 50 THEN '40代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 60 THEN '50代'
            ELSE '60代以上'
        END::VARCHAR(100) as segment_value,
        COUNT(DISTINCT p.id)::INTEGER as patient_count,
        COALESCE(SUM(r.amount), 0)::DECIMAL(10,2) as total_revenue,
        AVG(calculate_patient_ltv(p.id))::DECIMAL(10,2) as avg_ltv
    FROM patients p
    LEFT JOIN revenues r ON p.id = r.patient_id
    WHERE p.clinic_id = clinic_uuid
    AND p.date_of_birth IS NOT NULL
    GROUP BY 
        CASE 
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 30 THEN '20代以下'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 40 THEN '30代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 50 THEN '40代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 60 THEN '50代'
            ELSE '60代以上'
        END

    UNION ALL

    -- 来院頻度別セグメント
    SELECT 
        'visit_frequency'::VARCHAR(50) as segment_type,
        pvs.visit_category::VARCHAR(100) as segment_value,
        COUNT(pvs.patient_id)::INTEGER as patient_count,
        SUM(pvs.total_revenue)::DECIMAL(10,2) as total_revenue,
        AVG(calculate_patient_ltv(pvs.patient_id))::DECIMAL(10,2) as avg_ltv
    FROM patient_visit_summary pvs
    WHERE pvs.clinic_id = clinic_uuid
    GROUP BY pvs.visit_category;
END;
$$ LANGUAGE plpgsql;

-- スタッフ効率分析関数
CREATE OR REPLACE FUNCTION analyze_staff_efficiency(clinic_uuid UUID, analysis_period INTEGER DEFAULT 30)
RETURNS TABLE(
    staff_id UUID,
    staff_name VARCHAR(255),
    efficiency_score DECIMAL(5,2),
    revenue_per_hour DECIMAL(10,2),
    patients_per_day DECIMAL(5,2),
    satisfaction_trend VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as staff_id,
        s.name as staff_name,
        -- 効率スコア（売上 × 満足度 ÷ 勤務日数）
        (COALESCE(sps.total_revenue_generated, 0) * COALESCE(sps.average_satisfaction_score, 3) / NULLIF(sps.working_days, 0))::DECIMAL(5,2) as efficiency_score,
        (COALESCE(sps.total_revenue_generated, 0) / NULLIF(sps.working_days * 8, 0))::DECIMAL(10,2) as revenue_per_hour,
        (COALESCE(sps.unique_patients, 0)::DECIMAL / NULLIF(sps.working_days, 0))::DECIMAL(5,2) as patients_per_day,
        CASE 
            WHEN sps.average_satisfaction_score >= 4.5 THEN 'excellent'
            WHEN sps.average_satisfaction_score >= 4.0 THEN 'good'
            WHEN sps.average_satisfaction_score >= 3.5 THEN 'average'
            ELSE 'needs_improvement'
        END::VARCHAR(20) as satisfaction_trend
    FROM staff s
    LEFT JOIN staff_performance_summary sps ON s.id = sps.staff_id
    WHERE s.clinic_id = clinic_uuid
    AND s.is_therapist = TRUE
    ORDER BY efficiency_score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- 収益予測関数（線形回帰ベース）
CREATE OR REPLACE FUNCTION predict_revenue(clinic_uuid UUID, forecast_days INTEGER DEFAULT 30)
RETURNS TABLE(
    forecast_date DATE,
    predicted_revenue DECIMAL(10,2),
    confidence_level VARCHAR(20)
) AS $$
DECLARE
    avg_daily_revenue DECIMAL(10,2);
    revenue_trend DECIMAL(10,2);
    day_counter INTEGER;
BEGIN
    -- 過去30日の平均売上を計算
    SELECT AVG(total_revenue), 
           (MAX(total_revenue) - MIN(total_revenue)) / 30
    INTO avg_daily_revenue, revenue_trend
    FROM daily_revenue_summary
    WHERE clinic_id = clinic_uuid
    AND revenue_date >= CURRENT_DATE - INTERVAL '30 days';

    -- 予測データを生成
    FOR day_counter IN 1..forecast_days LOOP
        RETURN QUERY
        SELECT 
            (CURRENT_DATE + day_counter)::DATE as forecast_date,
            GREATEST(0, avg_daily_revenue + (revenue_trend * day_counter))::DECIMAL(10,2) as predicted_revenue,
            CASE 
                WHEN day_counter <= 7 THEN 'high'
                WHEN day_counter <= 14 THEN 'medium'
                ELSE 'low'
            END::VARCHAR(20) as confidence_level;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_revenues_clinic_date ON revenues(clinic_id, revenue_date);
CREATE INDEX IF NOT EXISTS idx_visits_clinic_date ON visits(clinic_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_clinic ON staff(clinic_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_clinic_date ON daily_reports(clinic_id, report_date);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

-- 関数実行権限の設定（必要に応じて調整）
-- GRANT EXECUTE ON FUNCTION get_hourly_visit_pattern(UUID) TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_hourly_revenue_pattern(UUID) TO authenticated;
-- GRANT EXECUTE ON FUNCTION analyze_patient_segments(UUID) TO authenticated;
-- GRANT EXECUTE ON FUNCTION analyze_staff_efficiency(UUID, INTEGER) TO authenticated;
-- GRANT EXECUTE ON FUNCTION predict_revenue(UUID, INTEGER) TO authenticated;