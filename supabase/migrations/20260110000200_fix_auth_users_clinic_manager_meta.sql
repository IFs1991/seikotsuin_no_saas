-- ================================================================
-- Migration: fix auth.users clinic_manager metadata
-- ================================================================
-- Spec: docs/stabilization/spec-auth-role-alignment-v0.1.md (Phase 3.5)
-- DoD: DOD-08 (Role checks are consistent across middleware, guards, and API)
--
-- Purpose: Update auth.users metadata keys that were not covered in
-- 20260109000100_migrate_clinic_manager_to_clinic_admin.sql.
-- Scope: auth.users raw_app_meta_data.role/user_role and raw_user_meta_data.user_role only.
-- ================================================================

BEGIN;

-- raw_app_meta_data.role
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{role}',
    '"clinic_admin"'
)
WHERE raw_app_meta_data->>'role' = 'clinic_manager';

-- raw_app_meta_data.user_role
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{user_role}',
    '"clinic_admin"'
)
WHERE raw_app_meta_data->>'user_role' = 'clinic_manager';

-- raw_user_meta_data.user_role
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{user_role}',
    '"clinic_admin"'
)
WHERE raw_user_meta_data->>'user_role' = 'clinic_manager';

COMMIT;

-- ================================================================
-- Post-Migration Verification (run manually after migration)
-- ================================================================
--
-- SELECT
--   'clinic_manager in auth.users (all keys)' as check_type,
--   COUNT(*) as count
-- FROM auth.users
-- WHERE raw_user_meta_data->>'role' = 'clinic_manager'
--    OR raw_user_meta_data->>'user_role' = 'clinic_manager'
--    OR raw_app_meta_data->>'role' = 'clinic_manager'
--    OR raw_app_meta_data->>'user_role' = 'clinic_manager';
-- -- Expected: 0
-- ================================================================

-- ================================================================
-- ROLLBACK PLAN (if needed)
-- ================================================================
-- Note: Use Point-in-Time Recovery for full rollback.
-- For manual rollback, replace clinic_admin back to clinic_manager for
-- rows updated at the migration timestamp.
--
-- UPDATE auth.users
-- SET raw_app_meta_data = jsonb_set(
--     COALESCE(raw_app_meta_data, '{}'::jsonb),
--     '{role}',
--     '"clinic_manager"'
-- )
-- WHERE raw_app_meta_data->>'role' = 'clinic_admin'
--   AND updated_at > '[migration_timestamp]';
--
-- UPDATE auth.users
-- SET raw_app_meta_data = jsonb_set(
--     COALESCE(raw_app_meta_data, '{}'::jsonb),
--     '{user_role}',
--     '"clinic_manager"'
-- )
-- WHERE raw_app_meta_data->>'user_role' = 'clinic_admin'
--   AND updated_at > '[migration_timestamp]';
--
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--     COALESCE(raw_user_meta_data, '{}'::jsonb),
--     '{user_role}',
--     '"clinic_manager"'
-- )
-- WHERE raw_user_meta_data->>'user_role' = 'clinic_admin'
--   AND updated_at > '[migration_timestamp]';
-- ================================================================
