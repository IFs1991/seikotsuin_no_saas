-- ================================================================
-- pgTAP Test: staff_invites RLS強化 + MFA関数権限最小化
-- ================================================================
-- 仕様書: docs/migration_spec_staff_invites_role_fix_v1.0.md
-- 対象マイグレーション: 20260222000100_fix_staff_invites_role_mfa_permissions.sql
--
-- 実行方法:
--   supabase test db
--
-- TDD方針（t-wada流）:
--   このテストはマイグレーション前は失敗し（🔴 Red）、
--   マイグレーション適用後に全て通過する（🟢 Green）こと。
-- ================================================================

BEGIN;

SELECT plan(12);

-- ================================================================
-- [1] CHECK制約: clinic_admin を含むこと（正規形）
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.staff_invites'::regclass
          AND conname = 'staff_invites_role_check'
          AND pg_get_constraintdef(oid) LIKE '%clinic_admin%'
    ),
    'staff_invites_role_check: clinic_admin を含むこと'
);

-- ================================================================
-- [2] CHECK制約: clinic_manager を含まないこと
-- ================================================================
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.staff_invites'::regclass
          AND conname = 'staff_invites_role_check'
          AND pg_get_constraintdef(oid) LIKE '%clinic_manager%'
    ),
    'staff_invites_role_check: clinic_manager を含まないこと（非推奨ロール除外）'
);

-- ================================================================
-- [3] データ: clinic_manager ロールの行が0件
-- ================================================================
SELECT is(
    (SELECT count(*)::integer FROM public.staff_invites WHERE role = 'clinic_manager'),
    0,
    'staff_invites: role=clinic_manager の行が0件であること（ドリフトデータ移行済み）'
);

-- ================================================================
-- [4] RLS: staff_invites_clinic_admin_select が get_current_role() を使用
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'staff_invites'
          AND policyname = 'staff_invites_clinic_admin_select'
          AND qual LIKE '%get_current_role%'
    ),
    'staff_invites_clinic_admin_select: get_current_role() を使用すること'
);

-- ================================================================
-- [5] RLS: staff_invites_creator_select が can_access_clinic() を使用
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'staff_invites'
          AND policyname = 'staff_invites_creator_select'
          AND qual LIKE '%can_access_clinic%'
    ),
    'staff_invites_creator_select: can_access_clinic() を使用すること'
);

-- ================================================================
-- [6] RLS: staff_invites_creator_insert が get_current_role() でロール制約を持つ
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'staff_invites'
          AND policyname = 'staff_invites_creator_insert'
          AND with_check LIKE '%get_current_role%'
    ),
    'staff_invites_creator_insert: WITH CHECK に get_current_role() ロール制約を持つこと'
);

-- ================================================================
-- [7] RLS: staff_invites_creator_update が USING/WITH CHECK 両方でロール制約を持つ
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'staff_invites'
          AND policyname = 'staff_invites_creator_update'
          AND qual LIKE '%get_current_role%'
          AND with_check LIKE '%get_current_role%'
    ),
    'staff_invites_creator_update: USING/WITH CHECK 両方に get_current_role() ロール制約を持つこと'
);

-- ================================================================
-- [8] RLS: staff_invites_creator_delete が USING でロール制約を持つ
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'staff_invites'
          AND policyname = 'staff_invites_creator_delete'
          AND qual LIKE '%get_current_role%'
    ),
    'staff_invites_creator_delete: USING に get_current_role() ロール制約を持つこと'
);

-- ================================================================
-- [9] MFA権限: encrypt_mfa_secret の authenticated EXECUTE が存在しない
-- ================================================================
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM information_schema.role_routine_grants
        WHERE specific_schema = 'public'
          AND routine_name = 'encrypt_mfa_secret'
          AND grantee = 'authenticated'
          AND privilege_type = 'EXECUTE'
    ),
    'encrypt_mfa_secret: authenticated に EXECUTE 権限が存在しないこと'
);

-- ================================================================
-- [10] MFA権限: decrypt_mfa_secret の authenticated EXECUTE が存在しない
-- ================================================================
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM information_schema.role_routine_grants
        WHERE specific_schema = 'public'
          AND routine_name = 'decrypt_mfa_secret'
          AND grantee = 'authenticated'
          AND privilege_type = 'EXECUTE'
    ),
    'decrypt_mfa_secret: authenticated に EXECUTE 権限が存在しないこと'
);

-- ================================================================
-- [11] MFA権限: encrypt_mfa_secret の service_role EXECUTE が存在する
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM information_schema.role_routine_grants
        WHERE specific_schema = 'public'
          AND routine_name = 'encrypt_mfa_secret'
          AND grantee = 'service_role'
          AND privilege_type = 'EXECUTE'
    ),
    'encrypt_mfa_secret: service_role に EXECUTE 権限が存在すること'
);

-- ================================================================
-- [12] MFA権限: decrypt_mfa_secret の service_role EXECUTE が存在する
-- ================================================================
SELECT ok(
    EXISTS (
        SELECT 1
        FROM information_schema.role_routine_grants
        WHERE specific_schema = 'public'
          AND routine_name = 'decrypt_mfa_secret'
          AND grantee = 'service_role'
          AND privilege_type = 'EXECUTE'
    ),
    'decrypt_mfa_secret: service_role に EXECUTE 権限が存在すること'
);

SELECT * FROM finish();
ROLLBACK;

-- ================================================================
-- TODOリスト（TDD残タスク）
-- ================================================================
-- [x] Test 1:  CHECK制約が clinic_admin を含む
-- [x] Test 2:  CHECK制約が clinic_manager を含まない
-- [x] Test 3:  clinic_manager データが0件
-- [x] Test 4:  staff_invites_clinic_admin_select が get_current_role() を使用
-- [x] Test 5:  staff_invites_creator_select が can_access_clinic() を使用
-- [x] Test 6:  staff_invites_creator_insert に get_current_role() ロール制約
-- [x] Test 7:  staff_invites_creator_update に get_current_role() ロール制約（USING+WITH CHECK）
-- [x] Test 8:  staff_invites_creator_delete に get_current_role() ロール制約
-- [x] Test 9:  encrypt_mfa_secret: authenticated EXECUTE なし
-- [x] Test 10: decrypt_mfa_secret: authenticated EXECUTE なし
-- [x] Test 11: encrypt_mfa_secret: service_role EXECUTE あり
-- [x] Test 12: decrypt_mfa_secret: service_role EXECUTE あり
-- ================================================================
