-- ================================================================
-- Phase 7: clinics テーブル RLS修正
-- ================================================================
-- 問題:
--   1. clinics_own_select が user_permissions サブクエリに依存しており
--      can_access_clinic() を使用していない
--   2. DELETE ポリシーが存在しない（論理削除想定だが明示されていない）
-- 対応:
--   1. clinics_own_select を can_access_clinic(id) に統一
--   2. DELETE ポリシーを admin のみに制限して追加
-- リスク: 中
-- ロールバック: ポリシーDROP + 旧ポリシー再作成
-- ================================================================

BEGIN;

-- ================================================================
-- 1. clinics_own_select の修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "clinics_own_select" ON public.clinics;

-- 所属クリニック参照: can_access_clinic() でスコープ内のクリニックを参照
-- admin は clinics_admin_select（is_admin()）経由でアクセスする。
-- 本ポリシーは非admin（clinic_admin, manager, therapist, staff）が
-- 自身の clinic_scope_ids 内のクリニックにアクセスするためのもの。
CREATE POLICY "clinics_own_select"
ON public.clinics FOR SELECT
USING (
    public.can_access_clinic(id)
);

-- ================================================================
-- 2. DELETE ポリシー追加
-- ================================================================
-- clinics の削除は admin のみに制限
-- 通常はソフトデリート（is_active = false）を使用すべき

DROP POLICY IF EXISTS "clinics_delete_for_admin" ON public.clinics;

CREATE POLICY "clinics_delete_for_admin"
ON public.clinics FOR DELETE
USING (
    public.get_current_role() = 'admin'
);

COMMENT ON POLICY "clinics_delete_for_admin" ON public.clinics IS
'クリニックの物理削除は admin のみ。
通常運用ではソフトデリート（is_active = false への UPDATE）を推奨。';

COMMIT;
