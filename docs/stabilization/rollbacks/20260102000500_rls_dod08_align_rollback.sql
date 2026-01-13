-- =====================================================
-- RLS DOD-08 Alignment - Rollback
-- Restores original reservation system + ai_comments policies
-- =====================================================

BEGIN;

-- Ensure RLS stays enabled for tenant tables
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_comments ENABLE ROW LEVEL SECURITY;

-- Drop policies introduced by DOD-08 alignment
DROP POLICY IF EXISTS "reservations_select_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_select_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_for_managers" ON public.reservations;

DROP POLICY IF EXISTS "blocks_select_for_staff" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_update_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete_for_admin" ON public.blocks;

DROP POLICY IF EXISTS "customers_select_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_select_for_self" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_for_managers" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_update_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_for_admin" ON public.customers;

DROP POLICY IF EXISTS "menus_select_for_all" ON public.menus;
DROP POLICY IF EXISTS "menus_select_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;
DROP POLICY IF EXISTS "menus_insert_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_update_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_delete_for_admin" ON public.menus;

DROP POLICY IF EXISTS "resources_select_for_staff" ON public.resources;
DROP POLICY IF EXISTS "resources_insert_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_update_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_delete_for_admin" ON public.resources;

DROP POLICY IF EXISTS "reservation_history_select_for_staff" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_insert_for_all" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_update_for_admin" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_delete_for_admin" ON public.reservation_history;

DROP POLICY IF EXISTS "ai_comments_select" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_insert" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_update" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_delete" ON public.ai_comments;

-- Restore original reservation system policies
CREATE POLICY "customers_select_for_staff"
ON public.customers FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "customers_insert_for_managers"
ON public.customers FOR INSERT
WITH CHECK (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "customers_update_for_staff"
ON public.customers FOR UPDATE
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "customers_delete_for_admin"
ON public.customers FOR DELETE
USING (
  public.user_role() = 'admin'
);

CREATE POLICY "customers_select_for_self"
ON public.customers FOR SELECT
USING (
  public.user_role() = 'customer' AND
  id = auth.uid()
);

CREATE POLICY "menus_select_for_all"
ON public.menus FOR SELECT
USING (
  is_active = true AND is_deleted = false
);

CREATE POLICY "menus_select_for_managers"
ON public.menus FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "menus_insert_for_managers"
ON public.menus FOR INSERT
WITH CHECK (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "menus_update_for_managers"
ON public.menus FOR UPDATE
USING (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "menus_delete_for_admin"
ON public.menus FOR DELETE
USING (
  public.user_role() = 'admin'
);

CREATE POLICY "resources_select_for_staff"
ON public.resources FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "resources_insert_for_managers"
ON public.resources FOR INSERT
WITH CHECK (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "resources_update_for_managers"
ON public.resources FOR UPDATE
USING (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "resources_delete_for_admin"
ON public.resources FOR DELETE
USING (
  public.user_role() = 'admin'
);

CREATE POLICY "reservations_select_for_staff"
ON public.reservations FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "reservations_select_for_customer"
ON public.reservations FOR SELECT
USING (
  public.user_role() = 'customer' AND
  customer_id = auth.uid()
);

CREATE POLICY "reservations_insert_for_staff"
ON public.reservations FOR INSERT
WITH CHECK (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "reservations_insert_for_customer"
ON public.reservations FOR INSERT
WITH CHECK (
  public.user_role() = 'customer' AND
  customer_id = auth.uid() AND
  channel IN ('web', 'line')
);

CREATE POLICY "reservations_update_for_staff"
ON public.reservations FOR UPDATE
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "reservations_update_for_customer"
ON public.reservations FOR UPDATE
USING (
  public.user_role() = 'customer' AND
  customer_id = auth.uid() AND
  status IN ('tentative', 'confirmed', 'unconfirmed')
)
WITH CHECK (
  public.user_role() = 'customer' AND
  customer_id = auth.uid() AND
  status = 'cancelled'
);

CREATE POLICY "reservations_delete_for_managers"
ON public.reservations FOR DELETE
USING (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "blocks_select_for_staff"
ON public.blocks FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "blocks_insert_for_managers"
ON public.blocks FOR INSERT
WITH CHECK (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "blocks_update_for_managers"
ON public.blocks FOR UPDATE
USING (
  public.user_role() IN ('admin', 'manager')
);

CREATE POLICY "blocks_delete_for_admin"
ON public.blocks FOR DELETE
USING (
  public.user_role() = 'admin'
);

CREATE POLICY "reservation_history_select_for_staff"
ON public.reservation_history FOR SELECT
USING (
  public.user_role() IN ('admin', 'manager', 'staff')
);

CREATE POLICY "reservation_history_insert_for_all"
ON public.reservation_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "reservation_history_update_for_admin"
ON public.reservation_history FOR UPDATE
USING (
  public.user_role() = 'admin'
);

CREATE POLICY "reservation_history_delete_for_admin"
ON public.reservation_history FOR DELETE
USING (
  public.user_role() = 'admin'
);

-- Restore original ai_comments policies (profiles-based)
CREATE POLICY ai_comments_select ON public.ai_comments
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.clinic_id = ai_comments.clinic_id
    )
  );

CREATE POLICY ai_comments_insert ON public.ai_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.clinic_id = ai_comments.clinic_id
        AND p.role IN ('admin', 'manager')
    )
  );

CREATE POLICY ai_comments_update ON public.ai_comments
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.clinic_id = ai_comments.clinic_id
        AND p.role IN ('admin', 'manager')
    )
  );

COMMIT;
