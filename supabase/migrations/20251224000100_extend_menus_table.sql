-- =====================================================
-- Migration: Extend menus table for consolidation
-- Purpose: Add columns from treatment_menus to unified menus table
-- Date: 2024-12-24
-- =====================================================

BEGIN;

-- clinic_id追加（マルチテナント対応）
ALTER TABLE public.menus
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

-- treatment_menusから必要なカラム追加
ALTER TABLE public.menus
ADD COLUMN IF NOT EXISTS code VARCHAR(50),
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.menu_categories(id),
ADD COLUMN IF NOT EXISTS is_insurance_applicable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS body_parts TEXT[],
ADD COLUMN IF NOT EXISTS contraindications TEXT[],
ADD COLUMN IF NOT EXISTS treatment_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS max_sessions_per_day INTEGER,
ADD COLUMN IF NOT EXISTS required_qualifications TEXT[],
ADD COLUMN IF NOT EXISTS equipment_required TEXT[];

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_menus_clinic_id ON public.menus(clinic_id);
CREATE INDEX IF NOT EXISTS idx_menus_category_id ON public.menus(category_id);
CREATE INDEX IF NOT EXISTS idx_menus_code ON public.menus(code);
CREATE INDEX IF NOT EXISTS idx_menus_treatment_type ON public.menus(treatment_type);

-- clinic_id + code のユニーク制約（NULLを許容）
CREATE UNIQUE INDEX IF NOT EXISTS idx_menus_clinic_code_unique
ON public.menus(clinic_id, code)
WHERE code IS NOT NULL;

COMMENT ON COLUMN public.menus.clinic_id IS 'クリニックID（マルチテナント対応）';
COMMENT ON COLUMN public.menus.code IS '施術コード（クリニック内で一意）';
COMMENT ON COLUMN public.menus.category_id IS 'メニューカテゴリID';
COMMENT ON COLUMN public.menus.is_insurance_applicable IS '保険適用可否';
COMMENT ON COLUMN public.menus.body_parts IS '対象部位';
COMMENT ON COLUMN public.menus.contraindications IS '禁忌事項';
COMMENT ON COLUMN public.menus.treatment_type IS '施術タイプ';
COMMENT ON COLUMN public.menus.max_sessions_per_day IS '1日の最大施術回数';
COMMENT ON COLUMN public.menus.required_qualifications IS '必要資格';
COMMENT ON COLUMN public.menus.equipment_required IS '必要機器';

COMMIT;
