CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 店舗情報管理
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone_number VARCHAR(20),
    opening_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- スタッフ情報（施術者含む）
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 例: '施術者', '受付', '管理者'
    hire_date DATE,
    is_therapist BOOLEAN DEFAULT FALSE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 患者情報
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    gender VARCHAR(10), -- 例: '男性', '女性', 'その他'
    date_of_birth DATE,
    phone_number VARCHAR(20),
    address TEXT,
    registration_date DATE DEFAULT CURRENT_DATE,
    last_visit_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 施術メニューマスタ
CREATE TABLE master_treatment_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 支払方法マスタ
CREATE TABLE master_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 患者区分マスタ
CREATE TABLE master_patient_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE, -- 例: '初診', '再診'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- カテゴリーマスタ
CREATE TABLE master_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE, -- 例: '保険診療', '自費診療', '交通事故'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 来院記録
CREATE TABLE visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    visit_date TIMESTAMP WITH TIME ZONE NOT NULL,
    therapist_id UUID REFERENCES staff(id) ON DELETE SET NULL, -- 施術者が退職しても記録は残す
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 売上データ
CREATE TABLE revenues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    revenue_date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    insurance_revenue DECIMAL(10, 2) DEFAULT 0.00,
    private_revenue DECIMAL(10, 2) DEFAULT 0.00,
    payment_method_id UUID REFERENCES master_payment_methods(id) ON DELETE SET NULL,
    treatment_menu_id UUID REFERENCES master_treatment_menus(id) ON DELETE SET NULL,
    patient_type_id UUID REFERENCES master_patient_types(id) ON DELETE SET NULL,
    category_id UUID REFERENCES master_categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- スタッフパフォーマンス
CREATE TABLE staff_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    performance_date DATE NOT NULL,
    patient_count INTEGER DEFAULT 0,
    revenue_generated DECIMAL(10, 2) DEFAULT 0.00,
    satisfaction_score DECIMAL(3, 2), -- 0.00 - 5.00
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (staff_id, performance_date) -- 1日1スタッフ1レコード
);

-- 日報データ（施術者情報含む）
CREATE TABLE daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL, -- 報告者が退職しても日報は残す
    total_patients INTEGER DEFAULT 0,
    new_patients INTEGER DEFAULT 0,
    total_revenue DECIMAL(10, 2) DEFAULT 0.00,
    insurance_revenue DECIMAL(10, 2) DEFAULT 0.00,
    private_revenue DECIMAL(10, 2) DEFAULT 0.00,
    report_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, report_date) -- 1日1店舗1日報
);

-- 日次AIコメント
CREATE TABLE daily_ai_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    comment_date DATE NOT NULL,
    summary TEXT,
    good_points TEXT,
    improvement_points TEXT,
    suggestion_for_tomorrow TEXT,
    raw_ai_response JSONB, -- AIの生レスポンスをJSON形式で保存
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, comment_date) -- 1日1店舗1コメント
);

-- ユーザー権限管理
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE UNIQUE, -- 1スタッフにつき1ユーザーアカウント
    username VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role VARCHAR(50) NOT NULL, -- 例: 'admin', 'clinic_manager', 'therapist', 'staff'
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL, -- AdminユーザーはNULL可
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- チャットセッション
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_permissions(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL, -- Adminセッションの場合はNULL
    session_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end_time TIMESTAMP WITH TIME ZONE,
    context_data JSONB, -- チャットのコンテキストデータ（例: ユーザーが参照しているダッシュボードデータなど）
    is_admin_session BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- チャットメッセージ (chat_sessionsの子テーブル)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL, -- 'user' or 'ai'
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_data JSONB, -- AIレスポンスに含まれる構造化データ（グラフデータなど）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 患者来院履歴サマリー（分析用ビュー）
CREATE VIEW patient_visit_summary AS
SELECT 
    p.id as patient_id,
    p.name as patient_name,
    p.clinic_id,
    p.registration_date as first_visit_date,
    p.last_visit_date,
    COUNT(v.id) as visit_count,
    COALESCE(SUM(r.amount), 0) as total_revenue,
    AVG(r.amount) as average_revenue_per_visit,
    MAX(v.visit_date) - MIN(v.visit_date) as treatment_period_days,
    CASE 
        WHEN COUNT(v.id) = 1 THEN '初診のみ'
        WHEN COUNT(v.id) BETWEEN 2 AND 5 THEN '軽度リピート'
        WHEN COUNT(v.id) BETWEEN 6 AND 15 THEN '中度リピート'
        ELSE '高度リピート'
    END as visit_category
FROM patients p
LEFT JOIN visits v ON p.id = v.patient_id
LEFT JOIN revenues r ON v.id = r.visit_id
GROUP BY p.id, p.name, p.clinic_id, p.registration_date, p.last_visit_date;

-- スタッフ成績サマリー（分析用ビュー）
CREATE VIEW staff_performance_summary AS
SELECT 
    s.id as staff_id,
    s.name as staff_name,
    s.clinic_id,
    s.role,
    COUNT(DISTINCT v.id) as total_visits,
    COUNT(DISTINCT v.patient_id) as unique_patients,
    COALESCE(SUM(r.amount), 0) as total_revenue_generated,
    AVG(sp.satisfaction_score) as average_satisfaction_score,
    COUNT(DISTINCT DATE(v.visit_date)) as working_days
FROM staff s
LEFT JOIN visits v ON s.id = v.therapist_id
LEFT JOIN revenues r ON v.id = r.visit_id
LEFT JOIN staff_performance sp ON s.id = sp.staff_id
WHERE s.is_therapist = TRUE
GROUP BY s.id, s.name, s.clinic_id, s.role;

-- 日次収益サマリー（分析用ビュー）
CREATE VIEW daily_revenue_summary AS
SELECT 
    c.id as clinic_id,
    c.name as clinic_name,
    r.revenue_date,
    COUNT(DISTINCT r.patient_id) as unique_patients,
    COUNT(r.id) as total_transactions,
    SUM(r.amount) as total_revenue,
    SUM(r.insurance_revenue) as insurance_revenue,
    SUM(r.private_revenue) as private_revenue,
    AVG(r.amount) as average_transaction_amount
FROM clinics c
LEFT JOIN revenues r ON c.id = r.clinic_id
GROUP BY c.id, c.name, r.revenue_date
ORDER BY r.revenue_date DESC;

-- 患者離脱リスクスコア計算関数
CREATE OR REPLACE FUNCTION calculate_churn_risk_score(patient_uuid UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    last_visit_days INTEGER;
    visit_frequency DECIMAL(10,2);
    avg_gap_days DECIMAL(10,2);
    risk_score DECIMAL(5,2);
BEGIN
    -- 最後の来院からの日数
    SELECT EXTRACT(DAY FROM NOW() - MAX(visit_date))
    INTO last_visit_days
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    -- 平均来院間隔
    SELECT AVG(EXTRACT(DAY FROM visit_date - LAG(visit_date) OVER (ORDER BY visit_date)))
    INTO avg_gap_days
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    -- リスクスコア計算（0-100）
    IF last_visit_days IS NULL OR avg_gap_days IS NULL THEN
        RETURN 0;
    END IF;
    
    risk_score := CASE 
        WHEN last_visit_days <= avg_gap_days THEN 0
        WHEN last_visit_days <= avg_gap_days * 2 THEN 25
        WHEN last_visit_days <= avg_gap_days * 3 THEN 50
        WHEN last_visit_days <= avg_gap_days * 4 THEN 75
        ELSE 100
    END;
    
    RETURN risk_score;
END;
$$ LANGUAGE plpgsql;

-- 患者LTV計算関数
CREATE OR REPLACE FUNCTION calculate_patient_ltv(patient_uuid UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    avg_revenue_per_visit DECIMAL(10,2);
    visit_frequency DECIMAL(10,2);
    total_visits INTEGER;
    months_active DECIMAL(10,2);
    predicted_ltv DECIMAL(10,2);
BEGIN
    -- 平均単価取得
    SELECT AVG(r.amount)
    INTO avg_revenue_per_visit
    FROM revenues r
    WHERE r.patient_id = patient_uuid;
    
    -- 来院頻度と期間取得
    SELECT 
        COUNT(*),
        EXTRACT(MONTH FROM AGE(MAX(visit_date), MIN(visit_date))) + 1
    INTO total_visits, months_active
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    IF avg_revenue_per_visit IS NULL OR total_visits = 0 OR months_active = 0 THEN
        RETURN 0;
    END IF;
    
    -- 月あたり来院頻度
    visit_frequency := total_visits / months_active;
    
    -- 12ヶ月予測LTV
    predicted_ltv := avg_revenue_per_visit * visit_frequency * 12;
    
    RETURN predicted_ltv;
END;
$$ LANGUAGE plpgsql;

-- 監査ログテーブル（医療データアクセス追跡用）
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL, -- 'login', 'data_access', 'data_modify', etc.
    user_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    target_table VARCHAR(100), -- アクセス/変更されたテーブル名
    target_id UUID, -- アクセス/変更されたレコードのID
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    details JSONB, -- 詳細情報（変更内容、検索条件など）
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 監査ログのインデックス（検索高速化）
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_target_table ON audit_logs(target_table);
CREATE INDEX idx_audit_logs_clinic_id ON audit_logs(clinic_id);

-- データベース暗号化用の拡張機能
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 暗号化キーのテーブル（実際の暗号化キーは環境変数で管理）
CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_name VARCHAR(100) NOT NULL UNIQUE,
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rotated_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 患者情報暗号化用のヘルパー関数
CREATE OR REPLACE FUNCTION encrypt_patient_data(plain_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- 実際の実装では環境変数からキーを取得
    -- ここでは例として固定値を使用（本番では変更必須）
    RETURN encode(pgp_sym_encrypt(plain_text, current_setting('app.encryption_key', true)), 'base64');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrypt_patient_data(encrypted_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- 実際の実装では環境変数からキーを取得
    RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), current_setting('app.encryption_key', true));
END;
$$ LANGUAGE plpgsql;