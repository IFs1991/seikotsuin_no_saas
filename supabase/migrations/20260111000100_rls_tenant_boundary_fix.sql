-- ================================================================
-- RLS Tenant Boundary Fix (SaaS Optimized)
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- DoD: DOD-02, DOD-08
-- Purpose: Add JWT-optimized helper functions, chat table RLS, 
--          customer self-access policies, and performance indexes
-- Dependency: 20251224001000_auth_helper_functions.sql
-- Scale Target: 1000+ tenants, 100k+ reservations per tenant
-- ================================================================

BEGIN;

-- ================================================================
-- 1. JWT-optimized helper functions (O(1) performance)
-- ================================================================
-- These functions avoid subqueries by reading directly from JWT claims

-- Get clinic_id directly from JWT (no subquery, O(1))
CREATE OR REPLACE FUNCTION public.jwt_clinic_id()
RETURNS UUID AS $$
BEGIN
    RETURN (current_setting('request.jwt.claims', true)::json->>'clinic_id')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user is admin (no subquery, O(1))
CREATE OR REPLACE FUNCTION public.jwt_is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    role_val TEXT;
BEGIN
    role_val := current_setting('request.jwt.claims', true)::json->>'user_role';
    IF role_val IS NULL THEN
        role_val := current_setting('request.jwt.claims', true)::json->>'role';
    END IF;
    RETURN role_val = 'admin';
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user can access a specific clinic (optimized)
-- Admin: can access all clinics (returns TRUE without checking clinic_id)
-- Others: can only access their own clinic (JWT comparison, no subquery)
CREATE OR REPLACE FUNCTION public.can_access_clinic(target_clinic_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Admin bypass: no clinic_id check needed
    IF public.jwt_is_admin() THEN
        RETURN TRUE;
    END IF;

    -- Non-admin: JWT clinic_id must match target
    RETURN public.jwt_clinic_id() = target_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.jwt_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_clinic(UUID) TO authenticated;

COMMENT ON FUNCTION public.jwt_clinic_id() IS
'Returns clinic_id from JWT claims. O(1) performance, no DB lookup.';

COMMENT ON FUNCTION public.jwt_is_admin() IS
'Returns TRUE if JWT role is admin. O(1) performance, no DB lookup.';

COMMENT ON FUNCTION public.can_access_clinic(UUID) IS
'Checks if user can access target clinic. Admin=all, others=own clinic only. O(1) performance.';

-- ================================================================
-- 2. Enable RLS and create policies for chat_sessions
-- ================================================================

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "chat_sessions_select" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON public.chat_sessions;

-- Chat sessions: user can see own sessions, admin can see all in clinic
CREATE POLICY "chat_sessions_select"
ON public.chat_sessions FOR SELECT
USING (
    user_id = auth.uid()
    OR (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    )
);

CREATE POLICY "chat_sessions_insert"
ON public.chat_sessions FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
);

CREATE POLICY "chat_sessions_update"
ON public.chat_sessions FOR UPDATE
USING (
    user_id = auth.uid()
    AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
);

CREATE POLICY "chat_sessions_delete"
ON public.chat_sessions FOR DELETE
USING (
    public.jwt_is_admin()
    AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
);

-- ================================================================
-- 3. Enable RLS and create policies for chat_messages
-- ================================================================

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;

-- Chat messages: user can see messages in own sessions
CREATE POLICY "chat_messages_select"
ON public.chat_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.chat_sessions cs
        WHERE cs.id = chat_messages.session_id
        AND (
            cs.user_id = auth.uid()
            OR (
                public.get_current_role() IN ('admin', 'clinic_admin')
                AND (cs.clinic_id IS NULL OR public.can_access_clinic(cs.clinic_id))
            )
        )
    )
);

CREATE POLICY "chat_messages_insert"
ON public.chat_messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.chat_sessions cs
        WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
);

-- ================================================================
-- 4. Add customer self-access policies for reservations
-- ================================================================

-- Drop and recreate customer policies to include self-access
DROP POLICY IF EXISTS "reservations_select_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_customer" ON public.reservations;

-- Customer can view their own reservations
CREATE POLICY "reservations_select_for_customer"
ON public.reservations FOR SELECT
USING (
    public.get_current_role() = 'customer'
    AND customer_id = auth.uid()
);

-- Customer can create their own reservations (web/line booking)
CREATE POLICY "reservations_insert_for_customer"
ON public.reservations FOR INSERT
WITH CHECK (
    public.get_current_role() = 'customer'
    AND customer_id = auth.uid()
    AND channel IN ('web', 'line')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 5. Add customer self-access policies for customers table
-- ================================================================

-- Ensure customer can see their own record
DROP POLICY IF EXISTS "customers_select_for_self" ON public.customers;

CREATE POLICY "customers_select_for_self"
ON public.customers FOR SELECT
USING (
    public.get_current_role() = 'customer'
    AND id = auth.uid()
);

-- ================================================================
-- 6. Add public menu access policy (for booking pages)
-- ================================================================

DROP POLICY IF EXISTS "menus_select_public" ON public.menus;

-- Public can view active menus (for booking pages)
CREATE POLICY "menus_select_public"
ON public.menus FOR SELECT
USING (
    is_active = true
    AND is_deleted = false
);

-- ================================================================
-- 7. Performance indexes for SaaS scale
-- ================================================================

-- Composite indexes for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_reservations_clinic_status
ON public.reservations(clinic_id, status)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_blocks_clinic_time
ON public.blocks(clinic_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_customers_clinic_active
ON public.customers(clinic_id)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_menus_clinic_active
ON public.menus(clinic_id, is_active)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_resources_clinic
ON public.resources(clinic_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_clinic
ON public.chat_sessions(user_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
ON public.chat_messages(session_id);

-- user_permissions index for fallback lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_staff_clinic
ON public.user_permissions(staff_id, clinic_id);

-- ================================================================
-- 8. JWT Claims Hook (ensure JWT includes clinic_id)
-- ================================================================
-- Note: This function is called by Supabase Auth to customize JWT claims
-- If not already configured, configure in Supabase Dashboard -> Auth -> Hooks

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
    claims jsonb;
    user_clinic_id uuid;
    user_role_val text;
BEGIN
    claims := event->'claims';

    -- Get user's clinic_id and role from user_permissions
    SELECT up.clinic_id, up.role INTO user_clinic_id, user_role_val
    FROM public.user_permissions up
    WHERE up.staff_id = (event->>'user_id')::uuid
    LIMIT 1;

    -- Add to claims if found
    IF user_clinic_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{clinic_id}', to_jsonb(user_clinic_id));
    END IF;
    IF user_role_val IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to supabase_auth_admin for hook execution
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
'Supabase Auth hook to include clinic_id and user_role in JWT claims.
Configure in Supabase Dashboard -> Auth -> Hooks -> Customize Access Token.';

COMMIT;

-- ================================================================
-- Post-Migration Verification (run manually after migration)
-- ================================================================
--
-- 1. Verify chat tables have RLS enabled:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('chat_sessions', 'chat_messages');
-- -- Expected: rowsecurity = true for both
--
-- 2. Verify policies exist:
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('chat_sessions', 'chat_messages');
-- -- Expected: Multiple policies per table
--
-- 3. Verify indexes exist:
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%';
-- ================================================================
