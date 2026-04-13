-- ================================================================
-- Migration: Supabase Security Advisor Lints Hardening
-- ================================================================
-- ファイル: 20260413000100_security_advisor_lints_hardening.sql
-- 作成日:  2026-04-13
-- 目的:    Supabase Security Advisor warning / error の是正
-- 対象:
--   1. Function Search Path Mutable
--   2. Extension in Public (pg_trgm)
--   3. Materialized View in API (daily_reservation_stats)
--   4. Security Definer View
--   5. RLS Policy Always True (beta_usage_metrics / csp_violations / security_alerts)
-- 関連:
--   - docs/stabilization/spec-security-advisor-lints-v0.1.md
--   - supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql
--   - docs/stabilization/DoD-v0.1.md (DOD-04 / DOD-08 / DOD-09)
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. SECURITY DEFINER / helper functions: fix mutable search_path
-- ----------------------------------------------------------------
DO $$
DECLARE
    target_functions text[] := ARRAY[
        'aggregate_mfa_stats',
        'decrypt_mfa_secret',
        'decrypt_patient_data',
        'encrypt_mfa_secret',
        'encrypt_patient_data',
        'analyze_patient_segments',
        'analyze_staff_efficiency',
        'belongs_to_clinic',
        'calculate_churn_risk_score',
        'calculate_patient_ltv',
        'can_access_clinic',
        'check_reservation_conflict',
        'custom_access_token_hook',
        'get_available_time_slots',
        'get_current_clinic_id',
        'get_current_role',
        'get_hourly_revenue_pattern',
        'get_hourly_visit_pattern',
        'get_sibling_clinic_ids',
        'is_admin',
        'jwt_clinic_id',
        'jwt_is_admin',
        'log_reservation_created',
        'log_reservation_deleted',
        'log_reservation_updated',
        'predict_revenue',
        'refresh_daily_stats',
        'set_updated_at',
        'update_customer_stats',
        'update_mfa_settings_updated_at',
        'update_updated_at_column',
        'user_role',
        'validate_blocks_clinic_refs',
        'validate_reservation_history_clinic_refs',
        'validate_reservations_clinic_refs'
    ];
    function_record record;
    matched_count integer;
BEGIN
    SELECT count(*)
    INTO matched_count
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (target_functions);

    FOR function_record IN
        SELECT
            n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS identity_args
        FROM pg_proc p
        JOIN pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY (target_functions)
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %I.%I(%s) SET search_path = public, auth, extensions',
            function_record.schema_name,
            function_record.function_name,
            function_record.identity_args
        );
    END LOOP;

    IF matched_count <> array_length(target_functions, 1) THEN
        RAISE WARNING
            'Security Advisor hardening targeted % functions, but matched % in public schema',
            array_length(target_functions, 1),
            matched_count;
    END IF;
END
$$;

-- ----------------------------------------------------------------
-- 2. Move pg_trgm out of public schema
-- ----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
    extension_schema text;
BEGIN
    SELECT n.nspname
    INTO extension_schema
    FROM pg_extension e
    JOIN pg_namespace n
      ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm';

    IF extension_schema = 'public' THEN
        ALTER EXTENSION pg_trgm SET SCHEMA extensions;
    END IF;
END
$$;

-- ----------------------------------------------------------------
-- 3. Hide materialized view from Data API roles
-- ----------------------------------------------------------------
REVOKE ALL ON TABLE public.daily_reservation_stats FROM anon;
REVOKE ALL ON TABLE public.daily_reservation_stats FROM authenticated;
GRANT SELECT ON TABLE public.daily_reservation_stats TO service_role;

-- ----------------------------------------------------------------
-- 4. Force exposed views to run with caller privileges
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 5. Tighten INSERT policies and grants to service_role only
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert metrics" ON public.beta_usage_metrics;
CREATE POLICY "System can insert metrics"
    ON public.beta_usage_metrics
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "csp_violations_insert_any" ON public.csp_violations;
CREATE POLICY "csp_violations_insert_any"
    ON public.csp_violations
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "security_alerts_insert_any" ON public.security_alerts;
CREATE POLICY "security_alerts_insert_any"
    ON public.security_alerts
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT ON TABLE public.beta_usage_metrics FROM anon;
REVOKE INSERT ON TABLE public.beta_usage_metrics FROM authenticated;
REVOKE INSERT ON TABLE public.csp_violations FROM anon;
REVOKE INSERT ON TABLE public.csp_violations FROM authenticated;
REVOKE INSERT ON TABLE public.security_alerts FROM anon;
REVOKE INSERT ON TABLE public.security_alerts FROM authenticated;

GRANT INSERT ON TABLE public.beta_usage_metrics TO service_role;
GRANT INSERT ON TABLE public.csp_violations TO service_role;
GRANT INSERT ON TABLE public.security_alerts TO service_role;

COMMIT;
