-- ================================================================
-- Phase 8: Role CHECK制約追加
-- ================================================================
-- 問題: user_permissions.role / profiles.role にCHECK制約がなく、
--       任意の文字列が入り得る。不正なロールがRLS判定をバイパスする
--       可能性がある。
-- 対応: 有効なロールのみ許可するCHECK制約を追加
-- 有効ロール: admin, clinic_admin, manager, therapist, staff
-- customer ロールは user_permissions には存在しない（顧客は別テーブル）
-- リスク: 中（既存データに不正ロールがあるとマイグレーション失敗）
-- ロールバック: ALTER TABLE ... DROP CONSTRAINT ...
-- ================================================================

BEGIN;

-- ================================================================
-- 1. 既存データの不正ロールチェック
-- ================================================================

DO $$
DECLARE
    invalid_count INTEGER;
    invalid_roles TEXT;
BEGIN
    -- user_permissions の不正ロールチェック
    SELECT count(*), string_agg(DISTINCT role, ', ')
    INTO invalid_count, invalid_roles
    FROM public.user_permissions
    WHERE role NOT IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff');

    IF invalid_count > 0 THEN
        RAISE WARNING 'user_permissions has % rows with invalid roles: %. Attempting to fix...', invalid_count, invalid_roles;

        -- clinic_manager → clinic_admin に修正（レガシーロール移行漏れ）
        UPDATE public.user_permissions
        SET role = 'clinic_admin'
        WHERE role = 'clinic_manager';

        -- それでも残る不正ロールがあればエラー
        SELECT count(*) INTO invalid_count
        FROM public.user_permissions
        WHERE role NOT IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff');

        IF invalid_count > 0 THEN
            RAISE EXCEPTION 'Cannot add CHECK constraint: user_permissions still has % rows with invalid roles', invalid_count;
        END IF;
    END IF;

    -- profiles の不正ロールチェック
    SELECT count(*), string_agg(DISTINCT role, ', ')
    INTO invalid_count, invalid_roles
    FROM public.profiles
    WHERE role IS NOT NULL
      AND role NOT IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff', 'customer');

    IF invalid_count > 0 THEN
        RAISE WARNING 'profiles has % rows with invalid roles: %. Attempting to fix...', invalid_count, invalid_roles;

        UPDATE public.profiles
        SET role = 'clinic_admin'
        WHERE role = 'clinic_manager';

        SELECT count(*) INTO invalid_count
        FROM public.profiles
        WHERE role IS NOT NULL
          AND role NOT IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff', 'customer');

        IF invalid_count > 0 THEN
            RAISE EXCEPTION 'Cannot add CHECK constraint: profiles still has % rows with invalid roles', invalid_count;
        END IF;
    END IF;
END $$;

-- ================================================================
-- 2. CHECK制約追加
-- ================================================================

-- user_permissions.role
ALTER TABLE public.user_permissions
    DROP CONSTRAINT IF EXISTS chk_user_permissions_valid_role;

ALTER TABLE public.user_permissions
    ADD CONSTRAINT chk_user_permissions_valid_role
    CHECK (role IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff'));

-- profiles.role（customerも含む）
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS chk_profiles_valid_role;

ALTER TABLE public.profiles
    ADD CONSTRAINT chk_profiles_valid_role
    CHECK (role IS NULL OR role IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff', 'customer'));

-- ================================================================
-- 3. コメント追加
-- ================================================================

COMMENT ON CONSTRAINT chk_user_permissions_valid_role ON public.user_permissions IS
'有効なロール: admin, clinic_admin, manager, therapist, staff。
clinic_manager は 20260109 で clinic_admin に移行済み。';

COMMENT ON CONSTRAINT chk_profiles_valid_role ON public.profiles IS
'有効なロール: admin, clinic_admin, manager, therapist, staff, customer。
NULL許可（プロフィール未設定状態）。';

COMMIT;
