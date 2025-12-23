-- Add clinic_id columns to reservation-related tables for API compatibility.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

ALTER TABLE public.menus
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

ALTER TABLE public.reservation_history
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics ORDER BY created_at LIMIT 1;

  IF v_clinic_id IS NOT NULL THEN
    UPDATE public.customers SET clinic_id = v_clinic_id WHERE clinic_id IS NULL;
    UPDATE public.menus SET clinic_id = v_clinic_id WHERE clinic_id IS NULL;
    UPDATE public.resources SET clinic_id = v_clinic_id WHERE clinic_id IS NULL;
    UPDATE public.blocks SET clinic_id = v_clinic_id WHERE clinic_id IS NULL;

    UPDATE public.reservations r
    SET clinic_id = COALESCE(r.clinic_id, res.clinic_id, m.clinic_id, c.clinic_id, v_clinic_id)
    FROM public.resources res
    LEFT JOIN public.menus m ON r.menu_id = m.id
    LEFT JOIN public.customers c ON r.customer_id = c.id
    WHERE r.staff_id = res.id AND r.clinic_id IS NULL;

    UPDATE public.reservation_history rh
    SET clinic_id = r.clinic_id
    FROM public.reservations r
    WHERE rh.reservation_id = r.id AND rh.clinic_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_clinic_id ON public.customers(clinic_id);
CREATE INDEX IF NOT EXISTS idx_menus_clinic_id ON public.menus(clinic_id);
CREATE INDEX IF NOT EXISTS idx_resources_clinic_id ON public.resources(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reservations_clinic_id ON public.reservations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_blocks_clinic_id ON public.blocks(clinic_id);

DROP VIEW IF EXISTS public.reservation_list_view;

CREATE VIEW public.reservation_list_view AS
SELECT
    r.id,
    r.clinic_id,
    r.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    r.menu_id,
    m.name AS menu_name,
    m.duration_minutes,
    m.price AS menu_price,
    r.staff_id,
    res.name AS staff_name,
    res.type AS resource_type,
    r.start_time,
    r.end_time,
    r.status,
    r.channel,
    r.notes,
    r.price,
    r.actual_price,
    r.payment_status,
    r.reservation_group_id,
    r.created_at,
    r.updated_at,
    r.created_by,
    r.selected_options
FROM public.reservations r
INNER JOIN public.customers c ON r.customer_id = c.id
INNER JOIN public.menus m ON r.menu_id = m.id
INNER JOIN public.resources res ON r.staff_id = res.id
WHERE r.is_deleted = false
    AND c.is_deleted = false
    AND m.is_deleted = false
    AND res.is_deleted = false;
