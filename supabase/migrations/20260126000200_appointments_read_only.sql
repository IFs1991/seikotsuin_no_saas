-- ================================================================
-- Appointments Read-Only Migration
-- ================================================================
-- Spec: docs/stabilization/spec-reservations-ssot-step1-v0.1.md
--
-- Purpose:
-- - SSOT for reservations is `public.reservations`
-- - `public.appointments` becomes read-only legacy table
-- - All writes must go through `/api/reservations`
--
-- Changes:
-- 1. DROP existing INSERT/UPDATE/DELETE policies on appointments
-- 2. Keep SELECT policy for read access
-- 3. Add service_role-only INSERT policy for backfill if needed
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Drop write policies from appointments
-- ================================================================
-- These policies were created in 20260126000100_rls_hardening_profiles_legacy_tables.sql

DROP POLICY IF EXISTS "appointments_insert_for_staff" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_for_staff" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete_for_managers" ON public.appointments;

-- ================================================================
-- 2. SELECT policy is retained (already exists)
-- ================================================================
-- "appointments_select_for_staff" remains for read access

-- ================================================================
-- 3. Add service_role-only INSERT for potential backfill
-- ================================================================
-- This allows migration scripts using service_role to insert data if needed

-- Drop if exists for idempotency (DOD-02)
DROP POLICY IF EXISTS "appointments_insert_service_role" ON public.appointments;

CREATE POLICY "appointments_insert_service_role"
ON public.appointments FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- ================================================================
-- 4. Add table comment documenting legacy status
-- ================================================================

COMMENT ON TABLE public.appointments IS
'LEGACY: Read-only appointment data.
SSOT for reservations is `public.reservations`.
All new writes must go through /api/reservations.
Direct INSERT/UPDATE/DELETE by authenticated users is prohibited.
Service role INSERT is allowed for data migration/backfill only.';

COMMIT;

-- ================================================================
-- Verification Queries (run after migration)
-- ================================================================
--
-- 1. Confirm only SELECT + service_role INSERT policies exist:
--    SELECT policyname, cmd
--    FROM pg_policies
--    WHERE tablename = 'appointments';
--
--    Expected:
--    - appointments_select_for_staff | SELECT
--    - appointments_insert_service_role | INSERT
--
-- 2. Test that authenticated user INSERT fails:
--    INSERT INTO public.appointments (clinic_id, ...) VALUES (...);
--    Expected: RLS policy violation error
--
-- ================================================================
