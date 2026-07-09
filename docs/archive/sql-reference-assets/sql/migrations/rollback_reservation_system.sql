-- =====================================================
-- 予約管理システム - ロールバックスクリプト
-- =====================================================
-- 作成日: 2025-11-04
-- 目的: 予約管理システムのマイグレーションを完全に取り消す
-- 警告: このスクリプトは全データを削除します
-- =====================================================

\echo '======================================================'
\echo '予約管理システム - ロールバック開始'
\echo '警告: 全データが削除されます'
\echo '======================================================'
\echo ''

-- 確認プロンプト（psqlインタラクティブモード）
\prompt '本当にロールバックしますか？ (yes/no): ' confirmation

-- トランザクション開始
BEGIN;

\echo '1. トリガー削除中...'

-- 予約変更履歴トリガー
DROP TRIGGER IF EXISTS reservation_created_log ON public.reservations;
DROP TRIGGER IF EXISTS reservation_updated_log ON public.reservations;
DROP TRIGGER IF EXISTS reservation_deleted_log ON public.reservations;
DROP TRIGGER IF EXISTS update_customer_stats_trigger ON public.reservations;

-- updated_atトリガー
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
DROP TRIGGER IF EXISTS update_menus_updated_at ON public.menus;
DROP TRIGGER IF EXISTS update_resources_updated_at ON public.resources;
DROP TRIGGER IF EXISTS update_reservations_updated_at ON public.reservations;
DROP TRIGGER IF EXISTS update_blocks_updated_at ON public.blocks;

\echo '   ✓ トリガー削除完了'
\echo ''

\echo '2. RLSポリシー削除中...'

-- Customersポリシー
DROP POLICY IF EXISTS "customers_select_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_for_managers" ON public.customers;
DROP POLICY IF EXISTS "customers_update_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_for_admin" ON public.customers;
DROP POLICY IF EXISTS "customers_select_for_self" ON public.customers;

-- Menusポリシー
DROP POLICY IF EXISTS "menus_select_for_all" ON public.menus;
DROP POLICY IF EXISTS "menus_select_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_insert_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_update_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_delete_for_admin" ON public.menus;

-- Resourcesポリシー
DROP POLICY IF EXISTS "resources_select_for_staff" ON public.resources;
DROP POLICY IF EXISTS "resources_insert_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_update_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_delete_for_admin" ON public.resources;

-- Reservationsポリシー
DROP POLICY IF EXISTS "reservations_select_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_select_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_for_managers" ON public.reservations;

-- Blocksポリシー
DROP POLICY IF EXISTS "blocks_select_for_staff" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_update_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete_for_admin" ON public.blocks;

-- Reservation Historyポリシー
DROP POLICY IF EXISTS "reservation_history_select_for_staff" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_insert_for_all" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_update_for_admin" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_delete_for_admin" ON public.reservation_history;

\echo '   ✓ RLSポリシー削除完了'
\echo ''

\echo '3. ビュー・マテリアライズドビュー削除中...'

DROP MATERIALIZED VIEW IF EXISTS public.daily_reservation_stats CASCADE;
DROP VIEW IF EXISTS public.reservation_list_view CASCADE;

\echo '   ✓ ビュー削除完了'
\echo ''

\echo '4. 関数削除中...'

DROP FUNCTION IF EXISTS refresh_daily_stats();
DROP FUNCTION IF EXISTS update_customer_stats();
DROP FUNCTION IF EXISTS log_reservation_deleted();
DROP FUNCTION IF EXISTS log_reservation_updated();
DROP FUNCTION IF EXISTS log_reservation_created();
DROP FUNCTION IF EXISTS get_available_time_slots(UUID, DATE, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS check_reservation_conflict(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS update_updated_at_column();

\echo '   ✓ 関数削除完了'
\echo ''

\echo '5. テーブル削除中（カスケード）...'

-- 外部キー制約があるため、依存順に削除
DROP TABLE IF EXISTS public.reservation_history CASCADE;
DROP TABLE IF EXISTS public.blocks CASCADE;
DROP TABLE IF EXISTS public.reservations CASCADE;
DROP TABLE IF EXISTS public.resources CASCADE;
DROP TABLE IF EXISTS public.menus CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;

\echo '   ✓ テーブル削除完了'
\echo ''

\echo '6. インデックス削除確認中...'

-- テーブル削除により自動削除されるため確認のみ
DO $$
DECLARE
    v_index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
        AND tablename IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history');

    RAISE NOTICE '   残存インデックス: % 件（期待値: 0）', v_index_count;
END $$;

\echo ''
\echo '======================================================'
\echo 'ロールバック完了'
\echo '======================================================'
\echo ''
\echo '削除されたオブジェクト:'
\echo '- テーブル: 6件'
\echo '- ビュー: 2件'
\echo '- 関数: 8件'
\echo '- トリガー: 9件'
\echo '- RLSポリシー: 25件'
\echo ''

-- コミット
COMMIT;

\echo 'トランザクション: コミット完了'
\echo ''
\echo '注意: Supabase型定義の再生成が必要です'
\echo '$ npm run supabase:types'
