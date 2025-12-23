-- =====================================================
-- 予約管理システム - マイグレーション実行スクリプト
-- =====================================================
-- 作成日: 2025-11-04
-- 実行順序: このファイルを単独で実行
-- =====================================================

\echo '======================================================'
\echo '予約管理システム - マイグレーション開始'
\echo '======================================================'
\echo ''

-- トランザクション開始
BEGIN;

\echo '1. スキーマ作成中...'
\i reservation_system_schema.sql
\echo '   ✓ スキーマ作成完了'
\echo ''

\echo '2. RLSポリシー設定中...'
\i reservation_system_rls.sql
\echo '   ✓ RLSポリシー設定完了'
\echo ''

\echo '3. 整合性チェック中...'

-- テーブル存在確認
DO $$
DECLARE
    v_table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
        AND table_name IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history');

    IF v_table_count != 6 THEN
        RAISE EXCEPTION 'テーブル作成に失敗しました。期待: 6テーブル、実際: %', v_table_count;
    END IF;

    RAISE NOTICE '   ✓ 全テーブル作成確認 (6/6)';
END $$;

-- ビュー存在確認
DO $$
DECLARE
    v_view_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_view_count
    FROM information_schema.views
    WHERE table_schema = 'public'
        AND table_name = 'reservation_list_view';

    IF v_view_count != 1 THEN
        RAISE EXCEPTION 'ビュー作成に失敗しました';
    END IF;

    RAISE NOTICE '   ✓ ビュー作成確認 (1/1)';
END $$;

-- 関数存在確認
DO $$
DECLARE
    v_function_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
        AND p.proname IN ('check_reservation_conflict', 'get_available_time_slots');

    IF v_function_count != 2 THEN
        RAISE EXCEPTION '関数作成に失敗しました。期待: 2関数、実際: %', v_function_count;
    END IF;

    RAISE NOTICE '   ✓ 関数作成確認 (2/2)';
END $$;

-- RLS有効化確認
DO $$
DECLARE
    v_rls_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_rls_count
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history')
        AND rowsecurity = true;

    IF v_rls_count != 6 THEN
        RAISE EXCEPTION 'RLS有効化に失敗しました。期待: 6テーブル、実際: %', v_rls_count;
    END IF;

    RAISE NOTICE '   ✓ RLS有効化確認 (6/6)';
END $$;

\echo ''
\echo '4. サンプルデータ確認中...'

-- サンプルデータ件数確認
DO $$
DECLARE
    v_customer_count INTEGER;
    v_menu_count INTEGER;
    v_resource_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_customer_count FROM public.customers;
    SELECT COUNT(*) INTO v_menu_count FROM public.menus;
    SELECT COUNT(*) INTO v_resource_count FROM public.resources;

    RAISE NOTICE '   ✓ 顧客データ: % 件', v_customer_count;
    RAISE NOTICE '   ✓ メニューデータ: % 件', v_menu_count;
    RAISE NOTICE '   ✓ リソースデータ: % 件', v_resource_count;
END $$;

\echo ''
\echo '======================================================'
\echo 'マイグレーション完了'
\echo '======================================================'
\echo ''
\echo '次のステップ:'
\echo '1. Supabase型定義の再生成'
\echo '   $ npm run supabase:types'
\echo ''
\echo '2. 開発サーバーの再起動'
\echo '   $ npm run dev'
\echo ''
\echo '3. テスト実行'
\echo '   $ npm test -- --testPathPattern="reservation"'
\echo ''

-- コミット
COMMIT;

\echo 'トランザクション: コミット完了'
