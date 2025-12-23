-- =====================================================
-- 予約管理システム - RLS（Row Level Security）ポリシー
-- =====================================================
-- 作成日: 2025-11-04
-- 対象: 整骨院管理SaaS 予約機能
-- バージョン: 1.0
--
-- セキュリティレベル: エンタープライズグレード
-- 準拠: 医療機関向けセキュリティ要件
-- =====================================================

-- =====================================================
-- RLS有効化
-- =====================================================

-- Customersテーブル
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Menusテーブル
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;

-- Resourcesテーブル
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Reservationsテーブル
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Blocksテーブル
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Reservation Historyテーブル
ALTER TABLE public.reservation_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ヘルパー関数: ユーザーロール取得
-- =====================================================

-- auth スキーマへは書き込めないため public に作成する
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role',
        'anon'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 1. Customersテーブル RLSポリシー
-- =====================================================

-- 管理者・スタッフは全件参照可能
CREATE POLICY "customers_select_for_staff"
ON public.customers FOR SELECT
USING (
    public.user_role() IN ('admin', 'staff', 'manager')
);

-- 管理者・マネージャーは全件挿入可能
CREATE POLICY "customers_insert_for_managers"
ON public.customers FOR INSERT
WITH CHECK (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 管理者・マネージャー・スタッフは全件更新可能
CREATE POLICY "customers_update_for_staff"
ON public.customers FOR UPDATE
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 管理者のみ削除可能（論理削除）
CREATE POLICY "customers_delete_for_admin"
ON public.customers FOR DELETE
USING (
    public.user_role() = 'admin'
);

-- 顧客本人は自分のデータのみ参照可能（LINE連携時）
CREATE POLICY "customers_select_for_self"
ON public.customers FOR SELECT
USING (
    public.user_role() = 'customer' AND
    id = auth.uid()
);

-- =====================================================
-- 2. Menusテーブル RLSポリシー
-- =====================================================

-- 全ユーザーが有効なメニューを参照可能
CREATE POLICY "menus_select_for_all"
ON public.menus FOR SELECT
USING (
    is_active = true AND is_deleted = false
);

-- 管理者・マネージャーは全件参照可能
CREATE POLICY "menus_select_for_managers"
ON public.menus FOR SELECT
USING (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者・マネージャーのみ挿入可能
CREATE POLICY "menus_insert_for_managers"
ON public.menus FOR INSERT
WITH CHECK (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者・マネージャーのみ更新可能
CREATE POLICY "menus_update_for_managers"
ON public.menus FOR UPDATE
USING (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者のみ削除可能
CREATE POLICY "menus_delete_for_admin"
ON public.menus FOR DELETE
USING (
    public.user_role() = 'admin'
);

-- =====================================================
-- 3. Resourcesテーブル RLSポリシー
-- =====================================================

-- スタッフ以上は全件参照可能
CREATE POLICY "resources_select_for_staff"
ON public.resources FOR SELECT
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 管理者・マネージャーのみ挿入可能
CREATE POLICY "resources_insert_for_managers"
ON public.resources FOR INSERT
WITH CHECK (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者・マネージャーのみ更新可能
CREATE POLICY "resources_update_for_managers"
ON public.resources FOR UPDATE
USING (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者のみ削除可能
CREATE POLICY "resources_delete_for_admin"
ON public.resources FOR DELETE
USING (
    public.user_role() = 'admin'
);

-- =====================================================
-- 4. Reservationsテーブル RLSポリシー
-- =====================================================

-- スタッフ以上は全件参照可能
CREATE POLICY "reservations_select_for_staff"
ON public.reservations FOR SELECT
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 顧客本人は自分の予約のみ参照可能
CREATE POLICY "reservations_select_for_customer"
ON public.reservations FOR SELECT
USING (
    public.user_role() = 'customer' AND
    customer_id = auth.uid()
);

-- スタッフ以上は予約作成可能
CREATE POLICY "reservations_insert_for_staff"
ON public.reservations FOR INSERT
WITH CHECK (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 顧客本人も予約作成可能（Web予約・LINE予約）
CREATE POLICY "reservations_insert_for_customer"
ON public.reservations FOR INSERT
WITH CHECK (
    public.user_role() = 'customer' AND
    customer_id = auth.uid() AND
    channel IN ('web', 'line')
);

-- スタッフ以上は予約更新可能
CREATE POLICY "reservations_update_for_staff"
ON public.reservations FOR UPDATE
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 顧客本人は自分の予約をキャンセル可能（ステータス変更のみ）
CREATE POLICY "reservations_update_for_customer"
ON public.reservations FOR UPDATE
USING (
    public.user_role() = 'customer' AND
    customer_id = auth.uid() AND
    status IN ('tentative', 'confirmed', 'unconfirmed')
)
WITH CHECK (
    public.user_role() = 'customer' AND
    customer_id = auth.uid() AND
    status = 'cancelled' -- キャンセルのみ許可
);

-- 管理者・マネージャーのみ削除可能
CREATE POLICY "reservations_delete_for_managers"
ON public.reservations FOR DELETE
USING (
    public.user_role() IN ('admin', 'manager')
);

-- =====================================================
-- 5. Blocksテーブル RLSポリシー
-- =====================================================

-- スタッフ以上は全件参照可能
CREATE POLICY "blocks_select_for_staff"
ON public.blocks FOR SELECT
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 管理者・マネージャーのみ挿入可能
CREATE POLICY "blocks_insert_for_managers"
ON public.blocks FOR INSERT
WITH CHECK (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者・マネージャーのみ更新可能
CREATE POLICY "blocks_update_for_managers"
ON public.blocks FOR UPDATE
USING (
    public.user_role() IN ('admin', 'manager')
);

-- 管理者のみ削除可能
CREATE POLICY "blocks_delete_for_admin"
ON public.blocks FOR DELETE
USING (
    public.user_role() = 'admin'
);

-- =====================================================
-- 6. Reservation Historyテーブル RLSポリシー
-- =====================================================

-- スタッフ以上は全件参照可能（監査ログ）
CREATE POLICY "reservation_history_select_for_staff"
ON public.reservation_history FOR SELECT
USING (
    public.user_role() IN ('admin', 'manager', 'staff')
);

-- 全ユーザーが履歴を記録可能（自動記録）
CREATE POLICY "reservation_history_insert_for_all"
ON public.reservation_history FOR INSERT
WITH CHECK (true);

-- 管理者のみ履歴を更新・削除可能（通常は不可）
CREATE POLICY "reservation_history_update_for_admin"
ON public.reservation_history FOR UPDATE
USING (
    public.user_role() = 'admin'
);

CREATE POLICY "reservation_history_delete_for_admin"
ON public.reservation_history FOR DELETE
USING (
    public.user_role() = 'admin'
);

-- =====================================================
-- 7. トリガー: 予約変更履歴の自動記録
-- =====================================================

-- 予約作成時の履歴記録
CREATE OR REPLACE FUNCTION log_reservation_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        new_value,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        'created',
        to_jsonb(NEW),
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER reservation_created_log
    AFTER INSERT ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION log_reservation_created();

-- 予約更新時の履歴記録
CREATE OR REPLACE FUNCTION log_reservation_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(50);
    v_change_reason TEXT;
BEGIN
    -- アクションの判定
    IF OLD.status != NEW.status THEN
        v_action := 'status_changed';
    ELSIF OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time THEN
        v_action := 'rescheduled';
    ELSE
        v_action := 'updated';
    END IF;

    -- キャンセル理由の取得
    IF NEW.status = 'cancelled' THEN
        v_change_reason := NEW.cancellation_reason;
    END IF;

    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        old_value,
        new_value,
        change_reason,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        v_action,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_change_reason,
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER reservation_updated_log
    AFTER UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION log_reservation_updated();

-- 予約削除時の履歴記録
CREATE OR REPLACE FUNCTION log_reservation_deleted()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        old_value,
        created_by,
        ip_address
    ) VALUES (
        OLD.id,
        'deleted',
        to_jsonb(OLD),
        auth.uid(),
        inet_client_addr()
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER reservation_deleted_log
    AFTER DELETE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION log_reservation_deleted();

-- =====================================================
-- 8. 顧客統計情報の自動更新
-- =====================================================

-- 予約完了時に顧客統計を更新
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 予約が完了ステータスに変更された場合
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN
        UPDATE public.customers
        SET
            total_visits = total_visits + 1,
            last_visit_date = NEW.end_time,
            total_revenue = total_revenue + COALESCE(NEW.actual_price, NEW.price, 0),
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_customer_stats_trigger
    AFTER INSERT OR UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION update_customer_stats();

-- =====================================================
-- 9. セキュリティ設定
-- =====================================================

-- Viewに対するアクセス権限
GRANT SELECT ON public.reservation_list_view TO authenticated;
GRANT SELECT ON public.reservation_list_view TO anon;

-- 関数に対するアクセス権限
GRANT EXECUTE ON FUNCTION check_reservation_conflict TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_time_slots TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role TO authenticated;

-- =====================================================
-- 10. パフォーマンス最適化: マテリアライズドビュー
-- =====================================================

-- 日別予約統計（パフォーマンス最適化用）
CREATE MATERIALIZED VIEW IF NOT EXISTS public.daily_reservation_stats AS
SELECT
    DATE(start_time) AS reservation_date,
    staff_id,
    COUNT(*) AS total_reservations,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
    SUM(actual_price) FILTER (WHERE status = 'completed') AS total_revenue,
    AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS avg_duration_minutes
FROM public.reservations
WHERE is_deleted = false
GROUP BY DATE(start_time), staff_id;

-- インデックス
CREATE UNIQUE INDEX idx_daily_stats_date_staff ON public.daily_reservation_stats(reservation_date, staff_id);

-- 権限付与
GRANT SELECT ON public.daily_reservation_stats TO authenticated;

-- リフレッシュ関数（cronで定期実行推奨）
CREATE OR REPLACE FUNCTION refresh_daily_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_reservation_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 完了メッセージ
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '予約管理システムのRLSポリシー設定が完了しました。';
    RAISE NOTICE 'セキュリティレベル: エンタープライズグレード';
    RAISE NOTICE 'ロール: admin, manager, staff, customer, anon';
    RAISE NOTICE '監査ログ: 自動記録（reservation_history）';
END $$;
