-- ================================================================
-- Onboarding Parent-ID Support
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- Section: Onboarding parent_id assignment (Option 2)
--
-- Changes:
-- 1. Add p_parent_id parameter to create_clinic_with_admin()
-- 2. Set parent_id on newly created clinics
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Update create_clinic_with_admin() to support p_parent_id
-- ================================================================
-- Original function signature:
--   create_clinic_with_admin(p_name, p_address, p_phone_number, p_opening_date)
-- Updated function signature:
--   create_clinic_with_admin(p_name, p_address, p_phone_number, p_opening_date, p_parent_id)

DROP FUNCTION IF EXISTS public.create_clinic_with_admin(TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.create_clinic_with_admin(
    p_name TEXT,
    p_address TEXT DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL,
    p_opening_date DATE DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_clinic_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
    END IF;

    -- Get user's email address
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- Validate parent_id if provided
    IF p_parent_id IS NOT NULL THEN
        PERFORM 1 FROM public.clinics WHERE id = p_parent_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', '親クリニックが見つかりません');
        END IF;
    END IF;

    -- 1. Create clinic (with parent_id if provided)
    INSERT INTO public.clinics (name, address, phone_number, opening_date, parent_id, is_active)
    VALUES (p_name, p_address, p_phone_number, p_opening_date, p_parent_id, true)
    RETURNING id INTO v_clinic_id;

    -- 2. Update profile
    UPDATE public.profiles
    SET clinic_id = v_clinic_id, role = 'admin', updated_at = NOW()
    WHERE user_id = v_user_id;

    -- 3. Create/update user_permissions
    INSERT INTO public.user_permissions (staff_id, clinic_id, role, username, hashed_password)
    VALUES (v_user_id, v_clinic_id, 'admin', COALESCE(v_user_email, ''), 'managed_by_supabase')
    ON CONFLICT (staff_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role;

    -- 4. Update onboarding state
    INSERT INTO public.onboarding_states (user_id, clinic_id, current_step)
    VALUES (v_user_id, v_clinic_id, 'invites')
    ON CONFLICT (user_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, current_step = 'invites', updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'clinic_id', v_clinic_id,
        'parent_id', p_parent_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.create_clinic_with_admin(TEXT, TEXT, TEXT, DATE, UUID) IS
'Creates a clinic with the current user as admin.
p_parent_id: Optional parent clinic ID for parent-child hierarchy.
When parent_id is set, the clinic becomes a child of the specified parent organization.
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md';

COMMIT;

-- ================================================================
-- Notes
-- ================================================================
-- The clinics.parent_id column must exist (from 20260112000100_add_clinics_parent_id.sql)
-- If parent_id column does not exist, this migration will fail.
-- ================================================================
