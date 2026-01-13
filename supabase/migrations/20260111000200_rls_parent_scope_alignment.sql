-- ================================================================
-- RLS Parent-Scope Alignment (Implementation Review Fixes)
-- ================================================================
-- Spec: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
-- Section: 追加修正作業（実装レビュー反映）
--
-- Changes:
-- 1. can_access_clinic() → clinic_scope_ids優先、clinic_idフォールバック、adminバイパス廃止
-- 2. custom_access_token_hook → clinic_scope_ids付与
-- 3. chat_sessions/messages → clinic_id IS NULL を admin限定に
-- 4. 顧客向けRLSポリシー削除（サーバAPI専用に制限）
-- 5. belongs_to_clinic → can_access_clinic委譲（非推奨化）
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Parent-scope enabled can_access_clinic function
-- ================================================================
-- Priority: clinic_scope_ids > clinic_id fallback
-- Admin bypass REMOVED: admin must also respect parent-scope boundary

CREATE OR REPLACE FUNCTION public.can_access_clinic(target_clinic_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    scope_ids_json jsonb;
    scope_ids UUID[];
    primary_clinic_id UUID;
BEGIN
    -- 1. Try to get clinic_scope_ids from JWT claims
    BEGIN
        scope_ids_json := current_setting('request.jwt.claims', true)::jsonb->'clinic_scope_ids';

        IF scope_ids_json IS NOT NULL AND jsonb_array_length(scope_ids_json) > 0 THEN
            -- Convert JSONB array to UUID array
            SELECT ARRAY_AGG(elem::TEXT::UUID)
            INTO scope_ids
            FROM jsonb_array_elements_text(scope_ids_json) AS elem;

            -- Check if target_clinic_id is in scope
            RETURN target_clinic_id = ANY(scope_ids);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- JSON parsing failed, fall through to fallback
        NULL;
    END;

    -- 2. Fallback: clinic_id single comparison (backward compatibility)
    primary_clinic_id := public.jwt_clinic_id();

    IF primary_clinic_id IS NULL THEN
        -- No clinic context at all - deny access
        RETURN FALSE;
    END IF;

    RETURN target_clinic_id = primary_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.can_access_clinic(UUID) IS
'Checks if user can access target clinic using parent-scope model.
Priority: clinic_scope_ids array > clinic_id fallback.
Admin bypass REMOVED: admin is also scoped to their parent organization.
O(1) JWT comparison, no DB lookup.';

-- ================================================================
-- 2. Update custom_access_token_hook to include clinic_scope_ids
-- ================================================================
-- Note: Parent-scope requires clinics.parent_id column.
-- If parent_id does not exist, falls back to single clinic_id array.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
    claims jsonb;
    user_clinic_id uuid;
    user_role_val text;
    parent_clinic_id uuid;
    scope_ids uuid[];
BEGIN
    claims := event->'claims';

    -- Get user's clinic_id and role from user_permissions
    SELECT up.clinic_id, up.role INTO user_clinic_id, user_role_val
    FROM public.user_permissions up
    WHERE up.staff_id = (event->>'user_id')::uuid
    LIMIT 1;

    -- Add clinic_id claim if found
    IF user_clinic_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{clinic_id}', to_jsonb(user_clinic_id));
    END IF;

    -- Add user_role claim if found
    IF user_role_val IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val));
    END IF;

    -- Build clinic_scope_ids array
    -- NOTE: This implementation checks if clinics.parent_id column exists
    -- If parent_id exists, get all sibling clinics under same parent
    -- If not, fall back to single clinic_id
    BEGIN
        -- Check if parent_id column exists
        PERFORM 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clinics'
          AND column_name = 'parent_id';

        IF FOUND AND user_clinic_id IS NOT NULL THEN
            -- Get parent organization ID
            EXECUTE format(
                'SELECT parent_id FROM public.clinics WHERE id = $1'
            ) INTO parent_clinic_id USING user_clinic_id;

            IF parent_clinic_id IS NOT NULL THEN
                -- Get all sibling clinic IDs under the same parent
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING parent_clinic_id;
            ELSE
                -- This clinic has no parent, check if it IS a parent
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING user_clinic_id;
            END IF;
        ELSE
            -- No parent_id column or no clinic_id, use single clinic
            IF user_clinic_id IS NOT NULL THEN
                scope_ids := ARRAY[user_clinic_id];
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Any error, fall back to single clinic
        IF user_clinic_id IS NOT NULL THEN
            scope_ids := ARRAY[user_clinic_id];
        END IF;
    END;

    -- Add clinic_scope_ids claim if we have scope
    IF scope_ids IS NOT NULL AND array_length(scope_ids, 1) > 0 THEN
        claims := jsonb_set(claims, '{clinic_scope_ids}', to_jsonb(scope_ids));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure supabase_auth_admin can execute the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
'Supabase Auth hook to include clinic_id, user_role, and clinic_scope_ids in JWT claims.
clinic_scope_ids contains all clinics under the same parent organization (sibling access).
If clinics.parent_id does not exist, falls back to single clinic_id array.
Configure in Supabase Dashboard -> Auth -> Hooks -> Customize Access Token.';

-- ================================================================
-- 3. Update chat_sessions policies: clinic_id IS NULL → admin only
-- ================================================================

DROP POLICY IF EXISTS "chat_sessions_select" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON public.chat_sessions;

-- Chat sessions: user can see own sessions
-- Admin can see sessions with NULL clinic_id OR sessions in their scope
CREATE POLICY "chat_sessions_select"
ON public.chat_sessions FOR SELECT
USING (
    user_id = auth.uid()
    OR (
        public.get_current_role() IN ('admin', 'clinic_admin')
        AND (
            -- Admin can access sessions in their scope
            (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
            -- Only admin can access NULL clinic sessions
            OR (clinic_id IS NULL AND public.jwt_is_admin())
        )
    )
);

-- Insert: user creates own session, must specify valid clinic
CREATE POLICY "chat_sessions_insert"
ON public.chat_sessions FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND (
        -- Normal users must specify a valid clinic
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        -- Only admin can create sessions without clinic
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- Update: user can update own session with valid clinic
CREATE POLICY "chat_sessions_update"
ON public.chat_sessions FOR UPDATE
USING (
    user_id = auth.uid()
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- Delete: admin only, must have access to clinic
CREATE POLICY "chat_sessions_delete"
ON public.chat_sessions FOR DELETE
USING (
    public.jwt_is_admin()
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR clinic_id IS NULL
    )
);

-- ================================================================
-- 4. Update chat_messages policies: inherit from session policies
-- ================================================================

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;

-- Chat messages: visible if session is visible (inherits session policy logic)
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
                AND (
                    (cs.clinic_id IS NOT NULL AND public.can_access_clinic(cs.clinic_id))
                    OR (cs.clinic_id IS NULL AND public.jwt_is_admin())
                )
            )
        )
    )
);

-- Insert: can add messages to own sessions
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
-- 5. Remove customer self-access policies (Server API Gateway pattern)
-- ================================================================
-- Per spec: 顧客（患者）はSupabase Authにログインしない
-- Customer operations go through server API with service role

DROP POLICY IF EXISTS "reservations_select_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_customer" ON public.reservations;
DROP POLICY IF EXISTS "customers_select_for_self" ON public.customers;

-- Note: menus_select_public is kept for anonymous booking page access

-- ================================================================
-- 6. Update belongs_to_clinic to delegate to can_access_clinic
-- ================================================================
-- Deprecated: use can_access_clinic() directly
-- Kept for backward compatibility with existing migrations

CREATE OR REPLACE FUNCTION public.belongs_to_clinic(target_clinic_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delegate to parent-scope enabled function
    -- DEPRECATED: Direct use of can_access_clinic() is recommended
    RETURN public.can_access_clinic(target_clinic_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.belongs_to_clinic(UUID) IS
'DEPRECATED: Use public.can_access_clinic() directly.
This function now delegates to can_access_clinic() for parent-scope support.
Kept for backward compatibility with existing policies.';

-- ================================================================
-- 7. Unify policies to use can_access_clinic directly
-- ================================================================
-- Replace belongs_to_clinic with can_access_clinic in all tenant table policies
-- This removes the delegation overhead and makes the code more explicit

-- Reservations policies (recreate with can_access_clinic)
DROP POLICY IF EXISTS "reservations_select_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_for_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete_for_managers" ON public.reservations;

CREATE POLICY "reservations_select_for_staff"
ON public.reservations FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "reservations_insert_for_staff"
ON public.reservations FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "reservations_update_for_staff"
ON public.reservations FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "reservations_delete_for_managers"
ON public.reservations FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- Blocks policies
DROP POLICY IF EXISTS "blocks_select_for_staff" ON public.blocks;
DROP POLICY IF EXISTS "blocks_insert_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_update_for_managers" ON public.blocks;
DROP POLICY IF EXISTS "blocks_delete_for_admin" ON public.blocks;

CREATE POLICY "blocks_select_for_staff"
ON public.blocks FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "blocks_insert_for_managers"
ON public.blocks FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "blocks_update_for_managers"
ON public.blocks FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "blocks_delete_for_admin"
ON public.blocks FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND public.can_access_clinic(clinic_id)
);

-- Customers policies
DROP POLICY IF EXISTS "customers_select_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_update_for_staff" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_for_admin" ON public.customers;

CREATE POLICY "customers_select_for_staff"
ON public.customers FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "customers_insert_for_staff"
ON public.customers FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "customers_update_for_staff"
ON public.customers FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "customers_delete_for_admin"
ON public.customers FOR DELETE
USING (
    public.get_current_role() = 'admin'
    AND public.can_access_clinic(clinic_id)
);

-- Menus policies
DROP POLICY IF EXISTS "menus_select_for_staff" ON public.menus;
DROP POLICY IF EXISTS "menus_insert_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_update_for_managers" ON public.menus;
DROP POLICY IF EXISTS "menus_delete_for_admin" ON public.menus;

CREATE POLICY "menus_select_for_staff"
ON public.menus FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "menus_insert_for_managers"
ON public.menus FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "menus_update_for_managers"
ON public.menus FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "menus_delete_for_admin"
ON public.menus FOR DELETE
USING (
    public.get_current_role() = 'admin'
    AND public.can_access_clinic(clinic_id)
);

-- Resources policies
DROP POLICY IF EXISTS "resources_select_for_staff" ON public.resources;
DROP POLICY IF EXISTS "resources_insert_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_update_for_managers" ON public.resources;
DROP POLICY IF EXISTS "resources_delete_for_admin" ON public.resources;

CREATE POLICY "resources_select_for_staff"
ON public.resources FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "resources_insert_for_managers"
ON public.resources FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "resources_update_for_managers"
ON public.resources FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "resources_delete_for_admin"
ON public.resources FOR DELETE
USING (
    public.get_current_role() = 'admin'
    AND public.can_access_clinic(clinic_id)
);

-- Reservation history policies
DROP POLICY IF EXISTS "reservation_history_select_for_staff" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_insert_for_all" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_update_for_admin" ON public.reservation_history;
DROP POLICY IF EXISTS "reservation_history_delete_for_admin" ON public.reservation_history;

CREATE POLICY "reservation_history_select_for_staff"
ON public.reservation_history FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.id = reservation_history.reservation_id
          AND public.can_access_clinic(r.clinic_id)
    )
);

CREATE POLICY "reservation_history_insert_for_all"
ON public.reservation_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "reservation_history_update_for_admin"
ON public.reservation_history FOR UPDATE
USING (
    public.jwt_is_admin()
    AND EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.id = reservation_history.reservation_id
          AND public.can_access_clinic(r.clinic_id)
    )
);

CREATE POLICY "reservation_history_delete_for_admin"
ON public.reservation_history FOR DELETE
USING (
    public.jwt_is_admin()
    AND EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.id = reservation_history.reservation_id
          AND public.can_access_clinic(r.clinic_id)
    )
);

-- AI comments policies
DROP POLICY IF EXISTS "ai_comments_select" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_insert" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_update" ON public.ai_comments;
DROP POLICY IF EXISTS "ai_comments_delete" ON public.ai_comments;

CREATE POLICY "ai_comments_select"
ON public.ai_comments FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "ai_comments_insert"
ON public.ai_comments FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "ai_comments_update"
ON public.ai_comments FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "ai_comments_delete"
ON public.ai_comments FOR DELETE
USING (
    public.jwt_is_admin()
    AND public.can_access_clinic(clinic_id)
);

COMMIT;

-- ================================================================
-- Post-Migration Notes
-- ================================================================
--
-- 1. Enable auth hook in supabase/config.toml:
--    [auth.hook.custom_access_token]
--    enabled = true
--    uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- 2. For parent-scope to work fully, add parent_id to clinics table:
--    ALTER TABLE public.clinics ADD COLUMN parent_id UUID REFERENCES clinics(id);
--
-- 3. Customer operations must use Server API Gateway pattern:
--    - POST /api/reservations (server validates clinic_id)
--    - GET /api/menus (public access for booking pages)
--
-- ================================================================
