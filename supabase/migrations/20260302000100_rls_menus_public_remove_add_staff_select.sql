-- ================================================================
-- Issue 1: menus_select_public 廃止 + menus_select_for_staff 追加（回帰修正）
-- ================================================================
-- 問題: 20260218000200 で再導入された menus_select_public がテナント境界なし。
--       匿名ユーザーが clinic_id フィルタなしで全テナントのメニューを参照可能。
-- 対応:
--   1. menus_select_public を削除（公開導線は既存の /api/public/menus (service_role) を使用）
--   2. therapist/staff 向けに menus_select_for_staff を新設（テナント境界付き）
-- 参照: docs/stabilization/spec-rls-menus-staff-preferences-hardening-v0.2.md
-- DoD: DOD-08, DOD-09
-- ロールバック: 下部参照
-- ================================================================

BEGIN;

-- 旧ポリシー削除（テナント境界なしの公開ポリシー）
DROP POLICY IF EXISTS "menus_select_public" ON public.menus;

-- 念のため既存の同名ポリシーも削除してから再作成
DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;

-- therapist/staff: 自テナントの公開中メニューのみ参照可
-- manager 以上は既存の menus_select_for_managers を継続使用。
-- 公開導線（匿名）は /api/public/menus (service_role) を使用。
CREATE POLICY "menus_select_for_staff"
ON public.menus FOR SELECT
TO authenticated
USING (
  public.get_current_role() IN ('therapist', 'staff')
  AND public.can_access_clinic(clinic_id)
  AND is_active = true
  AND is_deleted = false
);

COMMENT ON POLICY "menus_select_for_staff" ON public.menus IS
'therapist/staff は自テナントの公開中メニューのみ参照可。manager 以上は既存 menus_select_for_managers を使用。公開導線は /api/public/menus (service_role)。@spec spec-rls-menus-staff-preferences-hardening-v0.2.md Issue 1';

COMMIT;

-- ================================================================
-- ロールバック手順
-- ================================================================
-- BEGIN;
-- CREATE POLICY "menus_select_public"
-- ON public.menus FOR SELECT
-- USING (is_active = true AND is_deleted = false);
--
-- DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;
-- COMMIT;
-- ================================================================
--
-- 確認クエリ:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'menus'
-- ORDER BY policyname;
-- -- Expected: menus_select_public が存在しない
-- -- Expected: menus_select_for_staff が存在し can_access_clinic が含まれる
-- ================================================================
