-- ================================================================
-- RLS: clinics / user_permissions Parent-Scope Alignment
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- Section: 追加修正作業３
--
-- Changes:
-- 1. clinics_admin_select → can_access_clinic(id) に変更
-- 2. clinics_admin_insert → can_access_clinic(parent_id) に変更（新規作成時はparent_idで判定）
-- 3. clinics_admin_update → can_access_clinic(id) に変更
-- 4. user_permissions_admin_manage → can_access_clinic(clinic_id) に変更
-- 5. custom_access_token_hook → parent_id IS NULL の場合の処理を修正
--
-- Purpose: admin bypass を廃止し、admin も clinic_scope_ids の範囲内のみ許可
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Drop existing clinics admin policies
-- ================================================================

DROP POLICY IF EXISTS "clinics_admin_select" ON public.clinics;
DROP POLICY IF EXISTS "clinics_admin_insert" ON public.clinics;
DROP POLICY IF EXISTS "clinics_admin_update" ON public.clinics;

-- ================================================================
-- 2. Create new clinics admin policies with parent-scope
-- ================================================================

-- admin: スコープ内のclinicsのみ閲覧可能（親スコープ）
-- NOTE: can_access_clinic(id) でスコープチェック
CREATE POLICY "clinics_admin_select"
    ON public.clinics
    FOR SELECT
    USING (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND public.can_access_clinic(id)
    );

-- admin: スコープ内でのみclinic作成が可能
-- NOTE: 新規作成時はidがまだ存在しないため、parent_idでスコープチェック
-- parent_id が NULL の場合は HQ 作成なので、自分自身の clinic_id と一致するか確認
CREATE POLICY "clinics_admin_insert"
    ON public.clinics
    FOR INSERT
    WITH CHECK (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND (
            -- 子クリニック作成: parent_idがスコープ内
            (parent_id IS NOT NULL AND public.can_access_clinic(parent_id))
            -- HQ作成: admin のみ許可（新規親組織として自分自身がスコープになる想定）
            OR (parent_id IS NULL AND public.jwt_is_admin())
        )
    );

-- admin: スコープ内のclinicsのみ更新可能
CREATE POLICY "clinics_admin_update"
    ON public.clinics
    FOR UPDATE
    USING (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND public.can_access_clinic(id)
    )
    WITH CHECK (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND public.can_access_clinic(id)
    );

-- ================================================================
-- 3. Drop existing user_permissions admin policy
-- ================================================================

DROP POLICY IF EXISTS "user_permissions_admin_manage" ON public.user_permissions;

-- ================================================================
-- 4. Create new user_permissions admin policy with parent-scope
-- ================================================================

-- admin: スコープ内のuser_permissionsのみ管理可能
CREATE POLICY "user_permissions_admin_manage"
    ON public.user_permissions
    FOR ALL
    USING (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND public.can_access_clinic(clinic_id)
    )
    WITH CHECK (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND public.can_access_clinic(clinic_id)
    );

-- ================================================================
-- 5. Update custom_access_token_hook for parent_id IS NULL case
-- ================================================================
-- When clinic has parent_id IS NULL (HQ):
-- - HQ is considered its own parent
-- - scope_ids should include the HQ itself and all its children

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
    claims jsonb;
    user_clinic_id uuid;
    user_role_val text;
    parent_clinic_id uuid;
    scope_ids uuid[];
    has_parent_id_column boolean;
BEGIN
    claims := event->'claims';

    -- Get user's clinic_id and role from user_permissions
    SELECT up.clinic_id, up.role INTO user_clinic_id, user_role_val
    FROM public.user_permissions up
    WHERE up.staff_id = (event->>'user_id')::uuid
    LIMIT 1;

    -- Add clinic_id claim if found
    IF user_clinic_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{clinic_id}', to_jsonb(user_clinic_id));
    END IF;

    -- Add user_role claim if found
    IF user_role_val IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val));
    END IF;

    -- Build clinic_scope_ids array
    IF user_clinic_id IS NOT NULL THEN
        -- Check if parent_id column exists
        SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'clinics'
              AND column_name = 'parent_id'
        ) INTO has_parent_id_column;

        IF has_parent_id_column THEN
            -- Get parent organization ID
            EXECUTE format(
                'SELECT parent_id FROM public.clinics WHERE id = $1'
            ) INTO parent_clinic_id USING user_clinic_id;

            IF parent_clinic_id IS NOT NULL THEN
                -- User's clinic has a parent: get all sibling clinic IDs under the same parent
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING parent_clinic_id;
            ELSE
                -- User's clinic has parent_id IS NULL (HQ case)
                -- HQ is its own parent: get HQ itself + all children
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING user_clinic_id;
            END IF;
        ELSE
            -- No parent_id column: use single clinic
            scope_ids := ARRAY[user_clinic_id];
        END IF;

        -- Ensure scope_ids is not NULL
        IF scope_ids IS NULL THEN
            scope_ids := ARRAY[user_clinic_id];
        END IF;
    END IF;

    -- Add clinic_scope_ids claim if we have scope
    IF scope_ids IS NOT NULL AND array_length(scope_ids, 1) > 0 THEN
        claims := jsonb_set(claims, '{clinic_scope_ids}', to_jsonb(scope_ids));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure supabase_auth_admin can execute the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
'Supabase Auth hook to include clinic_id, user_role, and clinic_scope_ids in JWT claims.
clinic_scope_ids contains all clinics under the same parent organization (sibling access).
When parent_id IS NULL (HQ), the clinic is considered its own parent - scope includes itself + all children.
Configure in Supabase Dashboard -> Auth -> Hooks -> Customize Access Token.
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md (追加修正作業３)';

COMMIT;

-- ================================================================
-- Verification Query
-- ================================================================
-- Run this to verify the policies are correctly updated:
--
-- SELECT tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='public'
--   AND tablename IN ('clinics', 'user_permissions');
--
-- Expected: qual/with_check に can_access_clinic が含まれる
-- ================================================================
