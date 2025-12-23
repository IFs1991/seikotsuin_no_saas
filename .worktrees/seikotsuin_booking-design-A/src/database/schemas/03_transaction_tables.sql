-- ================================================================
-- 整骨院管理SaaS - トランザクションテーブル定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: 業務トランザクション（予約、施術、売上、日報等）のテーブル定義

-- ================================================================
-- 1. 予約テーブル (appointments)
-- ================================================================
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL, -- 指名がある場合
    appointment_number VARCHAR(50), -- 予約番号
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    appointment_type VARCHAR(50) DEFAULT 'treatment', -- 'treatment', 'consultation', 'follow_up'
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    symptoms TEXT, -- 予約時の症状・要望
    requested_menus UUID[], -- 希望施術メニューのID配列
    special_requests TEXT, -- 特別な要望
    reminder_sent_at TIMESTAMPTZ, -- リマインダー送信日時
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT appointments_start_before_end CHECK (start_time < end_time),
    CONSTRAINT appointments_number_clinic_unique UNIQUE (clinic_id, appointment_number)
);

-- ================================================================
-- 2. 施術記録テーブル (treatments)
-- ================================================================
CREATE TABLE public.treatments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE REFERENCES public.appointments(id) ON DELETE SET NULL,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    primary_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    assistant_staff_ids UUID[], -- アシスタントスタッフのID配列
    treatment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    
    -- 施術内容
    chief_complaint TEXT, -- 主訴
    current_symptoms TEXT, -- 現在の症状
    objective_findings TEXT, -- 他覚的所見
    treatment_plan TEXT, -- 治療計画
    treatment_performed TEXT, -- 実施した施術
    equipment_used TEXT[], -- 使用機器
    treatment_areas TEXT[], -- 施術部位
    pain_level_before INTEGER CHECK (pain_level_before >= 0 AND pain_level_before <= 10), -- 施術前痛みレベル
    pain_level_after INTEGER CHECK (pain_level_after >= 0 AND pain_level_after <= 10), -- 施術後痛みレベル
    mobility_assessment JSONB, -- 可動域評価
    
    -- 次回予約・指導
    next_visit_recommendation TEXT, -- 次回来院推奨
    home_care_instructions TEXT, -- 自宅ケア指導
    precautions TEXT, -- 注意事項
    
    -- その他
    patient_feedback TEXT, -- 患者からのフィードバック
    staff_notes TEXT, -- スタッフメモ
    is_insurance_claim BOOLEAN DEFAULT false, -- 保険請求対象
    claim_submitted_at TIMESTAMPTZ, -- 保険請求提出日時
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 3. 施術メニュー実績テーブル (treatment_menu_records)
-- ================================================================
CREATE TABLE public.treatment_menu_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    treatment_id UUID NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
    menu_id UUID NOT NULL REFERENCES public.treatment_menus(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(8, 2) NOT NULL, -- 実施時の単価
    total_price DECIMAL(8, 2) NOT NULL,
    insurance_points INTEGER, -- 保険点数
    insurance_coverage_amount DECIMAL(8, 2), -- 保険給付額
    patient_payment_amount DECIMAL(8, 2), -- 患者負担額
    duration_minutes INTEGER, -- 実際の施術時間
    performed_by UUID REFERENCES public.staff(id), -- 実施者
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 4. 売上テーブル (revenues)
-- ================================================================
CREATE TABLE public.revenues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    treatment_id UUID UNIQUE REFERENCES public.treatments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    revenue_number VARCHAR(50), -- 売上番号
    revenue_date DATE NOT NULL,
    revenue_time TIME NOT NULL,
    
    -- 金額情報
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    insurance_coverage_amount DECIMAL(10, 2) DEFAULT 0.00,
    patient_payment_amount DECIMAL(10, 2) NOT NULL CHECK (patient_payment_amount >= 0),
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    tax_amount DECIMAL(10, 2) DEFAULT 0.00,
    
    -- 支払い情報
    payment_method_id UUID REFERENCES public.payment_methods(id),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(255), -- 決済リファレンス
    
    -- 保険請求情報
    insurance_type_id UUID REFERENCES public.insurance_types(id),
    insurance_claim_number VARCHAR(100),
    insurance_claim_status VARCHAR(20) DEFAULT 'not_applicable' CHECK (insurance_claim_status IN ('not_applicable', 'pending', 'submitted', 'approved', 'rejected', 'paid')),
    insurance_claim_amount DECIMAL(10, 2),
    
    -- その他
    receipt_number VARCHAR(100),
    receipt_issued_at TIMESTAMPTZ,
    refund_amount DECIMAL(10, 2) DEFAULT 0.00,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    notes TEXT,
    
    processed_by UUID REFERENCES public.staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT revenues_number_clinic_unique UNIQUE (clinic_id, revenue_number),
    CONSTRAINT revenues_receipt_number_clinic_unique UNIQUE (clinic_id, receipt_number)
);

-- ================================================================
-- 5. 日報テーブル (daily_reports)
-- ================================================================
CREATE TABLE public.daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    
    -- 基本統計
    total_patients INTEGER NOT NULL DEFAULT 0,
    new_patients INTEGER NOT NULL DEFAULT 0,
    returning_patients INTEGER NOT NULL DEFAULT 0,
    cancelled_appointments INTEGER NOT NULL DEFAULT 0,
    no_show_appointments INTEGER NOT NULL DEFAULT 0,
    
    -- 売上関連
    total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    insurance_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    self_pay_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    average_revenue_per_patient DECIMAL(8, 2),
    
    -- スタッフ関連
    staff_count INTEGER DEFAULT 0,
    therapist_count INTEGER DEFAULT 0,
    staff_utilization_rate DECIMAL(3, 2), -- スタッフ稼働率
    
    -- その他
    weather VARCHAR(50), -- 天気
    special_events TEXT, -- 特別なイベント
    operational_notes TEXT, -- 営業に関するメモ
    issues_encountered TEXT, -- 発生した問題
    
    -- AI分析結果
    ai_analysis_summary TEXT,
    ai_recommendations TEXT[],
    
    created_by UUID NOT NULL REFERENCES public.staff(id),
    approved_by UUID REFERENCES public.staff(id),
    approved_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT daily_reports_clinic_date_unique UNIQUE (clinic_id, report_date)
);

-- ================================================================
-- 6. AIコメントテーブル (ai_comments)
-- ================================================================
CREATE TABLE public.ai_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    daily_report_id UUID REFERENCES public.daily_reports(id) ON DELETE CASCADE,
    comment_date DATE NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'daily_summary', -- 'daily_summary', 'weekly_analysis', 'monthly_report'
    
    -- AI生成コンテンツ
    summary TEXT NOT NULL,
    good_points TEXT[],
    improvement_points TEXT[],
    recommendations TEXT[],
    alerts TEXT[], -- 注意喚起
    insights TEXT[], -- インサイト
    
    -- AI関連メタデータ
    ai_model_version VARCHAR(50),
    confidence_score DECIMAL(3, 2), -- 信頼度スコア (0.00-1.00)
    data_sources TEXT[], -- 分析に使用したデータソース
    analysis_parameters JSONB, -- 分析パラメータ
    raw_ai_response JSONB, -- 生のAIレスポンス
    
    -- フィードバック
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5), -- ユーザー評価
    user_feedback TEXT,
    is_helpful BOOLEAN,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT ai_comments_clinic_date_type_unique UNIQUE (clinic_id, comment_date, comment_type)
);

-- ================================================================
-- インデックス作成
-- ================================================================

-- appointmentsテーブル
CREATE INDEX idx_appointments_clinic_date ON public.appointments(clinic_id, appointment_date);
CREATE INDEX idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX idx_appointments_staff_id ON public.appointments(staff_id);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_appointments_datetime ON public.appointments(appointment_date, start_time);

-- treatmentsテーブル
CREATE INDEX idx_treatments_clinic_date ON public.treatments(clinic_id, treatment_date);
CREATE INDEX idx_treatments_patient_id ON public.treatments(patient_id);
CREATE INDEX idx_treatments_staff_id ON public.treatments(primary_staff_id);
CREATE INDEX idx_treatments_status ON public.treatments(status);
CREATE INDEX idx_treatments_insurance ON public.treatments(is_insurance_claim);

-- treatment_menu_recordsテーブル
CREATE INDEX idx_treatment_menu_records_treatment ON public.treatment_menu_records(treatment_id);
CREATE INDEX idx_treatment_menu_records_menu ON public.treatment_menu_records(menu_id);
CREATE INDEX idx_treatment_menu_records_staff ON public.treatment_menu_records(performed_by);

-- revenuesテーブル
CREATE INDEX idx_revenues_clinic_date ON public.revenues(clinic_id, revenue_date);
CREATE INDEX idx_revenues_patient_id ON public.revenues(patient_id);
CREATE INDEX idx_revenues_payment_status ON public.revenues(payment_status);
CREATE INDEX idx_revenues_insurance_status ON public.revenues(insurance_claim_status);
CREATE INDEX idx_revenues_total_amount ON public.revenues(total_amount);

-- daily_reportsテーブル
CREATE INDEX idx_daily_reports_clinic_date ON public.daily_reports(clinic_id, report_date);
CREATE INDEX idx_daily_reports_status ON public.daily_reports(status);
CREATE INDEX idx_daily_reports_created_by ON public.daily_reports(created_by);

-- ai_commentsテーブル
CREATE INDEX idx_ai_comments_clinic_date ON public.ai_comments(clinic_id, comment_date);
CREATE INDEX idx_ai_comments_type ON public.ai_comments(comment_type);
CREATE INDEX idx_ai_comments_confidence ON public.ai_comments(confidence_score);

-- ================================================================
-- コメント追加
-- ================================================================

COMMENT ON TABLE public.appointments IS '患者の予約情報を管理';
COMMENT ON TABLE public.treatments IS '施術記録とカルテ情報を管理';
COMMENT ON TABLE public.treatment_menu_records IS '施術ごとのメニュー実績を記録';
COMMENT ON TABLE public.revenues IS '売上と支払い情報を管理';
COMMENT ON TABLE public.daily_reports IS '店舗の日次業績レポート';
COMMENT ON TABLE public.ai_comments IS 'AI分析によるコメントと提案';

COMMENT ON COLUMN public.treatments.pain_level_before IS '施術前の痛みレベル（0-10スケール）';
COMMENT ON COLUMN public.treatments.pain_level_after IS '施術後の痛みレベル（0-10スケール）';
COMMENT ON COLUMN public.ai_comments.confidence_score IS 'AI分析の信頼度（0.00-1.00）';