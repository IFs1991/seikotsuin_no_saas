-- =====================================================
-- Migration: Rename daily_ai_comments to ai_comments
-- Purpose: Consolidate AI comments table naming
-- Date: 2024-12-24
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: 既存の ai_comments テーブルがあれば削除
-- Note: ai_comments は canonical として作成されたが API では使用されていない
-- =====================================================

DROP TABLE IF EXISTS public.ai_comments CASCADE;

-- =====================================================
-- Step 2: daily_ai_comments を ai_comments にリネーム
-- =====================================================

ALTER TABLE IF EXISTS public.daily_ai_comments RENAME TO ai_comments;

-- =====================================================
-- Step 3: インデックスのリネーム（存在する場合）
-- =====================================================

-- 既存インデックスを削除して再作成（リネームより確実）
DROP INDEX IF EXISTS idx_daily_ai_comments_clinic_date;
DROP INDEX IF EXISTS daily_ai_comments_clinic_id_comment_date_key;

-- 新しいインデックス作成
CREATE INDEX IF NOT EXISTS idx_ai_comments_clinic_date ON public.ai_comments(clinic_id, comment_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_comments_clinic_date_unique ON public.ai_comments(clinic_id, comment_date);

-- =====================================================
-- Step 4: 制約のリネーム（存在する場合）
-- =====================================================

-- ユニーク制約を再作成
ALTER TABLE public.ai_comments DROP CONSTRAINT IF EXISTS daily_ai_comments_clinic_id_comment_date_key;
ALTER TABLE public.ai_comments ADD CONSTRAINT ai_comments_clinic_id_comment_date_key UNIQUE (clinic_id, comment_date);

-- =====================================================
-- Step 5: RLSポリシーの更新（必要に応じて）
-- =====================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS daily_ai_comments_select ON public.ai_comments;
DROP POLICY IF EXISTS daily_ai_comments_insert ON public.ai_comments;
DROP POLICY IF EXISTS daily_ai_comments_update ON public.ai_comments;

-- RLS有効化
ALTER TABLE public.ai_comments ENABLE ROW LEVEL SECURITY;

-- 新しいポリシー作成
CREATE POLICY ai_comments_select ON public.ai_comments
    FOR SELECT
    USING (
        auth.uid() IN (
            SELECT p.user_id FROM public.profiles p
            WHERE p.clinic_id = ai_comments.clinic_id
        )
    );

CREATE POLICY ai_comments_insert ON public.ai_comments
    FOR INSERT
    WITH CHECK (
        auth.uid() IN (
            SELECT p.user_id FROM public.profiles p
            WHERE p.clinic_id = ai_comments.clinic_id
            AND p.role IN ('admin', 'manager')
        )
    );

CREATE POLICY ai_comments_update ON public.ai_comments
    FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT p.user_id FROM public.profiles p
            WHERE p.clinic_id = ai_comments.clinic_id
            AND p.role IN ('admin', 'manager')
        )
    );

-- =====================================================
-- Step 6: コメント追加
-- =====================================================

COMMENT ON TABLE public.ai_comments IS 'AI生成の日次コメント（daily_ai_commentsから統合）';

COMMIT;
