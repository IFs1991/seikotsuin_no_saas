-- ================================================================
-- 整骨院管理SaaS - システム管理テーブル定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: システム運用・管理のためのテーブル（監査ログ、通知、セッション等）

-- ================================================================
-- 1. 監査ログテーブル (audit_logs)
-- ================================================================
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    session_id TEXT, -- セッションID
    ip_address INET, -- IPアドレス
    user_agent TEXT, -- ユーザーエージェント
    
    -- 操作情報
    action VARCHAR(100) NOT NULL, -- 'CREATE_PATIENT', 'UPDATE_REVENUE', 'DELETE_STAFF'
    resource_type VARCHAR(50) NOT NULL, -- 'patients', 'revenues', 'staff'
    resource_id UUID, -- 対象リソースのID
    
    -- 変更内容
    old_values JSONB, -- 変更前の値
    new_values JSONB, -- 変更後の値
    changes JSONB, -- 変更差分
    
    -- メタデータ
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT, -- エラーが発生した場合のメッセージ
    execution_time_ms INTEGER, -- 実行時間（ミリ秒）
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    category VARCHAR(50), -- 'security', 'data_modification', 'system_operation'
    
    -- 関連情報
    correlation_id UUID, -- 関連する操作のグループID
    parent_log_id UUID REFERENCES public.audit_logs(id), -- 親ログ（トランザクション）
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 2. 通知テーブル (notifications)
-- ================================================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    
    -- 通知内容
    type VARCHAR(50) NOT NULL, -- 'appointment_reminder', 'payment_due', 'system_alert', 'marketing'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    html_message TEXT, -- HTML形式のメッセージ
    
    -- 通知設定
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    channels TEXT[] DEFAULT ARRAY['in_app'], -- 'in_app', 'email', 'sms', 'push'
    delivery_method VARCHAR(20) DEFAULT 'immediate', -- 'immediate', 'scheduled', 'batch'
    scheduled_at TIMESTAMPTZ,
    
    -- 関連データ
    related_resource_type VARCHAR(50), -- 関連するリソースタイプ
    related_resource_id UUID, -- 関連するリソースID
    action_url TEXT, -- アクション用URL
    action_button_text VARCHAR(100), -- アクションボタンのテキスト
    
    -- 状態管理
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'dismissed', 'failed')),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    
    -- 送信結果
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    expires_at TIMESTAMPTZ, -- 通知の有効期限
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 3. セッション管理テーブル (user_sessions)
-- ================================================================
CREATE TABLE public.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    
    -- セッション情報
    session_token TEXT NOT NULL UNIQUE,
    refresh_token TEXT,
    device_id TEXT,
    device_name VARCHAR(255),
    device_type VARCHAR(50), -- 'web', 'mobile', 'tablet', 'desktop'
    
    -- 接続情報
    ip_address INET,
    user_agent TEXT,
    browser VARCHAR(100),
    os VARCHAR(100),
    location_country VARCHAR(2),
    location_city VARCHAR(100),
    
    -- 状態管理
    is_active BOOLEAN DEFAULT true,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- セキュリティ
    is_suspicious BOOLEAN DEFAULT false,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 4. システムイベントテーブル (system_events)
-- ================================================================
CREATE TABLE public.system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL, -- 'user_login', 'backup_completed', 'payment_processed'
    event_category VARCHAR(50) NOT NULL, -- 'security', 'system', 'business', 'maintenance'
    
    -- イベント詳細
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    
    -- 関連データ
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    related_resource_type VARCHAR(50),
    related_resource_id UUID,
    
    -- メタデータ
    event_data JSONB, -- イベント固有のデータ
    source VARCHAR(100), -- イベントの発生源
    correlation_id UUID, -- 関連するイベントのグループID
    
    -- 処理状況
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'investigating', 'resolved', 'ignored')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 5. ファイル管理テーブル (file_attachments)
-- ================================================================
CREATE TABLE public.file_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    
    -- ファイル情報
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_hash VARCHAR(64), -- SHA-256ハッシュ
    
    -- 関連データ
    related_resource_type VARCHAR(50), -- 'patients', 'treatments', 'insurance_cards'
    related_resource_id UUID,
    attachment_type VARCHAR(50), -- 'insurance_card', 'consent_form', 'xray', 'report'
    
    -- メタデータ
    title VARCHAR(255),
    description TEXT,
    tags TEXT[],
    is_public BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    
    -- セキュリティ
    encryption_status VARCHAR(20) DEFAULT 'none', -- 'none', 'client_side', 'server_side'
    access_level VARCHAR(20) DEFAULT 'private', -- 'public', 'clinic', 'staff', 'private'
    
    -- Supabase Storage関連
    bucket_name VARCHAR(100) DEFAULT 'attachments',
    storage_path TEXT,
    
    expires_at TIMESTAMPTZ, -- 自動削除日時
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 6. API使用量テーブル (api_usage_logs)
-- ================================================================
CREATE TABLE public.api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- リクエスト情報
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_id UUID,
    ip_address INET,
    user_agent TEXT,
    
    -- レスポンス情報
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    response_size_bytes INTEGER,
    
    -- 使用量情報
    api_key_id UUID,
    rate_limit_key VARCHAR(255),
    request_count INTEGER DEFAULT 1,
    
    -- エラー情報
    error_type VARCHAR(100),
    error_message TEXT,
    stack_trace TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 7. 一時データテーブル (temporary_data)
-- ================================================================
CREATE TABLE public.temporary_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    data_type VARCHAR(50), -- 'csv_import', 'export_cache', 'session_data'
    
    -- メタデータ
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT,
    
    -- 有効期限
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    auto_cleanup BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- インデックス作成
-- ================================================================

-- audit_logsテーブル
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_clinic_id ON public.audit_logs(clinic_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON public.audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_severity ON public.audit_logs(severity);
CREATE INDEX idx_audit_logs_correlation_id ON public.audit_logs(correlation_id);

-- notificationsテーブル
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_clinic_id ON public.notifications(clinic_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);
CREATE INDEX idx_notifications_type ON public.notifications(type);
CREATE INDEX idx_notifications_scheduled_at ON public.notifications(scheduled_at);
CREATE INDEX idx_notifications_expires_at ON public.notifications(expires_at);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- user_sessionsテーブル
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(is_active, expires_at);
CREATE INDEX idx_user_sessions_activity ON public.user_sessions(last_activity_at);
CREATE INDEX idx_user_sessions_suspicious ON public.user_sessions(is_suspicious);

-- system_eventsテーブル
CREATE INDEX idx_system_events_type ON public.system_events(event_type);
CREATE INDEX idx_system_events_category ON public.system_events(event_category);
CREATE INDEX idx_system_events_severity ON public.system_events(severity);
CREATE INDEX idx_system_events_status ON public.system_events(status);
CREATE INDEX idx_system_events_clinic_id ON public.system_events(clinic_id);
CREATE INDEX idx_system_events_created_at ON public.system_events(created_at);

-- file_attachmentsテーブル
CREATE INDEX idx_file_attachments_clinic_id ON public.file_attachments(clinic_id);
CREATE INDEX idx_file_attachments_uploaded_by ON public.file_attachments(uploaded_by);
CREATE INDEX idx_file_attachments_resource ON public.file_attachments(related_resource_type, related_resource_id);
CREATE INDEX idx_file_attachments_type ON public.file_attachments(attachment_type);
CREATE INDEX idx_file_attachments_archived ON public.file_attachments(is_archived);

-- api_usage_logsテーブル
CREATE INDEX idx_api_usage_logs_clinic_id ON public.api_usage_logs(clinic_id);
CREATE INDEX idx_api_usage_logs_user_id ON public.api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_endpoint ON public.api_usage_logs(endpoint);
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_status_code ON public.api_usage_logs(status_code);

-- temporary_dataテーブル
CREATE INDEX idx_temporary_data_key ON public.temporary_data(key);
CREATE INDEX idx_temporary_data_expires_at ON public.temporary_data(expires_at);
CREATE INDEX idx_temporary_data_clinic_user ON public.temporary_data(clinic_id, user_id);

-- ================================================================
-- 自動クリーンアップ関数
-- ================================================================

-- 期限切れの一時データを削除する関数
CREATE OR REPLACE FUNCTION cleanup_expired_temporary_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.temporary_data 
    WHERE expires_at < NOW() AND auto_cleanup = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- コメント追加
-- ================================================================

COMMENT ON TABLE public.audit_logs IS 'システム操作の監査ログ';
COMMENT ON TABLE public.notifications IS 'ユーザー向け通知の管理';
COMMENT ON TABLE public.user_sessions IS 'ユーザーセッションの管理';
COMMENT ON TABLE public.system_events IS 'システムイベントの記録';
COMMENT ON TABLE public.file_attachments IS 'ファイル添付の管理';
COMMENT ON TABLE public.api_usage_logs IS 'API使用量の記録';
COMMENT ON TABLE public.temporary_data IS '一時的なデータの保存';

COMMENT ON COLUMN public.audit_logs.correlation_id IS '関連する操作のグループ識別子';
COMMENT ON COLUMN public.notifications.channels IS '通知配信チャネル（配列）';
COMMENT ON COLUMN public.file_attachments.file_hash IS 'ファイルのSHA-256ハッシュ値';
COMMENT ON FUNCTION cleanup_expired_temporary_data() IS '期限切れ一時データの自動削除';

-- ================================================================
-- 定期実行スケジュール（pg_cronエクステンション使用時）
-- ================================================================

-- 一時データのクリーンアップを1時間ごとに実行
-- SELECT cron.schedule('cleanup-temp-data', '0 * * * *', 'SELECT cleanup_expired_temporary_data();');