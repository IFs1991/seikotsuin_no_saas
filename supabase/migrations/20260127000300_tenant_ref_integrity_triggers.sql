-- ================================================================
-- Tenant Reference Integrity (Reservation Domain)
-- ================================================================
-- Spec: docs/stabilization/spec-tenant-ref-integrity-v0.1.md
-- DoD: DOD-08
-- Purpose: enforce same-clinic references across reservations/blocks/history.
-- ================================================================

BEGIN;

-- ================================================================
-- Reservations: customer/menu/staff must belong to same clinic
-- ================================================================
CREATE OR REPLACE FUNCTION public.validate_reservations_clinic_refs()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_clinic_id uuid;
    v_menu_clinic_id uuid;
    v_staff_clinic_id uuid;
BEGIN
    IF NEW.clinic_id IS NULL THEN
        RAISE EXCEPTION 'reservations.clinic_id is required' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_customer_clinic_id
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'customers.id not found' USING ERRCODE = '23503';
    END IF;

    IF v_customer_clinic_id IS NULL OR v_customer_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'reservations.customer_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_menu_clinic_id
    FROM public.menus
    WHERE id = NEW.menu_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'menus.id not found' USING ERRCODE = '23503';
    END IF;

    -- Allow global menus (clinic_id IS NULL)
    IF v_menu_clinic_id IS NOT NULL AND v_menu_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'reservations.menu_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_staff_clinic_id
    FROM public.resources
    WHERE id = NEW.staff_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'resources.id not found' USING ERRCODE = '23503';
    END IF;

    IF v_staff_clinic_id IS NULL OR v_staff_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'reservations.staff_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservations_clinic_ref_check ON public.reservations;
CREATE TRIGGER reservations_clinic_ref_check
    BEFORE INSERT OR UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.validate_reservations_clinic_refs();

-- ================================================================
-- Blocks: resource must belong to same clinic
-- ================================================================
CREATE OR REPLACE FUNCTION public.validate_blocks_clinic_refs()
RETURNS TRIGGER AS $$
DECLARE
    v_resource_clinic_id uuid;
BEGIN
    IF NEW.clinic_id IS NULL THEN
        RAISE EXCEPTION 'blocks.clinic_id is required' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_resource_clinic_id
    FROM public.resources
    WHERE id = NEW.resource_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'resources.id not found' USING ERRCODE = '23503';
    END IF;

    IF v_resource_clinic_id IS NULL OR v_resource_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'blocks.resource_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blocks_clinic_ref_check ON public.blocks;
CREATE TRIGGER blocks_clinic_ref_check
    BEFORE INSERT OR UPDATE ON public.blocks
    FOR EACH ROW EXECUTE FUNCTION public.validate_blocks_clinic_refs();

-- ================================================================
-- Reservation history: reservation must belong to same clinic
-- ================================================================
CREATE OR REPLACE FUNCTION public.validate_reservation_history_clinic_refs()
RETURNS TRIGGER AS $$
DECLARE
    v_reservation_clinic_id uuid;
BEGIN
    IF NEW.clinic_id IS NULL THEN
        RAISE EXCEPTION 'reservation_history.clinic_id is required' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_reservation_clinic_id
    FROM public.reservations
    WHERE id = NEW.reservation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservations.id not found' USING ERRCODE = '23503';
    END IF;

    IF v_reservation_clinic_id IS NULL OR v_reservation_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'reservation_history.reservation_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservation_history_clinic_ref_check ON public.reservation_history;
CREATE TRIGGER reservation_history_clinic_ref_check
    BEFORE INSERT OR UPDATE ON public.reservation_history
    FOR EACH ROW EXECUTE FUNCTION public.validate_reservation_history_clinic_refs();

-- ================================================================
-- Reservation history log functions: include clinic_id
-- ================================================================
CREATE OR REPLACE FUNCTION log_reservation_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        clinic_id,
        action,
        new_value,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        NEW.clinic_id,
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
        clinic_id,
        action,
        old_value,
        new_value,
        change_reason,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        NEW.clinic_id,
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
        clinic_id,
        action,
        old_value,
        created_by,
        ip_address
    ) VALUES (
        OLD.id,
        OLD.clinic_id,
        'deleted',
        to_jsonb(OLD),
        auth.uid(),
        inet_client_addr()
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
