-- ================================================================
-- 整骨院管理SaaS - セッション管理テーブル定義
-- ================================================================
-- 作成日: 2025-08-25
-- 説明: Phase 3A セッション管理強化のためのテーブル定義
-- 目的: セッションタイムアウト、複数デバイス制御、セキュリティ監視

-- ================================================================
-- 1. ユーザーセッション管理テーブル (user_sessions)
-- ================================================================
CREATE TABLE public.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- ユーザー・テナント関連
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    
    -- セッション識別情報
    session_token VARCHAR(512) NOT NULL UNIQUE,
    refresh_token_id VARCHAR(255), -- Supabaseのリフレッシュトークンと紐付け
    
    -- デバイス・接続情報
    device_info JSONB NOT NULL DEFAULT '{}', -- {"device": "desktop", "os": "Windows", "browser": "Chrome"}
    ip_address INET,
    user_agent TEXT,
    geolocation JSONB, -- {"country": "JP", "region": "Tokyo", "city": "Shibuya"}
    
    -- セッション状態管理
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    idle_timeout_at TIMESTAMPTZ, -- アイドルタイムアウト時刻
    absolute_timeout_at TIMESTAMPTZ, -- 絶対タイムアウト時刻
    
    -- セッション制御
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id),
    revoked_reason VARCHAR(100), -- 'timeout', 'manual_logout', 'security_violation', 'max_sessions_exceeded'
    
    -- セッション設定
    max_idle_minutes INTEGER NOT NULL DEFAULT 30,
    max_session_hours INTEGER NOT NULL DEFAULT 8,
    remember_device BOOLEAN NOT NULL DEFAULT false,
    
    -- メタデータ
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 2. セキュリティイベント記録テーブル (security_events)
-- ================================================================
CREATE TABLE public.security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- ユーザー・テナント関連
    user_id UUID REFERENCES auth.users(id),
    clinic_id UUID REFERENCES public.clinics(id),
    session_id UUID REFERENCES public.user_sessions(id),
    
    -- イベント分類
    event_type VARCHAR(100) NOT NULL, -- 'session_created', 'session_expired', 'suspicious_login', etc.
    event_category VARCHAR(50) NOT NULL, -- 'authentication', 'authorization', 'session_management', 'security_violation'
    severity_level VARCHAR(20) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
    
    -- イベント詳細
    event_description TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    
    -- 接続情報
    ip_address INET,
    user_agent TEXT,
    geolocation JSONB,
    
    -- システム情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_component VARCHAR(100), -- 'middleware', 'session_manager', 'auth_system'
    correlation_id UUID -- 関連イベントのグループ化用
);

-- ================================================================
-- 3. セッション設定テーブル (session_policies)
-- ================================================================
CREATE TABLE public.session_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 適用範囲
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    role VARCHAR(50), -- 特定ロールに適用する場合（NULLの場合は全ロール対象）
    
    -- セッション設定
    max_concurrent_sessions INTEGER NOT NULL DEFAULT 3,
    max_idle_minutes INTEGER NOT NULL DEFAULT 30,
    max_session_hours INTEGER NOT NULL DEFAULT 8,
    
    -- セキュリティ設定
    require_ip_whitelist BOOLEAN NOT NULL DEFAULT false,
    allowed_ip_ranges INET[], -- IP範囲の配列
    block_concurrent_different_ips BOOLEAN NOT NULL DEFAULT false,
    
    -- デバイス制御
    max_devices_per_user INTEGER NOT NULL DEFAULT 5,
    remember_device_days INTEGER NOT NULL DEFAULT 30,
    require_device_registration BOOLEAN NOT NULL DEFAULT false,
    
    -- 通知設定
    notify_new_device_login BOOLEAN NOT NULL DEFAULT true,
    notify_suspicious_activity BOOLEAN NOT NULL DEFAULT true,
    
    -- 有効性
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    -- メタデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ================================================================
-- 4. デバイス登録テーブル (registered_devices)
-- ================================================================
CREATE TABLE public.registered_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- ユーザー・テナント関連
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    
    -- デバイス識別情報
    device_fingerprint VARCHAR(512) NOT NULL, -- デバイスフィンガープリント
    device_name VARCHAR(255), -- ユーザー定義のデバイス名
    device_info JSONB NOT NULL DEFAULT '{}',
    
    -- 信頼度・状態
    trust_level VARCHAR(20) NOT NULL DEFAULT 'untrusted', -- 'trusted', 'untrusted', 'blocked'
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_ip_address INET,
    
    -- 自動管理
    auto_trust_after_days INTEGER,
    trusted_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ,
    blocked_reason TEXT,
    
    -- メタデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- インデックス定義
-- ================================================================

-- user_sessions テーブル
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_clinic_id ON public.user_sessions(clinic_id);
CREATE INDEX idx_user_sessions_session_token ON public.user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(user_id, clinic_id) WHERE is_active = true;
CREATE INDEX idx_user_sessions_last_activity ON public.user_sessions(last_activity);
CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at);

-- security_events テーブル
CREATE INDEX idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX idx_security_events_clinic_id ON public.security_events(clinic_id);
CREATE INDEX idx_security_events_type ON public.security_events(event_type, event_category);
CREATE INDEX idx_security_events_created_at ON public.security_events(created_at);
CREATE INDEX idx_security_events_severity ON public.security_events(severity_level, created_at);

-- session_policies テーブル
CREATE INDEX idx_session_policies_clinic_id ON public.session_policies(clinic_id);
CREATE INDEX idx_session_policies_role ON public.session_policies(role);
CREATE INDEX idx_session_policies_active ON public.session_policies(clinic_id, is_active) WHERE is_active = true;

-- registered_devices テーブル  
CREATE INDEX idx_registered_devices_user_id ON public.registered_devices(user_id);
CREATE INDEX idx_registered_devices_clinic_id ON public.registered_devices(clinic_id);
CREATE INDEX idx_registered_devices_fingerprint ON public.registered_devices(device_fingerprint);
CREATE INDEX idx_registered_devices_trust_level ON public.registered_devices(trust_level, user_id);

-- ================================================================
-- トリガー：更新日時の自動更新
-- ================================================================

-- updated_at自動更新関数（既存の場合はスキップ）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 各テーブルにトリガー設定
CREATE TRIGGER update_user_sessions_updated_at 
    BEFORE UPDATE ON public.user_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_policies_updated_at 
    BEFORE UPDATE ON public.session_policies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registered_devices_updated_at 
    BEFORE UPDATE ON public.registered_devices 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- Row Level Security (RLS) ポリシー
-- ================================================================

-- user_sessions テーブルのRLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions" ON public.user_sessions
    FOR SELECT USING (
        auth.uid() = user_id AND 
        auth.jwt() ->> 'clinic_id' = clinic_id::text
    );

CREATE POLICY "Users can insert their own sessions" ON public.user_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND 
        auth.jwt() ->> 'clinic_id' = clinic_id::text
    );

CREATE POLICY "Users can update their own sessions" ON public.user_sessions
    FOR UPDATE USING (
        auth.uid() = user_id AND 
        auth.jwt() ->> 'clinic_id' = clinic_id::text
    );

CREATE POLICY "Clinic admins can view all clinic sessions" ON public.user_sessions
    FOR SELECT USING (
        auth.jwt() ->> 'clinic_id' = clinic_id::text AND
        auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin')
    );

-- security_events テーブルのRLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own security events" ON public.security_events
    FOR SELECT USING (
        auth.uid() = user_id AND 
        (clinic_id IS NULL OR auth.jwt() ->> 'clinic_id' = clinic_id::text)
    );

CREATE POLICY "System can insert security events" ON public.security_events
    FOR INSERT WITH CHECK (true); -- システムコンポーネントからの挿入を許可

CREATE POLICY "Clinic admins can view all clinic security events" ON public.security_events
    FOR SELECT USING (
        auth.jwt() ->> 'clinic_id' = clinic_id::text AND
        auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin')
    );

-- session_policies テーブルのRLS
ALTER TABLE public.session_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic admins can manage session policies" ON public.session_policies
    FOR ALL USING (
        auth.jwt() ->> 'clinic_id' = clinic_id::text AND
        auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin')
    );

-- registered_devices テーブルのRLS
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own devices" ON public.registered_devices
    FOR ALL USING (
        auth.uid() = user_id AND 
        auth.jwt() ->> 'clinic_id' = clinic_id::text
    );

CREATE POLICY "Clinic admins can view all clinic devices" ON public.registered_devices
    FOR SELECT USING (
        auth.jwt() ->> 'clinic_id' = clinic_id::text AND
        auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin')
    );

-- ================================================================
-- デフォルトデータ挿入
-- ================================================================

-- 基本セッションポリシーの挿入（各クリニックに対してデフォルト値を設定）
-- 注意: 実際の運用時は各クリニック作成時に自動挿入される想定