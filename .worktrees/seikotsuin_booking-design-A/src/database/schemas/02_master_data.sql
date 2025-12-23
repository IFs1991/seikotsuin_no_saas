-- ================================================================
-- 整骨院管理SaaS - マスターデータテーブル定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: システムで使用するマスターデータ（施術メニュー、支払い方法、権限等）

-- ================================================================
-- 1. 施術メニューテーブル (treatment_menus)
-- ================================================================
CREATE TABLE public.treatment_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULLの場合は全店舗共通
    category_id UUID REFERENCES public.menu_categories(id),
    code VARCHAR(50), -- メニューコード
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(8, 2) NOT NULL CHECK (price >= 0),
    duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes > 0),
    is_insurance_applicable BOOLEAN DEFAULT false, -- 保険適用可能か
    insurance_points INTEGER, -- 保険点数
    max_sessions_per_day INTEGER, -- 1日の最大実施回数
    required_qualifications TEXT[], -- 必要な資格
    body_parts TEXT[], -- 対象部位 ["首", "肩", "腰"]
    treatment_type VARCHAR(50), -- 'manual', 'equipment', 'combination'
    equipment_required TEXT[], -- 必要な機器
    contraindications TEXT[], -- 禁忌事項
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT treatment_menus_code_clinic_unique UNIQUE (clinic_id, code)
);

-- ================================================================
-- 2. メニューカテゴリテーブル (menu_categories)
-- ================================================================
CREATE TABLE public.menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color_code VARCHAR(7) DEFAULT '#3B82F6', -- カテゴリ表示色
    icon_name VARCHAR(50), -- アイコン名
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 3. 支払い方法テーブル (payment_methods)
-- ================================================================
CREATE TABLE public.payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULLの場合は全店舗共通
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'cash', 'credit_card', 'electronic_money', 'bank_transfer', 'insurance'
    processing_fee_rate DECIMAL(5, 4) DEFAULT 0.0000, -- 手数料率 (例: 0.0320 = 3.2%)
    processing_fee_fixed DECIMAL(8, 2) DEFAULT 0.00, -- 固定手数料
    settlement_days INTEGER DEFAULT 0, -- 入金日数
    is_default BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 4. 保険種別テーブル (insurance_types)
-- ================================================================
CREATE TABLE public.insurance_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL UNIQUE, -- 保険者番号の頭2桁等
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'health_insurance', 'workers_compensation', 'auto_insurance', 'self_pay'
    coverage_rate DECIMAL(3, 2) DEFAULT 0.70, -- 給付率 (例: 0.70 = 70%)
    co_payment_rate DECIMAL(3, 2) DEFAULT 0.30, -- 自己負担率 (例: 0.30 = 30%)
    point_value DECIMAL(4, 2) DEFAULT 10.00, -- 1点単価（円）
    monthly_limit_amount DECIMAL(10, 2), -- 月額上限額
    age_restrictions JSONB, -- 年齢制限 {"min_age": 0, "max_age": null}
    valid_conditions TEXT[], -- 適用条件
    required_documents TEXT[], -- 必要書類
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 5. 権限ロールテーブル (roles)
-- ================================================================
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL DEFAULT 0, -- 権限レベル（高いほど強い権限）
    color_code VARCHAR(7) DEFAULT '#6B7280',
    is_system_role BOOLEAN DEFAULT false, -- システム標準ロール
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 6. 権限テーブル (permissions)
-- ================================================================
CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 'patient:read', 'patient:create', 'revenue:report'
    resource VARCHAR(50) NOT NULL, -- 'patient', 'staff', 'revenue', 'system'
    action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'report'
    description TEXT,
    is_dangerous BOOLEAN DEFAULT false, -- 危険な操作かどうか
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 7. ロール権限中間テーブル (role_permissions)
-- ================================================================
CREATE TABLE public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES public.profiles(id),
    
    PRIMARY KEY (role_id, permission_id)
);

-- ================================================================
-- 8. 患者タイプテーブル (patient_types)
-- ================================================================
CREATE TABLE public.patient_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULLの場合は全店舗共通
    name VARCHAR(100) NOT NULL,
    description TEXT,
    default_insurance_type_id UUID REFERENCES public.insurance_types(id),
    color_code VARCHAR(7) DEFAULT '#10B981',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 9. システム設定テーブル (system_settings)
-- ================================================================
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULLの場合は全システム共通
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    data_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'object', 'array'
    description TEXT,
    is_editable BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false, -- クライアントサイドから参照可能か
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 制約
    CONSTRAINT system_settings_key_clinic_unique UNIQUE (clinic_id, key)
);

-- ================================================================
-- インデックス作成
-- ================================================================

-- treatment_menusテーブル
CREATE INDEX idx_treatment_menus_clinic_id ON public.treatment_menus(clinic_id);
CREATE INDEX idx_treatment_menus_category ON public.treatment_menus(category_id);
CREATE INDEX idx_treatment_menus_active ON public.treatment_menus(is_active);
CREATE INDEX idx_treatment_menus_insurance ON public.treatment_menus(is_insurance_applicable);
CREATE INDEX idx_treatment_menus_price ON public.treatment_menus(price);

-- menu_categoriesテーブル
CREATE INDEX idx_menu_categories_active ON public.menu_categories(is_active);
CREATE INDEX idx_menu_categories_order ON public.menu_categories(display_order);

-- payment_methodsテーブル
CREATE INDEX idx_payment_methods_clinic_id ON public.payment_methods(clinic_id);
CREATE INDEX idx_payment_methods_type ON public.payment_methods(type);
CREATE INDEX idx_payment_methods_active ON public.payment_methods(is_active);
CREATE INDEX idx_payment_methods_default ON public.payment_methods(is_default);

-- insurance_typesテーブル
CREATE INDEX idx_insurance_types_type ON public.insurance_types(type);
CREATE INDEX idx_insurance_types_active ON public.insurance_types(is_active);

-- rolesテーブル
CREATE INDEX idx_roles_level ON public.roles(level);
CREATE INDEX idx_roles_active ON public.roles(is_active);
CREATE INDEX idx_roles_system ON public.roles(is_system_role);

-- permissionsテーブル
CREATE INDEX idx_permissions_resource ON public.permissions(resource);
CREATE INDEX idx_permissions_action ON public.permissions(action);
CREATE INDEX idx_permissions_dangerous ON public.permissions(is_dangerous);

-- patient_typesテーブル
CREATE INDEX idx_patient_types_clinic_id ON public.patient_types(clinic_id);
CREATE INDEX idx_patient_types_active ON public.patient_types(is_active);

-- system_settingsテーブル
CREATE INDEX idx_system_settings_clinic_id ON public.system_settings(clinic_id);
CREATE INDEX idx_system_settings_key ON public.system_settings(key);
CREATE INDEX idx_system_settings_public ON public.system_settings(is_public);

-- ================================================================
-- コメント追加
-- ================================================================

COMMENT ON TABLE public.treatment_menus IS '施術メニューのマスターデータ';
COMMENT ON TABLE public.menu_categories IS '施術メニューのカテゴリ分類';
COMMENT ON TABLE public.payment_methods IS '支払い方法のマスターデータ';
COMMENT ON TABLE public.insurance_types IS '保険種別のマスターデータ';
COMMENT ON TABLE public.roles IS 'ユーザーの権限ロール定義';
COMMENT ON TABLE public.permissions IS 'システム内の個別権限定義';
COMMENT ON TABLE public.role_permissions IS 'ロールと権限の関連付け';
COMMENT ON TABLE public.patient_types IS '患者分類のマスターデータ';
COMMENT ON TABLE public.system_settings IS 'システム設定値の管理';

COMMENT ON COLUMN public.treatment_menus.insurance_points IS '保険診療時の点数';
COMMENT ON COLUMN public.payment_methods.processing_fee_rate IS '決済手数料率（小数）';
COMMENT ON COLUMN public.insurance_types.point_value IS '保険点数の1点あたり単価（円）';
COMMENT ON COLUMN public.roles.level IS '権限レベル（数値が大きいほど強い権限）';