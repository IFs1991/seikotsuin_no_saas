-- =====================================================
-- Migration: Create improvement_backlog table
-- Purpose: Create missing table used by /api/beta/backlog
-- Date: 2024-12-24
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.improvement_backlog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本情報
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,

    -- 分類
    category VARCHAR(50) NOT NULL CHECK (category IN ('feature', 'enhancement', 'bug_fix', 'technical_debt', 'documentation')),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    estimated_effort VARCHAR(10) NOT NULL CHECK (estimated_effort IN ('xs', 's', 'm', 'l', 'xl')),
    business_value INTEGER NOT NULL CHECK (business_value >= 1 AND business_value <= 10),

    -- ステータス
    status VARCHAR(20) NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'planned', 'in_progress', 'completed', 'cancelled')),

    -- 関連情報
    related_feedback_ids UUID[],
    affected_clinics UUID[],
    milestone TEXT,
    assigned_to UUID,

    -- タイムスタンプ
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_status ON public.improvement_backlog(status);
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_priority ON public.improvement_backlog(priority);
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_category ON public.improvement_backlog(category);
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_milestone ON public.improvement_backlog(milestone);
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_created_at ON public.improvement_backlog(created_at DESC);

-- RLS有効化
ALTER TABLE public.improvement_backlog ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 管理者のみ全操作可能
DROP POLICY IF EXISTS improvement_backlog_admin_all ON public.improvement_backlog;
CREATE POLICY improvement_backlog_admin_all ON public.improvement_backlog
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- RLSポリシー: 認証ユーザーは閲覧可能
DROP POLICY IF EXISTS improvement_backlog_authenticated_select ON public.improvement_backlog;
CREATE POLICY improvement_backlog_authenticated_select ON public.improvement_backlog
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- updated_atトリガー
DROP TRIGGER IF EXISTS update_improvement_backlog_updated_at ON public.improvement_backlog;
CREATE TRIGGER update_improvement_backlog_updated_at
    BEFORE UPDATE ON public.improvement_backlog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.improvement_backlog IS '改善バックログ（ベータ運用）';
COMMENT ON COLUMN public.improvement_backlog.category IS '分類: feature, enhancement, bug_fix, technical_debt, documentation';
COMMENT ON COLUMN public.improvement_backlog.priority IS '優先度: critical, high, medium, low';
COMMENT ON COLUMN public.improvement_backlog.estimated_effort IS '見積工数: xs, s, m, l, xl';
COMMENT ON COLUMN public.improvement_backlog.business_value IS 'ビジネス価値 (1-10)';
COMMENT ON COLUMN public.improvement_backlog.status IS 'ステータス: backlog, planned, in_progress, completed, cancelled';

COMMIT;
