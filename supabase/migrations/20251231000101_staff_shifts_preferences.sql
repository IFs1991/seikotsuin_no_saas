-- シフト最適化実データ化: staff_shifts と staff_preferences テーブル作成
-- 仕様書: docs/シフト最適化実データ化_MVP仕様書.md

-- staff_shifts テーブル: スタッフのシフトデータ
CREATE TABLE IF NOT EXISTS public.staff_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'confirmed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_shift_time CHECK (end_time > start_time)
);

-- staff_preferences テーブル: スタッフの希望データ
CREATE TABLE IF NOT EXISTS public.staff_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    preference_text TEXT NOT NULL,
    preference_type VARCHAR(50) DEFAULT 'general' CHECK (preference_type IN ('general', 'day_off', 'time_preference', 'shift_pattern')),
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_preference_period CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_staff_shifts_clinic_id ON public.staff_shifts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_id ON public.staff_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_start_time ON public.staff_shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_status ON public.staff_shifts(status);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_clinic_time ON public.staff_shifts(clinic_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_staff_preferences_clinic_id ON public.staff_preferences(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_preferences_staff_id ON public.staff_preferences(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_preferences_active ON public.staff_preferences(is_active) WHERE is_active = TRUE;

-- updated_at 自動更新用トリガー関数（存在しない場合のみ作成）
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー作成
DROP TRIGGER IF EXISTS update_staff_shifts_updated_at ON public.staff_shifts;
CREATE TRIGGER update_staff_shifts_updated_at
    BEFORE UPDATE ON public.staff_shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_preferences_updated_at ON public.staff_preferences;
CREATE TRIGGER update_staff_preferences_updated_at
    BEFORE UPDATE ON public.staff_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (Row Level Security) ポリシー
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_preferences ENABLE ROW LEVEL SECURITY;

-- staff_shifts RLS ポリシー
CREATE POLICY "staff_shifts_select_policy" ON public.staff_shifts
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_shifts_insert_policy" ON public.staff_shifts
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_shifts_update_policy" ON public.staff_shifts
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_shifts_delete_policy" ON public.staff_shifts
    FOR DELETE
    USING (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

-- staff_preferences RLS ポリシー
CREATE POLICY "staff_preferences_select_policy" ON public.staff_preferences
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_preferences_insert_policy" ON public.staff_preferences
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_preferences_update_policy" ON public.staff_preferences
    FOR UPDATE
    USING (
        (staff_id = auth.uid())
        OR clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

CREATE POLICY "staff_preferences_delete_policy" ON public.staff_preferences
    FOR DELETE
    USING (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

-- コメント追加
COMMENT ON TABLE public.staff_shifts IS 'スタッフのシフトデータを管理するテーブル';
COMMENT ON COLUMN public.staff_shifts.status IS 'シフトのステータス: draft=下書き, proposed=提案中, confirmed=確定, cancelled=キャンセル';

COMMENT ON TABLE public.staff_preferences IS 'スタッフの勤務希望データを管理するテーブル';
COMMENT ON COLUMN public.staff_preferences.preference_type IS '希望の種類: general=一般, day_off=休日希望, time_preference=時間帯希望, shift_pattern=勤務パターン希望';
COMMENT ON COLUMN public.staff_preferences.priority IS '希望の優先度: 1=低, 5=高';
