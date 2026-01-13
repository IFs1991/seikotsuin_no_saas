-- ================================================================
-- security_events テーブル拡張マイグレーション
-- ================================================================
-- 作成日: 2026-01-01
-- 説明: セキュリティイベントの運用機能追加（状態管理・対応記録）
-- 目的: security-monitor運用化のためのカラム追加

-- ================================================================
-- 1. security_events テーブルに運用カラムを追加
-- ================================================================

-- status: イベントの現在の状態
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'new';

-- assigned_to: 担当者
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- resolution_notes: 解決メモ
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- actions_taken: 実行されたアクション
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS actions_taken JSONB DEFAULT '[]'::jsonb;

-- resolved_at: 解決日時
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- updated_at: 更新日時
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ================================================================
-- 2. ステータスのチェック制約
-- ================================================================
ALTER TABLE public.security_events
DROP CONSTRAINT IF EXISTS security_events_status_check;

ALTER TABLE public.security_events
ADD CONSTRAINT security_events_status_check
CHECK (status IN ('new', 'investigating', 'resolved', 'false_positive'));

-- ================================================================
-- 3. インデックス追加
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_security_events_status
ON public.security_events(status);

CREATE INDEX IF NOT EXISTS idx_security_events_assigned_to
ON public.security_events(assigned_to);

CREATE INDEX IF NOT EXISTS idx_security_events_resolved_at
ON public.security_events(resolved_at);

-- ================================================================
-- 4. トリガー：更新日時の自動更新
-- ================================================================
DROP TRIGGER IF EXISTS update_security_events_updated_at ON public.security_events;

CREATE TRIGGER update_security_events_updated_at
    BEFORE UPDATE ON public.security_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- 5. RLSポリシー追加（更新権限）
-- ================================================================
-- 管理者がセキュリティイベントを更新できるポリシー
DROP POLICY IF EXISTS "Clinic admins can update security events" ON public.security_events;

CREATE POLICY "Clinic admins can update security events" ON public.security_events
    FOR UPDATE USING (
        auth.jwt() ->> 'clinic_id' = clinic_id::text AND
        auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin')
    );

-- ================================================================
-- 6. 通知テーブル確認（高重要度イベント用）
-- ================================================================
-- notificationsテーブルがない場合は作成
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'security'
    is_read BOOLEAN NOT NULL DEFAULT false,
    related_entity_type VARCHAR(50), -- 'security_event', 'reservation', etc.
    related_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- notificationsテーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_clinic_id ON public.notifications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

-- notificationsテーブルのRLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
    FOR SELECT USING (
        auth.uid() = user_id OR
        (clinic_id IS NOT NULL AND auth.jwt() ->> 'clinic_id' = clinic_id::text AND
         auth.jwt() ->> 'user_role' IN ('clinic_admin', 'admin'))
    );

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (true);
