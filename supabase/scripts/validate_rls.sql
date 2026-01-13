-- ================================================================
-- RLS検証スクリプト (validate_rls.sql)
-- ================================================================
-- 作成日: 2025-12-24
-- 目的: ポリシー/関数/インデックス/監査の健全性確認
-- 参照: tenant_hq_clinic_plan_v1.yml (test_plan.validate_sql)
--
-- 使用方法:
--   psql -d your_database -f validate_rls.sql
--   または Supabase SQL Editor で実行
-- ================================================================

-- ================================================================
-- 1. RLSが有効化されているテーブルの確認
-- ================================================================

DO $$
DECLARE
    v_result RECORD;
    v_errors TEXT[] := '{}';
    v_warnings TEXT[] := '{}';
BEGIN
    RAISE NOTICE '=== RLS検証開始 ===';
    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.1 必須テーブルのRLS有効化確認
    -- -----------------------------------------------------------------
    RAISE NOTICE '1. RLS有効化確認';

    FOR v_result IN
        SELECT
            schemaname,
            tablename,
            rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'clinics',
              'user_permissions',
              'customers',
              'menus',
              'resources',
              'reservations',
              'blocks',
              'reservation_history',
              'patients',
              'visits',
              'revenues',
              'staff',
              'profiles'
          )
        ORDER BY tablename
    LOOP
        IF v_result.rowsecurity THEN
            RAISE NOTICE '  [OK] %.% - RLS有効', v_result.schemaname, v_result.tablename;
        ELSE
            RAISE NOTICE '  [NG] %.% - RLS無効', v_result.schemaname, v_result.tablename;
            v_errors := array_append(v_errors, format('RLS無効: %s.%s', v_result.schemaname, v_result.tablename));
        END IF;
    END LOOP;

    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.2 RLSポリシーの存在確認
    -- -----------------------------------------------------------------
    RAISE NOTICE '2. RLSポリシー確認';

    -- clinics テーブルのポリシー
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'clinics_admin_select') THEN
        RAISE NOTICE '  [OK] clinics_admin_select';
    ELSE
        RAISE NOTICE '  [NG] clinics_admin_select が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: clinics_admin_select');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'clinics_own_select') THEN
        RAISE NOTICE '  [OK] clinics_own_select';
    ELSE
        RAISE NOTICE '  [NG] clinics_own_select が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: clinics_own_select');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'clinics_admin_insert') THEN
        RAISE NOTICE '  [OK] clinics_admin_insert';
    ELSE
        RAISE NOTICE '  [NG] clinics_admin_insert が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: clinics_admin_insert');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'clinics_admin_update') THEN
        RAISE NOTICE '  [OK] clinics_admin_update';
    ELSE
        RAISE NOTICE '  [NG] clinics_admin_update が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: clinics_admin_update');
    END IF;

    -- user_permissions テーブルのポリシー
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND policyname = 'user_permissions_admin_manage') THEN
        RAISE NOTICE '  [OK] user_permissions_admin_manage';
    ELSE
        RAISE NOTICE '  [NG] user_permissions_admin_manage が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: user_permissions_admin_manage');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND policyname = 'user_permissions_self_select') THEN
        RAISE NOTICE '  [OK] user_permissions_self_select';
    ELSE
        RAISE NOTICE '  [NG] user_permissions_self_select が見つかりません';
        v_errors := array_append(v_errors, 'ポリシー欠落: user_permissions_self_select');
    END IF;

    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.3 認証ヘルパー関数の存在確認
    -- -----------------------------------------------------------------
    RAISE NOTICE '3. 認証ヘルパー関数確認';

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_current_role' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        RAISE NOTICE '  [OK] auth.get_current_role()';
    ELSE
        RAISE NOTICE '  [NG] auth.get_current_role() が見つかりません';
        v_errors := array_append(v_errors, '関数欠落: auth.get_current_role()');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_current_clinic_id' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        RAISE NOTICE '  [OK] auth.get_current_clinic_id()';
    ELSE
        RAISE NOTICE '  [NG] auth.get_current_clinic_id() が見つかりません';
        v_errors := array_append(v_errors, '関数欠落: auth.get_current_clinic_id()');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        RAISE NOTICE '  [OK] auth.is_admin()';
    ELSE
        RAISE NOTICE '  [NG] auth.is_admin() が見つかりません';
        v_errors := array_append(v_errors, '関数欠落: auth.is_admin()');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'belongs_to_clinic' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        RAISE NOTICE '  [OK] auth.belongs_to_clinic()';
    ELSE
        RAISE NOTICE '  [NG] auth.belongs_to_clinic() が見つかりません';
        v_errors := array_append(v_errors, '関数欠落: auth.belongs_to_clinic()');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'user_role' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE NOTICE '  [OK] public.user_role()';
    ELSE
        RAISE NOTICE '  [NG] public.user_role() が見つかりません';
        v_errors := array_append(v_errors, '関数欠落: public.user_role()');
    END IF;

    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.4 インデックスの存在確認
    -- -----------------------------------------------------------------
    RAISE NOTICE '4. インデックス確認';

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clinics_is_active') THEN
        RAISE NOTICE '  [OK] idx_clinics_is_active';
    ELSE
        RAISE NOTICE '  [NG] idx_clinics_is_active が見つかりません';
        v_errors := array_append(v_errors, 'インデックス欠落: idx_clinics_is_active');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_permissions_staff_id') THEN
        RAISE NOTICE '  [OK] idx_user_permissions_staff_id';
    ELSE
        RAISE NOTICE '  [NG] idx_user_permissions_staff_id が見つかりません';
        v_errors := array_append(v_errors, 'インデックス欠落: idx_user_permissions_staff_id');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_permissions_clinic_id') THEN
        RAISE NOTICE '  [OK] idx_user_permissions_clinic_id';
    ELSE
        RAISE NOTICE '  [NG] idx_user_permissions_clinic_id が見つかりません';
        v_errors := array_append(v_errors, 'インデックス欠落: idx_user_permissions_clinic_id');
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_permissions_role') THEN
        RAISE NOTICE '  [OK] idx_user_permissions_role';
    ELSE
        RAISE NOTICE '  [NG] idx_user_permissions_role が見つかりません';
        v_errors := array_append(v_errors, 'インデックス欠落: idx_user_permissions_role');
    END IF;

    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.5 監査ログテーブルの確認
    -- -----------------------------------------------------------------
    RAISE NOTICE '5. 監査ログテーブル確認';

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
        RAISE NOTICE '  [OK] audit_logs テーブル存在';

        -- 必須カラムの確認
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'event_type') THEN
            RAISE NOTICE '  [OK] audit_logs.event_type カラム存在';
        ELSE
            RAISE NOTICE '  [NG] audit_logs.event_type カラムが見つかりません';
            v_errors := array_append(v_errors, 'カラム欠落: audit_logs.event_type');
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'user_id') THEN
            RAISE NOTICE '  [OK] audit_logs.user_id カラム存在';
        ELSE
            RAISE NOTICE '  [NG] audit_logs.user_id カラムが見つかりません';
            v_errors := array_append(v_errors, 'カラム欠落: audit_logs.user_id');
        END IF;
    ELSE
        RAISE NOTICE '  [NG] audit_logs テーブルが見つかりません';
        v_errors := array_append(v_errors, 'テーブル欠落: audit_logs');
    END IF;

    RAISE NOTICE '';

    -- -----------------------------------------------------------------
    -- 1.6 結果サマリー
    -- -----------------------------------------------------------------
    RAISE NOTICE '=== 検証結果サマリー ===';

    IF array_length(v_errors, 1) IS NULL THEN
        RAISE NOTICE 'ステータス: OK - すべての検証に合格しました';
    ELSE
        RAISE NOTICE 'ステータス: NG - % 件のエラーがあります', array_length(v_errors, 1);
        RAISE NOTICE '';
        RAISE NOTICE 'エラー一覧:';
        FOR i IN 1..array_length(v_errors, 1) LOOP
            RAISE NOTICE '  - %', v_errors[i];
        END LOOP;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== RLS検証完了 ===';
END $$;

-- ================================================================
-- 2. ポリシー詳細レポート
-- ================================================================

SELECT
    schemaname AS schema,
    tablename AS table_name,
    policyname AS policy_name,
    permissive,
    roles,
    cmd AS operation,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clinics', 'user_permissions')
ORDER BY tablename, policyname;

-- ================================================================
-- 3. インデックス詳細レポート
-- ================================================================

SELECT
    schemaname AS schema,
    tablename AS table_name,
    indexname AS index_name,
    indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('clinics', 'user_permissions')
ORDER BY tablename, indexname;
