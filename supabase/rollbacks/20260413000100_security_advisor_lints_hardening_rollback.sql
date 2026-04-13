-- ================================================================
-- ROLLBACK: Supabase Security Advisor Lints Hardening
-- ================================================================
-- 対象: 20260413000100_security_advisor_lints_hardening.sql
-- 関連:
--   - docs/stabilization/rollback-security-advisor-lints-v0.1.md
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Restore function search_path defaults
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
BEGIN
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
            'ALTER FUNCTION %I.%I(%s) RESET search_path',
            function_record.schema_name,
            function_record.function_name,
            function_record.identity_args
        );
    END LOOP;
END
$$;

-- ----------------------------------------------------------------
-- 2. Move pg_trgm back to public schema
-- ----------------------------------------------------------------
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

    IF extension_schema = 'extensions' THEN
        ALTER EXTENSION pg_trgm SET SCHEMA public;
    END IF;
END
$$;

-- ----------------------------------------------------------------
-- 3. Re-open materialized view grants for API roles
-- ----------------------------------------------------------------
GRANT ALL ON TABLE public.daily_reservation_stats TO anon;
GRANT ALL ON TABLE public.daily_reservation_stats TO authenticated;
GRANT ALL ON TABLE public.daily_reservation_stats TO service_role;

-- ----------------------------------------------------------------
-- 4. Restore SECURITY DEFINER semantics on exposed views
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 5. Restore permissive INSERT policies / grants
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert metrics" ON public.beta_usage_metrics;
CREATE POLICY "System can insert metrics"
    ON public.beta_usage_metrics
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "csp_violations_insert_any" ON public.csp_violations;
CREATE POLICY "csp_violations_insert_any"
    ON public.csp_violations
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "security_alerts_insert_any" ON public.security_alerts;
CREATE POLICY "security_alerts_insert_any"
    ON public.security_alerts
    FOR INSERT
    WITH CHECK (true);

GRANT INSERT ON TABLE public.beta_usage_metrics TO anon;
GRANT INSERT ON TABLE public.beta_usage_metrics TO authenticated;
GRANT INSERT ON TABLE public.csp_violations TO anon;
GRANT INSERT ON TABLE public.csp_violations TO authenticated;
GRANT INSERT ON TABLE public.security_alerts TO anon;
GRANT INSERT ON TABLE public.security_alerts TO authenticated;
GRANT INSERT ON TABLE public.beta_usage_metrics TO service_role;
GRANT INSERT ON TABLE public.csp_violations TO service_role;
GRANT INSERT ON TABLE public.security_alerts TO service_role;

COMMIT;
