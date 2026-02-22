-- ================================================================
-- Phase 1: Legacy Tables Deprecation
-- ================================================================
-- 目的: 旧テーブル（staff, patients, master_treatment_menus, appointments）に
--       LEGACYマークを付与し、新規INSERTを禁止する。
--       新規開発では resources/customers/menus/reservations を SSOT とする。
-- リスク: 低（コメント追加 + INSERTポリシー追加のみ）
-- ロールバック: コメント削除 + ポリシーDROP
-- ================================================================

BEGIN;

-- ================================================================
-- 1. LEGACYコメント追加
-- ================================================================

COMMENT ON TABLE public.staff IS
'[LEGACY] 旧スタッフテーブル。新規開発では resources (type=''staff'') を使用すること。
統合マイグレーションまで読み取り専用として維持。';

COMMENT ON TABLE public.patients IS
'[LEGACY] 旧患者テーブル。新規開発では customers を使用すること。
統合マイグレーションまで読み取り専用として維持。';

DO $$
BEGIN
    IF to_regclass('public.master_treatment_menus') IS NOT NULL THEN
        COMMENT ON TABLE public.master_treatment_menus IS
        '[LEGACY] 旧施術メニューテーブル。新規開発では menus を使用すること。
統合マイグレーションまで読み取り専用として維持。';
    ELSE
        RAISE WARNING 'Table public.master_treatment_menus does not exist. Skipping legacy comment.';
    END IF;
END $$;

COMMENT ON TABLE public.appointments IS
'[LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。
新規開発では reservations を使用すること。最終的にDROP予定。';

-- ================================================================
-- 2. 新規INSERT禁止RLSポリシー
-- ================================================================
-- appointments は既に Read-Only 化済みのため対象外

-- staff: 新規INSERT禁止（service_roleのみ許可）
DROP POLICY IF EXISTS "staff_insert_legacy_block" ON public.staff;
DROP POLICY IF EXISTS "staff_insert_for_staff" ON public.staff;

CREATE POLICY "staff_insert_legacy_block"
ON public.staff FOR INSERT
WITH CHECK (
    -- service_role のみ許可（データ移行用）
    auth.role() = 'service_role'
);

-- patients: 新規INSERT禁止（service_roleのみ許可）
DROP POLICY IF EXISTS "patients_insert_legacy_block" ON public.patients;
DROP POLICY IF EXISTS "patients_insert_for_staff" ON public.patients;

CREATE POLICY "patients_insert_legacy_block"
ON public.patients FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
);

-- master_treatment_menus: RLS有効化 + 新規INSERT禁止（存在時のみ）
DO $$
BEGIN
    IF to_regclass('public.master_treatment_menus') IS NOT NULL THEN
        ALTER TABLE public.master_treatment_menus ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "master_treatment_menus_insert_legacy_block" ON public.master_treatment_menus;

        CREATE POLICY "master_treatment_menus_insert_legacy_block"
        ON public.master_treatment_menus FOR INSERT
        WITH CHECK (
            auth.role() = 'service_role'
        );

        -- master_treatment_menus: SELECT は認証済みスタッフに許可（読み取りのみ）
        -- 注意: このテーブルには clinic_id カラムが存在しないため、
        --       テナント境界チェック（can_access_clinic）は適用不可。
        --       参照のみ許可し、新規INSERT はブロック済み。
        DROP POLICY IF EXISTS "master_treatment_menus_select_for_staff" ON public.master_treatment_menus;

        CREATE POLICY "master_treatment_menus_select_for_staff"
        ON public.master_treatment_menus FOR SELECT
        USING (
            public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
        );
    ELSE
        RAISE WARNING 'Table public.master_treatment_menus does not exist. Skipping legacy RLS policies.';
    END IF;
END $$;

COMMIT;
