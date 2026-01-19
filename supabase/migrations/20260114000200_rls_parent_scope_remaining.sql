-- ================================================================
-- RLS Parent-Scope Alignment: Remaining Tables
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- Section: 追加修正作業（引き継ぎ / Next Steps）
--
-- Changes:
-- 1. clinic_settings: Replace profiles-based RLS with can_access_clinic
-- 2. staff_shifts: Replace user_permissions-based RLS with can_access_clinic
-- 3. staff_preferences: Replace user_permissions-based RLS with can_access_clinic
-- 4. menus_select_public: Remove (public access via server API gateway)
-- ================================================================

BEGIN;

-- ================================================================
-- 1. clinic_settings: Unify RLS to can_access_clinic
-- ================================================================

DROP POLICY IF EXISTS "clinic_settings_clinic_member_select" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_insert" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_update" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_delete" ON public.clinic_settings;

-- SELECT: All staff roles in scope can read settings
CREATE POLICY "clinic_settings_select"
ON public.clinic_settings FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- INSERT: Admin/managers in scope can create settings
CREATE POLICY "clinic_settings_insert"
ON public.clinic_settings FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- UPDATE: Admin/managers in scope can update settings
CREATE POLICY "clinic_settings_update"
ON public.clinic_settings FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- DELETE: Admin in scope can delete settings
CREATE POLICY "clinic_settings_delete"
ON public.clinic_settings FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 2. staff_shifts: Unify RLS to can_access_clinic
-- ================================================================

DROP POLICY IF EXISTS "staff_shifts_select_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_insert_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_update_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_delete_policy" ON public.staff_shifts;

-- SELECT: All staff roles in scope can read shifts
CREATE POLICY "staff_shifts_select"
ON public.staff_shifts FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- INSERT: Admin/managers in scope can create shifts
CREATE POLICY "staff_shifts_insert"
ON public.staff_shifts FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- UPDATE: Admin/managers in scope can update shifts
CREATE POLICY "staff_shifts_update"
ON public.staff_shifts FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- DELETE: Admin/managers in scope can delete shifts
CREATE POLICY "staff_shifts_delete"
ON public.staff_shifts FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 3. staff_preferences: Unify RLS to can_access_clinic
-- ================================================================

DROP POLICY IF EXISTS "staff_preferences_select_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_insert_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_update_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_delete_policy" ON public.staff_preferences;

-- SELECT: All staff roles in scope can read preferences
CREATE POLICY "staff_preferences_select"
ON public.staff_preferences FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- INSERT: Staff can create their own preferences in their clinic scope
CREATE POLICY "staff_preferences_insert"
ON public.staff_preferences FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

-- UPDATE: Staff can update their own preferences OR admin/manager can update any
CREATE POLICY "staff_preferences_update"
ON public.staff_preferences FOR UPDATE
USING (
    public.can_access_clinic(clinic_id)
    AND (
        -- Own preferences (staff can update their own)
        staff_id = auth.uid()
        -- OR admin/manager can update any in scope
        OR public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    )
);

-- DELETE: Admin/managers in scope can delete preferences
CREATE POLICY "staff_preferences_delete"
ON public.staff_preferences FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 4. menus_select_public: Remove anonymous public access
-- ================================================================
-- Per spec: Customer operations go through server API gateway (non-auth)
-- Public access is handled by GET /api/public/menus with service role
-- menus_select_public allowed cross-tenant menu visibility - security risk

DROP POLICY IF EXISTS "menus_select_public" ON public.menus;

-- Note: Staff-level access remains via menus_select_for_staff policy
-- @see 20260111000200_rls_parent_scope_alignment.sql

COMMIT;

-- ================================================================
-- Post-Migration Verification
-- ================================================================
-- SELECT policyname FROM pg_policies
-- WHERE tablename IN ('clinic_settings', 'staff_shifts', 'staff_preferences', 'menus')
-- ORDER BY tablename, policyname;
--
-- Expected policies:
-- - clinic_settings: clinic_settings_select, _insert, _update, _delete
-- - staff_shifts: staff_shifts_select, _insert, _update, _delete
-- - staff_preferences: staff_preferences_select, _insert, _update, _delete
-- - menus: menus_select_for_staff, _insert_for_managers, _update_for_managers, _delete_for_admin
-- ================================================================
