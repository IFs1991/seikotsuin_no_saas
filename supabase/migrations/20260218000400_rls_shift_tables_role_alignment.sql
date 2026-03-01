-- ================================================================
-- Phase 4: Shift Tables RLS - Role Alignment
-- ================================================================
-- 問題: staff_shifts / staff_preferences のRLSに以下の問題:
--   1. 'clinic_manager' ロールが残存（20260109で clinic_admin に移行済み）
--   2. can_access_clinic() を使用していない（独自のサブクエリパターン）
--   3. app_metadata 直参照でフォールバックロジックが不統一
-- 対応: パターンB（get_current_role() + can_access_clinic()）に統一
--       clinic_manager → clinic_admin に修正
-- リスク: 中
-- ロールバック: 各ポリシーDROP + 旧ポリシー再作成
-- ================================================================

BEGIN;

-- ================================================================
-- 1. staff_shifts テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "staff_shifts_select_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_insert_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_update_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_delete_policy" ON public.staff_shifts;

-- SELECT: 全スタッフが自テナントのシフト参照可能
CREATE POLICY "staff_shifts_select_policy"
ON public.staff_shifts FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- INSERT: 管理者・クリニック管理者・マネージャーが自テナントにシフト追加
CREATE POLICY "staff_shifts_insert_policy"
ON public.staff_shifts FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- UPDATE: 管理者・クリニック管理者・マネージャーが自テナントのシフト更新
CREATE POLICY "staff_shifts_update_policy"
ON public.staff_shifts FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- DELETE: 管理者・クリニック管理者・マネージャーが自テナントのシフト削除
CREATE POLICY "staff_shifts_delete_policy"
ON public.staff_shifts FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 2. staff_preferences テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "staff_preferences_select_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_update_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_delete_policy" ON public.staff_preferences;

-- SELECT: 全スタッフが自テナントの希望参照可能
CREATE POLICY "staff_preferences_select_policy"
ON public.staff_preferences FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- INSERT: 全スタッフが自テナントに希望登録可能
CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- UPDATE: 管理者・クリニック管理者・マネージャーが自テナントの希望更新
-- 注意: resources テーブルに user_id カラムが存在しないため、
--       スタッフ本人による直接更新は RLS では実現できない。
--       スタッフ本人の希望更新が必要な場合は Server API 経由で行うこと。
CREATE POLICY "staff_preferences_update_policy"
ON public.staff_preferences FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- DELETE: 管理者・クリニック管理者・マネージャーが自テナントの希望削除
CREATE POLICY "staff_preferences_delete_policy"
ON public.staff_preferences FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

COMMIT;
