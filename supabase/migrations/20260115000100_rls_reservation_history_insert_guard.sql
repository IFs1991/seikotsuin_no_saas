-- ================================================================
-- RLS Reservation History Insert Guard
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- DoD: DOD-08
-- Purpose: Restrict reservation_history inserts to clinic scope via reservations
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS "reservation_history_insert_for_all" ON public.reservation_history;

CREATE POLICY "reservation_history_insert_for_all"
ON public.reservation_history FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.id = reservation_history.reservation_id
          AND public.can_access_clinic(r.clinic_id)
    )
);

COMMIT;
