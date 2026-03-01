-- ================================================================
-- Phase 5: clinic_id NOT NULL制約追加（予約系テーブル）
-- ================================================================
-- 問題: マルチテナントの生命線である clinic_id が NULLABLE のまま。
--       ALTER ADD で後追加されたため NOT NULL 制約が欠如。
--       NULL の clinic_id が存在するとテナント分離が保証されない。
-- 対応: NULL行を埋めてから NOT NULL 制約を追加
-- リスク: 中（既存データにNULLがあるとマイグレーション失敗）
-- ロールバック: ALTER COLUMN ... DROP NOT NULL
-- ================================================================

BEGIN;

-- ================================================================
-- 1. NULL行チェック＆クリーンアップ
-- ================================================================
-- 既に 20251222 で NULL→デフォルトクリニック埋めが実施済みだが、
-- その後の INSERT で NULL が入る可能性があるため再度チェック

-- NULL行の修正
DO $$
DECLARE
    null_count INTEGER;
    table_name TEXT;
BEGIN
    -- 1. reservation_history は特別処理: reservation_id 経由で正しい clinic_id を取得
    SELECT count(*) INTO null_count
    FROM public.reservation_history
    WHERE clinic_id IS NULL;

    IF null_count > 0 THEN
        RAISE WARNING 'reservation_history has % rows with NULL clinic_id. Fixing via reservation_id lookup...', null_count;

        -- reservations テーブルから正しい clinic_id をコピー
        UPDATE public.reservation_history rh
        SET clinic_id = r.clinic_id
        FROM public.reservations r
        WHERE rh.reservation_id = r.id
          AND rh.clinic_id IS NULL
          AND r.clinic_id IS NOT NULL;

        -- reservations にも clinic_id がない、または reservation_id が孤立している場合
        SELECT count(*) INTO null_count
        FROM public.reservation_history
        WHERE clinic_id IS NULL;

        IF null_count > 0 THEN
            RAISE WARNING 'reservation_history still has % orphan rows with NULL clinic_id. Using first clinic as fallback.', null_count;
            UPDATE public.reservation_history
            SET clinic_id = (SELECT id FROM public.clinics ORDER BY created_at LIMIT 1)
            WHERE clinic_id IS NULL;
        END IF;

        RAISE NOTICE 'Fixed NULL clinic_id rows in reservation_history';
    END IF;

    -- 2. その他のテーブル: 最初のクリニックIDで埋める（緊急措置）
    FOR table_name IN
        SELECT unnest(ARRAY['customers', 'menus', 'resources', 'reservations', 'blocks'])
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE clinic_id IS NULL', table_name)
        INTO null_count;

        IF null_count > 0 THEN
            RAISE WARNING 'Table % has % rows with NULL clinic_id. Attempting to fix...', table_name, null_count;

            EXECUTE format(
                'UPDATE public.%I SET clinic_id = (SELECT id FROM public.clinics ORDER BY created_at LIMIT 1) WHERE clinic_id IS NULL',
                table_name
            );

            RAISE NOTICE 'Fixed % NULL clinic_id rows in %', null_count, table_name;
        END IF;
    END LOOP;
END $$;

-- ================================================================
-- 2. NOT NULL制約追加
-- ================================================================

ALTER TABLE public.customers
    ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.menus
    ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.resources
    ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.reservations
    ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.blocks
    ALTER COLUMN clinic_id SET NOT NULL;

ALTER TABLE public.reservation_history
    ALTER COLUMN clinic_id SET NOT NULL;

-- ================================================================
-- 3. コメント追加
-- ================================================================

COMMENT ON COLUMN public.customers.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMENT ON COLUMN public.menus.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMENT ON COLUMN public.resources.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMENT ON COLUMN public.reservations.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMENT ON COLUMN public.blocks.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMENT ON COLUMN public.reservation_history.clinic_id IS
'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';

COMMIT;

-- ================================================================
-- Post-Migration Verification
-- ================================================================
--
-- 1. NOT NULL確認:
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history')
--   AND column_name = 'clinic_id';
-- -- Expected: is_nullable = 'NO' for all
--
-- 2. NULLデータ残存確認:
-- SELECT 'customers' as tbl, count(*) FROM customers WHERE clinic_id IS NULL
-- UNION ALL
-- SELECT 'menus', count(*) FROM menus WHERE clinic_id IS NULL
-- UNION ALL
-- SELECT 'resources', count(*) FROM resources WHERE clinic_id IS NULL
-- UNION ALL
-- SELECT 'reservations', count(*) FROM reservations WHERE clinic_id IS NULL
-- UNION ALL
-- SELECT 'blocks', count(*) FROM blocks WHERE clinic_id IS NULL
-- UNION ALL
-- SELECT 'reservation_history', count(*) FROM reservation_history WHERE clinic_id IS NULL;
-- -- Expected: count = 0 for all
-- ================================================================
