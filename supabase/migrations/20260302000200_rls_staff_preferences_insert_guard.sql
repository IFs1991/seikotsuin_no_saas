-- ================================================================
-- Issue 2: staff_preferences INSERT ポリシーを manager 以上に限定
-- ================================================================
-- 問題: 20260218000400 の staff_preferences_insert_policy が
--       therapist/staff にも INSERT を許可していた。
--       resources.user_id が存在しないため、RLS で auth.uid() = staff_id の
--       本人検証ができない。本フェーズでは self-service 登録は実装しない。
-- 対応: INSERT 許可ロールを ('admin', 'clinic_admin', 'manager') のみに縮小。
-- 参照: docs/stabilization/spec-rls-menus-staff-preferences-hardening-v0.2.md
-- DoD: DOD-08
-- ロールバック: 下部参照
-- ================================================================

BEGIN;

-- 旧ポリシー削除
DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;

-- INSERT: admin/clinic_admin/manager のみ許可
-- therapist/staff は本フェーズでは 403。
-- self-service 登録は resources.user_id 導入まで延期。
CREATE POLICY "staff_preferences_insert_policy"
ON public.staff_preferences FOR INSERT
TO authenticated
WITH CHECK (
  public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
  AND public.can_access_clinic(clinic_id)
);

COMMENT ON POLICY "staff_preferences_insert_policy" ON public.staff_preferences IS
'希望シフトの直接 INSERT は admin/clinic_admin/manager のみ許可。therapist/staff は本フェーズでは 403。self-service 登録は resources.user_id 導入後に対応。@spec spec-rls-menus-staff-preferences-hardening-v0.2.md Issue 2';

COMMIT;

-- ================================================================
-- ロールバック手順
-- ================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;
--
-- CREATE POLICY "staff_preferences_insert_policy"
-- ON public.staff_preferences FOR INSERT
-- WITH CHECK (
--   public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
--   AND public.can_access_clinic(clinic_id)
-- );
-- COMMIT;
-- ================================================================
--
-- 確認クエリ:
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'staff_preferences' AND cmd = 'INSERT'
-- ORDER BY policyname;
-- -- Expected: therapist/staff が with_check に含まれない
-- ================================================================
