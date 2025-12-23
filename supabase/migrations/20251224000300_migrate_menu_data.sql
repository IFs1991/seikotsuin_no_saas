-- =====================================================
-- Migration: Migrate menu data and consolidate tables
-- Purpose: Migrate data from master_treatment_menus and treatment_menus to unified menus
-- Date: 2024-12-24
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: master_treatment_menus からのデータ移行
-- =====================================================

-- master_treatment_menusのデータをmenusに移行
-- clinic_id は NULL（グローバルメニュー）として扱う
INSERT INTO public.menus (
    name,
    description,
    price,
    duration_minutes,
    is_active,
    created_at,
    updated_at
)
SELECT
    mtm.name,
    mtm.description,
    mtm.price,
    30,  -- デフォルト30分
    mtm.is_active,
    mtm.created_at,
    mtm.updated_at
FROM public.master_treatment_menus mtm
WHERE NOT EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.name = mtm.name AND m.clinic_id IS NULL
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Step 2: treatment_menus からのデータ移行
-- =====================================================

-- treatment_menusのデータをmenusに移行
INSERT INTO public.menus (
    clinic_id,
    code,
    name,
    description,
    price,
    duration_minutes,
    category_id,
    insurance_points,
    is_insurance_applicable,
    body_parts,
    contraindications,
    treatment_type,
    max_sessions_per_day,
    required_qualifications,
    equipment_required,
    display_order,
    is_active,
    created_at,
    updated_at
)
SELECT
    tm.clinic_id,
    tm.code,
    tm.name,
    tm.description,
    tm.price,
    COALESCE(tm.duration_minutes, 30),
    tm.category_id,
    tm.insurance_points,
    tm.is_insurance_applicable,
    tm.body_parts,
    tm.contraindications,
    tm.treatment_type,
    tm.max_sessions_per_day,
    tm.required_qualifications,
    tm.equipment_required,
    tm.display_order,
    tm.is_active,
    tm.created_at,
    tm.updated_at
FROM public.treatment_menus tm
WHERE NOT EXISTS (
    SELECT 1 FROM public.menus m
    WHERE COALESCE(m.clinic_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(tm.clinic_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND m.name = tm.name
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Step 3: FK参照の更新 - revenues テーブル
-- =====================================================

-- revenues.treatment_menu_id を menus.id に対応させる
-- 新しいカラムを追加（menu_id）
ALTER TABLE public.revenues
ADD COLUMN IF NOT EXISTS menu_id UUID;

-- 既存のtreatment_menu_id から menu_id を紐づけ
-- master_treatment_menus の name を使って menus から検索
UPDATE public.revenues r
SET menu_id = (
    SELECT m.id FROM public.menus m
    INNER JOIN public.master_treatment_menus mtm ON mtm.name = m.name
    WHERE mtm.id = r.treatment_menu_id
    LIMIT 1
)
WHERE r.treatment_menu_id IS NOT NULL AND r.menu_id IS NULL;

-- FK制約追加
ALTER TABLE public.revenues
ADD CONSTRAINT revenues_menu_id_fkey
FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_revenues_menu_id ON public.revenues(menu_id);

-- =====================================================
-- Step 4: FK参照の更新 - treatment_menu_records テーブル
-- =====================================================

-- treatment_menu_records が存在する場合のみ処理
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'treatment_menu_records'
    ) THEN
        -- 既存のmenu_idを新しいmenusテーブルのIDに更新
        -- treatment_menus の name と clinic_id を使って menus から検索
        UPDATE public.treatment_menu_records tmr
        SET menu_id = (
            SELECT m.id FROM public.menus m
            INNER JOIN public.treatment_menus tm ON tm.name = m.name
                AND COALESCE(tm.clinic_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(m.clinic_id, '00000000-0000-0000-0000-000000000000'::uuid)
            WHERE tm.id = tmr.menu_id
            LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM public.treatment_menus tm WHERE tm.id = tmr.menu_id
        );

        -- FK制約を削除して再作成
        ALTER TABLE public.treatment_menu_records
        DROP CONSTRAINT IF EXISTS treatment_menu_records_menu_id_fkey;

        ALTER TABLE public.treatment_menu_records
        ADD CONSTRAINT treatment_menu_records_menu_id_fkey
        FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- =====================================================
-- Step 5: 旧テーブルの削除
-- =====================================================

-- 旧テーブルのFK制約を先に削除
ALTER TABLE public.revenues
DROP CONSTRAINT IF EXISTS revenues_treatment_menu_id_fkey;

-- 旧カラムを削除（オプション - データを残したい場合はコメントアウト）
-- ALTER TABLE public.revenues DROP COLUMN IF EXISTS treatment_menu_id;

-- 旧テーブルを削除
DROP TABLE IF EXISTS public.master_treatment_menus CASCADE;
DROP TABLE IF EXISTS public.treatment_menus CASCADE;

-- =====================================================
-- Step 6: コメント追加
-- =====================================================

COMMENT ON COLUMN public.revenues.menu_id IS '統合後のメニューID（menusテーブル参照）';

COMMIT;
