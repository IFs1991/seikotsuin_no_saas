-- ================================================================
-- Phase 2: Reservation Tables RLS - Tenant Boundary 統一
-- ================================================================
-- 問題: 予約系テーブルのRLSが複数マイグレーション（20251104, 20260111等）で
--       段階的に修正されてきたが、ポリシー名・ロール権限が不統一。
--       本マイグレーションで最終的な正規化を行う。
-- 前提: 20260111000200 で既に can_access_clinic() ベースに移行済み。
--       本マイグレーションは追加の正規化・明確化を行う。
-- 注意: 顧客ポリシー（customer系）は 20260111000200 で意図的に削除済み。
--       顧客操作は Server API Gateway パターン（service_role経由）で行う。
-- リスク: 高（全予約系RLSの書き換え）
-- ロールバック: 各ポリシーDROP + 旧ポリシー再作成
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Customers テーブル RLS修正
-- ================================================================
-- 注意: customers_select_for_self は 20260111000200 で意図的に削除済み。
--       顧客はSupabase Authにログインしない設計のため再作成しない。

-- 旧ポリシー削除（20260111000200 で作成されたポリシー名に合わせる）
DROP POLICY IF EXISTS "customers_select_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_update_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_for_admin" ON public.customers;
-- レガシー名も念のためDROP
DROP POLICY IF EXISTS "customers_insert_for_managers" ON public.customers;
DROP POLICY IF EXISTS "customers_select_for_self" ON public.customers;

-- スタッフ以上: 自テナントの顧客のみ参照可能
CREATE POLICY "customers_select_for_staff"
ON public.customers FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- スタッフ以上: 自テナントへの顧客登録
CREATE POLICY "customers_insert_for_staff"
ON public.customers FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- スタッフ以上: 自テナントの顧客情報更新
CREATE POLICY "customers_update_for_staff"
ON public.customers FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者のみ: 自テナントの顧客削除（論理削除）
-- 変更: admin + clinic_admin に拡大（クリニック管理者も自院の顧客管理が必要）
CREATE POLICY "customers_delete_for_admin"
ON public.customers FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 2. Menus テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除（20260111000200 で作成されたポリシー名に合わせる）
DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;
DROP POLICY IF EXISTS "menus_select_public" ON public.menus;
DROP POLICY IF EXISTS "menus_insert_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_update_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_delete_for_admin" ON public.menus;
-- レガシー名も念のためDROP
DROP POLICY IF EXISTS "menus_select_for_all" ON public.menus;
DROP POLICY IF EXISTS "menus_select_for_managers" ON public.menus;

-- 公開メニュー: 有効なメニューは匿名でも参照可能（予約ページ用）
-- 注意: テナント境界なし。アプリ側で clinic_id フィルタ必須。
CREATE POLICY "menus_select_public"
ON public.menus FOR SELECT
USING (
    is_active = true AND is_deleted = false
);

-- 管理者・マネージャー: 自テナントの全メニュー参照（無効含む）
CREATE POLICY "menus_select_for_managers"
ON public.menus FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントへのメニュー追加
CREATE POLICY "menus_insert_for_managers"
ON public.menus FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントのメニュー更新
CREATE POLICY "menus_update_for_managers"
ON public.menus FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者のみ: 自テナントのメニュー削除
-- 変更: admin + clinic_admin に拡大
CREATE POLICY "menus_delete_for_admin"
ON public.menus FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 3. Resources テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "resources_select_for_staff" ON public.resources;
DROP POLICY IF EXISTS "resources_insert_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_update_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_delete_for_admin" ON public.resources;

-- スタッフ以上: 自テナントのリソース参照
CREATE POLICY "resources_select_for_staff"
ON public.resources FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントへのリソース追加
CREATE POLICY "resources_insert_for_managers"
ON public.resources FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントのリソース更新
CREATE POLICY "resources_update_for_managers"
ON public.resources FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者のみ: 自テナントのリソース削除
-- 変更: admin + clinic_admin に拡大
CREATE POLICY "resources_delete_for_admin"
ON public.resources FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 4. Reservations テーブル RLS修正
-- ================================================================
-- 注意: 顧客ポリシー（reservations_*_for_customer）は 20260111000200 で
--       意図的に削除済み。Server API Gateway パターンのため再作成しない。

-- 旧ポリシー削除
DROP POLICY IF EXISTS "reservations_select_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_for_managers" ON public.reservations;
-- レガシー名も念のためDROP
DROP POLICY IF EXISTS "reservations_select_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_customer" ON public.reservations;

-- スタッフ以上: 自テナントの予約参照
CREATE POLICY "reservations_select_for_staff"
ON public.reservations FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- スタッフ以上: 自テナントへの予約作成
CREATE POLICY "reservations_insert_for_staff"
ON public.reservations FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- スタッフ以上: 自テナントの予約更新
CREATE POLICY "reservations_update_for_staff"
ON public.reservations FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントの予約削除
CREATE POLICY "reservations_delete_for_managers"
ON public.reservations FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 5. Blocks テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "blocks_select_for_staff" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_update_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete_for_admin" ON public.blocks;

-- スタッフ以上: 自テナントのブロック参照
CREATE POLICY "blocks_select_for_staff"
ON public.blocks FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントへのブロック追加
CREATE POLICY "blocks_insert_for_managers"
ON public.blocks FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者・マネージャー: 自テナントのブロック更新
CREATE POLICY "blocks_update_for_managers"
ON public.blocks FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- 管理者のみ: 自テナントのブロック削除
-- 変更: admin + clinic_admin に拡大
CREATE POLICY "blocks_delete_for_admin"
ON public.blocks FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 6. Reservation History テーブル RLS修正
-- ================================================================

-- 旧ポリシー削除
DROP POLICY IF EXISTS "reservation_history_select_for_staff" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_insert_for_all" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_update_for_admin" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_delete_for_admin" ON public.reservation_history;
-- Phase 2 で作成される可能性のある名前も念のためDROP
DROP POLICY IF EXISTS "reservation_history_insert_service_role" ON public.reservation_history;

-- スタッフ以上: 自テナントの履歴参照（監査ログ）
-- 注意: 既存データに clinic_id が NULL の行がある可能性があるため、
--       reservations テーブル経由でテナント境界を検証する（安全策）。
--       Phase 5 で clinic_id NOT NULL 制約追加後も、JOIN方式の方が堅牢。
CREATE POLICY "reservation_history_select_for_staff"
ON public.reservation_history FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND (
        -- clinic_id が設定されている場合は直接チェック
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        -- clinic_id が NULL の場合は reservations 経由でチェック（後方互換）
        OR (clinic_id IS NULL AND EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.id = reservation_history.reservation_id
              AND public.can_access_clinic(r.clinic_id)
        ))
    )
);

-- INSERT: service_role + SECURITY DEFINER トリガーのみ許可
-- トリガー関数（log_reservation_created等）は SECURITY DEFINER で実行され、
-- 関数オーナー（postgres）が BYPASSRLS 属性を持つため RLS をバイパスする。
-- したがって authenticated ユーザーからの直接 INSERT のみブロックされる。
CREATE POLICY "reservation_history_insert_service_role"
ON public.reservation_history FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
);

-- 管理者のみ: 履歴更新（通常は不要）
CREATE POLICY "reservation_history_update_for_admin"
ON public.reservation_history FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.id = reservation_history.reservation_id
              AND public.can_access_clinic(r.clinic_id)
        ))
    )
);

-- 管理者のみ: 履歴削除（通常は不要）
CREATE POLICY "reservation_history_delete_for_admin"
ON public.reservation_history FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.id = reservation_history.reservation_id
              AND public.can_access_clinic(r.clinic_id)
        ))
    )
);

COMMIT;

-- ================================================================
-- Post-Migration Verification
-- ================================================================
--
-- 1. テナント境界テスト:
-- SET LOCAL request.jwt.claims = '{"sub":"user-a","clinic_id":"clinic-a","user_role":"staff"}';
-- SELECT count(*) FROM customers WHERE clinic_id = 'clinic-b'; -- Expected: 0
--
-- 2. ポリシー確認:
-- SELECT tablename, policyname, qual
-- FROM pg_policies
-- WHERE tablename IN ('customers', 'menus', 'resources', 'reservations', 'blocks', 'reservation_history')
-- ORDER BY tablename, policyname;
-- -- Expected: 全ポリシーに can_access_clinic が含まれる
--
-- 3. 顧客ポリシーが存在しないことを確認:
-- SELECT policyname FROM pg_policies
-- WHERE policyname LIKE '%customer%' OR policyname LIKE '%self%';
-- -- Expected: 空（顧客操作は Server API Gateway 経由）
-- ================================================================
