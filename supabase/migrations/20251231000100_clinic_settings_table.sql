-- ================================================================
-- 整骨院管理SaaS - 管理設定永続化
-- ================================================================
-- 作成日: 2025-12-31
-- 説明: クリニック設定の永続化テーブル定義・RLSポリシー
-- 参照: docs/管理設定永続化_MVP仕様書.md
-- ================================================================

-- ================================================================
-- 1. clinic_settings テーブル（設定永続化）
-- ================================================================
CREATE TABLE IF NOT EXISTS public.clinic_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    category TEXT NOT NULL
        CHECK (category IN (
            'clinic_basic',
            'clinic_hours',
            'booking_calendar',
            'communication',
            'system_security',
            'system_backup',
            'services_pricing',
            'insurance_billing',
            'data_management'
        )),
    settings JSONB NOT NULL DEFAULT '{}',
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- クリニックとカテゴリの組み合わせはユニーク
    UNIQUE(clinic_id, category)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_clinic_settings_clinic_id
    ON public.clinic_settings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_settings_category
    ON public.clinic_settings(category);
CREATE INDEX IF NOT EXISTS idx_clinic_settings_updated_at
    ON public.clinic_settings(updated_at DESC);

-- コメント
COMMENT ON TABLE public.clinic_settings IS 'クリニック設定永続化テーブル';
COMMENT ON COLUMN public.clinic_settings.clinic_id IS '設定が属するクリニックID';
COMMENT ON COLUMN public.clinic_settings.category IS '設定カテゴリ（clinic_basic, clinic_hours, booking_calendar, communication, system_security, system_backup, services_pricing, insurance_billing, data_management）';
COMMENT ON COLUMN public.clinic_settings.settings IS 'カテゴリごとの設定値（JSONB形式）';
COMMENT ON COLUMN public.clinic_settings.updated_by IS '最終更新者のユーザーID';

-- ================================================================
-- 2. トリガー：updated_at の自動更新
-- ================================================================
DROP TRIGGER IF EXISTS update_clinic_settings_updated_at ON public.clinic_settings;
CREATE TRIGGER update_clinic_settings_updated_at
    BEFORE UPDATE ON public.clinic_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- 3. RLS ポリシー
-- ================================================================

-- RLS有効化
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 参照ポリシー: 同一クリニックのメンバーは閲覧可能
-- ----------------------------------------------------------------
CREATE POLICY "clinic_settings_clinic_member_select"
    ON public.clinic_settings
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------
-- 作成ポリシー: admin/clinic_managerのみ作成可能
-- ----------------------------------------------------------------
CREATE POLICY "clinic_settings_admin_insert"
    ON public.clinic_settings
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

-- ----------------------------------------------------------------
-- 更新ポリシー: admin/clinic_managerのみ更新可能
-- ----------------------------------------------------------------
CREATE POLICY "clinic_settings_admin_update"
    ON public.clinic_settings
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    )
    WITH CHECK (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_manager', 'manager')
        )
    );

-- ----------------------------------------------------------------
-- 削除ポリシー: adminのみ削除可能（念のため）
-- ----------------------------------------------------------------
CREATE POLICY "clinic_settings_admin_delete"
    ON public.clinic_settings
    FOR DELETE
    USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- ================================================================
-- 4. 設定取得RPC関数（デフォルト値返却対応）
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_clinic_settings(
    p_clinic_id UUID,
    p_category TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings JSONB;
    v_default_settings JSONB;
BEGIN
    -- カテゴリ別のデフォルト値を定義
    v_default_settings := CASE p_category
        WHEN 'clinic_basic' THEN '{
            "name": "",
            "zipCode": "",
            "address": "",
            "phone": "",
            "fax": "",
            "email": "",
            "website": "",
            "description": "",
            "logoUrl": null
        }'::JSONB

        WHEN 'clinic_hours' THEN '{
            "hoursByDay": {},
            "holidays": [],
            "specialClosures": []
        }'::JSONB

        WHEN 'booking_calendar' THEN '{
            "slotMinutes": 30,
            "maxConcurrent": 3,
            "weekStartDay": 1,
            "allowOnlineBooking": false
        }'::JSONB

        WHEN 'communication' THEN '{
            "emailEnabled": false,
            "smsEnabled": false,
            "lineEnabled": false,
            "pushEnabled": false,
            "smtpSettings": {
                "host": "",
                "port": 587,
                "user": "",
                "password": ""
            },
            "templates": []
        }'::JSONB

        WHEN 'system_security' THEN '{
            "passwordPolicy": {
                "minLength": 8,
                "requireUppercase": true,
                "requireNumbers": true,
                "requireSymbols": false
            },
            "twoFactorEnabled": false,
            "sessionTimeout": 30,
            "loginAttempts": 5,
            "lockoutDuration": 15
        }'::JSONB

        WHEN 'system_backup' THEN '{
            "autoBackup": false,
            "backupFrequency": "daily",
            "backupTime": "03:00",
            "retentionDays": 30,
            "cloudStorage": false,
            "storageProvider": "aws"
        }'::JSONB

        WHEN 'services_pricing' THEN '{
            "menus": [],
            "categories": [],
            "insuranceOptions": []
        }'::JSONB

        WHEN 'insurance_billing' THEN '{
            "insuranceTypes": [],
            "receiptSettings": {},
            "billingCycle": "monthly"
        }'::JSONB

        WHEN 'data_management' THEN '{
            "importMode": "update",
            "exportFormat": "csv",
            "retentionDays": 365
        }'::JSONB

        ELSE '{}'::JSONB
    END;

    -- 保存済み設定を取得
    SELECT settings INTO v_settings
    FROM public.clinic_settings
    WHERE clinic_id = p_clinic_id AND category = p_category;

    -- 保存済み設定があればそれを返す、なければデフォルト値を返す
    RETURN COALESCE(v_settings, v_default_settings);
END;
$$;

COMMENT ON FUNCTION public.get_clinic_settings IS 'クリニック設定を取得（未登録時はデフォルト値を返す）';

-- ================================================================
-- 5. 設定保存RPC関数（upsert対応）
-- ================================================================

CREATE OR REPLACE FUNCTION public.upsert_clinic_settings(
    p_clinic_id UUID,
    p_category TEXT,
    p_settings JSONB,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result_id UUID;
BEGIN
    -- カテゴリのバリデーション
    IF p_category NOT IN (
        'clinic_basic',
        'clinic_hours',
        'booking_calendar',
        'communication',
        'system_security',
        'system_backup',
        'services_pricing',
        'insurance_billing',
        'data_management'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', '不正なカテゴリです');
    END IF;

    -- upsert実行
    INSERT INTO public.clinic_settings (clinic_id, category, settings, updated_by)
    VALUES (p_clinic_id, p_category, p_settings, p_user_id)
    ON CONFLICT (clinic_id, category)
    DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    RETURNING id INTO v_result_id;

    RETURN jsonb_build_object('success', true, 'id', v_result_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.upsert_clinic_settings IS 'クリニック設定を保存（upsert）';

-- ================================================================
-- 完了メッセージ
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'clinic_settingsテーブルの作成が完了しました。';
    RAISE NOTICE 'テーブル: clinic_settings';
    RAISE NOTICE 'RPC関数: get_clinic_settings, upsert_clinic_settings';
    RAISE NOTICE 'RLSポリシー: クリニックメンバー閲覧、管理者のみ更新';
END $$;
