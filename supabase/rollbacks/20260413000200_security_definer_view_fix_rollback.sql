-- ================================================================
-- ROLLBACK: Security Definer View Fix
-- ================================================================
-- 対象: 20260413000200_security_definer_view_fix.sql
-- ================================================================

BEGIN;

ALTER VIEW public.clinic_hierarchy
    SET (security_invoker = false);

ALTER VIEW public.staff_performance_summary
    SET (security_invoker = false);

ALTER VIEW public.patient_visit_summary
    SET (security_invoker = false);

ALTER VIEW public.daily_revenue_summary
    SET (security_invoker = false);

ALTER VIEW public.reservation_list_view
    SET (security_invoker = false);

COMMIT;
