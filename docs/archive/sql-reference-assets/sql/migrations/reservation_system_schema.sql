-- =====================================================
-- 予約管理システム - データベーススキーマ
-- =====================================================
-- 作成日: 2025-11-04
-- 対象: 整骨院管理SaaS 予約機能
-- バージョン: 1.0
--
-- 実装機能:
-- - F001: 日表示タイムライン
-- - F002: ドラッグ&ドロップ編集
-- - F005: 電話予約手入力
-- - F006: 予約表印刷
-- - F007: 予約枠設定
-- - F008: 販売停止設定
-- - F101: 複数日予約一括登録
-- - F103: 検索/フィルタ
-- =====================================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- テキスト検索用

-- =====================================================
-- 1. Customers（顧客）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本情報
    name VARCHAR(255) NOT NULL,
    name_kana VARCHAR(255), -- カタカナ名
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),

    -- LINE連携（Phase 2）
    line_user_id VARCHAR(255) UNIQUE,
    line_display_name VARCHAR(255),

    -- カスタム属性（事前ヒアリング等）
    custom_attributes JSONB DEFAULT '{}',

    -- 同意管理
    consent_marketing BOOLEAN DEFAULT false,
    consent_reminder BOOLEAN DEFAULT false,
    consent_date TIMESTAMPTZ,

    -- 顧客メモ
    notes TEXT,

    -- タグ・セグメント
    tags TEXT[], -- 例: ['VIP', '新患', '離脱リスク']
    segment VARCHAR(50), -- 例: 'high_value', 'at_risk'

    -- 統計情報（非正規化）
    total_visits INTEGER DEFAULT 0,
    last_visit_date TIMESTAMPTZ,
    total_revenue DECIMAL(10, 2) DEFAULT 0,
    lifetime_value DECIMAL(10, 2) DEFAULT 0,

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- 削除フラグ（論理削除）
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id)
);

-- インデックス作成
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_line_user_id ON public.customers(line_user_id);
CREATE INDEX idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX idx_customers_created_at ON public.customers(created_at DESC);
CREATE INDEX idx_customers_last_visit ON public.customers(last_visit_date DESC NULLS LAST);
CREATE INDEX idx_customers_is_deleted ON public.customers(is_deleted) WHERE is_deleted = false;

-- トリガー: updated_at自動更新
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.customers IS '顧客マスターテーブル';
COMMENT ON COLUMN public.customers.custom_attributes IS 'カスタム属性（事前ヒアリング、アレルギー情報等）';
COMMENT ON COLUMN public.customers.lifetime_value IS '顧客生涯価値（LTV）';

-- =====================================================
-- 2. Menus（施術メニュー）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本情報
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 例: '整体', '鍼灸', 'カイロプラクティック'

    -- 料金・時間
    price DECIMAL(10, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),

    -- 保険適用区分
    insurance_type VARCHAR(50), -- 'insurance' | 'self_pay' | 'mixed'
    insurance_points INTEGER, -- 保険点数

    -- 対応可能リソース制約
    requires_room BOOLEAN DEFAULT false,
    requires_device VARCHAR(100), -- 例: 'ultrasound', 'electric_therapy'
    max_concurrent INTEGER DEFAULT 1, -- 同時施術可能数

    -- 前後バッファ時間
    buffer_before_minutes INTEGER DEFAULT 0,
    buffer_after_minutes INTEGER DEFAULT 0,

    -- 表示設定
    display_order INTEGER DEFAULT 0,
    color VARCHAR(7), -- 例: '#4CAF50'
    icon VARCHAR(50), -- 例: 'massage', 'acupuncture'

    -- オプション（フロント追加要件）
    -- 例: [{ "id": "...", "name": "延長10分", "priceDelta": 1000, "durationDeltaMinutes": 10, "isActive": true }]
    options JSONB DEFAULT '[]'::jsonb,

    -- ステータス
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true, -- Web予約で表示するか

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- 削除フラグ
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id)
);

-- インデックス
CREATE INDEX idx_menus_category ON public.menus(category);
CREATE INDEX idx_menus_is_active ON public.menus(is_active) WHERE is_active = true;
CREATE INDEX idx_menus_is_public ON public.menus(is_public) WHERE is_public = true;
CREATE INDEX idx_menus_display_order ON public.menus(display_order);

-- トリガー
CREATE TRIGGER update_menus_updated_at
    BEFORE UPDATE ON public.menus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.menus IS '施術メニューマスターテーブル';
COMMENT ON COLUMN public.menus.insurance_type IS '保険適用区分（保険/自費/混合）';
COMMENT ON COLUMN public.menus.buffer_before_minutes IS '前準備時間（分）';
COMMENT ON COLUMN public.menus.buffer_after_minutes IS '後片付け時間（分）';

-- =====================================================
-- 3. Resources（リソース：スタッフ・施術室・設備）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 基本情報
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('staff', 'room', 'bed', 'device')),

    -- スタッフ固有情報
    staff_code VARCHAR(50) UNIQUE, -- 従業員コード
    email VARCHAR(255),
    phone VARCHAR(20),
    specialties TEXT[], -- 専門分野: ['鍼灸', '柔道整復']
    qualifications TEXT[], -- 資格: ['国家資格:柔道整復師', '鍼灸師']

    -- 営業時間（曜日別）
    working_hours JSONB NOT NULL DEFAULT '{
        "monday": {"start": "09:00", "end": "18:00"},
        "tuesday": {"start": "09:00", "end": "18:00"},
        "wednesday": {"start": "09:00", "end": "18:00"},
        "thursday": {"start": "09:00", "end": "18:00"},
        "friday": {"start": "09:00", "end": "18:00"},
        "saturday": {"start": "09:00", "end": "17:00"},
        "sunday": null
    }',

    -- 能力・制約
    max_concurrent INTEGER DEFAULT 1 CHECK (max_concurrent > 0),
    supported_menus UUID[], -- 対応可能メニューID配列

    -- 表示設定
    display_order INTEGER DEFAULT 0,
    color VARCHAR(7), -- タイムライン表示色

    -- ステータス
    is_active BOOLEAN DEFAULT true,
    is_bookable BOOLEAN DEFAULT true, -- 予約受付可能か

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- 削除フラグ
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id)
);

-- インデックス
CREATE INDEX idx_resources_type ON public.resources(type);
CREATE INDEX idx_resources_staff_code ON public.resources(staff_code);
CREATE INDEX idx_resources_is_active ON public.resources(is_active) WHERE is_active = true;
CREATE INDEX idx_resources_is_bookable ON public.resources(is_bookable) WHERE is_bookable = true;
CREATE INDEX idx_resources_display_order ON public.resources(display_order);

-- トリガー
CREATE TRIGGER update_resources_updated_at
    BEFORE UPDATE ON public.resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.resources IS 'リソースマスターテーブル（スタッフ・施術室・設備）';
COMMENT ON COLUMN public.resources.type IS 'リソース種別: staff（スタッフ）, room（施術室）, bed（ベッド）, device（設備）';
COMMENT ON COLUMN public.resources.working_hours IS '曜日別営業時間（JSONB形式）';
COMMENT ON COLUMN public.resources.supported_menus IS '対応可能メニューID配列';

-- =====================================================
-- 4. Reservations（予約）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 外部キー
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE RESTRICT,
    staff_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,

    -- 予約日時
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    CHECK (end_time > start_time),

    -- ステータス
    status VARCHAR(50) NOT NULL DEFAULT 'unconfirmed' CHECK (status IN (
        'tentative',     -- 仮予約
        'confirmed',     -- 確定
        'arrived',       -- 来院
        'completed',     -- 完了
        'cancelled',     -- キャンセル
        'no_show',       -- 無断欠席
        'unconfirmed',   -- 未確認
        'trial'          -- 体験
    )),

    -- 予約チャネル
    channel VARCHAR(50) NOT NULL DEFAULT 'phone' CHECK (channel IN (
        'line',          -- LINE予約
        'web',           -- Web予約
        'phone',         -- 電話予約
        'walk_in'        -- 来院予約
    )),

    -- 予約者情報（LINEミニアプリ等で使用）
    booker_name VARCHAR(255), -- 予約者名（顧客と異なる場合）
    booker_phone VARCHAR(20),  -- 予約者電話番号

    -- メモ・備考
    notes TEXT,

    -- 選択オプション（フロント追加要件）
    selected_options JSONB DEFAULT '[]'::jsonb,
    cancellation_reason TEXT,
    no_show_reason TEXT,

    -- 料金情報
    price DECIMAL(10, 2), -- 予約時の料金（メニューから自動設定）
    actual_price DECIMAL(10, 2), -- 実際の請求額
    payment_status VARCHAR(50) DEFAULT 'unpaid' CHECK (payment_status IN (
        'unpaid',        -- 未払い
        'paid',          -- 支払い済み
        'partial',       -- 一部支払い
        'refunded'       -- 返金済み
    )),

    -- リマインド管理（Phase 2）
    reminder_sent BOOLEAN DEFAULT false,
    reminder_sent_at TIMESTAMPTZ,
    confirmation_sent BOOLEAN DEFAULT false,
    confirmation_sent_at TIMESTAMPTZ,

    -- 複数日予約グループ管理
    reservation_group_id UUID, -- 同じグループの予約を識別
    is_recurring BOOLEAN DEFAULT false,
    recurrence_parent_id UUID, -- 繰り返し予約の親ID

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- 削除フラグ
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id)
);

-- インデックス作成
CREATE INDEX idx_reservations_customer_id ON public.reservations(customer_id);
CREATE INDEX idx_reservations_menu_id ON public.reservations(menu_id);
CREATE INDEX idx_reservations_staff_id ON public.reservations(staff_id);
CREATE INDEX idx_reservations_start_time ON public.reservations(start_time DESC);
CREATE INDEX idx_reservations_end_time ON public.reservations(end_time);
CREATE INDEX idx_reservations_status ON public.reservations(status);
CREATE INDEX idx_reservations_channel ON public.reservations(channel);
CREATE INDEX idx_reservations_payment_status ON public.reservations(payment_status);
CREATE INDEX idx_reservations_reservation_group_id ON public.reservations(reservation_group_id);

-- 複合インデックス（D&D編集の衝突検出用）
CREATE INDEX idx_reservations_staff_time ON public.reservations(staff_id, start_time, end_time)
    WHERE is_deleted = false AND status NOT IN ('cancelled', 'no_show');

-- 日付範囲検索用
CREATE INDEX idx_reservations_date_range ON public.reservations(start_time, end_time)
    WHERE is_deleted = false;

-- トリガー
CREATE TRIGGER update_reservations_updated_at
    BEFORE UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.reservations IS '予約トランザクションテーブル';
COMMENT ON COLUMN public.reservations.status IS '予約ステータス（8種類）';
COMMENT ON COLUMN public.reservations.channel IS '予約チャネル（LINE/Web/電話/来院）';
COMMENT ON COLUMN public.reservations.reservation_group_id IS '複数日予約の同一グループID';

-- =====================================================
-- 5. Blocks（販売停止）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 外部キー
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,

    -- ブロック期間
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    CHECK (end_time > start_time),

    -- 繰り返し設定（RFC 5545 RRULE形式）
    recurrence_rule TEXT, -- 例: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10'
    recurrence_end_date TIMESTAMPTZ, -- 繰り返し終了日

    -- ブロック理由
    reason VARCHAR(255),
    block_type VARCHAR(50) DEFAULT 'manual' CHECK (block_type IN (
        'manual',        -- 手動設定
        'holiday',       -- 祝日
        'vacation',      -- 休暇
        'training',      -- 研修
        'maintenance',   -- メンテナンス
        'emergency'      -- 緊急
    )),

    -- ステータス
    is_active BOOLEAN DEFAULT true,

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- 削除フラグ
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id)
);

-- インデックス
CREATE INDEX idx_blocks_resource_id ON public.blocks(resource_id);
CREATE INDEX idx_blocks_start_time ON public.blocks(start_time);
CREATE INDEX idx_blocks_end_time ON public.blocks(end_time);
CREATE INDEX idx_blocks_is_active ON public.blocks(is_active) WHERE is_active = true;

-- 時間重複チェック用複合インデックス
CREATE INDEX idx_blocks_resource_time ON public.blocks(resource_id, start_time, end_time)
    WHERE is_deleted = false AND is_active = true;

-- トリガー
CREATE TRIGGER update_blocks_updated_at
    BEFORE UPDATE ON public.blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE public.blocks IS '販売停止（ブロック）テーブル';
COMMENT ON COLUMN public.blocks.recurrence_rule IS 'RFC 5545形式の繰り返しルール';
COMMENT ON COLUMN public.blocks.block_type IS 'ブロック種別（手動/祝日/休暇/研修等）';

-- =====================================================
-- 6. Reservation History（予約変更履歴）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS public.reservation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,

    -- 変更内容
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'created',
        'updated',
        'status_changed',
        'cancelled',
        'rescheduled',
        'deleted'
    )),

    -- 変更前後の値
    old_value JSONB,
    new_value JSONB,

    -- 変更理由
    change_reason TEXT,

    -- メタ情報
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- IPアドレス（監査用）
    ip_address INET,
    user_agent TEXT
);

-- インデックス
CREATE INDEX idx_reservation_history_reservation_id ON public.reservation_history(reservation_id);
CREATE INDEX idx_reservation_history_created_at ON public.reservation_history(created_at DESC);
CREATE INDEX idx_reservation_history_action ON public.reservation_history(action);

-- コメント
COMMENT ON TABLE public.reservation_history IS '予約変更履歴テーブル（監査ログ）';

-- =====================================================
-- 7. ビュー: 予約一覧（JOIN済み）
-- =====================================================
CREATE OR REPLACE VIEW public.reservation_list_view AS
SELECT
    r.id,
    r.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    r.menu_id,
    m.name AS menu_name,
    m.duration_minutes,
    m.price AS menu_price,
    r.staff_id,
    res.name AS staff_name,
    res.type AS resource_type,
    r.start_time,
    r.end_time,
    r.status,
    r.channel,
    r.notes,
    r.price,
    r.actual_price,
    r.payment_status,
    r.reservation_group_id,
    r.created_at,
    r.updated_at,
    r.created_by
FROM public.reservations r
INNER JOIN public.customers c ON r.customer_id = c.id
INNER JOIN public.menus m ON r.menu_id = m.id
INNER JOIN public.resources res ON r.staff_id = res.id
WHERE r.is_deleted = false
    AND c.is_deleted = false
    AND m.is_deleted = false
    AND res.is_deleted = false;

-- コメント
COMMENT ON VIEW public.reservation_list_view IS '予約一覧ビュー（顧客・メニュー・スタッフ情報をJOIN）';

-- =====================================================
-- 8. 関数: 予約の重複チェック
-- =====================================================
CREATE OR REPLACE FUNCTION check_reservation_conflict(
    p_staff_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_exclude_reservation_id UUID DEFAULT NULL
)
RETURNS TABLE(
    has_conflict BOOLEAN,
    conflict_type VARCHAR(50),
    conflict_reason TEXT,
    conflicting_reservation_id UUID
) AS $$
BEGIN
    -- 予約の重複チェック
    RETURN QUERY
    SELECT
        true AS has_conflict,
        'reservation' AS conflict_type,
        'この時間帯は既に予約が入っています' AS conflict_reason,
        r.id AS conflicting_reservation_id
    FROM public.reservations r
    WHERE r.staff_id = p_staff_id
        AND r.is_deleted = false
        AND r.status NOT IN ('cancelled', 'no_show')
        AND (p_exclude_reservation_id IS NULL OR r.id != p_exclude_reservation_id)
        AND r.start_time < p_end_time
        AND r.end_time > p_start_time
    LIMIT 1;

    -- 重複がなければ空の結果を返す
    IF NOT FOUND THEN
        -- ブロックのチェック
        RETURN QUERY
        SELECT
            true AS has_conflict,
            'block' AS conflict_type,
            COALESCE('販売停止期間: ' || b.reason, '販売停止期間') AS conflict_reason,
            b.id AS conflicting_reservation_id
        FROM public.blocks b
        WHERE b.resource_id = p_staff_id
            AND b.is_deleted = false
            AND b.is_active = true
            AND b.start_time < p_end_time
            AND b.end_time > p_start_time
        LIMIT 1;
    END IF;

    -- ブロックもなければ競合なし
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            false AS has_conflict,
            NULL::VARCHAR(50) AS conflict_type,
            NULL::TEXT AS conflict_reason,
            NULL::UUID AS conflicting_reservation_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- コメント
COMMENT ON FUNCTION check_reservation_conflict IS '予約の重複・ブロックチェック関数';

-- =====================================================
-- 9. 関数: 利用可能時間スロット取得
-- =====================================================
CREATE OR REPLACE FUNCTION get_available_time_slots(
    p_staff_id UUID,
    p_date DATE,
    p_duration_minutes INTEGER,
    p_slot_interval_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
    time_slot TIME,
    is_available BOOLEAN,
    conflict_reason TEXT
) AS $$
DECLARE
    v_day_name TEXT;
    v_working_hours JSONB;
    v_start_time TIME;
    v_end_time TIME;
    v_current_time TIME;
    v_slot_end_time TIME;
BEGIN
    -- 曜日を取得
    v_day_name := LOWER(TO_CHAR(p_date, 'Day'));
    v_day_name := TRIM(v_day_name);

    -- 英語の曜日名に変換
    v_day_name := CASE v_day_name
        WHEN '月曜日' THEN 'monday'
        WHEN '火曜日' THEN 'tuesday'
        WHEN '水曜日' THEN 'wednesday'
        WHEN '木曜日' THEN 'thursday'
        WHEN '金曜日' THEN 'friday'
        WHEN '土曜日' THEN 'saturday'
        WHEN '日曜日' THEN 'sunday'
        ELSE TO_CHAR(p_date, 'Day')
    END;

    -- スタッフの営業時間を取得
    SELECT working_hours INTO v_working_hours
    FROM public.resources
    WHERE id = p_staff_id;

    IF v_working_hours IS NULL OR v_working_hours->v_day_name IS NULL THEN
        RETURN;
    END IF;

    v_start_time := (v_working_hours->v_day_name->>'start')::TIME;
    v_end_time := (v_working_hours->v_day_name->>'end')::TIME;

    -- 時間スロットを生成
    v_current_time := v_start_time;

    WHILE v_current_time < v_end_time LOOP
        v_slot_end_time := v_current_time + (p_duration_minutes || ' minutes')::INTERVAL;

        -- 営業時間内チェック
        IF v_slot_end_time <= v_end_time THEN
            -- 重複チェック
            DECLARE
                v_has_conflict BOOLEAN;
                v_conflict_reason TEXT;
            BEGIN
                SELECT
                    COALESCE(bool_or(true), false),
                    STRING_AGG(DISTINCT conflict_type, ', ')
                INTO v_has_conflict, v_conflict_reason
                FROM check_reservation_conflict(
                    p_staff_id,
                    (p_date + v_current_time)::TIMESTAMPTZ,
                    (p_date + v_slot_end_time)::TIMESTAMPTZ
                )
                WHERE has_conflict = true;

                RETURN QUERY SELECT
                    v_current_time,
                    NOT COALESCE(v_has_conflict, false),
                    v_conflict_reason;
            END;
        ELSE
            RETURN QUERY SELECT
                v_current_time,
                false,
                '営業時間外'::TEXT;
        END IF;

        v_current_time := v_current_time + (p_slot_interval_minutes || ' minutes')::INTERVAL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- コメント
COMMENT ON FUNCTION get_available_time_slots IS '利用可能時間スロット取得関数';

-- =====================================================
-- 10. サンプルデータ挿入（開発・テスト用）
-- =====================================================

-- 顧客サンプルデータ
INSERT INTO public.customers (name, name_kana, phone, email, consent_marketing, consent_reminder)
VALUES
    ('山田太郎', 'ヤマダタロウ', '090-1234-5678', 'yamada@example.com', true, true),
    ('田中花子', 'タナカハナコ', '080-2345-6789', 'tanaka@example.com', true, false),
    ('佐藤次郎', 'サトウジロウ', '070-3456-7890', NULL, false, true)
ON CONFLICT DO NOTHING;

-- メニューサンプルデータ
INSERT INTO public.menus (name, description, category, price, duration_minutes, insurance_type, is_active, is_public)
VALUES
    ('整体60分', '全身の歪みを整える基本コース', '整体', 5000, 60, 'self_pay', true, true),
    ('鍼灸45分', '東洋医学による施術', '鍼灸', 4500, 45, 'insurance', true, true),
    ('保険診療30分', '保険適用の施術', '保険診療', 1500, 30, 'insurance', true, false),
    ('カイロプラクティック90分', '骨格調整の専門コース', 'カイロ', 8000, 90, 'self_pay', true, true)
ON CONFLICT DO NOTHING;

-- スタッフサンプルデータ
INSERT INTO public.resources (name, type, staff_code, specialties, qualifications, working_hours, supported_menus, is_active, is_bookable)
VALUES
    ('田中先生', 'staff', 'ST001', ARRAY['整体', '鍼灸'], ARRAY['柔道整復師', '鍼灸師'],
     '{"monday": {"start": "09:00", "end": "18:00"}, "tuesday": {"start": "09:00", "end": "18:00"}, "wednesday": {"start": "09:00", "end": "18:00"}, "thursday": {"start": "09:00", "end": "18:00"}, "friday": {"start": "09:00", "end": "18:00"}, "saturday": {"start": "09:00", "end": "17:00"}, "sunday": null}'::JSONB,
     NULL, true, true),
    ('佐藤先生', 'staff', 'ST002', ARRAY['鍼灸', 'カイロプラクティック'], ARRAY['鍼灸師'],
     '{"monday": {"start": "10:00", "end": "19:00"}, "tuesday": {"start": "10:00", "end": "19:00"}, "wednesday": {"start": "10:00", "end": "19:00"}, "thursday": {"start": "10:00", "end": "19:00"}, "friday": {"start": "10:00", "end": "19:00"}, "saturday": {"start": "10:00", "end": "18:00"}, "sunday": null}'::JSONB,
     NULL, true, true),
    ('鈴木先生', 'staff', 'ST003', ARRAY['整体', '保険診療'], ARRAY['柔道整復師'],
     '{"monday": {"start": "09:00", "end": "21:00"}, "tuesday": {"start": "09:00", "end": "21:00"}, "wednesday": {"start": "09:00", "end": "21:00"}, "thursday": {"start": "09:00", "end": "21:00"}, "friday": {"start": "09:00", "end": "21:00"}, "saturday": {"start": "09:00", "end": "21:00"}, "sunday": {"start": "10:00", "end": "18:00"}}'::JSONB,
     NULL, true, true)
ON CONFLICT DO NOTHING;

-- 施術室サンプルデータ
INSERT INTO public.resources (name, type, max_concurrent, is_active, is_bookable)
VALUES
    ('施術室A', 'room', 1, true, true),
    ('施術室B', 'room', 1, true, true),
    ('施術室C', 'room', 1, true, true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 完了メッセージ
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '予約管理システムのスキーマ作成が完了しました。';
    RAISE NOTICE 'テーブル: customers, menus, resources, reservations, blocks, reservation_history';
    RAISE NOTICE 'ビュー: reservation_list_view';
    RAISE NOTICE '関数: check_reservation_conflict, get_available_time_slots';
END $$;
