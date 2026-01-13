-- ================================================================
-- 認証ヘルパー関数とRLSポリシー統一
-- ================================================================
-- 作成日: 2025-12-24
-- 説明: user_permissions を権限の正としてRLSポリシーを統一
-- 参照: tenant_hq_clinic_plan_v1.yml (auth_and_claims, rls_design)
-- 注意: auth スキーマへの直接書き込みは権限がないため public に作成

-- ================================================================
-- 1. 認証ヘルパー関数の作成（public スキーマ）
-- ================================================================

-- 現在のユーザーのロールを取得（user_permissions を参照）
-- 優先順位: 1. JWT app_metadata (user_role) 2. JWT claims (role) 3. user_permissions テーブル
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS TEXT AS $$
DECLARE
    jwt_role TEXT;
    jwt_role_legacy TEXT;
    db_role TEXT;
BEGIN
    -- 1. JWT app_metadata から user_role を取得（新方式）
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::json->>'user_role';
        IF jwt_role IS NOT NULL AND jwt_role != '' THEN
            RETURN jwt_role;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 2. JWT claims から role を取得（予約システム互換）
    BEGIN
        jwt_role_legacy := current_setting('request.jwt.claims', true)::json->>'role';
        IF jwt_role_legacy IS NOT NULL AND jwt_role_legacy != '' THEN
            RETURN jwt_role_legacy;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. user_permissions テーブルからフォールバック
    SELECT role INTO db_role
    FROM public.user_permissions
    WHERE staff_id = auth.uid()
    LIMIT 1;

    -- 4. 見つからない場合は最小権限（空文字列）
    RETURN COALESCE(db_role, '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 現在のユーザーの clinic_id を取得（user_permissions を参照）
CREATE OR REPLACE FUNCTION public.get_current_clinic_id()
RETURNS UUID AS $$
DECLARE
    jwt_clinic_id UUID;
    db_clinic_id UUID;
BEGIN
    -- 1. JWT app_metadata から取得を試みる
    BEGIN
        jwt_clinic_id := (current_setting('request.jwt.claims', true)::json->>'clinic_id')::UUID;
        IF jwt_clinic_id IS NOT NULL THEN
            RETURN jwt_clinic_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- JWT取得失敗時は継続
    END;

    -- 2. user_permissions テーブルからフォールバック
    SELECT clinic_id INTO db_clinic_id
    FROM public.user_permissions
    WHERE staff_id = auth.uid()
    LIMIT 1;

    RETURN db_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ユーザーがadminかどうかを判定
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_current_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ユーザーが指定されたclinicに所属しているか判定
CREATE OR REPLACE FUNCTION public.belongs_to_clinic(target_clinic_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- adminは全てのclinicにアクセス可能
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;

    RETURN public.get_current_clinic_id() = target_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ================================================================
-- 2. 既存RLSポリシーの削除
-- ================================================================

-- clinics テーブルのポリシー削除
DROP POLICY IF EXISTS "clinics_admin_select" ON public.clinics;
DROP POLICY IF EXISTS "clinics_own_select" ON public.clinics;
DROP POLICY IF EXISTS "clinics_admin_insert" ON public.clinics;
DROP POLICY IF EXISTS "clinics_admin_update" ON public.clinics;

-- user_permissions テーブルのポリシー削除
DROP POLICY IF EXISTS "user_permissions_admin_manage" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_self_select" ON public.user_permissions;

-- ================================================================
-- 3. 新しいRLSポリシーの作成（user_permissions ベース）
-- ================================================================

-- -----------------------------------------------------------------
-- clinics テーブル
-- -----------------------------------------------------------------

-- admin: 全clinicsを閲覧可能
CREATE POLICY "clinics_admin_select"
    ON public.clinics
    FOR SELECT
    USING (public.is_admin());

-- 非admin: 自分のclinicのみ閲覧可能
CREATE POLICY "clinics_own_select"
    ON public.clinics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
              AND up.clinic_id = clinics.id
        )
    );

-- admin: clinicsの作成が可能
CREATE POLICY "clinics_admin_insert"
    ON public.clinics
    FOR INSERT
    WITH CHECK (public.is_admin());

-- admin: clinicsの更新が可能
CREATE POLICY "clinics_admin_update"
    ON public.clinics
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------
-- user_permissions テーブル
-- -----------------------------------------------------------------

-- admin: 全権限を管理可能
CREATE POLICY "user_permissions_admin_manage"
    ON public.user_permissions
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 一般ユーザー: 自分の権限のみ閲覧可能
CREATE POLICY "user_permissions_self_select"
    ON public.user_permissions
    FOR SELECT
    USING (staff_id = auth.uid());

-- ================================================================
-- 4. コメント追加（ドキュメント用）
-- ================================================================

COMMENT ON FUNCTION public.get_current_role() IS
'現在のユーザーのロールを取得。優先順位: JWT app_metadata > user_permissions テーブル。
見つからない場合は空文字列を返す（最小権限原則）。';

COMMENT ON FUNCTION public.get_current_clinic_id() IS
'現在のユーザーの所属clinic_idを取得。優先順位: JWT app_metadata > user_permissions テーブル。
adminユーザーはNULLを返す可能性がある。';

COMMENT ON FUNCTION public.is_admin() IS
'現在のユーザーがadminロールかどうかを判定。';

COMMENT ON FUNCTION public.belongs_to_clinic(UUID) IS
'ユーザーが指定されたclinicに所属しているか判定。adminは常にTRUEを返す。';

-- ================================================================
-- 5. public.user_role() の統一（予約システム互換）
-- ================================================================
-- 既存の public.user_role() を public.get_current_role() のエイリアスに更新
-- これにより、予約システムのRLSポリシーも user_permissions ベースになる

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
DECLARE
    user_role_val TEXT;
BEGIN
    -- public.get_current_role() に委譲（統一されたロール判定）
    -- 予約システム互換: 空文字列の場合は 'anon' を返す
    user_role_val := public.get_current_role();
    IF user_role_val IS NULL OR user_role_val = '' THEN
        RETURN 'anon';
    END IF;
    RETURN user_role_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.user_role() IS
'現在のユーザーのロールを取得（予約システム互換）。
public.get_current_role() のラッパー。ロールが見つからない場合は "anon" を返す。';

-- ================================================================
-- 6. 権限付与
-- ================================================================

GRANT EXECUTE ON FUNCTION public.get_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.belongs_to_clinic(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO anon;
