-- ================================================================
-- Migration: staff_invites RLS強化 + MFA関数権限最小化
-- ================================================================
-- 仕様書: docs/migration_spec_staff_invites_role_fix_v1.0.md (v1.3)
-- テスト: supabase/tests/20260222000100_staff_invites_rls_mfa_test.sql
-- DoD: DOD-04, DOD-08, DOD-10
-- 優先度: Critical（初回ユーザー登録/予約UI修正の前提）
--
-- 修正内容:
--   1. staff_invites.staff_invites_role_check を正規形で再定義（冪等）
--   2. clinic_manager 残存データを clinic_admin へ移行（ドリフト対策）
--   3. staff_invites_creator_insert/update/delete にロール制約を追加
--      （created_by 一致のみでは防げない権限過剰を抑制）
--   4. encrypt_mfa_secret / decrypt_mfa_secret の EXECUTE を
--      authenticated から service_role 限定へ変更
--
-- 前提（既修正済み・再実装不要）:
--   - staff_invites_role_check の clinic_admin 対応
--     → 20260110000300_fix_rls_clinic_manager_roles.sql
--   - staff_invites_clinic_admin_select の clinic_manager 参照解消
--     → 20260126000100_rls_hardening_profiles_legacy_tables.sql
-- ================================================================

BEGIN;

-- ================================================================
-- Step 1: 既存データ健全性確認（未知ロール検出）
-- ================================================================
-- clinic_manager はドリフト環境を考慮して一時許可（Step 3 で移行）
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT count(*)
    INTO invalid_count
    FROM public.staff_invites
    WHERE role NOT IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager', 'clinic_manager');

    IF invalid_count > 0 THEN
        RAISE EXCEPTION
            'staff_invites に未知ロールが % 件あります。手動確認が必要です。',
            invalid_count;
    END IF;
END $$;

-- ================================================================
-- Step 2: CHECK制約を一旦削除
-- ================================================================
-- 重要: 旧制約が clinic_admin を許可しない環境でも安全に移行できるよう、
--       role 更新より前に DROP する。
ALTER TABLE public.staff_invites
    DROP CONSTRAINT IF EXISTS staff_invites_role_check;

-- ================================================================
-- Step 3: clinic_manager -> clinic_admin 移行（ドリフト環境向け）
-- ================================================================
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    UPDATE public.staff_invites
    SET role = 'clinic_admin'
    WHERE role = 'clinic_manager';

    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    IF migrated_count > 0 THEN
        RAISE WARNING
            'staff_invites: clinic_manager -> clinic_admin を % 件移行しました。',
            migrated_count;
    END IF;
END $$;

-- ================================================================
-- Step 4: CHECK制約を正規形で再作成（冪等）
-- ================================================================
ALTER TABLE public.staff_invites
    ADD CONSTRAINT staff_invites_role_check
    CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'));

COMMENT ON CONSTRAINT staff_invites_role_check ON public.staff_invites IS
'有効ロール: admin, clinic_admin, manager, therapist, staff。clinic_manager は非推奨（2026-01-09 移行済み）。';

-- ================================================================
-- Step 5: RLS再作成（ポリシー名は既存互換を維持）
-- ================================================================
-- 既存ポリシーを全て削除してから再作成（冪等）
DROP POLICY IF EXISTS "staff_invites_clinic_admin_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_select"      ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_insert"      ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_update"      ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_delete"      ON public.staff_invites;

-- ----------------------------------------------------------------
-- 管理者系SELECT: ロール + テナント境界で制御
-- ----------------------------------------------------------------
CREATE POLICY "staff_invites_clinic_admin_select"
ON public.staff_invites FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 作成者SELECT: 自分の招待のみ、テナント境界内
-- ----------------------------------------------------------------
CREATE POLICY "staff_invites_creator_select"
ON public.staff_invites FOR SELECT
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 作成者INSERT: ロール制約追加（therapist/staff からの直接クエリを拒否）
-- ----------------------------------------------------------------
CREATE POLICY "staff_invites_creator_insert"
ON public.staff_invites FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

-- ----------------------------------------------------------------
-- 作成者UPDATE: USING + WITH CHECK 両方でロール制約（二重防衛）
-- ----------------------------------------------------------------
CREATE POLICY "staff_invites_creator_update"
ON public.staff_invites FOR UPDATE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
)
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

-- ----------------------------------------------------------------
-- 作成者DELETE: ロール制約追加
-- ----------------------------------------------------------------
CREATE POLICY "staff_invites_creator_delete"
ON public.staff_invites FOR DELETE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
    AND public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
);

-- ================================================================
-- Step 6: MFA関数の EXECUTE 権限を service_role のみに制限
-- ================================================================
-- ドリフト対策: PUBLIC に残存する権限を先行クリア
REVOKE ALL ON FUNCTION public.encrypt_mfa_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_mfa_secret(TEXT) FROM PUBLIC;

-- authenticated からの EXECUTE を明示的に剥奪
-- （20260218000600 で付与されたものを取り消す）
REVOKE EXECUTE ON FUNCTION public.encrypt_mfa_secret(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_mfa_secret(TEXT) FROM authenticated;

-- service_role のみに EXECUTE を付与
-- （service_role は SUPERUSER ではないため明示 GRANT が必要）
GRANT EXECUTE ON FUNCTION public.encrypt_mfa_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_mfa_secret(TEXT) TO service_role;

COMMENT ON FUNCTION public.encrypt_mfa_secret(TEXT) IS
'MFA秘密鍵暗号化関数（pgp_sym_encrypt）。
SECURITY DEFINER。EXECUTE は service_role 限定。
2026-02-22: authenticated EXECUTE を削除し service_role 限定へ変更。
app.settings.mfa_encryption_key 未設定時は WARNING を出力し平文で返す（開発環境用）。';

COMMENT ON FUNCTION public.decrypt_mfa_secret(TEXT) IS
'MFA秘密鍵復号化関数（pgp_sym_decrypt）。
SECURITY DEFINER。EXECUTE は service_role 限定。
2026-02-22: authenticated EXECUTE を削除し service_role 限定へ変更。
復号化失敗時（平文データ後方互換）はそのまま返す。';

COMMIT;

-- ================================================================
-- Post-Migration 検証SQL（手動実行 / supabase test db で確認）
-- ================================================================
--
-- A) CHECK制約: clinic_manager が含まれていないこと
-- SELECT pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.staff_invites'::regclass
--   AND conname = 'staff_invites_role_check';
-- -- Expected: CHECK ((role = ANY (ARRAY['admin'::text, 'clinic_admin'::text, ...])))
--
-- B) clinic_manager 残存0件
-- SELECT count(*) FROM public.staff_invites WHERE role = 'clinic_manager';
-- -- Expected: 0
--
-- C) RLSポリシー確認（creator_* が get_current_role() を含むこと）
-- SELECT policyname, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'staff_invites'
-- ORDER BY policyname;
--
-- D) MFA関数権限確認
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.role_routine_grants
-- WHERE specific_schema = 'public'
--   AND routine_name IN ('encrypt_mfa_secret', 'decrypt_mfa_secret')
-- ORDER BY routine_name, grantee;
-- -- Expected: service_role の EXECUTE のみ存在
--             authenticated の EXECUTE は存在しない
-- ================================================================
