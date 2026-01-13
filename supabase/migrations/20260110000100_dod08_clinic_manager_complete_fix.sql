-- ================================================================
-- DOD-08 Complete Fix: clinic_manager → clinic_admin
-- ================================================================
-- Spec: docs/stabilization/spec-auth-role-alignment-v0.1.md (Phase 3.5-3.7)
-- DoD: DOD-08 (Role checks are consistent across middleware, guards, and API)
--
-- Purpose: Complete the clinic_manager migration by covering:
--   1. auth.users.raw_app_meta_data (role/user_role keys)
--   2. auth.users.raw_user_meta_data.user_role key
--   3. RLS policies in clinic_settings, staff_shifts/preferences, invitations, mfa tables
--
-- Dependency: 20260109000100_migrate_clinic_manager_to_clinic_admin.sql
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Complete auth.users migration (missing from original migration)
-- ================================================================

-- 1a. raw_app_meta_data の role を更新
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{role}',
    '"clinic_admin"'
)
WHERE raw_app_meta_data->>'role' = 'clinic_manager';

-- 1b. raw_app_meta_data の user_role を更新
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{user_role}',
    '"clinic_admin"'
)
WHERE raw_app_meta_data->>'user_role' = 'clinic_manager';

-- 1c. raw_user_meta_data の user_role を更新
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{user_role}',
    '"clinic_admin"'
)
WHERE raw_user_meta_data->>'user_role' = 'clinic_manager';

-- ================================================================
-- 2. Fix RLS policies in clinic_settings table
-- ================================================================
-- Source: 20251231000200_clinic_settings_rls_fix.sql

DROP POLICY IF EXISTS "clinic_settings_select_policy" ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_upsert_policy" ON public.clinic_settings;

-- Recreate with clinic_admin instead of clinic_manager
CREATE POLICY "clinic_settings_select_policy" ON public.clinic_settings
    FOR SELECT USING (
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

CREATE POLICY "clinic_settings_upsert_policy" ON public.clinic_settings
    FOR ALL USING (
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
-- 3. Fix RLS policies in staff_shifts table
-- ================================================================
-- Source: 20251231000101_staff_shifts_preferences.sql

DROP POLICY IF EXISTS "staff_shifts_select_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_insert_policy" ON public.staff_shifts;
DROP POLICY IF EXISTS "staff_shifts_update_policy" ON public.staff_shifts;

-- Recreate with clinic_admin instead of clinic_manager
CREATE POLICY "staff_shifts_select_policy" ON public.staff_shifts
    FOR SELECT USING (
        clinic_id IN (
            SELECT up.clinic_id
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = staff_shifts.clinic_id
            AND up.role IN ('therapist', 'staff', 'manager')
        )
    );

CREATE POLICY "staff_shifts_insert_policy" ON public.staff_shifts
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT up.clinic_id
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = staff_shifts.clinic_id
            AND up.role IN ('manager')
        )
    );

CREATE POLICY "staff_shifts_update_policy" ON public.staff_shifts
    FOR UPDATE USING (
        clinic_id IN (
            SELECT up.clinic_id
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = staff_shifts.clinic_id
            AND up.role IN ('manager')
        )
    );

-- ================================================================
-- 4. Fix RLS policies in staff_preferences table
-- ================================================================

DROP POLICY IF EXISTS "staff_preferences_select_policy" ON public.staff_preferences;
DROP POLICY IF EXISTS "staff_preferences_upsert_policy" ON public.staff_preferences;

-- Recreate with clinic_admin instead of clinic_manager
CREATE POLICY "staff_preferences_select_policy" ON public.staff_preferences
    FOR SELECT USING (
        clinic_id IN (
            SELECT up.clinic_id
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.staff_id = auth.uid()
            AND up.clinic_id = staff_preferences.clinic_id
            AND up.role IN ('therapist', 'staff', 'manager')
        )
        OR staff_id = auth.uid()
    );

CREATE POLICY "staff_preferences_upsert_policy" ON public.staff_preferences
    FOR ALL USING (
        clinic_id IN (
            SELECT up.clinic_id
            FROM public.user_permissions up
            WHERE up.staff_id = auth.uid() AND up.role IN ('admin', 'clinic_admin')
        )
        OR staff_id = auth.uid()
    );

-- ================================================================
-- 5. Fix CHECK constraint in invitations table
-- ================================================================
-- Source: 20251225000100_onboarding_tables.sql

-- Drop existing constraint
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;

-- Recreate with clinic_admin instead of clinic_manager
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
    CHECK (role IN ('admin', 'clinic_admin', 'therapist', 'staff', 'manager'));

-- ================================================================
-- 6. Fix RLS policy in invitations table
-- ================================================================

DROP POLICY IF EXISTS "invitations_select_policy" ON public.invitations;

-- Recreate with clinic_admin instead of clinic_manager
CREATE POLICY "invitations_select_policy" ON public.invitations
    FOR SELECT USING (
        clinic_id IN (
            SELECT p.clinic_id FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

-- ================================================================
-- 7. Fix RLS policies in MFA tables
-- ================================================================
-- Source: 20250826000600_06_mfa_tables.sql

DROP POLICY IF EXISTS "user_mfa_settings_select_policy" ON public.user_mfa_settings;
DROP POLICY IF EXISTS "mfa_usage_stats_select_policy" ON public.mfa_usage_stats;

-- Recreate with clinic_admin instead of clinic_manager
CREATE POLICY "user_mfa_settings_select_policy" ON public.user_mfa_settings
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = user_mfa_settings.clinic_id
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

CREATE POLICY "mfa_usage_stats_select_policy" ON public.mfa_usage_stats
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.clinic_id = mfa_usage_stats.clinic_id
            AND p.role IN ('admin', 'clinic_admin', 'manager')
        )
    );

COMMIT;

-- ================================================================
-- Post-Migration Verification (run manually after migration)
-- ================================================================
--
-- -- Check 1: auth.users での clinic_manager 使用状況（完全版）
-- SELECT
--   'clinic_manager in auth.users (all keys)' as check_type,
--   COUNT(*) as count
-- FROM auth.users
-- WHERE raw_user_meta_data->>'role' = 'clinic_manager'
--    OR raw_user_meta_data->>'user_role' = 'clinic_manager'
--    OR raw_app_meta_data->>'role' = 'clinic_manager'
--    OR raw_app_meta_data->>'user_role' = 'clinic_manager';
-- -- Expected: 0
--
-- -- Check 2: RLS policies での clinic_manager 参照状況
-- SELECT
--   tablename,
--   policyname,
--   CASE WHEN definition ILIKE '%clinic_manager%' THEN 'HAS clinic_manager' ELSE 'clean' END as status
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- -- Expected: すべて 'clean'
--
-- -- Check 3: CHECK制約での clinic_manager 使用状況
-- SELECT
--   table_name,
--   constraint_name,
--   check_clause
-- FROM information_schema.check_constraints
-- WHERE check_clause ILIKE '%clinic_manager%';
-- -- Expected: 0 rows
-- ================================================================

-- ================================================================
-- ROLLBACK PLAN (if needed)
-- ================================================================
--
-- -- Restore clinic_manager references
-- -- Note: Use Point-in-Time Recovery for full rollback
--
-- -- 1. Restore CHECK constraint
-- ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
-- ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
--     CHECK (role IN ('admin', 'clinic_manager', 'therapist', 'staff', 'manager'));
--
-- -- 2. Restore RLS policies (reference original migration files)
-- -- ... (recreate policies with clinic_manager)
-- ================================================================
