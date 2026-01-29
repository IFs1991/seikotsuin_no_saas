-- ================================================================
-- RLS Hardening: Profiles + Legacy Tables + System Inserts
-- ================================================================
-- Spec: docs/stabilization/spec-rls-hardening-legacy-tables-v0.1.md
-- DoD: DOD-08, DOD-09 (docs/stabilization/DoD-v0.1.md)
--
-- Changes:
-- 1. public.profiles: Enable RLS + column-level UPDATE guard
-- 2. Legacy tenant tables: Add RLS with tenant scope
-- 3. audit_logs / encryption_keys: RLS with restricted access
-- 4. security_events / notifications: Service-role-only inserts
-- 5. staff_invites: Add clinic scope to creator policies
-- ================================================================

BEGIN;

-- ================================================================
-- 1. public.profiles RLS + column-level UPDATE guard
-- ================================================================
-- Problem: profiles has no RLS, role/clinic_id values used for authorization
-- Solution: Enable RLS + restrict UPDATE to safe columns only

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;

-- Self-select: users can view their own profile
CREATE POLICY "profiles_self_select"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- Self-update: users can update their own profile (limited columns via GRANT)
CREATE POLICY "profiles_self_update"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admin select: admin/clinic_admin can view profiles in their clinic scope
CREATE POLICY "profiles_admin_select"
ON public.profiles FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        clinic_id IS NULL -- admin profiles may have NULL clinic_id
        OR public.can_access_clinic(clinic_id)
    )
);

-- Column-level privilege guard: prevent role/clinic_id escalation
-- REVOKE all direct INSERT/UPDATE, then GRANT UPDATE on safe columns only
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

-- Grant UPDATE only on non-sensitive columns (excludes: role, clinic_id, is_active)
-- Note: email is excluded as it must sync with auth.users (server-side only)
GRANT UPDATE (full_name, avatar_url, phone_number, language_preference, timezone, last_login_at, updated_at)
ON public.profiles TO authenticated;

COMMENT ON TABLE public.profiles IS
'User profiles linked to auth.users. RLS enabled.
UPDATE restricted to non-sensitive columns. role/clinic_id changes require service role.';

-- ================================================================
-- 2. Legacy tenant tables - add RLS with tenant scope
-- ================================================================
-- Tables: staff, patients, visits, revenues, staff_performance,
--         daily_reports, daily_ai_comments, appointments

-- ----------------------------------------------------------------
-- 2a. public.staff
-- ----------------------------------------------------------------
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_for_staff" ON public.staff;
DROP POLICY IF EXISTS "staff_insert_for_staff" ON public.staff;
DROP POLICY IF EXISTS "staff_update_for_staff" ON public.staff;
DROP POLICY IF EXISTS "staff_delete_for_managers" ON public.staff;

CREATE POLICY "staff_select_for_staff"
ON public.staff FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_insert_for_staff"
ON public.staff FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_update_for_staff"
ON public.staff FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_delete_for_managers"
ON public.staff FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2b. public.patients
-- ----------------------------------------------------------------
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patients_select_for_staff" ON public.patients;
DROP POLICY IF EXISTS "patients_insert_for_staff" ON public.patients;
DROP POLICY IF EXISTS "patients_update_for_staff" ON public.patients;
DROP POLICY IF EXISTS "patients_delete_for_managers" ON public.patients;

CREATE POLICY "patients_select_for_staff"
ON public.patients FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "patients_insert_for_staff"
ON public.patients FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "patients_update_for_staff"
ON public.patients FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "patients_delete_for_managers"
ON public.patients FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2c. public.visits
-- ----------------------------------------------------------------
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits_select_for_staff" ON public.visits;
DROP POLICY IF EXISTS "visits_insert_for_staff" ON public.visits;
DROP POLICY IF EXISTS "visits_update_for_staff" ON public.visits;
DROP POLICY IF EXISTS "visits_delete_for_managers" ON public.visits;

CREATE POLICY "visits_select_for_staff"
ON public.visits FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "visits_insert_for_staff"
ON public.visits FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "visits_update_for_staff"
ON public.visits FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "visits_delete_for_managers"
ON public.visits FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2d. public.revenues (EXCEPTION: financial data, stricter access)
-- ----------------------------------------------------------------
ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenues_select_for_managers" ON public.revenues;
DROP POLICY IF EXISTS "revenues_insert_for_managers" ON public.revenues;
DROP POLICY IF EXISTS "revenues_update_for_managers" ON public.revenues;
DROP POLICY IF EXISTS "revenues_delete_for_admin" ON public.revenues;

-- Financial data: manager+ for SELECT/INSERT/UPDATE, admin only for DELETE
CREATE POLICY "revenues_select_for_managers"
ON public.revenues FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "revenues_insert_for_managers"
ON public.revenues FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "revenues_update_for_managers"
ON public.revenues FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "revenues_delete_for_admin"
ON public.revenues FOR DELETE
USING (
    public.get_current_role() = 'admin'
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2e. public.staff_performance
-- ----------------------------------------------------------------
ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_performance_select_for_staff" ON public.staff_performance;
DROP POLICY IF EXISTS "staff_performance_insert_for_staff" ON public.staff_performance;
DROP POLICY IF EXISTS "staff_performance_update_for_staff" ON public.staff_performance;
DROP POLICY IF EXISTS "staff_performance_delete_for_managers" ON public.staff_performance;

CREATE POLICY "staff_performance_select_for_staff"
ON public.staff_performance FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_performance_insert_for_staff"
ON public.staff_performance FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_performance_update_for_staff"
ON public.staff_performance FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "staff_performance_delete_for_managers"
ON public.staff_performance FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2f. public.daily_reports
-- ----------------------------------------------------------------
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_reports_select_for_staff" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert_for_staff" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_update_for_staff" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_delete_for_managers" ON public.daily_reports;

CREATE POLICY "daily_reports_select_for_staff"
ON public.daily_reports FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "daily_reports_insert_for_staff"
ON public.daily_reports FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "daily_reports_update_for_staff"
ON public.daily_reports FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "daily_reports_delete_for_managers"
ON public.daily_reports FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ----------------------------------------------------------------
-- 2g. public.ai_comments (formerly daily_ai_comments)
-- ----------------------------------------------------------------
-- NOTE: daily_ai_comments was renamed to ai_comments in 20251224000400_rename_ai_comments.sql
-- RLS policies were already updated in 20260111000200_rls_parent_scope_alignment.sql
-- to use can_access_clinic(). No action needed here.
-- Keeping this comment for documentation purposes.

-- ----------------------------------------------------------------
-- 2h. public.appointments
-- ----------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select_for_staff" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert_for_staff" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_for_staff" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete_for_managers" ON public.appointments;

CREATE POLICY "appointments_select_for_staff"
ON public.appointments FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "appointments_insert_for_staff"
ON public.appointments FOR INSERT
WITH CHECK (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "appointments_update_for_staff"
ON public.appointments FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);

CREATE POLICY "appointments_delete_for_managers"
ON public.appointments FOR DELETE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

-- ================================================================
-- 3. Audit and secret tables
-- ================================================================

-- ----------------------------------------------------------------
-- 3a. public.audit_logs
-- ----------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_for_admins" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_service_role" ON public.audit_logs;

-- SELECT: admin/clinic_admin only, scoped to their clinic
-- For clinic_id IS NULL events (global admin events), only admin can view
CREATE POLICY "audit_logs_select_for_admins"
ON public.audit_logs FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
        (clinic_id IS NOT NULL AND public.can_access_clinic(clinic_id))
        OR (clinic_id IS NULL AND public.jwt_is_admin())
    )
);

-- INSERT: service role only
CREATE POLICY "audit_logs_insert_service_role"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- No UPDATE/DELETE policies = deny all modifications

-- ----------------------------------------------------------------
-- 3b. public.encryption_keys
-- ----------------------------------------------------------------
ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon = deny all
-- Access only via service role / definer functions

-- ================================================================
-- 4. System inserts for security_events and notifications
-- ================================================================
-- Replace permissive insert policies with service-role-only checks

-- ----------------------------------------------------------------
-- 4a. security_events - update INSERT policy
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert security events" ON public.security_events;

CREATE POLICY "security_events_insert_service_role"
ON public.security_events FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------
-- 4b. notifications - update INSERT policy
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "notifications_insert_service_role"
ON public.notifications FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- ================================================================
-- 5. staff_invites creator scope
-- ================================================================
-- Update creator policies to include clinic scope

-- Drop existing creator policies
DROP POLICY IF EXISTS "staff_invites_creator_select" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_insert" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_update" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_creator_delete" ON public.staff_invites;
DROP POLICY IF EXISTS "staff_invites_clinic_admin_select" ON public.staff_invites;

-- Creator select: own invites within accessible clinics
CREATE POLICY "staff_invites_creator_select"
ON public.staff_invites FOR SELECT
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

-- Creator insert: can create invites for accessible clinics only
CREATE POLICY "staff_invites_creator_insert"
ON public.staff_invites FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

-- Creator update: can update own invites within accessible clinics
CREATE POLICY "staff_invites_creator_update"
ON public.staff_invites FOR UPDATE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
)
WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

-- Creator delete: can delete own invites within accessible clinics
CREATE POLICY "staff_invites_creator_delete"
ON public.staff_invites FOR DELETE
USING (
    created_by = auth.uid()
    AND public.can_access_clinic(clinic_id)
);

-- Clinic admin select: use get_current_role() + can_access_clinic() instead of profiles join
CREATE POLICY "staff_invites_clinic_admin_select"
ON public.staff_invites FOR SELECT
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager')
    AND public.can_access_clinic(clinic_id)
);

COMMIT;

-- ================================================================
-- Post-Migration Notes
-- ================================================================
--
-- Verification (DOD-08):
-- Run the following to confirm can_access_clinic appears in policy quals:
-- SELECT tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'staff', 'patients', 'visits', 'revenues',
--                     'staff_performance', 'daily_reports', 'daily_ai_comments',
--                     'appointments', 'audit_logs', 'encryption_keys',
--                     'security_events', 'notifications', 'staff_invites')
-- ORDER BY tablename, policyname;
--
-- Verification (DOD-09):
-- Ensure client code does not bypass server guards:
-- rg -n "from\('(staff|patients|visits|revenues|appointments|daily_reports|daily_ai_comments|staff_performance|audit_logs|encryption_keys)'" src
--
-- Verification (profiles privilege guard):
-- Confirm authenticated user cannot update role or clinic_id via PostgREST.
--
-- ================================================================
