-- ================================================================
-- Migration: replace clinic_manager in RLS policies and constraints
-- ================================================================
-- Spec: docs/stabilization/spec-auth-role-alignment-v0.1.md (Phase 3.6)
-- DoD: DOD-08 (Role checks are consistent across middleware, guards, and API)
--
-- Purpose: Replace clinic_manager -> clinic_admin in remaining RLS policies
-- and staff_invites role check constraint.
-- Scope: clinic_settings, staff_invites, staff_shifts, staff_preferences.
-- ================================================================

BEGIN;

-- ================================================================
-- 1. clinic_settings RLS policies
-- Source: 20251231000200_clinic_settings_rls_fix.sql
-- ================================================================
DROP POLICY IF EXISTS "clinic_settings_admin_insert" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_admin_update" ON public.clinic_settings;

CREATE POLICY "clinic_settings_admin_insert"
    ON public.clinic_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

CREATE POLICY "clinic_settings_admin_update"
    ON public.clinic_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_admin', 'manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = clinic_id
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = clinic_id
            AND up.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

-- ================================================================
-- 2. staff_invites policy and role check constraint
-- Source: 20251225000100_onboarding_tables.sql
-- ================================================================
DROP POLICY IF EXISTS "staff_invites_clinic_admin_select" ON public.staff_invites;

CREATE POLICY "staff_invites_clinic_admin_select"
    ON public.staff_invites
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

ALTER TABLE public.staff_invites DROP CONSTRAINT IF EXISTS staff_invites_role_check;
ALTER TABLE public.staff_invites ADD CONSTRAINT staff_invites_role_check
    CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'));

-- ================================================================
-- 3. staff_shifts policies
-- Source: 20251231000101_staff_shifts_preferences.sql
-- ================================================================
DROP POLICY IF EXISTS "staff_shifts_insert_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_update_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_delete_policy" ON public.staff_shifts;

CREATE POLICY "staff_shifts_insert_policy" ON public.staff_shifts
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT COALESCE(
                (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::UUID,
                up.clinic_id
            )
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
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
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
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
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

-- ================================================================
-- 4. staff_preferences policies
-- Source: 20251231000101_staff_shifts_preferences.sql
-- ================================================================
DROP POLICY IF EXISTS "staff_preferences_update_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_delete_policy" ON public.staff_preferences;

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
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
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
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role = 'admin'
        )
    );

COMMIT;

-- ================================================================
-- Post-Migration Verification (run manually after migration)
-- ================================================================
--
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE qual ILIKE '%clinic_manager%'
--    OR with_check ILIKE '%clinic_manager%';
-- -- Expected: 0 rows
--
-- SELECT
--   tc.table_name,
--   cc.constraint_name,
--   cc.check_clause
-- FROM information_schema.check_constraints cc
-- JOIN information_schema.table_constraints tc
--   ON cc.constraint_name = tc.constraint_name
--   AND cc.constraint_schema = tc.constraint_schema
-- WHERE cc.check_clause ILIKE '%clinic_manager%';
-- -- Expected: 0 rows
-- ================================================================

-- ================================================================
-- ROLLBACK PLAN (if needed)
-- ================================================================
-- Note: Use Point-in-Time Recovery for full rollback.
-- For manual rollback, replace clinic_admin back to clinic_manager:
--
-- 1) Recreate policies with clinic_manager in role arrays.
-- 2) Restore staff_invites_role_check with clinic_manager.
-- ================================================================
