-- ================================================================
-- Migration: clinic_manager → clinic_admin Role Alignment
-- ================================================================
-- Spec: docs/stabilization/spec-auth-role-alignment-v0.1.md (Phase 3)
-- DoD: DOD-08 (Role checks are consistent across middleware, guards, and API)
--
-- Purpose: Migrate deprecated 'clinic_manager' role to canonical 'clinic_admin'
-- Decision: Option B-1 selected (2026-01-07)
--
-- Preflight Checks Results (2026-01-09):
--   - auth.users with clinic_manager: 0
--   - profiles with clinic_manager: 0
--   - user_permissions with clinic_manager: 0
--   - RLS policies referencing clinic_manager: 6 (handled separately in spec-rls-tenant-boundary)
--
-- IMPORTANT: This migration is safe to run even if no clinic_manager records exist.
-- The UPDATE statements will simply affect 0 rows.
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Migrate user_permissions table
-- ================================================================
UPDATE public.user_permissions
SET role = 'clinic_admin',
    updated_at = NOW()
WHERE role = 'clinic_manager';

-- ================================================================
-- 2. Migrate profiles table
-- ================================================================
UPDATE public.profiles
SET role = 'clinic_admin',
    updated_at = NOW()
WHERE role = 'clinic_manager';

-- ================================================================
-- 3. Migrate auth.users raw_user_meta_data (if applicable)
-- ================================================================
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"clinic_admin"'
)
WHERE raw_user_meta_data->>'role' = 'clinic_manager';

COMMIT;

-- ================================================================
-- Post-Migration Verification (run manually after migration)
-- ================================================================
--
-- SELECT 'Remaining clinic_manager in auth.users' as check_type, COUNT(*) as count
-- FROM auth.users WHERE raw_user_meta_data->>'role' = 'clinic_manager';
-- -- Expected: 0
--
-- SELECT 'Remaining clinic_manager in profiles' as check_type, COUNT(*) as count
-- FROM public.profiles WHERE role = 'clinic_manager';
-- -- Expected: 0
--
-- SELECT 'Remaining clinic_manager in user_permissions' as check_type, COUNT(*) as count
-- FROM public.user_permissions WHERE role = 'clinic_manager';
-- -- Expected: 0
--
-- SELECT role, COUNT(*) as count FROM public.user_permissions GROUP BY role ORDER BY count DESC;
-- SELECT role, COUNT(*) as count FROM public.profiles GROUP BY role ORDER BY count DESC;
-- ================================================================

-- ================================================================
-- ROLLBACK PLAN (if needed, run as separate migration)
-- ================================================================
--
-- Note: Only use rollback if migration causes issues.
-- This will revert clinic_admin back to clinic_manager for recently migrated records.
--
-- UPDATE public.user_permissions
-- SET role = 'clinic_manager'
-- WHERE role = 'clinic_admin'
-- AND updated_at > '[migration_timestamp]';
--
-- UPDATE public.profiles
-- SET role = 'clinic_manager'
-- WHERE role = 'clinic_admin'
-- AND updated_at > '[migration_timestamp]';
--
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--     raw_user_meta_data,
--     '{role}',
--     '"clinic_manager"'
-- )
-- WHERE raw_user_meta_data->>'role' = 'clinic_admin'
-- AND updated_at > '[migration_timestamp]';
-- ================================================================
