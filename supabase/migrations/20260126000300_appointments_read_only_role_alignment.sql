-- ================================================================
-- Appointments Read-Only Role Alignment
-- ================================================================
-- Spec: docs/stabilization/spec-reservations-ssot-step1-rls-migration-v0.1.md
-- DoD: DOD-08, DOD-02
--
-- Purpose:
-- - Align appointments_insert_service_role to public.get_current_role()
-- - Keep appointments read-only for authenticated users
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS "appointments_insert_service_role" ON public.appointments;

CREATE POLICY "appointments_insert_service_role"
ON public.appointments FOR INSERT
WITH CHECK (
    public.get_current_role() = 'service_role'
);

COMMIT;
