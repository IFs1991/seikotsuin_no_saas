-- ================================================================
-- Migration: Security Definer View Fix
-- ================================================================
-- ファイル: 20260413000200_security_definer_view_fix.sql
-- 作成日:  2026-04-13
-- 目的:    Supabase Security Advisor の security_definer_view を是正
-- 関連:
--   - docs/stabilization/spec-security-advisor-lints-v0.1.md
--   - supabase/rollbacks/20260413000200_security_definer_view_fix_rollback.sql
--   - docs/stabilization/DoD-v0.1.md (DOD-04 / DOD-08)
-- ================================================================

BEGIN;

ALTER VIEW public.clinic_hierarchy
    SET (security_invoker = true);

ALTER VIEW public.staff_performance_summary
    SET (security_invoker = true);

ALTER VIEW public.patient_visit_summary
    SET (security_invoker = true);

ALTER VIEW public.daily_revenue_summary
    SET (security_invoker = true);

ALTER VIEW public.reservation_list_view
    SET (security_invoker = true);

COMMIT;
