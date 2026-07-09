-- ================================================================
-- 整骨院管理SaaS - コアテーブル定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: システムの基盤となるコアテーブル（店舗、ユーザー、患者、スタッフ）

-- UUIDエクステンションの有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- 1. 店舗テーブル (clinics)
-- ================================================================
CREATE TABLE public.clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone_number VARCHAR(20),
    postal_code VARCHAR(10),
    prefecture VARCHAR(50),
    city VARCHAR(100),
    opening_date DATE,
    business_hours JSONB, -- 営業時間をJSONBで格納 {"monday": {"open": "09:00", "close": "18:00"}}
    holiday_schedule TEXT[], -- 休診日の配列
    is_active BOOLEAN NOT NULL DEFAULT true,
    max_staff_count INTEGER DEFAULT 10, -- 最大スタッフ数
    subscription_plan VARCHAR(50) DEFAULT 'basic', -- サブスクリプションプラン
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 2. プロファイルテーブル (profiles)
-- ================================================================
-- auth.usersテーブルと1:1対応するプロファイル情報
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone_number VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'staff', -- 'admin', 'manager', 'staff', 'practitioner'
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    language_preference VARCHAR(10) DEFAULT 'ja',
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 3. 患者テーブル (patients)
-- ================================================================
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_number VARCHAR(50) UNIQUE, -- 患者番号（clinic内でユニーク）
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name_kana VARCHAR(100), -- カナ
    first_name_kana VARCHAR(100), -- カナ
    date_of_birth DATE,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
    phone_number VARCHAR(20),
    email VARCHAR(255),
    postal_code VARCHAR(10),
    address TEXT,
    emergency_contact JSONB, -- 緊急連絡先 {"name": "田中太郎", "phone": "090-1234-5678", "relationship": "配偶者"}
    medical_history TEXT[], -- 既往歴の配列
    allergies TEXT[], -- アレルギー情報の配列
    medications TEXT[], -- 現在服用中の薬の配列
    insurance_info JSONB, -- 保険証情報 {"type": "国民健康保険", "number": "12345678", "symbol": "アイウ", "valid_until": "2024-12-31"}
    first_visit_date DATE,
    last_visit_date DATE,
    total_visits INTEGER DEFAULT 0,
    total_revenue DECIMAL(10, 2) DEFAULT 0,
    visit_frequency_days INTEGER, -- 平均来院間隔（日数）
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100), -- 離脱リスクスコア (0-100)
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT patients_patient_number_clinic_unique UNIQUE (clinic_id, patient_number)
);

-- ================================================================
-- 4. スタッフテーブル (staff)
-- ================================================================
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    staff_number VARCHAR(50), -- スタッフ番号
    job_title VARCHAR(100), -- 職種・役職
    hire_date DATE,
    employment_type VARCHAR(50) DEFAULT 'full_time', -- 'full_time', 'part_time', 'contract'
    hourly_rate DECIMAL(8, 2), -- 時給
    monthly_salary DECIMAL(10, 2), -- 月給
    qualifications TEXT[], -- 資格の配列 ["柔道整復師", "鍼灸師"]
    specialties TEXT[], -- 専門分野の配列 ["肩こり", "腰痛", "スポーツ外傷"]
    is_therapist BOOLEAN NOT NULL DEFAULT false, -- 施術者かどうか
    max_patients_per_day INTEGER DEFAULT 20, -- 1日の最大対応患者数
    performance_score DECIMAL(3, 2) DEFAULT 0.00, -- パフォーマンススコア (0.00-5.00)
    customer_satisfaction DECIMAL(3, 2) DEFAULT 0.00, -- 顧客満足度 (0.00-5.00)
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT staff_number_clinic_unique UNIQUE (clinic_id, staff_number)
);

-- ================================================================
-- インデックス作成
-- ================================================================

-- clinicsテーブル
CREATE INDEX idx_clinics_active ON public.clinics(is_active);
CREATE INDEX idx_clinics_subscription ON public.clinics(subscription_plan);

-- profilesテーブル
CREATE INDEX idx_profiles_clinic_id ON public.profiles(clinic_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_active ON public.profiles(is_active);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- patientsテーブル  
CREATE INDEX idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX idx_patients_active ON public.patients(is_active);
CREATE INDEX idx_patients_last_visit ON public.patients(last_visit_date);
CREATE INDEX idx_patients_risk_score ON public.patients(risk_score);
CREATE INDEX idx_patients_name_kana ON public.patients(last_name_kana, first_name_kana);
CREATE INDEX idx_patients_phone ON public.patients(phone_number);

-- staffテーブル
CREATE INDEX idx_staff_clinic_id ON public.staff(clinic_id);
CREATE INDEX idx_staff_active ON public.staff(is_active);
CREATE INDEX idx_staff_therapist ON public.staff(is_therapist);
CREATE INDEX idx_staff_performance ON public.staff(performance_score);

-- ================================================================
-- コメント追加
-- ================================================================

COMMENT ON TABLE public.clinics IS '整骨院店舗の基本情報を管理するテーブル';
COMMENT ON TABLE public.profiles IS 'auth.usersと対応するユーザープロファイル情報';
COMMENT ON TABLE public.patients IS '患者の基本情報と来院履歴サマリーを管理';
COMMENT ON TABLE public.staff IS 'スタッフの詳細情報と勤務関連データを管理';

COMMENT ON COLUMN public.patients.risk_score IS '患者の離脱リスクスコア（0-100）。AIが算出';
COMMENT ON COLUMN public.staff.performance_score IS 'スタッフのパフォーマンススコア（0.00-5.00）';
COMMENT ON COLUMN public.staff.customer_satisfaction IS '顧客満足度スコア（0.00-5.00）';