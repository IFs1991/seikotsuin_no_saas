-- Rollback: Tenant Reference Integrity (Reservation Domain)
-- Reverts supabase/migrations/20260127000300_tenant_ref_integrity_triggers.sql

BEGIN;

DROP TRIGGER IF EXISTS reservation_history_clinic_ref_check ON public.reservation_history;
DROP TRIGGER IF EXISTS blocks_clinic_ref_check ON public.blocks;
DROP TRIGGER IF EXISTS reservations_clinic_ref_check ON public.reservations;

DROP FUNCTION IF EXISTS public.validate_reservation_history_clinic_refs();
DROP FUNCTION IF EXISTS public.validate_blocks_clinic_refs();
DROP FUNCTION IF EXISTS public.validate_reservations_clinic_refs();

-- Restore original reservation history logging functions (no clinic_id)
CREATE OR REPLACE FUNCTION log_reservation_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        new_value,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        'created',
        to_jsonb(NEW),
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_reservation_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(50);
    v_change_reason TEXT;
BEGIN
    IF OLD.status != NEW.status THEN
        v_action := 'status_changed';
    ELSIF OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time THEN
        v_action := 'rescheduled';
    ELSE
        v_action := 'updated';
    END IF;

    IF NEW.status = 'cancelled' THEN
        v_change_reason := NEW.cancellation_reason;
    END IF;

    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        old_value,
        new_value,
        change_reason,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        v_action,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_change_reason,
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_reservation_deleted()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        action,
        old_value,
        created_by,
        ip_address
    ) VALUES (
        OLD.id,
        'deleted',
        to_jsonb(OLD),
        auth.uid(),
        inet_client_addr()
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
