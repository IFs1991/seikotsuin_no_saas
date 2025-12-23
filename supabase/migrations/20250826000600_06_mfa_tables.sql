-- MFA（多要素認証）関連テーブル
-- Phase 3B: TOTP認証システム構築

-- MFA設定テーブル
CREATE TABLE IF NOT EXISTS user_mfa_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    clinic_id UUID NOT NULL,
    
    -- TOTP設定
    secret_key TEXT NOT NULL, -- Base32エンコードされた秘密鍵
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- バックアップコード（JSON配列）
    backup_codes JSONB DEFAULT '[]'::jsonb,
    backup_codes_regenerated_at TIMESTAMPTZ,
    
    -- 使用履歴
    setup_completed_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    
    -- 無効化情報
    disabled_at TIMESTAMPTZ,
    disabled_by UUID, -- 無効化実行者のユーザーID
    
    -- メタデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 外部キー制約
    CONSTRAINT fk_mfa_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_mfa_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
    
    -- 一意制約（ユーザーごとに1つのMFA設定）
    UNIQUE(user_id)
);

-- MFAセットアップセッションテーブル（一時的なセットアップ情報）
CREATE TABLE IF NOT EXISTS mfa_setup_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    clinic_id UUID NOT NULL,
    
    -- セットアップ情報
    secret_key TEXT NOT NULL,
    backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- セッション管理
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    
    -- メタデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 外部キー制約
    CONSTRAINT fk_mfa_setup_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_mfa_setup_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
);

-- MFA利用統計テーブル
CREATE TABLE IF NOT EXISTS mfa_usage_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clinic_id UUID NOT NULL,
    
    -- 統計期間
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- 利用統計
    total_users INTEGER NOT NULL DEFAULT 0,
    mfa_enabled_users INTEGER NOT NULL DEFAULT 0,
    totp_attempts INTEGER NOT NULL DEFAULT 0,
    totp_successes INTEGER NOT NULL DEFAULT 0,
    backup_code_uses INTEGER NOT NULL DEFAULT 0,
    
    -- メタデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 外部キー制約
    CONSTRAINT fk_mfa_stats_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
    
    -- 一意制約（クリニック・期間ごと）
    UNIQUE(clinic_id, period_start, period_end)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_mfa_settings_user_id ON user_mfa_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_settings_clinic_id ON user_mfa_settings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_mfa_settings_enabled ON user_mfa_settings(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_mfa_settings_last_used ON user_mfa_settings(last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_setup_user_id ON mfa_setup_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_setup_expires ON mfa_setup_sessions(expires_at) WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_stats_clinic_period ON mfa_usage_stats(clinic_id, period_start, period_end);

-- Row Level Security (RLS) ポリシー

-- MFA設定テーブルのRLS
ALTER TABLE user_mfa_settings ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のMFA設定のみ参照可能
CREATE POLICY "Users can view own MFA settings" ON user_mfa_settings
    FOR SELECT USING (
        auth.uid() = user_id
    );

-- ユーザーは自分のMFA設定のみ更新可能
CREATE POLICY "Users can update own MFA settings" ON user_mfa_settings
    FOR UPDATE USING (
        auth.uid() = user_id
    );

-- ユーザーは自分のMFA設定のみ挿入可能
CREATE POLICY "Users can insert own MFA settings" ON user_mfa_settings
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

-- 管理者はクリニック内のMFA設定を参照可能
CREATE POLICY "Admins can view clinic MFA settings" ON user_mfa_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = user_mfa_settings.clinic_id
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

-- MFAセットアップセッションのRLS
ALTER TABLE mfa_setup_sessions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のセットアップセッションのみアクセス可能
CREATE POLICY "Users can manage own MFA setup sessions" ON mfa_setup_sessions
    FOR ALL USING (
        auth.uid() = user_id
    );

-- MFA利用統計のRLS
ALTER TABLE mfa_usage_stats ENABLE ROW LEVEL SECURITY;

-- 管理者のみクリニックのMFA統計を参照可能
CREATE POLICY "Admins can view MFA usage stats" ON mfa_usage_stats
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = mfa_usage_stats.clinic_id
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

-- トリガー関数: updated_at自動更新
CREATE OR REPLACE FUNCTION update_mfa_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー作成
CREATE TRIGGER update_mfa_settings_updated_at_trigger
    BEFORE UPDATE ON user_mfa_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_settings_updated_at();

-- MFA利用統計集計関数
CREATE OR REPLACE FUNCTION aggregate_mfa_stats(
    p_clinic_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
) RETURNS void AS $$
DECLARE
    v_total_users INTEGER;
    v_mfa_enabled_users INTEGER;
    v_totp_attempts INTEGER;
    v_totp_successes INTEGER;
    v_backup_code_uses INTEGER;
BEGIN
    -- 総ユーザー数
    SELECT COUNT(*) INTO v_total_users
    FROM profiles
    WHERE clinic_id = p_clinic_id
    AND is_active = true;
    
    -- MFA有効ユーザー数
    SELECT COUNT(*) INTO v_mfa_enabled_users
    FROM user_mfa_settings ums
    JOIN profiles p ON ums.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND ums.is_enabled = true;
    
    -- TOTP試行回数
    SELECT COUNT(*) INTO v_totp_attempts
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type IN ('mfa_totp_success', 'mfa_totp_failed')
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- TOTP成功回数
    SELECT COUNT(*) INTO v_totp_successes
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type = 'mfa_totp_success'
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- バックアップコード使用回数
    SELECT COUNT(*) INTO v_backup_code_uses
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type = 'mfa_backup_code_success'
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- 統計データ挿入/更新
    INSERT INTO mfa_usage_stats (
        clinic_id, period_start, period_end,
        total_users, mfa_enabled_users, 
        totp_attempts, totp_successes, backup_code_uses
    ) VALUES (
        p_clinic_id, p_start_date, p_end_date,
        v_total_users, v_mfa_enabled_users,
        v_totp_attempts, v_totp_successes, v_backup_code_uses
    )
    ON CONFLICT (clinic_id, period_start, period_end)
    DO UPDATE SET
        total_users = EXCLUDED.total_users,
        mfa_enabled_users = EXCLUDED.mfa_enabled_users,
        totp_attempts = EXCLUDED.totp_attempts,
        totp_successes = EXCLUDED.totp_successes,
        backup_code_uses = EXCLUDED.backup_code_uses,
        created_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- MFA設定データ暗号化関数（将来拡張用）
CREATE OR REPLACE FUNCTION encrypt_mfa_secret(secret_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- 現在は平文保存（将来的にpg_cryptoで暗号化予定）
    RETURN secret_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- MFA設定データ復号化関数（将来拡張用）
CREATE OR REPLACE FUNCTION decrypt_mfa_secret(encrypted_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- 現在は平文読込（将来的にpg_cryptoで復号化予定）
    RETURN encrypted_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- コメント追加
COMMENT ON TABLE user_mfa_settings IS 'ユーザーMFA設定テーブル - TOTP秘密鍵とバックアップコードを管理';
COMMENT ON TABLE mfa_setup_sessions IS 'MFAセットアップセッションテーブル - セットアップ過程の一時的な情報を保存';
COMMENT ON TABLE mfa_usage_stats IS 'MFA利用統計テーブル - クリニック別の利用状況を集計';

COMMENT ON COLUMN user_mfa_settings.secret_key IS 'TOTP秘密鍵（Base32エンコード）';
COMMENT ON COLUMN user_mfa_settings.backup_codes IS 'バックアップコード配列（JSON形式）';
COMMENT ON COLUMN user_mfa_settings.disabled_by IS '無効化実行者（管理者無効化の場合）';
