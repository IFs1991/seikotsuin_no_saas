-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_invite"("invite_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_invite RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
    END IF;

    -- 招待を取得
    SELECT * INTO v_invite
    FROM public.staff_invites
    WHERE token = invite_token
    AND expires_at > NOW()
    AND accepted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '有効な招待が見つかりません');
    END IF;

    -- 招待を受諾済みに更新
    UPDATE public.staff_invites
    SET accepted_at = NOW(), accepted_by = v_user_id, updated_at = NOW()
    WHERE id = v_invite.id;

    -- プロフィールを更新
    UPDATE public.profiles
    SET clinic_id = v_invite.clinic_id, role = v_invite.role, updated_at = NOW()
    WHERE user_id = v_user_id;

    -- user_permissionsを作成/更新
    INSERT INTO public.user_permissions (staff_id, clinic_id, role, username, hashed_password)
    VALUES (v_user_id, v_invite.clinic_id, v_invite.role, v_invite.email, 'managed_by_supabase')
    ON CONFLICT (staff_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role;

    RETURN jsonb_build_object('success', true, 'clinic_id', v_invite.clinic_id);
END;
$$;


ALTER FUNCTION "public"."accept_invite"("invite_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggregate_mfa_stats"("p_clinic_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_total_users INTEGER;
    v_mfa_enabled_users INTEGER;
    v_totp_attempts INTEGER;
    v_totp_successes INTEGER;
    v_backup_code_uses INTEGER;
BEGIN
    -- 総ユーザー数
    SELECT COUNT(*) INTO v_total_users
    FROM profiles
    WHERE clinic_id = p_clinic_id
    AND is_active = true;
    
    -- MFA有効ユーザー数
    SELECT COUNT(*) INTO v_mfa_enabled_users
    FROM user_mfa_settings ums
    JOIN profiles p ON ums.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND ums.is_enabled = true;
    
    -- TOTP試行回数
    SELECT COUNT(*) INTO v_totp_attempts
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type IN ('mfa_totp_success', 'mfa_totp_failed')
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- TOTP成功回数
    SELECT COUNT(*) INTO v_totp_successes
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type = 'mfa_totp_success'
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- バックアップコード使用回数
    SELECT COUNT(*) INTO v_backup_code_uses
    FROM security_events se
    JOIN profiles p ON se.user_id = p.user_id
    WHERE p.clinic_id = p_clinic_id
    AND se.event_type = 'mfa_backup_code_success'
    AND se.created_at >= p_start_date
    AND se.created_at <= p_end_date;
    
    -- 統計データ挿入/更新
    INSERT INTO mfa_usage_stats (
        clinic_id, period_start, period_end,
        total_users, mfa_enabled_users, 
        totp_attempts, totp_successes, backup_code_uses
    ) VALUES (
        p_clinic_id, p_start_date, p_end_date,
        v_total_users, v_mfa_enabled_users,
        v_totp_attempts, v_totp_successes, v_backup_code_uses
    )
    ON CONFLICT (clinic_id, period_start, period_end)
    DO UPDATE SET
        total_users = EXCLUDED.total_users,
        mfa_enabled_users = EXCLUDED.mfa_enabled_users,
        totp_attempts = EXCLUDED.totp_attempts,
        totp_successes = EXCLUDED.totp_successes,
        backup_code_uses = EXCLUDED.backup_code_uses,
        created_at = NOW();
END;
$$;


ALTER FUNCTION "public"."aggregate_mfa_stats"("p_clinic_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_patient_segments"("clinic_uuid" "uuid") RETURNS TABLE("segment_type" character varying, "segment_value" character varying, "patient_count" integer, "total_revenue" numeric, "avg_ltv" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- 年齢層別セグメント
    RETURN QUERY
    SELECT 
        'age_group'::VARCHAR(50) as segment_type,
        CASE 
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 30 THEN '20代以下'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 40 THEN '30代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 50 THEN '40代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 60 THEN '50代'
            ELSE '60代以上'
        END::VARCHAR(100) as segment_value,
        COUNT(DISTINCT p.id)::INTEGER as patient_count,
        COALESCE(SUM(r.amount), 0)::DECIMAL(10,2) as total_revenue,
        AVG(calculate_patient_ltv(p.id))::DECIMAL(10,2) as avg_ltv
    FROM patients p
    LEFT JOIN revenues r ON p.id = r.patient_id
    WHERE p.clinic_id = clinic_uuid
    AND p.date_of_birth IS NOT NULL
    GROUP BY 
        CASE 
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 30 THEN '20代以下'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 40 THEN '30代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 50 THEN '40代'
            WHEN EXTRACT(YEAR FROM AGE(p.date_of_birth)) < 60 THEN '50代'
            ELSE '60代以上'
        END

    UNION ALL

    -- 来院頻度別セグメント
    SELECT 
        'visit_frequency'::VARCHAR(50) as segment_type,
        pvs.visit_category::VARCHAR(100) as segment_value,
        COUNT(pvs.patient_id)::INTEGER as patient_count,
        SUM(pvs.total_revenue)::DECIMAL(10,2) as total_revenue,
        AVG(calculate_patient_ltv(pvs.patient_id))::DECIMAL(10,2) as avg_ltv
    FROM patient_visit_summary pvs
    WHERE pvs.clinic_id = clinic_uuid
    GROUP BY pvs.visit_category;
END;
$$;


ALTER FUNCTION "public"."analyze_patient_segments"("clinic_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_staff_efficiency"("clinic_uuid" "uuid", "analysis_period" integer DEFAULT 30) RETURNS TABLE("staff_id" "uuid", "staff_name" character varying, "efficiency_score" numeric, "revenue_per_hour" numeric, "patients_per_day" numeric, "satisfaction_trend" character varying)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as staff_id,
        s.name as staff_name,
        -- 効率スコア（売上 × 満足度 ÷ 勤務日数）
        (COALESCE(sps.total_revenue_generated, 0) * COALESCE(sps.average_satisfaction_score, 3) / NULLIF(sps.working_days, 0))::DECIMAL(5,2) as efficiency_score,
        (COALESCE(sps.total_revenue_generated, 0) / NULLIF(sps.working_days * 8, 0))::DECIMAL(10,2) as revenue_per_hour,
        (COALESCE(sps.unique_patients, 0)::DECIMAL / NULLIF(sps.working_days, 0))::DECIMAL(5,2) as patients_per_day,
        CASE 
            WHEN sps.average_satisfaction_score >= 4.5 THEN 'excellent'
            WHEN sps.average_satisfaction_score >= 4.0 THEN 'good'
            WHEN sps.average_satisfaction_score >= 3.5 THEN 'average'
            ELSE 'needs_improvement'
        END::VARCHAR(20) as satisfaction_trend
    FROM staff s
    LEFT JOIN staff_performance_summary sps ON s.id = sps.staff_id
    WHERE s.clinic_id = clinic_uuid
    AND s.is_therapist = TRUE
    ORDER BY efficiency_score DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."analyze_staff_efficiency"("clinic_uuid" "uuid", "analysis_period" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    -- Delegate to parent-scope enabled function
    -- DEPRECATED: Direct use of can_access_clinic() is recommended
    RETURN public.can_access_clinic(target_clinic_id);
END;
$$;


ALTER FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") IS 'DEPRECATED: Use public.can_access_clinic() directly.
This function now delegates to can_access_clinic() for parent-scope support.
Kept for backward compatibility with existing policies.';



CREATE OR REPLACE FUNCTION "public"."calculate_churn_risk_score"("patient_uuid" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    last_visit_days INTEGER;
    visit_frequency DECIMAL(10,2);
    avg_gap_days DECIMAL(10,2);
    risk_score DECIMAL(5,2);
BEGIN
    -- 最後の来院からの日数
    SELECT EXTRACT(DAY FROM NOW() - MAX(visit_date))
    INTO last_visit_days
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    -- 平均来院間隔
    SELECT AVG(EXTRACT(DAY FROM visit_date - LAG(visit_date) OVER (ORDER BY visit_date)))
    INTO avg_gap_days
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    -- リスクスコア計算（0-100）
    IF last_visit_days IS NULL OR avg_gap_days IS NULL THEN
        RETURN 0;
    END IF;
    
    risk_score := CASE 
        WHEN last_visit_days <= avg_gap_days THEN 0
        WHEN last_visit_days <= avg_gap_days * 2 THEN 25
        WHEN last_visit_days <= avg_gap_days * 3 THEN 50
        WHEN last_visit_days <= avg_gap_days * 4 THEN 75
        ELSE 100
    END;
    
    RETURN risk_score;
END;
$$;


ALTER FUNCTION "public"."calculate_churn_risk_score"("patient_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_patient_ltv"("patient_uuid" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    avg_revenue_per_visit DECIMAL(10,2);
    visit_frequency DECIMAL(10,2);
    total_visits INTEGER;
    months_active DECIMAL(10,2);
    predicted_ltv DECIMAL(10,2);
BEGIN
    -- 平均単価取得
    SELECT AVG(r.amount)
    INTO avg_revenue_per_visit
    FROM revenues r
    WHERE r.patient_id = patient_uuid;
    
    -- 来院頻度と期間取得
    SELECT 
        COUNT(*),
        EXTRACT(MONTH FROM AGE(MAX(visit_date), MIN(visit_date))) + 1
    INTO total_visits, months_active
    FROM visits 
    WHERE patient_id = patient_uuid;
    
    IF avg_revenue_per_visit IS NULL OR total_visits = 0 OR months_active = 0 THEN
        RETURN 0;
    END IF;
    
    -- 月あたり来院頻度
    visit_frequency := total_visits / months_active;
    
    -- 12ヶ月予測LTV
    predicted_ltv := avg_revenue_per_visit * visit_frequency * 12;
    
    RETURN predicted_ltv;
END;
$$;


ALTER FUNCTION "public"."calculate_patient_ltv"("patient_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") IS 'Checks if user can access target clinic using parent-scope model.
Priority: clinic_scope_ids array > clinic_id fallback.
Admin bypass REMOVED: admin is also scoped to their parent organization.
O(1) JWT comparison, no DB lookup.';



CREATE OR REPLACE FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("has_conflict" boolean, "conflict_type" character varying, "conflict_reason" "text", "conflicting_reservation_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- 予約の重複チェック
    RETURN QUERY
    SELECT
        true AS has_conflict,
        'reservation' AS conflict_type,
        'この時間帯は既に予約が入っています' AS conflict_reason,
        r.id AS conflicting_reservation_id
    FROM public.reservations r
    WHERE r.staff_id = p_staff_id
        AND r.is_deleted = false
        AND r.status NOT IN ('cancelled', 'no_show')
        AND (p_exclude_reservation_id IS NULL OR r.id != p_exclude_reservation_id)
        AND r.start_time < p_end_time
        AND r.end_time > p_start_time
    LIMIT 1;

    -- 重複がなければ空の結果を返す
    IF NOT FOUND THEN
        -- ブロックのチェック
        RETURN QUERY
        SELECT
            true AS has_conflict,
            'block' AS conflict_type,
            COALESCE('販売停止期間: ' || b.reason, '販売停止期間') AS conflict_reason,
            b.id AS conflicting_reservation_id
        FROM public.blocks b
        WHERE b.resource_id = p_staff_id
            AND b.is_deleted = false
            AND b.is_active = true
            AND b.start_time < p_end_time
            AND b.end_time > p_start_time
        LIMIT 1;
    END IF;

    -- ブロックもなければ競合なし
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            false AS has_conflict,
            NULL::VARCHAR(50) AS conflict_type,
            NULL::TEXT AS conflict_reason,
            NULL::UUID AS conflicting_reservation_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid") IS '予約の重複・ブロックチェック関数';



CREATE OR REPLACE FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text" DEFAULT NULL::"text", "p_phone_number" "text" DEFAULT NULL::"text", "p_opening_date" "date" DEFAULT NULL::"date", "p_parent_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_clinic_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '認証が必要です');
    END IF;

    -- Get user's email address
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- Validate parent_id if provided
    IF p_parent_id IS NOT NULL THEN
        PERFORM 1 FROM public.clinics WHERE id = p_parent_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', '親クリニックが見つかりません');
        END IF;
    END IF;

    -- 1. Create clinic (with parent_id if provided)
    INSERT INTO public.clinics (name, address, phone_number, opening_date, parent_id, is_active)
    VALUES (p_name, p_address, p_phone_number, p_opening_date, p_parent_id, true)
    RETURNING id INTO v_clinic_id;

    -- 2. Update profile
    UPDATE public.profiles
    SET clinic_id = v_clinic_id, role = 'admin', updated_at = NOW()
    WHERE user_id = v_user_id;

    -- 3. Create/update user_permissions
    INSERT INTO public.user_permissions (staff_id, clinic_id, role, username, hashed_password)
    VALUES (v_user_id, v_clinic_id, 'admin', COALESCE(v_user_email, ''), 'managed_by_supabase')
    ON CONFLICT (staff_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, role = EXCLUDED.role;

    -- 4. Update onboarding state
    INSERT INTO public.onboarding_states (user_id, clinic_id, current_step)
    VALUES (v_user_id, v_clinic_id, 'invites')
    ON CONFLICT (user_id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id, current_step = 'invites', updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'clinic_id', v_clinic_id,
        'parent_id', p_parent_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text", "p_phone_number" "text", "p_opening_date" "date", "p_parent_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text", "p_phone_number" "text", "p_opening_date" "date", "p_parent_id" "uuid") IS 'Creates a clinic with the current user as admin.
p_parent_id: Optional parent clinic ID for parent-child hierarchy.
When parent_id is set, the clinic becomes a child of the specified parent organization.
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md';



CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
    claims jsonb;
    user_clinic_id uuid;
    user_role_val text;
    parent_clinic_id uuid;
    scope_ids uuid[];
    has_parent_id_column boolean;
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
    IF user_clinic_id IS NOT NULL THEN
        -- Check if parent_id column exists
        SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'clinics'
              AND column_name = 'parent_id'
        ) INTO has_parent_id_column;

        IF has_parent_id_column THEN
            -- Get parent organization ID
            EXECUTE format(
                'SELECT parent_id FROM public.clinics WHERE id = $1'
            ) INTO parent_clinic_id USING user_clinic_id;

            IF parent_clinic_id IS NOT NULL THEN
                -- User's clinic has a parent: get all sibling clinic IDs under the same parent
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING parent_clinic_id;
            ELSE
                -- User's clinic has parent_id IS NULL (HQ case)
                -- HQ is its own parent: get HQ itself + all children
                EXECUTE format(
                    'SELECT ARRAY_AGG(c.id) FROM public.clinics c
                     WHERE c.parent_id = $1 OR c.id = $1'
                ) INTO scope_ids USING user_clinic_id;
            END IF;
        ELSE
            -- No parent_id column: use single clinic
            scope_ids := ARRAY[user_clinic_id];
        END IF;

        -- Ensure scope_ids is not NULL
        IF scope_ids IS NULL THEN
            scope_ids := ARRAY[user_clinic_id];
        END IF;
    END IF;

    -- Add clinic_scope_ids claim if we have scope
    IF scope_ids IS NOT NULL AND array_length(scope_ids, 1) > 0 THEN
        claims := jsonb_set(claims, '{clinic_scope_ids}', to_jsonb(scope_ids));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$_$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") IS 'Supabase Auth hook to include clinic_id, user_role, and clinic_scope_ids in JWT claims.
clinic_scope_ids contains all clinics under the same parent organization (sibling access).
When parent_id IS NULL (HQ), the clinic is considered its own parent - scope includes itself + all children.
Configure in Supabase Dashboard -> Auth -> Hooks -> Customize Access Token.
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md (追加修正作業３)';



CREATE OR REPLACE FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- 暗号化鍵を設定から取得
    BEGIN
        encryption_key := current_setting('app.settings.mfa_encryption_key', true);
    EXCEPTION WHEN OTHERS THEN
        encryption_key := NULL;
    END;

    -- 暗号化鍵が未設定の場合はそのまま返す（平文保存されている前提）
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RETURN encrypted_text;
    END IF;

    -- pgp_sym_decrypt で復号化
    RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), encryption_key);
EXCEPTION WHEN OTHERS THEN
    -- 復号化失敗時（平文データの場合等）はそのまま返す
    RETURN encrypted_text;
END;
$$;


ALTER FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") IS 'MFA秘密鍵復号化関数（pgp_sym_decrypt）。
SECURITY DEFINER。EXECUTE は service_role 限定。
2026-02-22: authenticated EXECUTE を削除し service_role 限定へ変更。
復号化失敗時（平文データ後方互換）はそのまま返す。';



CREATE OR REPLACE FUNCTION "public"."decrypt_patient_data"("encrypted_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- 実際の実装では環境変数からキーを取得
    RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), current_setting('app.encryption_key', true));
END;
$$;


ALTER FUNCTION "public"."decrypt_patient_data"("encrypted_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- 暗号化鍵を設定から取得
    BEGIN
        encryption_key := current_setting('app.settings.mfa_encryption_key', true);
    EXCEPTION WHEN OTHERS THEN
        encryption_key := NULL;
    END;

    -- 暗号化鍵が未設定の場合は平文で返す（開発環境用）
    -- TODO: 本番環境では必ず暗号化鍵を設定すること
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RAISE WARNING '[SECURITY] MFA encryption key not configured. Storing secret in plaintext. Set app.settings.mfa_encryption_key before production use.';
        RETURN secret_text;
    END IF;

    -- pgp_sym_encrypt で暗号化
    RETURN encode(pgp_sym_encrypt(secret_text, encryption_key), 'base64');
END;
$$;


ALTER FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") IS 'MFA秘密鍵暗号化関数（pgp_sym_encrypt）。
SECURITY DEFINER。EXECUTE は service_role 限定。
2026-02-22: authenticated EXECUTE を削除し service_role 限定へ変更。
app.settings.mfa_encryption_key 未設定時は WARNING を出力し平文で返す（開発環境用）。';



CREATE OR REPLACE FUNCTION "public"."encrypt_patient_data"("plain_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- 実際の実装では環境変数からキーを取得
    -- ここでは例として固定値を使用（本番では変更必須）
    RETURN encode(pgp_sym_encrypt(plain_text, current_setting('app.encryption_key', true)), 'base64');
END;
$$;


ALTER FUNCTION "public"."encrypt_patient_data"("plain_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer DEFAULT 30) RETURNS TABLE("time_slot" time without time zone, "is_available" boolean, "conflict_reason" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_day_name TEXT;
    v_working_hours JSONB;
    v_start_time TIME;
    v_end_time TIME;
    v_current_time TIME;
    v_slot_end_time TIME;
BEGIN
    -- 曜日を取得
    v_day_name := LOWER(TO_CHAR(p_date, 'Day'));
    v_day_name := TRIM(v_day_name);

    -- 英語の曜日名に変換
    v_day_name := CASE v_day_name
        WHEN '月曜日' THEN 'monday'
        WHEN '火曜日' THEN 'tuesday'
        WHEN '水曜日' THEN 'wednesday'
        WHEN '木曜日' THEN 'thursday'
        WHEN '金曜日' THEN 'friday'
        WHEN '土曜日' THEN 'saturday'
        WHEN '日曜日' THEN 'sunday'
        ELSE TO_CHAR(p_date, 'Day')
    END;

    -- スタッフの営業時間を取得
    SELECT working_hours INTO v_working_hours
    FROM public.resources
    WHERE id = p_staff_id;

    IF v_working_hours IS NULL OR v_working_hours->v_day_name IS NULL THEN
        RETURN;
    END IF;

    v_start_time := (v_working_hours->v_day_name->>'start')::TIME;
    v_end_time := (v_working_hours->v_day_name->>'end')::TIME;

    -- 時間スロットを生成
    v_current_time := v_start_time;

    WHILE v_current_time < v_end_time LOOP
        v_slot_end_time := v_current_time + (p_duration_minutes || ' minutes')::INTERVAL;

        -- 営業時間内チェック
        IF v_slot_end_time <= v_end_time THEN
            -- 重複チェック
            DECLARE
                v_has_conflict BOOLEAN;
                v_conflict_reason TEXT;
            BEGIN
                SELECT
                    COALESCE(bool_or(true), false),
                    STRING_AGG(DISTINCT conflict_type, ', ')
                INTO v_has_conflict, v_conflict_reason
                FROM check_reservation_conflict(
                    p_staff_id,
                    (p_date + v_current_time)::TIMESTAMPTZ,
                    (p_date + v_slot_end_time)::TIMESTAMPTZ
                )
                WHERE has_conflict = true;

                RETURN QUERY SELECT
                    v_current_time,
                    NOT COALESCE(v_has_conflict, false),
                    v_conflict_reason;
            END;
        ELSE
            RETURN QUERY SELECT
                v_current_time,
                false,
                '営業時間外'::TEXT;
        END IF;

        v_current_time := v_current_time + (p_slot_interval_minutes || ' minutes')::INTERVAL;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer) IS '利用可能時間スロット取得関数';



CREATE OR REPLACE FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_settings JSONB;
    v_default_settings JSONB;
BEGIN
    -- カテゴリ別のデフォルト値を定義
    v_default_settings := CASE p_category
        WHEN 'clinic_basic' THEN '{
            "name": "",
            "zipCode": "",
            "address": "",
            "phone": "",
            "fax": "",
            "email": "",
            "website": "",
            "description": "",
            "logoUrl": null
        }'::JSONB

        WHEN 'clinic_hours' THEN '{
            "hoursByDay": {},
            "holidays": [],
            "specialClosures": []
        }'::JSONB

        WHEN 'booking_calendar' THEN '{
            "slotMinutes": 30,
            "maxConcurrent": 3,
            "weekStartDay": 1,
            "allowOnlineBooking": false
        }'::JSONB

        WHEN 'communication' THEN '{
            "emailEnabled": false,
            "smsEnabled": false,
            "lineEnabled": false,
            "pushEnabled": false,
            "smtpSettings": {
                "host": "",
                "port": 587,
                "user": "",
                "password": ""
            },
            "templates": []
        }'::JSONB

        WHEN 'system_security' THEN '{
            "passwordPolicy": {
                "minLength": 8,
                "requireUppercase": true,
                "requireNumbers": true,
                "requireSymbols": false
            },
            "twoFactorEnabled": false,
            "sessionTimeout": 30,
            "loginAttempts": 5,
            "lockoutDuration": 15
        }'::JSONB

        WHEN 'system_backup' THEN '{
            "autoBackup": false,
            "backupFrequency": "daily",
            "backupTime": "03:00",
            "retentionDays": 30,
            "cloudStorage": false,
            "storageProvider": "aws"
        }'::JSONB

        WHEN 'services_pricing' THEN '{
            "menus": [],
            "categories": [],
            "insuranceOptions": []
        }'::JSONB

        WHEN 'insurance_billing' THEN '{
            "insuranceTypes": [],
            "receiptSettings": {},
            "billingCycle": "monthly"
        }'::JSONB

        WHEN 'data_management' THEN '{
            "importMode": "update",
            "exportFormat": "csv",
            "retentionDays": 365
        }'::JSONB

        ELSE '{}'::JSONB
    END;

    -- 保存済み設定を取得
    SELECT settings INTO v_settings
    FROM public.clinic_settings
    WHERE clinic_id = p_clinic_id AND category = p_category;

    -- 保存済み設定があればそれを返す、なければデフォルト値を返す
    RETURN COALESCE(v_settings, v_default_settings);
END;
$$;


ALTER FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") IS 'クリニック設定を取得（未登録時はデフォルト値を返す）';



CREATE OR REPLACE FUNCTION "public"."get_current_clinic_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_clinic_id UUID;
    db_clinic_id UUID;
BEGIN
    -- 1. JWT app_metadata から取得を試みる
    BEGIN
        jwt_clinic_id := (current_setting('request.jwt.claims', true)::json->>'clinic_id')::UUID;
        IF jwt_clinic_id IS NOT NULL THEN
            RETURN jwt_clinic_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- JWT取得失敗時は継続
    END;

    -- 2. user_permissions テーブルからフォールバック
    SELECT clinic_id INTO db_clinic_id
    FROM public.user_permissions
    WHERE staff_id = auth.uid()
    LIMIT 1;

    RETURN db_clinic_id;
END;
$$;


ALTER FUNCTION "public"."get_current_clinic_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_clinic_id"() IS '現在のユーザーの所属clinic_idを取得。優先順位: JWT app_metadata > user_permissions テーブル。
adminユーザーはNULLを返す可能性がある。';



CREATE OR REPLACE FUNCTION "public"."get_current_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_role TEXT;
    jwt_role_legacy TEXT;
    db_role TEXT;
BEGIN
    -- 1. JWT app_metadata から user_role を取得（新方式）
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::json->>'user_role';
        IF jwt_role IS NOT NULL AND jwt_role != '' THEN
            RETURN jwt_role;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 2. JWT claims から role を取得（予約システム互換）
    BEGIN
        jwt_role_legacy := current_setting('request.jwt.claims', true)::json->>'role';
        IF jwt_role_legacy IS NOT NULL AND jwt_role_legacy != '' THEN
            RETURN jwt_role_legacy;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. user_permissions テーブルからフォールバック
    SELECT role INTO db_role
    FROM public.user_permissions
    WHERE staff_id = auth.uid()
    LIMIT 1;

    -- 4. 見つからない場合は最小権限（空文字列）
    RETURN COALESCE(db_role, '');
END;
$$;


ALTER FUNCTION "public"."get_current_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_role"() IS '現在のユーザーのロールを取得。優先順位: JWT app_metadata > user_permissions テーブル。
見つからない場合は空文字列を返す（最小権限原則）。';



CREATE OR REPLACE FUNCTION "public"."get_hourly_revenue_pattern"("clinic_uuid" "uuid") RETURNS TABLE("hour_of_day" integer, "total_revenue" numeric, "transaction_count" integer, "avg_transaction_amount" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM r.created_at)::INTEGER as hour_of_day,
        SUM(r.amount)::DECIMAL(10,2) as total_revenue,
        COUNT(r.id)::INTEGER as transaction_count,
        AVG(r.amount)::DECIMAL(10,2) as avg_transaction_amount
    FROM revenues r
    WHERE r.clinic_id = clinic_uuid
    AND r.revenue_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY EXTRACT(HOUR FROM r.created_at)
    ORDER BY hour_of_day;
END;
$$;


ALTER FUNCTION "public"."get_hourly_revenue_pattern"("clinic_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hourly_visit_pattern"("clinic_uuid" "uuid") RETURNS TABLE("hour_of_day" integer, "day_of_week" integer, "visit_count" integer, "avg_revenue" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM v.visit_date)::INTEGER as hour_of_day,
        EXTRACT(DOW FROM v.visit_date)::INTEGER as day_of_week,
        COUNT(v.id)::INTEGER as visit_count,
        AVG(r.amount)::DECIMAL(10,2) as avg_revenue
    FROM visits v
    LEFT JOIN revenues r ON v.id = r.visit_id
    WHERE v.clinic_id = clinic_uuid
    AND v.visit_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY 
        EXTRACT(HOUR FROM v.visit_date),
        EXTRACT(DOW FROM v.visit_date)
    ORDER BY day_of_week, hour_of_day;
END;
$$;


ALTER FUNCTION "public"."get_hourly_visit_pattern"("clinic_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_by_token"("invite_token" "uuid") RETURNS TABLE("id" "uuid", "clinic_id" "uuid", "email" character varying, "role" character varying, "expires_at" timestamp with time zone, "accepted_at" timestamp with time zone, "clinic_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        si.id,
        si.clinic_id,
        si.email,
        si.role,
        si.expires_at,
        si.accepted_at,
        c.name AS clinic_name
    FROM public.staff_invites si
    LEFT JOIN public.clinics c ON c.id = si.clinic_id
    WHERE si.token = invite_token
    AND si.expires_at > NOW()
    AND si.accepted_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."get_invite_by_token"("invite_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    parent UUID;
    siblings UUID[];
BEGIN
    -- Get parent of the given clinic
    SELECT c.parent_id INTO parent
    FROM public.clinics c
    WHERE c.id = clinic_id;

    IF parent IS NULL THEN
        -- This clinic might be a parent itself, get its children + itself
        SELECT ARRAY_AGG(c.id) INTO siblings
        FROM public.clinics c
        WHERE c.parent_id = clinic_id OR c.id = clinic_id;
    ELSE
        -- Get all clinics under the same parent + the parent itself
        SELECT ARRAY_AGG(c.id) INTO siblings
        FROM public.clinics c
        WHERE c.parent_id = parent OR c.id = parent;
    END IF;

    RETURN COALESCE(siblings, ARRAY[clinic_id]);
END;
$$;


ALTER FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") IS 'Returns array of clinic IDs that share the same parent organization.
Includes the parent clinic itself and all child clinics.
Used for debugging and admin operations.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN public.get_current_role() = 'admin';
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS '現在のユーザーがadminロールかどうかを判定。';



CREATE OR REPLACE FUNCTION "public"."jwt_clinic_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN (current_setting('request.jwt.claims', true)::json->>'clinic_id')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."jwt_clinic_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."jwt_clinic_id"() IS 'Returns clinic_id from JWT claims. O(1) performance, no DB lookup.';



CREATE OR REPLACE FUNCTION "public"."jwt_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."jwt_is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."jwt_is_admin"() IS 'Returns TRUE if JWT role is admin. O(1) performance, no DB lookup.';



CREATE OR REPLACE FUNCTION "public"."log_reservation_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
        NEW.clinic_id,  -- テナント境界を明示的にコピー
        'created',
        to_jsonb(NEW),
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_reservation_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_reservation_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
        OLD.clinic_id,  -- テナント境界を明示的にコピー
        'deleted',
        to_jsonb(OLD),
        auth.uid(),
        inet_client_addr()
    );
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."log_reservation_deleted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_reservation_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
        NEW.clinic_id,  -- テナント境界を明示的にコピー
        v_action,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_change_reason,
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_reservation_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."predict_revenue"("clinic_uuid" "uuid", "forecast_days" integer DEFAULT 30) RETURNS TABLE("forecast_date" "date", "predicted_revenue" numeric, "confidence_level" character varying)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    avg_daily_revenue DECIMAL(10,2);
    revenue_trend DECIMAL(10,2);
    day_counter INTEGER;
BEGIN
    -- 過去30日の平均売上を計算
    SELECT AVG(total_revenue), 
           (MAX(total_revenue) - MIN(total_revenue)) / 30
    INTO avg_daily_revenue, revenue_trend
    FROM daily_revenue_summary
    WHERE clinic_id = clinic_uuid
    AND revenue_date >= CURRENT_DATE - INTERVAL '30 days';

    -- 予測データを生成
    FOR day_counter IN 1..forecast_days LOOP
        RETURN QUERY
        SELECT 
            (CURRENT_DATE + day_counter)::DATE as forecast_date,
            GREATEST(0, avg_daily_revenue + (revenue_trend * day_counter))::DECIMAL(10,2) as predicted_revenue,
            CASE 
                WHEN day_counter <= 7 THEN 'high'
                WHEN day_counter <= 14 THEN 'medium'
                ELSE 'low'
            END::VARCHAR(20) as confidence_level;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."predict_revenue"("clinic_uuid" "uuid", "forecast_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_daily_stats"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_reservation_stats;
END;
$$;


ALTER FUNCTION "public"."refresh_daily_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_customer_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- 予約が完了ステータスに変更された場合
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN
        UPDATE public.customers
        SET
            total_visits = total_visits + 1,
            last_visit_date = NEW.end_time,
            total_revenue = total_revenue + COALESCE(NEW.actual_price, NEW.price, 0),
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_customer_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mfa_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_mfa_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_result_id UUID;
BEGIN
    -- カテゴリのバリデーション
    IF p_category NOT IN (
        'clinic_basic',
        'clinic_hours',
        'booking_calendar',
        'communication',
        'system_security',
        'system_backup',
        'services_pricing',
        'insurance_billing',
        'data_management'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', '不正なカテゴリです');
    END IF;

    -- upsert実行
    INSERT INTO public.clinic_settings (clinic_id, category, settings, updated_by)
    VALUES (p_clinic_id, p_category, p_settings, p_user_id)
    ON CONFLICT (clinic_id, category)
    DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    RETURNING id INTO v_result_id;

    RETURN jsonb_build_object('success', true, 'id', v_result_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") IS 'クリニック設定を保存（upsert）';



CREATE OR REPLACE FUNCTION "public"."user_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role_val TEXT;
BEGIN
    -- public.get_current_role() に委譲（統一されたロール判定）
    -- 予約システム互換: 空文字列の場合は 'anon' を返す
    user_role_val := public.get_current_role();
    IF user_role_val IS NULL OR user_role_val = '' THEN
        RETURN 'anon';
    END IF;
    RETURN user_role_val;
END;
$$;


ALTER FUNCTION "public"."user_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_role"() IS '現在のユーザーのロールを取得（予約システム互換）。
public.get_current_role() のラッパー。ロールが見つからない場合は "anon" を返す。';



CREATE OR REPLACE FUNCTION "public"."validate_blocks_clinic_refs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_blocks_clinic_refs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_reservation_history_clinic_refs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_reservation_history_clinic_refs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_reservations_clinic_refs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_reservations_clinic_refs"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid",
    "comment_date" "date" NOT NULL,
    "summary" "text",
    "good_points" "text",
    "improvement_points" "text",
    "suggestion_for_tomorrow" "text",
    "raw_ai_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."ai_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_comments" IS 'AI生成の日次コメント（daily_ai_commentsから統合）';



CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "appointment_number" character varying(50),
    "appointment_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "status" character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    "appointment_type" character varying(50) DEFAULT 'treatment'::character varying,
    "priority" character varying(20) DEFAULT 'normal'::character varying,
    "symptoms" "text",
    "requested_menus" "uuid"[],
    "special_requests" "text",
    "reminder_sent_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointments_priority_check" CHECK ((("priority")::"text" = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::"text"[]))),
    CONSTRAINT "appointments_start_before_end" CHECK (("start_time" < "end_time")),
    CONSTRAINT "appointments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::"text"[])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON TABLE "public"."appointments" IS '[LEGACY] 旧予約テーブル。Read-Only化済み（20260126000200）。
新規開発では reservations を使用すること。最終的にDROP予定。';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_type" character varying(50) NOT NULL,
    "user_id" "uuid",
    "user_email" character varying(255),
    "target_table" character varying(100),
    "target_id" "uuid",
    "clinic_id" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "details" "jsonb",
    "success" boolean DEFAULT true NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "affected_feature" "text",
    "steps_to_reproduce" "text",
    "expected_behavior" "text",
    "actual_behavior" "text",
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "priority" "text" DEFAULT 'p3'::"text" NOT NULL,
    "assigned_to" "uuid",
    "resolution" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "beta_feedback_category_check" CHECK (("category" = ANY (ARRAY['feature_request'::"text", 'bug_report'::"text", 'usability'::"text", 'performance'::"text", 'other'::"text"]))),
    CONSTRAINT "beta_feedback_priority_check" CHECK (("priority" = ANY (ARRAY['p0'::"text", 'p1'::"text", 'p2'::"text", 'p3'::"text"]))),
    CONSTRAINT "beta_feedback_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "beta_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'acknowledged'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_feedback" IS 'ベータユーザーからのフィードバック（要望・不具合報告）';



CREATE TABLE IF NOT EXISTS "public"."beta_usage_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "login_count" integer DEFAULT 0 NOT NULL,
    "unique_users" integer DEFAULT 0 NOT NULL,
    "dashboard_view_count" integer DEFAULT 0 NOT NULL,
    "daily_report_submissions" integer DEFAULT 0 NOT NULL,
    "patient_analysis_view_count" integer DEFAULT 0 NOT NULL,
    "average_session_duration" numeric(10,2) DEFAULT 0 NOT NULL,
    "daily_active_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "feature_adoption_rate" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "daily_report_completion_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "data_accuracy" numeric(5,2) DEFAULT 0 NOT NULL,
    "average_load_time" integer DEFAULT 0 NOT NULL,
    "error_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "period_check" CHECK (("period_end" > "period_start"))
);


ALTER TABLE "public"."beta_usage_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."beta_usage_metrics" IS 'ベータ運用期間中の利用状況メトリクス';



CREATE TABLE IF NOT EXISTS "public"."blocks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "recurrence_rule" "text",
    "recurrence_end_date" timestamp with time zone,
    "reason" character varying(255),
    "block_type" character varying(50) DEFAULT 'manual'::character varying,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "clinic_id" "uuid" NOT NULL,
    CONSTRAINT "blocks_block_type_check" CHECK ((("block_type")::"text" = ANY ((ARRAY['manual'::character varying, 'holiday'::character varying, 'vacation'::character varying, 'training'::character varying, 'maintenance'::character varying, 'emergency'::character varying])::"text"[]))),
    CONSTRAINT "blocks_check" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."blocks" OWNER TO "postgres";


COMMENT ON TABLE "public"."blocks" IS '販売停止（ブロック）テーブル';



COMMENT ON COLUMN "public"."blocks"."recurrence_rule" IS 'RFC 5545形式の繰り返しルール';



COMMENT ON COLUMN "public"."blocks"."block_type" IS 'ブロック種別（手動/祝日/休暇/研修等）';



COMMENT ON COLUMN "public"."blocks"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid",
    "sender" character varying(10) NOT NULL,
    "message_text" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "response_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "clinic_id" "uuid",
    "session_start_time" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "session_end_time" timestamp with time zone,
    "context_data" "jsonb",
    "is_admin_session" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "address" "text",
    "phone_number" character varying(20),
    "opening_date" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "parent_id" "uuid",
    CONSTRAINT "clinics_parent_id_not_self" CHECK ((("parent_id" IS NULL) OR ("parent_id" <> "id")))
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinics"."parent_id" IS 'Parent clinic ID for hierarchical organization structure.
NULL means this is a top-level (HQ) or standalone clinic.
Clinics with the same parent_id share tenant boundary (sibling access allowed).
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md';



CREATE OR REPLACE VIEW "public"."clinic_hierarchy" AS
 SELECT "c"."id",
    "c"."name",
    "c"."parent_id",
    "p"."name" AS "parent_name",
        CASE
            WHEN ("c"."parent_id" IS NULL) THEN 'HQ/Standalone'::"text"
            ELSE 'Child'::"text"
        END AS "clinic_type",
    ( SELECT "count"(*) AS "count"
           FROM "public"."clinics" "child"
          WHERE ("child"."parent_id" = "c"."id")) AS "child_count"
   FROM ("public"."clinics" "c"
     LEFT JOIN "public"."clinics" "p" ON (("c"."parent_id" = "p"."id")))
  WHERE ("c"."is_active" = true)
  ORDER BY COALESCE("c"."parent_id", "c"."id"), "c"."parent_id" NULLS FIRST, "c"."name";


ALTER VIEW "public"."clinic_hierarchy" OWNER TO "postgres";


COMMENT ON VIEW "public"."clinic_hierarchy" IS 'Hierarchical view of clinic parent-child relationships.
HQ/Standalone clinics are shown first, followed by their children.';



CREATE TABLE IF NOT EXISTS "public"."clinic_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinic_settings_category_check" CHECK (("category" = ANY (ARRAY['clinic_basic'::"text", 'clinic_hours'::"text", 'booking_calendar'::"text", 'communication'::"text", 'system_security'::"text", 'system_backup'::"text", 'services_pricing'::"text", 'insurance_billing'::"text", 'data_management'::"text"])))
);


ALTER TABLE "public"."clinic_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."clinic_settings" IS 'クリニック設定永続化テーブル';



COMMENT ON COLUMN "public"."clinic_settings"."clinic_id" IS '設定が属するクリニックID';



COMMENT ON COLUMN "public"."clinic_settings"."category" IS '設定カテゴリ（clinic_basic, clinic_hours, booking_calendar, communication, system_security, system_backup, services_pricing, insurance_billing, data_management）';



COMMENT ON COLUMN "public"."clinic_settings"."settings" IS 'カテゴリごとの設定値（JSONB形式）';



COMMENT ON COLUMN "public"."clinic_settings"."updated_by" IS '最終更新者のユーザーID';



CREATE TABLE IF NOT EXISTS "public"."critical_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "category" "text" NOT NULL,
    "affected_clinics" "uuid"[] DEFAULT '{}'::"uuid"[],
    "affected_users" integer DEFAULT 0 NOT NULL,
    "impact_description" "text" NOT NULL,
    "status" "text" DEFAULT 'detected'::"text" NOT NULL,
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "incident_commander" "uuid",
    "assigned_team" "uuid"[] DEFAULT '{}'::"uuid"[],
    "root_cause" "text",
    "mitigation_steps" "text"[] DEFAULT '{}'::"text"[],
    "prevention_measures" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "critical_incidents_category_check" CHECK (("category" = ANY (ARRAY['security'::"text", 'data_loss'::"text", 'service_outage'::"text", 'performance'::"text", 'other'::"text"]))),
    CONSTRAINT "critical_incidents_severity_check" CHECK (("severity" = ANY (ARRAY['p0'::"text", 'p1'::"text", 'p2'::"text", 'p3'::"text"]))),
    CONSTRAINT "critical_incidents_status_check" CHECK (("status" = ANY (ARRAY['detected'::"text", 'investigating'::"text", 'mitigating'::"text", 'resolved'::"text", 'post_mortem'::"text"])))
);


ALTER TABLE "public"."critical_incidents" OWNER TO "postgres";


COMMENT ON TABLE "public"."critical_incidents" IS '重大インシデント管理';



CREATE TABLE IF NOT EXISTS "public"."csp_violations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "document_uri" "text" NOT NULL,
    "violated_directive" "text" NOT NULL,
    "blocked_uri" "text",
    "effective_directive" "text",
    "original_policy" "text",
    "disposition" "text" DEFAULT 'report'::"text",
    "line_number" integer,
    "column_number" integer,
    "source_file" "text",
    "script_sample" "text",
    "referrer" "text",
    "client_ip" "inet",
    "user_agent" "text",
    "severity" "text" DEFAULT 'low'::"text" NOT NULL,
    "threat_score" integer DEFAULT 0,
    "is_false_positive" boolean DEFAULT false,
    "notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "csp_violations_disposition_check" CHECK (("disposition" = ANY (ARRAY['enforce'::"text", 'report'::"text"]))),
    CONSTRAINT "csp_violations_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "csp_violations_threat_score_check" CHECK ((("threat_score" >= 0) AND ("threat_score" <= 100)))
);


ALTER TABLE "public"."csp_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "name_kana" character varying(255),
    "phone" character varying(20) NOT NULL,
    "email" character varying(255),
    "line_user_id" character varying(255),
    "line_display_name" character varying(255),
    "custom_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "consent_marketing" boolean DEFAULT false,
    "consent_reminder" boolean DEFAULT false,
    "consent_date" timestamp with time zone,
    "notes" "text",
    "tags" "text"[],
    "segment" character varying(50),
    "total_visits" integer DEFAULT 0,
    "last_visit_date" timestamp with time zone,
    "total_revenue" numeric(10,2) DEFAULT 0,
    "lifetime_value" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "clinic_id" "uuid" NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."customers" IS '顧客マスターテーブル';



COMMENT ON COLUMN "public"."customers"."custom_attributes" IS 'カスタム属性（事前ヒアリング、アレルギー情報等）';



COMMENT ON COLUMN "public"."customers"."lifetime_value" IS '顧客生涯価値（LTV）';



COMMENT ON COLUMN "public"."customers"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



CREATE TABLE IF NOT EXISTS "public"."daily_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid",
    "report_date" "date" NOT NULL,
    "staff_id" "uuid",
    "total_patients" integer DEFAULT 0,
    "new_patients" integer DEFAULT 0,
    "total_revenue" numeric(10,2) DEFAULT 0.00,
    "insurance_revenue" numeric(10,2) DEFAULT 0.00,
    "private_revenue" numeric(10,2) DEFAULT 0.00,
    "report_text" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."daily_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "menu_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" character varying(50) DEFAULT 'unconfirmed'::character varying NOT NULL,
    "channel" character varying(50) DEFAULT 'phone'::character varying NOT NULL,
    "booker_name" character varying(255),
    "booker_phone" character varying(20),
    "notes" "text",
    "selected_options" "jsonb" DEFAULT '[]'::"jsonb",
    "cancellation_reason" "text",
    "no_show_reason" "text",
    "price" numeric(10,2),
    "actual_price" numeric(10,2),
    "payment_status" character varying(50) DEFAULT 'unpaid'::character varying,
    "reminder_sent" boolean DEFAULT false,
    "reminder_sent_at" timestamp with time zone,
    "confirmation_sent" boolean DEFAULT false,
    "confirmation_sent_at" timestamp with time zone,
    "reservation_group_id" "uuid",
    "is_recurring" boolean DEFAULT false,
    "recurrence_parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "clinic_id" "uuid" NOT NULL,
    CONSTRAINT "reservations_channel_check" CHECK ((("channel")::"text" = ANY ((ARRAY['line'::character varying, 'web'::character varying, 'phone'::character varying, 'walk_in'::character varying])::"text"[]))),
    CONSTRAINT "reservations_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "reservations_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['unpaid'::character varying, 'paid'::character varying, 'partial'::character varying, 'refunded'::character varying])::"text"[]))),
    CONSTRAINT "reservations_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['tentative'::character varying, 'confirmed'::character varying, 'arrived'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying, 'unconfirmed'::character varying, 'trial'::character varying])::"text"[])))
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


COMMENT ON TABLE "public"."reservations" IS '予約トランザクションテーブル';



COMMENT ON COLUMN "public"."reservations"."status" IS '予約ステータス（8種類）';



COMMENT ON COLUMN "public"."reservations"."channel" IS '予約チャネル（LINE/Web/電話/来院）';



COMMENT ON COLUMN "public"."reservations"."reservation_group_id" IS '複数日予約の同一グループID';



COMMENT ON COLUMN "public"."reservations"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



CREATE MATERIALIZED VIEW "public"."daily_reservation_stats" AS
 SELECT "date"("start_time") AS "reservation_date",
    "staff_id",
    "count"(*) AS "total_reservations",
    "count"(*) FILTER (WHERE (("status")::"text" = 'completed'::"text")) AS "completed_count",
    "count"(*) FILTER (WHERE (("status")::"text" = 'cancelled'::"text")) AS "cancelled_count",
    "count"(*) FILTER (WHERE (("status")::"text" = 'no_show'::"text")) AS "no_show_count",
    "sum"("actual_price") FILTER (WHERE (("status")::"text" = 'completed'::"text")) AS "total_revenue",
    "avg"((EXTRACT(epoch FROM ("end_time" - "start_time")) / (60)::numeric)) AS "avg_duration_minutes"
   FROM "public"."reservations"
  WHERE ("is_deleted" = false)
  GROUP BY ("date"("start_time")), "staff_id"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."daily_reservation_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."daily_revenue_summary" AS
 SELECT "r"."clinic_id",
    "c"."name" AS "clinic_name",
    "date"(("r"."start_time" AT TIME ZONE 'Asia/Tokyo'::"text")) AS "revenue_date",
    "count"(DISTINCT "r"."customer_id") AS "unique_patients",
    "count"("r"."id") AS "total_transactions",
    COALESCE("sum"(COALESCE("r"."actual_price", "r"."price", (0)::numeric)), (0)::numeric) AS "total_revenue",
    COALESCE("sum"(COALESCE("r"."actual_price", "r"."price", (0)::numeric)), (0)::numeric) AS "insurance_revenue",
    (0)::numeric(10,2) AS "private_revenue",
    COALESCE("avg"(COALESCE("r"."actual_price", "r"."price", (0)::numeric)), (0)::numeric) AS "average_transaction_amount"
   FROM ("public"."reservations" "r"
     JOIN "public"."clinics" "c" ON (("r"."clinic_id" = "c"."id")))
  WHERE (("r"."is_deleted" = false) AND (("r"."status")::"text" = ANY ((ARRAY['completed'::character varying, 'arrived'::character varying])::"text"[])) AND ("r"."clinic_id" IS NOT NULL))
  GROUP BY "r"."clinic_id", "c"."name", ("date"(("r"."start_time" AT TIME ZONE 'Asia/Tokyo'::"text")))
  ORDER BY ("date"(("r"."start_time" AT TIME ZONE 'Asia/Tokyo'::"text"))) DESC;


ALTER VIEW "public"."daily_revenue_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_revenue_summary" IS '日次収益サマリー（新スキーマ対応版）- reservationsテーブルから集計';



CREATE TABLE IF NOT EXISTS "public"."encryption_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "key_name" character varying(100) NOT NULL,
    "algorithm" character varying(50) DEFAULT 'aes-256'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" timestamp with time zone,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."encryption_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."improvement_backlog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "priority" "text" NOT NULL,
    "estimated_effort" "text" NOT NULL,
    "business_value" integer NOT NULL,
    "related_feedback_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "affected_clinics" "uuid"[] DEFAULT '{}'::"uuid"[],
    "status" "text" DEFAULT 'backlog'::"text" NOT NULL,
    "milestone" "text",
    "assigned_to" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "improvement_backlog_business_value_check" CHECK ((("business_value" >= 1) AND ("business_value" <= 10))),
    CONSTRAINT "improvement_backlog_category_check" CHECK (("category" = ANY (ARRAY['feature'::"text", 'enhancement'::"text", 'bug_fix'::"text", 'technical_debt'::"text", 'documentation'::"text"]))),
    CONSTRAINT "improvement_backlog_estimated_effort_check" CHECK (("estimated_effort" = ANY (ARRAY['xs'::"text", 's'::"text", 'm'::"text", 'l'::"text", 'xl'::"text"]))),
    CONSTRAINT "improvement_backlog_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "improvement_backlog_status_check" CHECK (("status" = ANY (ARRAY['backlog'::"text", 'planned'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."improvement_backlog" OWNER TO "postgres";


COMMENT ON TABLE "public"."improvement_backlog" IS '改善バックログ（ベータ運用）';



COMMENT ON COLUMN "public"."improvement_backlog"."category" IS '分類: feature, enhancement, bug_fix, technical_debt, documentation';



COMMENT ON COLUMN "public"."improvement_backlog"."priority" IS '優先度: critical, high, medium, low';



COMMENT ON COLUMN "public"."improvement_backlog"."estimated_effort" IS '見積工数: xs, s, m, l, xl';



COMMENT ON COLUMN "public"."improvement_backlog"."business_value" IS 'ビジネス価値 (1-10)';



COMMENT ON COLUMN "public"."improvement_backlog"."status" IS 'ステータス: backlog, planned, in_progress, completed, cancelled';



CREATE TABLE IF NOT EXISTS "public"."master_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."master_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_patient_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."master_patient_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_payment_methods" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."master_payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "color_code" character varying(7) DEFAULT '#3B82F6'::character varying,
    "icon_name" character varying(50),
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menus" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "category" character varying(100),
    "price" numeric(10,2) NOT NULL,
    "duration_minutes" integer NOT NULL,
    "insurance_type" character varying(50),
    "insurance_points" integer,
    "requires_room" boolean DEFAULT false,
    "requires_device" character varying(100),
    "max_concurrent" integer DEFAULT 1,
    "buffer_before_minutes" integer DEFAULT 0,
    "buffer_after_minutes" integer DEFAULT 0,
    "display_order" integer DEFAULT 0,
    "color" character varying(7),
    "icon" character varying(50),
    "options" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "is_public" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "clinic_id" "uuid" NOT NULL,
    "code" character varying(50),
    "category_id" "uuid",
    "is_insurance_applicable" boolean DEFAULT false,
    "body_parts" "text"[],
    "contraindications" "text"[],
    "treatment_type" character varying(100),
    "max_sessions_per_day" integer,
    "required_qualifications" "text"[],
    "equipment_required" "text"[],
    CONSTRAINT "menus_duration_minutes_check" CHECK (("duration_minutes" > 0))
);


ALTER TABLE "public"."menus" OWNER TO "postgres";


COMMENT ON TABLE "public"."menus" IS '施術メニューマスターテーブル';



COMMENT ON COLUMN "public"."menus"."insurance_type" IS '保険適用区分（保険/自費/混合）';



COMMENT ON COLUMN "public"."menus"."buffer_before_minutes" IS '前準備時間（分）';



COMMENT ON COLUMN "public"."menus"."buffer_after_minutes" IS '後片付け時間（分）';



COMMENT ON COLUMN "public"."menus"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



COMMENT ON COLUMN "public"."menus"."code" IS '施術コード（クリニック内で一意）';



COMMENT ON COLUMN "public"."menus"."category_id" IS 'メニューカテゴリID';



COMMENT ON COLUMN "public"."menus"."is_insurance_applicable" IS '保険適用可否';



COMMENT ON COLUMN "public"."menus"."body_parts" IS '対象部位';



COMMENT ON COLUMN "public"."menus"."contraindications" IS '禁忌事項';



COMMENT ON COLUMN "public"."menus"."treatment_type" IS '施術タイプ';



COMMENT ON COLUMN "public"."menus"."max_sessions_per_day" IS '1日の最大施術回数';



COMMENT ON COLUMN "public"."menus"."required_qualifications" IS '必要資格';



COMMENT ON COLUMN "public"."menus"."equipment_required" IS '必要機器';



CREATE TABLE IF NOT EXISTS "public"."mfa_setup_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "secret_key" "text" NOT NULL,
    "backup_codes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_setup_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."mfa_setup_sessions" IS 'MFAセットアップセッションテーブル - セットアップ過程の一時的な情報を保存';



CREATE TABLE IF NOT EXISTS "public"."mfa_usage_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "total_users" integer DEFAULT 0 NOT NULL,
    "mfa_enabled_users" integer DEFAULT 0 NOT NULL,
    "totp_attempts" integer DEFAULT 0 NOT NULL,
    "totp_successes" integer DEFAULT 0 NOT NULL,
    "backup_code_uses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_usage_stats" OWNER TO "postgres";


COMMENT ON TABLE "public"."mfa_usage_stats" IS 'MFA利用統計テーブル - クリニック別の利用状況を集計';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "clinic_id" "uuid",
    "title" character varying(255) NOT NULL,
    "message" "text" NOT NULL,
    "type" character varying(50) DEFAULT 'info'::character varying NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "related_entity_type" character varying(50),
    "related_entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_states" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid",
    "current_step" character varying(20) DEFAULT 'profile'::character varying NOT NULL,
    "completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_states_current_step_check" CHECK ((("current_step")::"text" = ANY ((ARRAY['profile'::character varying, 'clinic'::character varying, 'invites'::character varying, 'seed'::character varying, 'completed'::character varying])::"text"[])))
);


ALTER TABLE "public"."onboarding_states" OWNER TO "postgres";


COMMENT ON TABLE "public"."onboarding_states" IS 'オンボーディング進捗管理テーブル';



COMMENT ON COLUMN "public"."onboarding_states"."current_step" IS 'profile/clinic/invites/seed/completed';



CREATE OR REPLACE VIEW "public"."patient_visit_summary" AS
 SELECT "cu"."id" AS "patient_id",
    "cu"."name" AS "patient_name",
    "cu"."clinic_id",
    COALESCE("date"(("min"("rv"."start_time") AT TIME ZONE 'Asia/Tokyo'::"text")), "date"(("cu"."created_at" AT TIME ZONE 'Asia/Tokyo'::"text"))) AS "first_visit_date",
    "date"(("max"("rv"."start_time") AT TIME ZONE 'Asia/Tokyo'::"text")) AS "last_visit_date",
    "count"("rv"."id") AS "visit_count",
    COALESCE("sum"(COALESCE("rv"."actual_price", "rv"."price", (0)::numeric)), (0)::numeric) AS "total_revenue",
    COALESCE("avg"(COALESCE("rv"."actual_price", "rv"."price", (0)::numeric)), (0)::numeric) AS "average_revenue_per_visit",
    COALESCE(("date"(("max"("rv"."start_time") AT TIME ZONE 'Asia/Tokyo'::"text")) - "date"(("min"("rv"."start_time") AT TIME ZONE 'Asia/Tokyo'::"text"))), 0) AS "treatment_period_days",
        CASE
            WHEN ("count"("rv"."id") = 0) THEN '来院なし'::"text"
            WHEN ("count"("rv"."id") = 1) THEN '初診のみ'::"text"
            WHEN (("count"("rv"."id") >= 2) AND ("count"("rv"."id") <= 5)) THEN '軽度リピート'::"text"
            WHEN (("count"("rv"."id") >= 6) AND ("count"("rv"."id") <= 15)) THEN '中度リピート'::"text"
            ELSE '高度リピート'::"text"
        END AS "visit_category"
   FROM ("public"."customers" "cu"
     LEFT JOIN "public"."reservations" "rv" ON ((("cu"."id" = "rv"."customer_id") AND ("rv"."is_deleted" = false) AND (("rv"."status")::"text" = ANY ((ARRAY['completed'::character varying, 'arrived'::character varying])::"text"[])))))
  WHERE (("cu"."is_deleted" = false) AND ("cu"."clinic_id" IS NOT NULL))
  GROUP BY "cu"."id", "cu"."name", "cu"."clinic_id", "cu"."created_at";


ALTER VIEW "public"."patient_visit_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."patient_visit_summary" IS '患者来院履歴サマリー（新スキーマ対応版）- customers/reservationsテーブルから集計';



CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid",
    "name" character varying(255) NOT NULL,
    "gender" character varying(10),
    "date_of_birth" "date",
    "phone_number" character varying(20),
    "address" "text",
    "registration_date" "date" DEFAULT CURRENT_DATE,
    "last_visit_date" "date",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


COMMENT ON TABLE "public"."patients" IS '[LEGACY] 旧患者テーブル。新規開発では customers を使用すること。
統合マイグレーションまで読み取り専用として維持。';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid",
    "email" character varying(255) NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "avatar_url" "text",
    "phone_number" character varying(20),
    "role" character varying(50) DEFAULT 'staff'::character varying NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_login_at" timestamp with time zone,
    "language_preference" character varying(10) DEFAULT 'ja'::character varying,
    "timezone" character varying(50) DEFAULT 'Asia/Tokyo'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_profiles_valid_role" CHECK ((("role" IS NULL) OR (("role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying, 'therapist'::character varying, 'staff'::character varying, 'customer'::character varying])::"text"[]))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles linked to auth.users. RLS enabled.
UPDATE restricted to non-sensitive columns. role/clinic_id changes require service role.';



COMMENT ON CONSTRAINT "chk_profiles_valid_role" ON "public"."profiles" IS '有効なロール: admin, clinic_admin, manager, therapist, staff, customer。
NULL許可（プロフィール未設定状態）。';



CREATE TABLE IF NOT EXISTS "public"."registered_devices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "device_fingerprint" character varying(512) NOT NULL,
    "device_name" character varying(255),
    "device_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "trust_level" character varying(20) DEFAULT 'untrusted'::character varying NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_ip_address" "inet",
    "auto_trust_after_days" integer,
    "trusted_at" timestamp with time zone,
    "blocked_at" timestamp with time zone,
    "blocked_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registered_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "action" character varying(50) NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "change_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "clinic_id" "uuid" NOT NULL,
    CONSTRAINT "reservation_history_action_check" CHECK ((("action")::"text" = ANY ((ARRAY['created'::character varying, 'updated'::character varying, 'status_changed'::character varying, 'cancelled'::character varying, 'rescheduled'::character varying, 'deleted'::character varying])::"text"[])))
);


ALTER TABLE "public"."reservation_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."reservation_history" IS '予約変更履歴テーブル（監査ログ）';



COMMENT ON COLUMN "public"."reservation_history"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "type" character varying(50) NOT NULL,
    "staff_code" character varying(50),
    "email" character varying(255),
    "phone" character varying(20),
    "specialties" "text"[],
    "qualifications" "text"[],
    "working_hours" "jsonb" DEFAULT '{"friday": {"end": "18:00", "start": "09:00"}, "monday": {"end": "18:00", "start": "09:00"}, "sunday": null, "tuesday": {"end": "18:00", "start": "09:00"}, "saturday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "18:00", "start": "09:00"}, "wednesday": {"end": "18:00", "start": "09:00"}}'::"jsonb" NOT NULL,
    "max_concurrent" integer DEFAULT 1,
    "supported_menus" "uuid"[],
    "display_order" integer DEFAULT 0,
    "color" character varying(7),
    "is_active" boolean DEFAULT true,
    "is_bookable" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "clinic_id" "uuid" NOT NULL,
    CONSTRAINT "resources_max_concurrent_check" CHECK (("max_concurrent" > 0)),
    CONSTRAINT "resources_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['staff'::character varying, 'room'::character varying, 'bed'::character varying, 'device'::character varying])::"text"[])))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."resources" IS 'リソースマスターテーブル（スタッフ・施術室・設備）';



COMMENT ON COLUMN "public"."resources"."type" IS 'リソース種別: staff（スタッフ）, room（施術室）, bed（ベッド）, device（設備）';



COMMENT ON COLUMN "public"."resources"."working_hours" IS '曜日別営業時間（JSONB形式）';



COMMENT ON COLUMN "public"."resources"."supported_menus" IS '対応可能メニューID配列';



COMMENT ON COLUMN "public"."resources"."clinic_id" IS 'テナント識別子。NOT NULL必須。RLSでテナント境界を保証。';



CREATE OR REPLACE VIEW "public"."reservation_list_view" AS
 SELECT "r"."id",
    "r"."clinic_id",
    "r"."customer_id",
    "c"."name" AS "customer_name",
    "c"."phone" AS "customer_phone",
    "c"."email" AS "customer_email",
    "r"."menu_id",
    "m"."name" AS "menu_name",
    "m"."duration_minutes",
    "m"."price" AS "menu_price",
    "r"."staff_id",
    "res"."name" AS "staff_name",
    "res"."type" AS "resource_type",
    "r"."start_time",
    "r"."end_time",
    "r"."status",
    "r"."channel",
    "r"."notes",
    "r"."price",
    "r"."actual_price",
    "r"."payment_status",
    "r"."reservation_group_id",
    "r"."created_at",
    "r"."updated_at",
    "r"."created_by",
    "r"."selected_options"
   FROM ((("public"."reservations" "r"
     JOIN "public"."customers" "c" ON (("r"."customer_id" = "c"."id")))
     JOIN "public"."menus" "m" ON (("r"."menu_id" = "m"."id")))
     JOIN "public"."resources" "res" ON (("r"."staff_id" = "res"."id")))
  WHERE (("r"."is_deleted" = false) AND ("c"."is_deleted" = false) AND ("m"."is_deleted" = false) AND ("res"."is_deleted" = false));


ALTER VIEW "public"."reservation_list_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."revenues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "visit_id" "uuid",
    "clinic_id" "uuid",
    "patient_id" "uuid",
    "revenue_date" "date" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "insurance_revenue" numeric(10,2) DEFAULT 0.00,
    "private_revenue" numeric(10,2) DEFAULT 0.00,
    "payment_method_id" "uuid",
    "treatment_menu_id" "uuid",
    "patient_type_id" "uuid",
    "category_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "menu_id" "uuid"
);


ALTER TABLE "public"."revenues" OWNER TO "postgres";


COMMENT ON COLUMN "public"."revenues"."menu_id" IS '統合後のメニューID（menusテーブル参照）';



CREATE TABLE IF NOT EXISTS "public"."security_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "details" "jsonb",
    "client_ip" "inet",
    "user_agent" "text",
    "source" "text",
    "status" "text" DEFAULT 'new'::"text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "security_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "security_alerts_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewing'::"text", 'resolved'::"text", 'false_positive'::"text"]))),
    CONSTRAINT "security_alerts_type_check" CHECK (("type" = ANY (ARRAY['csp_violation'::"text", 'rate_limit'::"text", 'authentication'::"text", 'data_breach'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."security_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "clinic_id" "uuid",
    "session_id" "uuid",
    "event_type" character varying(100) NOT NULL,
    "event_category" character varying(50) NOT NULL,
    "severity_level" character varying(20) DEFAULT 'info'::character varying NOT NULL,
    "event_description" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "geolocation" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_component" character varying(100),
    "correlation_id" "uuid",
    "status" character varying(20) DEFAULT 'new'::character varying NOT NULL,
    "assigned_to" "uuid",
    "resolution_notes" "text",
    "actions_taken" "jsonb" DEFAULT '[]'::"jsonb",
    "resolved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "security_events_severity_level_check" CHECK ((("severity_level")::"text" = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'critical'::character varying])::"text"[]))),
    CONSTRAINT "security_events_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['new'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'false_positive'::character varying])::"text"[])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_policies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "role" character varying(50),
    "max_concurrent_sessions" integer DEFAULT 3 NOT NULL,
    "max_idle_minutes" integer DEFAULT 30 NOT NULL,
    "max_session_hours" integer DEFAULT 8 NOT NULL,
    "require_ip_whitelist" boolean DEFAULT false NOT NULL,
    "allowed_ip_ranges" "inet"[],
    "block_concurrent_different_ips" boolean DEFAULT false NOT NULL,
    "max_devices_per_user" integer DEFAULT 5 NOT NULL,
    "remember_device_days" integer DEFAULT 30 NOT NULL,
    "require_device_registration" boolean DEFAULT false NOT NULL,
    "notify_new_device_login" boolean DEFAULT true NOT NULL,
    "notify_suspicious_activity" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."session_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid",
    "name" character varying(255) NOT NULL,
    "role" character varying(50) NOT NULL,
    "hire_date" "date",
    "is_therapist" boolean DEFAULT false,
    "email" character varying(255) NOT NULL,
    "password_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff" IS '[LEGACY] 旧スタッフテーブル。新規開発では resources (type=''staff'') を使用すること。
統合マイグレーションまで読み取り専用として維持。';



COMMENT ON COLUMN "public"."staff"."password_hash" IS '[DEPRECATED] Supabase Auth を使用しているため不要。
次回の破壊的マイグレーション時に DROP 予定。
新規コードでは auth.users を使用すること。';



CREATE TABLE IF NOT EXISTS "public"."staff_invites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'staff'::character varying NOT NULL,
    "token" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_invites_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'therapist'::character varying, 'staff'::character varying, 'manager'::character varying])::"text"[])))
);


ALTER TABLE "public"."staff_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_invites" IS 'スタッフ招待管理テーブル';



COMMENT ON COLUMN "public"."staff_invites"."token" IS '招待トークン（7日間有効）';



COMMENT ON CONSTRAINT "staff_invites_role_check" ON "public"."staff_invites" IS '有効ロール: admin, clinic_admin, manager, therapist, staff。clinic_manager は非推奨（2026-01-09 移行済み）。';



CREATE TABLE IF NOT EXISTS "public"."staff_performance" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "staff_id" "uuid",
    "clinic_id" "uuid",
    "performance_date" "date" NOT NULL,
    "patient_count" integer DEFAULT 0,
    "revenue_generated" numeric(10,2) DEFAULT 0.00,
    "satisfaction_score" numeric(3,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."staff_performance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."staff_performance_summary" AS
 SELECT "res"."id" AS "staff_id",
    "res"."name" AS "staff_name",
    "res"."clinic_id",
    'staff'::"text" AS "role",
    "count"(DISTINCT "rv"."id") AS "total_visits",
    "count"(DISTINCT "rv"."customer_id") AS "unique_patients",
    COALESCE("sum"(COALESCE("rv"."actual_price", "rv"."price", (0)::numeric)), (0)::numeric) AS "total_revenue_generated",
    NULL::numeric(3,2) AS "average_satisfaction_score",
    "count"(DISTINCT "date"(("rv"."start_time" AT TIME ZONE 'Asia/Tokyo'::"text"))) AS "working_days"
   FROM ("public"."resources" "res"
     LEFT JOIN "public"."reservations" "rv" ON ((("res"."id" = "rv"."staff_id") AND ("rv"."is_deleted" = false) AND (("rv"."status")::"text" = ANY ((ARRAY['completed'::character varying, 'arrived'::character varying])::"text"[])))))
  WHERE ((("res"."type")::"text" = 'staff'::"text") AND ("res"."is_deleted" = false) AND ("res"."clinic_id" IS NOT NULL))
  GROUP BY "res"."id", "res"."name", "res"."clinic_id";


ALTER VIEW "public"."staff_performance_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."staff_performance_summary" IS 'スタッフ成績サマリー（新スキーマ対応版）- resources/reservationsテーブルから集計';



CREATE TABLE IF NOT EXISTS "public"."staff_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "preference_text" "text" NOT NULL,
    "preference_type" character varying(50) DEFAULT 'general'::character varying,
    "priority" integer DEFAULT 1,
    "valid_from" "date",
    "valid_until" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_preferences_preference_type_check" CHECK ((("preference_type")::"text" = ANY ((ARRAY['general'::character varying, 'day_off'::character varying, 'time_preference'::character varying, 'shift_pattern'::character varying])::"text"[]))),
    CONSTRAINT "staff_preferences_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 5))),
    CONSTRAINT "valid_preference_period" CHECK ((("valid_until" IS NULL) OR ("valid_from" IS NULL) OR ("valid_until" >= "valid_from")))
);


ALTER TABLE "public"."staff_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_preferences" IS 'スタッフの勤務希望データを管理するテーブル';



COMMENT ON COLUMN "public"."staff_preferences"."preference_type" IS '希望の種類: general=一般, day_off=休日希望, time_preference=時間帯希望, shift_pattern=勤務パターン希望';



COMMENT ON COLUMN "public"."staff_preferences"."priority" IS '希望の優先度: 1=低, 5=高';



CREATE TABLE IF NOT EXISTS "public"."staff_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "staff_shifts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'proposed'::character varying, 'confirmed'::character varying, 'cancelled'::character varying])::"text"[]))),
    CONSTRAINT "valid_shift_time" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."staff_shifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_shifts" IS 'スタッフのシフトデータを管理するテーブル';



COMMENT ON COLUMN "public"."staff_shifts"."status" IS 'シフトのステータス: draft=下書き, proposed=提案中, confirmed=確定, cancelled=キャンセル';



CREATE TABLE IF NOT EXISTS "public"."treatment_menu_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "treatment_id" "uuid" NOT NULL,
    "menu_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(8,2) NOT NULL,
    "total_price" numeric(8,2) NOT NULL,
    "insurance_points" integer,
    "insurance_coverage_amount" numeric(8,2),
    "patient_payment_amount" numeric(8,2),
    "duration_minutes" integer,
    "performed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_menu_records_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "treatment_menu_records_total_price_check" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "treatment_menu_records_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."treatment_menu_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "appointment_id" "uuid",
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "primary_staff_id" "uuid" NOT NULL,
    "treatment_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "status" character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."treatments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_mfa_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "secret_key" "text" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "backup_codes" "jsonb" DEFAULT '[]'::"jsonb",
    "backup_codes_regenerated_at" timestamp with time zone,
    "setup_completed_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "disabled_at" timestamp with time zone,
    "disabled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_mfa_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_mfa_settings" IS 'ユーザーMFA設定テーブル - TOTP秘密鍵とバックアップコードを管理';



COMMENT ON COLUMN "public"."user_mfa_settings"."secret_key" IS '[SECURITY WARNING] TOTP秘密鍵。
本番環境では encrypt_mfa_secret() で暗号化して保存すること。
app.settings.mfa_encryption_key の設定が必要。
参照: decrypt_mfa_secret() で復号化。';



COMMENT ON COLUMN "public"."user_mfa_settings"."backup_codes" IS 'バックアップコード配列（JSON形式）';



COMMENT ON COLUMN "public"."user_mfa_settings"."disabled_by" IS '無効化実行者（管理者無効化の場合）';



CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "staff_id" "uuid",
    "username" character varying(255) NOT NULL,
    "hashed_password" "text" NOT NULL,
    "role" character varying(50) NOT NULL,
    "clinic_id" "uuid",
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_user_permissions_valid_role" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying, 'therapist'::character varying, 'staff'::character varying])::"text"[])))
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_permissions"."hashed_password" IS '[DEPRECATED] Supabase Auth を使用しているため不要。
値は ''managed_by_supabase'' 固定。
次回の破壊的マイグレーション時に DROP 予定。';



COMMENT ON CONSTRAINT "chk_user_permissions_valid_role" ON "public"."user_permissions" IS '有効なロール: admin, clinic_admin, manager, therapist, staff。
clinic_manager は 20260109 で clinic_admin に移行済み。';



CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "session_token" character varying(512) NOT NULL,
    "refresh_token_id" character varying(255),
    "device_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "geolocation" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "idle_timeout_at" timestamp with time zone,
    "absolute_timeout_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_revoked" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revoked_reason" character varying(100),
    "max_idle_minutes" integer DEFAULT 30 NOT NULL,
    "max_session_hours" integer DEFAULT 8 NOT NULL,
    "remember_device" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "patient_id" "uuid",
    "clinic_id" "uuid",
    "visit_date" timestamp with time zone NOT NULL,
    "therapist_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_comments"
    ADD CONSTRAINT "ai_comments_clinic_id_comment_date_key" UNIQUE ("clinic_id", "comment_date");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_number_clinic_unique" UNIQUE ("clinic_id", "appointment_number");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_usage_metrics"
    ADD CONSTRAINT "beta_usage_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_clinic_id_category_key" UNIQUE ("clinic_id", "category");



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."critical_incidents"
    ADD CONSTRAINT "critical_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."csp_violations"
    ADD CONSTRAINT "csp_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_line_user_id_key" UNIQUE ("line_user_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_comments"
    ADD CONSTRAINT "daily_ai_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_clinic_id_report_date_key" UNIQUE ("clinic_id", "report_date");



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encryption_keys"
    ADD CONSTRAINT "encryption_keys_key_name_key" UNIQUE ("key_name");



ALTER TABLE ONLY "public"."encryption_keys"
    ADD CONSTRAINT "encryption_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."improvement_backlog"
    ADD CONSTRAINT "improvement_backlog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_categories"
    ADD CONSTRAINT "master_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."master_categories"
    ADD CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_patient_types"
    ADD CONSTRAINT "master_patient_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."master_patient_types"
    ADD CONSTRAINT "master_patient_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_payment_methods"
    ADD CONSTRAINT "master_payment_methods_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."master_payment_methods"
    ADD CONSTRAINT "master_payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_setup_sessions"
    ADD CONSTRAINT "mfa_setup_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_usage_stats"
    ADD CONSTRAINT "mfa_usage_stats_clinic_id_period_start_period_end_key" UNIQUE ("clinic_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."mfa_usage_stats"
    ADD CONSTRAINT "mfa_usage_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_states"
    ADD CONSTRAINT "onboarding_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_states"
    ADD CONSTRAINT "onboarding_states_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."registered_devices"
    ADD CONSTRAINT "registered_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_history"
    ADD CONSTRAINT "reservation_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_staff_code_key" UNIQUE ("staff_code");



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_alerts"
    ADD CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_policies"
    ADD CONSTRAINT "session_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_clinic_id_email_key" UNIQUE ("clinic_id", "email");



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_staff_id_performance_date_key" UNIQUE ("staff_id", "performance_date");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_preferences"
    ADD CONSTRAINT "staff_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_shifts"
    ADD CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_menu_records"
    ADD CONSTRAINT "treatment_menu_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_usage_metrics"
    ADD CONSTRAINT "unique_clinic_period" UNIQUE ("clinic_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."user_mfa_settings"
    ADD CONSTRAINT "user_mfa_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_mfa_settings"
    ADD CONSTRAINT "user_mfa_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_staff_id_key" UNIQUE ("staff_id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_session_token_key" UNIQUE ("session_token");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ai_comments_clinic_date" ON "public"."ai_comments" USING "btree" ("clinic_id", "comment_date");



CREATE INDEX "idx_appointments_clinic_date" ON "public"."appointments" USING "btree" ("clinic_id", "appointment_date");



CREATE INDEX "idx_appointments_datetime" ON "public"."appointments" USING "btree" ("appointment_date", "start_time");



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_appointments_staff_id" ON "public"."appointments" USING "btree" ("staff_id");



CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "idx_audit_logs_clinic_id" ON "public"."audit_logs" USING "btree" ("clinic_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_logs_event_type" ON "public"."audit_logs" USING "btree" ("event_type");



CREATE INDEX "idx_audit_logs_target_table" ON "public"."audit_logs" USING "btree" ("target_table");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_beta_feedback_category" ON "public"."beta_feedback" USING "btree" ("category");



CREATE INDEX "idx_beta_feedback_clinic_id" ON "public"."beta_feedback" USING "btree" ("clinic_id");



CREATE INDEX "idx_beta_feedback_priority" ON "public"."beta_feedback" USING "btree" ("priority");



CREATE INDEX "idx_beta_feedback_status" ON "public"."beta_feedback" USING "btree" ("status");



CREATE INDEX "idx_beta_feedback_user_id" ON "public"."beta_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_beta_usage_metrics_clinic_id" ON "public"."beta_usage_metrics" USING "btree" ("clinic_id");



CREATE INDEX "idx_beta_usage_metrics_period" ON "public"."beta_usage_metrics" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_blocks_clinic_id" ON "public"."blocks" USING "btree" ("clinic_id");



CREATE INDEX "idx_blocks_clinic_time" ON "public"."blocks" USING "btree" ("clinic_id", "start_time", "end_time");



CREATE INDEX "idx_blocks_end_time" ON "public"."blocks" USING "btree" ("end_time");



CREATE INDEX "idx_blocks_is_active" ON "public"."blocks" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_blocks_resource_id" ON "public"."blocks" USING "btree" ("resource_id");



CREATE INDEX "idx_blocks_resource_time" ON "public"."blocks" USING "btree" ("resource_id", "start_time", "end_time") WHERE (("is_deleted" = false) AND ("is_active" = true));



CREATE INDEX "idx_blocks_start_time" ON "public"."blocks" USING "btree" ("start_time");



CREATE INDEX "idx_chat_messages_session" ON "public"."chat_messages" USING "btree" ("session_id");



CREATE INDEX "idx_chat_sessions_user" ON "public"."chat_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_chat_sessions_user_clinic" ON "public"."chat_sessions" USING "btree" ("user_id", "clinic_id");



CREATE INDEX "idx_clinic_settings_category" ON "public"."clinic_settings" USING "btree" ("category");



CREATE INDEX "idx_clinic_settings_clinic_id" ON "public"."clinic_settings" USING "btree" ("clinic_id");



CREATE INDEX "idx_clinic_settings_updated_at" ON "public"."clinic_settings" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_clinics_is_active" ON "public"."clinics" USING "btree" ("is_active");



CREATE INDEX "idx_clinics_parent_id" ON "public"."clinics" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_critical_incidents_detected_at" ON "public"."critical_incidents" USING "btree" ("detected_at");



CREATE INDEX "idx_critical_incidents_severity" ON "public"."critical_incidents" USING "btree" ("severity");



CREATE INDEX "idx_critical_incidents_status" ON "public"."critical_incidents" USING "btree" ("status");



CREATE INDEX "idx_csp_violations_clinic_id" ON "public"."csp_violations" USING "btree" ("clinic_id");



CREATE INDEX "idx_csp_violations_created_at" ON "public"."csp_violations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_csp_violations_severity" ON "public"."csp_violations" USING "btree" ("severity");



CREATE INDEX "idx_customers_clinic_active" ON "public"."customers" USING "btree" ("clinic_id") WHERE ("is_deleted" = false);



CREATE INDEX "idx_customers_clinic_id" ON "public"."customers" USING "btree" ("clinic_id");



CREATE INDEX "idx_customers_created_at" ON "public"."customers" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email");



CREATE INDEX "idx_customers_is_deleted" ON "public"."customers" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_customers_last_visit" ON "public"."customers" USING "btree" ("last_visit_date" DESC NULLS LAST);



CREATE INDEX "idx_customers_line_user_id" ON "public"."customers" USING "btree" ("line_user_id");



CREATE INDEX "idx_customers_name_trgm" ON "public"."customers" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_customers_phone" ON "public"."customers" USING "btree" ("phone");



CREATE INDEX "idx_daily_reports_clinic_date" ON "public"."daily_reports" USING "btree" ("clinic_id", "report_date");



CREATE UNIQUE INDEX "idx_daily_stats_date_staff" ON "public"."daily_reservation_stats" USING "btree" ("reservation_date", "staff_id");



CREATE INDEX "idx_improvement_backlog_assigned_to" ON "public"."improvement_backlog" USING "btree" ("assigned_to");



CREATE INDEX "idx_improvement_backlog_category" ON "public"."improvement_backlog" USING "btree" ("category");



CREATE INDEX "idx_improvement_backlog_created_at" ON "public"."improvement_backlog" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_improvement_backlog_milestone" ON "public"."improvement_backlog" USING "btree" ("milestone");



CREATE INDEX "idx_improvement_backlog_priority" ON "public"."improvement_backlog" USING "btree" ("priority");



CREATE INDEX "idx_improvement_backlog_status" ON "public"."improvement_backlog" USING "btree" ("status");



CREATE INDEX "idx_menus_category" ON "public"."menus" USING "btree" ("category");



CREATE INDEX "idx_menus_category_id" ON "public"."menus" USING "btree" ("category_id");



CREATE INDEX "idx_menus_clinic_active" ON "public"."menus" USING "btree" ("clinic_id", "is_active") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "idx_menus_clinic_code_unique" ON "public"."menus" USING "btree" ("clinic_id", "code") WHERE ("code" IS NOT NULL);



CREATE INDEX "idx_menus_clinic_id" ON "public"."menus" USING "btree" ("clinic_id");



CREATE INDEX "idx_menus_code" ON "public"."menus" USING "btree" ("code");



CREATE INDEX "idx_menus_display_order" ON "public"."menus" USING "btree" ("display_order");



CREATE INDEX "idx_menus_is_active" ON "public"."menus" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_menus_is_public" ON "public"."menus" USING "btree" ("is_public") WHERE ("is_public" = true);



CREATE INDEX "idx_menus_treatment_type" ON "public"."menus" USING "btree" ("treatment_type");



CREATE INDEX "idx_mfa_settings_clinic_id" ON "public"."user_mfa_settings" USING "btree" ("clinic_id");



CREATE INDEX "idx_mfa_settings_enabled" ON "public"."user_mfa_settings" USING "btree" ("is_enabled") WHERE ("is_enabled" = true);



CREATE INDEX "idx_mfa_settings_last_used" ON "public"."user_mfa_settings" USING "btree" ("last_used_at" DESC);



CREATE INDEX "idx_mfa_settings_user_id" ON "public"."user_mfa_settings" USING "btree" ("user_id");



CREATE INDEX "idx_mfa_setup_expires" ON "public"."mfa_setup_sessions" USING "btree" ("expires_at") WHERE ("completed_at" IS NULL);



CREATE INDEX "idx_mfa_setup_user_id" ON "public"."mfa_setup_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_mfa_stats_clinic_period" ON "public"."mfa_usage_stats" USING "btree" ("clinic_id", "period_start", "period_end");



CREATE INDEX "idx_notifications_clinic_id" ON "public"."notifications" USING "btree" ("clinic_id");



CREATE INDEX "idx_notifications_clinic_type" ON "public"."notifications" USING "btree" ("clinic_id", "type");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE UNIQUE INDEX "idx_notifications_unique_related_entity" ON "public"."notifications" USING "btree" ("related_entity_type", "related_entity_id", "type");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("is_read" = false);



CREATE INDEX "idx_onboarding_states_clinic_id" ON "public"."onboarding_states" USING "btree" ("clinic_id");



CREATE INDEX "idx_onboarding_states_current_step" ON "public"."onboarding_states" USING "btree" ("current_step");



CREATE INDEX "idx_onboarding_states_user_id" ON "public"."onboarding_states" USING "btree" ("user_id");



CREATE INDEX "idx_patients_clinic" ON "public"."patients" USING "btree" ("clinic_id");



CREATE INDEX "idx_profiles_active" ON "public"."profiles" USING "btree" ("is_active");



CREATE INDEX "idx_profiles_clinic_id" ON "public"."profiles" USING "btree" ("clinic_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_registered_devices_clinic_id" ON "public"."registered_devices" USING "btree" ("clinic_id");



CREATE INDEX "idx_registered_devices_fingerprint" ON "public"."registered_devices" USING "btree" ("device_fingerprint");



CREATE INDEX "idx_registered_devices_trust_level" ON "public"."registered_devices" USING "btree" ("trust_level", "user_id");



CREATE INDEX "idx_registered_devices_user_id" ON "public"."registered_devices" USING "btree" ("user_id");



CREATE INDEX "idx_reservation_history_action" ON "public"."reservation_history" USING "btree" ("action");



CREATE INDEX "idx_reservation_history_clinic_created" ON "public"."reservation_history" USING "btree" ("clinic_id", "created_at" DESC);



CREATE INDEX "idx_reservation_history_clinic_id" ON "public"."reservation_history" USING "btree" ("clinic_id");



CREATE INDEX "idx_reservation_history_created_at" ON "public"."reservation_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reservation_history_reservation_id" ON "public"."reservation_history" USING "btree" ("reservation_id");



CREATE INDEX "idx_reservations_channel" ON "public"."reservations" USING "btree" ("channel");



CREATE INDEX "idx_reservations_clinic_id" ON "public"."reservations" USING "btree" ("clinic_id");



CREATE INDEX "idx_reservations_clinic_status" ON "public"."reservations" USING "btree" ("clinic_id", "status") WHERE ("is_deleted" = false);



CREATE INDEX "idx_reservations_customer_id" ON "public"."reservations" USING "btree" ("customer_id");



CREATE INDEX "idx_reservations_date_range" ON "public"."reservations" USING "btree" ("start_time", "end_time") WHERE ("is_deleted" = false);



CREATE INDEX "idx_reservations_end_time" ON "public"."reservations" USING "btree" ("end_time");



CREATE INDEX "idx_reservations_menu_id" ON "public"."reservations" USING "btree" ("menu_id");



CREATE INDEX "idx_reservations_payment_status" ON "public"."reservations" USING "btree" ("payment_status");



CREATE INDEX "idx_reservations_reservation_group_id" ON "public"."reservations" USING "btree" ("reservation_group_id");



CREATE INDEX "idx_reservations_staff_id" ON "public"."reservations" USING "btree" ("staff_id");



CREATE INDEX "idx_reservations_staff_time" ON "public"."reservations" USING "btree" ("staff_id", "start_time", "end_time") WHERE (("is_deleted" = false) AND (("status")::"text" <> ALL ((ARRAY['cancelled'::character varying, 'no_show'::character varying])::"text"[])));



CREATE INDEX "idx_reservations_start_time" ON "public"."reservations" USING "btree" ("start_time" DESC);



CREATE INDEX "idx_reservations_status" ON "public"."reservations" USING "btree" ("status");



CREATE INDEX "idx_reservations_status_clinic" ON "public"."reservations" USING "btree" ("clinic_id", "status") WHERE ("is_deleted" = false);



CREATE INDEX "idx_resources_clinic" ON "public"."resources" USING "btree" ("clinic_id");



CREATE INDEX "idx_resources_clinic_id" ON "public"."resources" USING "btree" ("clinic_id");



CREATE INDEX "idx_resources_display_order" ON "public"."resources" USING "btree" ("display_order");



CREATE INDEX "idx_resources_is_active" ON "public"."resources" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_resources_is_bookable" ON "public"."resources" USING "btree" ("is_bookable") WHERE ("is_bookable" = true);



CREATE INDEX "idx_resources_staff_code" ON "public"."resources" USING "btree" ("staff_code");



CREATE INDEX "idx_resources_type" ON "public"."resources" USING "btree" ("type");



CREATE INDEX "idx_revenues_clinic_date" ON "public"."revenues" USING "btree" ("clinic_id", "revenue_date");



CREATE INDEX "idx_revenues_menu_id" ON "public"."revenues" USING "btree" ("menu_id");



CREATE INDEX "idx_security_alerts_clinic_id" ON "public"."security_alerts" USING "btree" ("clinic_id");



CREATE INDEX "idx_security_alerts_created_at" ON "public"."security_alerts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_alerts_severity" ON "public"."security_alerts" USING "btree" ("severity");



CREATE INDEX "idx_security_alerts_type" ON "public"."security_alerts" USING "btree" ("type");



CREATE INDEX "idx_security_events_assigned_to" ON "public"."security_events" USING "btree" ("assigned_to");



CREATE INDEX "idx_security_events_clinic_id" ON "public"."security_events" USING "btree" ("clinic_id");



CREATE INDEX "idx_security_events_clinic_severity" ON "public"."security_events" USING "btree" ("clinic_id", "severity_level", "created_at" DESC);



CREATE INDEX "idx_security_events_created_at" ON "public"."security_events" USING "btree" ("created_at");



CREATE INDEX "idx_security_events_resolved_at" ON "public"."security_events" USING "btree" ("resolved_at");



CREATE INDEX "idx_security_events_severity" ON "public"."security_events" USING "btree" ("severity_level", "created_at");



CREATE INDEX "idx_security_events_status" ON "public"."security_events" USING "btree" ("status");



CREATE INDEX "idx_security_events_type" ON "public"."security_events" USING "btree" ("event_type", "event_category");



CREATE INDEX "idx_security_events_user_id" ON "public"."security_events" USING "btree" ("user_id");



CREATE INDEX "idx_session_policies_active" ON "public"."session_policies" USING "btree" ("clinic_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_session_policies_clinic_id" ON "public"."session_policies" USING "btree" ("clinic_id");



CREATE INDEX "idx_session_policies_role" ON "public"."session_policies" USING "btree" ("role");



CREATE INDEX "idx_staff_clinic" ON "public"."staff" USING "btree" ("clinic_id");



CREATE INDEX "idx_staff_invites_clinic_id" ON "public"."staff_invites" USING "btree" ("clinic_id");



CREATE INDEX "idx_staff_invites_created_by" ON "public"."staff_invites" USING "btree" ("created_by");



CREATE INDEX "idx_staff_invites_email" ON "public"."staff_invites" USING "btree" ("email");



CREATE INDEX "idx_staff_invites_expires_at" ON "public"."staff_invites" USING "btree" ("expires_at");



CREATE INDEX "idx_staff_invites_token" ON "public"."staff_invites" USING "btree" ("token");



CREATE INDEX "idx_staff_preferences_active" ON "public"."staff_preferences" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_staff_preferences_clinic_id" ON "public"."staff_preferences" USING "btree" ("clinic_id");



CREATE INDEX "idx_staff_preferences_staff_id" ON "public"."staff_preferences" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_shifts_clinic_id" ON "public"."staff_shifts" USING "btree" ("clinic_id");



CREATE INDEX "idx_staff_shifts_clinic_time" ON "public"."staff_shifts" USING "btree" ("clinic_id", "start_time", "end_time");



CREATE INDEX "idx_staff_shifts_staff_id" ON "public"."staff_shifts" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_shifts_start_time" ON "public"."staff_shifts" USING "btree" ("start_time");



CREATE INDEX "idx_staff_shifts_status" ON "public"."staff_shifts" USING "btree" ("status");



CREATE INDEX "idx_treatment_menu_records_menu" ON "public"."treatment_menu_records" USING "btree" ("menu_id");



CREATE INDEX "idx_treatment_menu_records_staff" ON "public"."treatment_menu_records" USING "btree" ("performed_by");



CREATE INDEX "idx_treatment_menu_records_treatment" ON "public"."treatment_menu_records" USING "btree" ("treatment_id");



CREATE INDEX "idx_user_permissions_clinic_id" ON "public"."user_permissions" USING "btree" ("clinic_id");



CREATE INDEX "idx_user_permissions_role" ON "public"."user_permissions" USING "btree" ("role");



CREATE INDEX "idx_user_permissions_role_clinic" ON "public"."user_permissions" USING "btree" ("role", "clinic_id");



CREATE INDEX "idx_user_permissions_staff_clinic" ON "public"."user_permissions" USING "btree" ("staff_id", "clinic_id");



CREATE INDEX "idx_user_permissions_staff_id" ON "public"."user_permissions" USING "btree" ("staff_id");



CREATE INDEX "idx_user_sessions_active" ON "public"."user_sessions" USING "btree" ("user_id", "clinic_id") WHERE ("is_active" = true);



CREATE INDEX "idx_user_sessions_active_expires" ON "public"."user_sessions" USING "btree" ("expires_at") WHERE (("is_active" = true) AND ("is_revoked" = false));



CREATE INDEX "idx_user_sessions_clinic_id" ON "public"."user_sessions" USING "btree" ("clinic_id");



CREATE INDEX "idx_user_sessions_expires_at" ON "public"."user_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_user_sessions_last_activity" ON "public"."user_sessions" USING "btree" ("last_activity");



CREATE INDEX "idx_user_sessions_session_token" ON "public"."user_sessions" USING "btree" ("session_token");



CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_visits_clinic_date" ON "public"."visits" USING "btree" ("clinic_id", "visit_date");



CREATE OR REPLACE TRIGGER "blocks_clinic_ref_check" BEFORE INSERT OR UPDATE ON "public"."blocks" FOR EACH ROW EXECUTE FUNCTION "public"."validate_blocks_clinic_refs"();



CREATE OR REPLACE TRIGGER "reservation_created_log" AFTER INSERT ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."log_reservation_created"();



CREATE OR REPLACE TRIGGER "reservation_deleted_log" AFTER DELETE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."log_reservation_deleted"();



CREATE OR REPLACE TRIGGER "reservation_history_clinic_ref_check" BEFORE INSERT OR UPDATE ON "public"."reservation_history" FOR EACH ROW EXECUTE FUNCTION "public"."validate_reservation_history_clinic_refs"();



CREATE OR REPLACE TRIGGER "reservation_updated_log" AFTER UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."log_reservation_updated"();



CREATE OR REPLACE TRIGGER "reservations_clinic_ref_check" BEFORE INSERT OR UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_reservations_clinic_refs"();



CREATE OR REPLACE TRIGGER "set_updated_at_menu_categories" BEFORE UPDATE ON "public"."menu_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_treatments" BEFORE UPDATE ON "public"."treatments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_beta_feedback_updated_at" BEFORE UPDATE ON "public"."beta_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_beta_usage_metrics_updated_at" BEFORE UPDATE ON "public"."beta_usage_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_blocks_updated_at" BEFORE UPDATE ON "public"."blocks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_clinic_settings_updated_at" BEFORE UPDATE ON "public"."clinic_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_critical_incidents_updated_at" BEFORE UPDATE ON "public"."critical_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customer_stats_trigger" AFTER INSERT OR UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."update_customer_stats"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_improvement_backlog_updated_at" BEFORE UPDATE ON "public"."improvement_backlog" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_menus_updated_at" BEFORE UPDATE ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_mfa_settings_updated_at_trigger" BEFORE UPDATE ON "public"."user_mfa_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_mfa_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_onboarding_states_updated_at" BEFORE UPDATE ON "public"."onboarding_states" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_registered_devices_updated_at" BEFORE UPDATE ON "public"."registered_devices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_reservations_updated_at" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_resources_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_security_events_updated_at" BEFORE UPDATE ON "public"."security_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_session_policies_updated_at" BEFORE UPDATE ON "public"."session_policies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_staff_invites_updated_at" BEFORE UPDATE ON "public"."staff_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_staff_preferences_updated_at" BEFORE UPDATE ON "public"."staff_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_staff_shifts_updated_at" BEFORE UPDATE ON "public"."staff_shifts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_sessions_updated_at" BEFORE UPDATE ON "public"."user_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_usage_metrics"
    ADD CONSTRAINT "beta_usage_metrics_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."csp_violations"
    ADD CONSTRAINT "csp_violations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."csp_violations"
    ADD CONSTRAINT "csp_violations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_comments"
    ADD CONSTRAINT "daily_ai_comments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_mfa_settings"
    ADD CONSTRAINT "fk_mfa_clinic" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_setup_sessions"
    ADD CONSTRAINT "fk_mfa_setup_clinic" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_setup_sessions"
    ADD CONSTRAINT "fk_mfa_setup_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_usage_stats"
    ADD CONSTRAINT "fk_mfa_stats_clinic" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_mfa_settings"
    ADD CONSTRAINT "fk_mfa_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_states"
    ADD CONSTRAINT "onboarding_states_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_states"
    ADD CONSTRAINT "onboarding_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registered_devices"
    ADD CONSTRAINT "registered_devices_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registered_devices"
    ADD CONSTRAINT "registered_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_history"
    ADD CONSTRAINT "reservation_history_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservation_history"
    ADD CONSTRAINT "reservation_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reservation_history"
    ADD CONSTRAINT "reservation_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."resources"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."master_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_patient_type_id_fkey" FOREIGN KEY ("patient_type_id") REFERENCES "public"."master_patient_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "public"."master_payment_methods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."revenues"
    ADD CONSTRAINT "revenues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_alerts"
    ADD CONSTRAINT "security_alerts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_alerts"
    ADD CONSTRAINT "security_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_policies"
    ADD CONSTRAINT "session_policies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_policies"
    ADD CONSTRAINT "session_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."session_policies"
    ADD CONSTRAINT "session_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invites"
    ADD CONSTRAINT "staff_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_preferences"
    ADD CONSTRAINT "staff_preferences_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_preferences"
    ADD CONSTRAINT "staff_preferences_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_shifts"
    ADD CONSTRAINT "staff_shifts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_shifts"
    ADD CONSTRAINT "staff_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_shifts"
    ADD CONSTRAINT "staff_shifts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_menu_records"
    ADD CONSTRAINT "treatment_menu_records_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."treatment_menu_records"
    ADD CONSTRAINT "treatment_menu_records_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."treatment_menu_records"
    ADD CONSTRAINT "treatment_menu_records_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatments"
    ADD CONSTRAINT "treatments_primary_staff_id_fkey" FOREIGN KEY ("primary_staff_id") REFERENCES "public"."staff"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_therapist_id_fkey" FOREIGN KEY ("therapist_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can manage backlog" ON "public"."improvement_backlog" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can manage incidents" ON "public"."critical_incidents" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can update feedback" ON "public"."beta_feedback" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can view MFA usage stats" ON "public"."mfa_usage_stats" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "mfa_usage_stats"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying])::"text"[]))))));



CREATE POLICY "Admins can view all feedback" ON "public"."beta_feedback" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can view all metrics" ON "public"."beta_usage_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins can view clinic MFA settings" ON "public"."user_mfa_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "user_mfa_settings"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying])::"text"[]))))));



CREATE POLICY "Affected clinics can view their incidents" ON "public"."critical_incidents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."clinic_id" = ANY ("critical_incidents"."affected_clinics"))))));



CREATE POLICY "System can insert metrics" ON "public"."beta_usage_metrics" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert own MFA settings" ON "public"."user_mfa_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their clinic feedback" ON "public"."beta_feedback" FOR INSERT WITH CHECK (("clinic_id" IN ( SELECT "profiles"."clinic_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can manage own MFA setup sessions" ON "public"."mfa_setup_sessions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own MFA settings" ON "public"."user_mfa_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view backlog" ON "public"."improvement_backlog" FOR SELECT USING (true);



CREATE POLICY "Users can view own MFA settings" ON "public"."user_mfa_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their clinic feedback" ON "public"."beta_feedback" FOR SELECT USING (("clinic_id" IN ( SELECT "profiles"."clinic_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their clinic metrics" ON "public"."beta_usage_metrics" FOR SELECT USING (("clinic_id" IN ( SELECT "profiles"."clinic_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("clinic_id" IS NOT NULL) AND (("auth"."jwt"() ->> 'clinic_id'::"text") = ("clinic_id")::"text") AND (("auth"."jwt"() ->> 'user_role'::"text") = ANY (ARRAY['clinic_admin'::"text", 'admin'::"text"])))));



ALTER TABLE "public"."ai_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_comments_delete" ON "public"."ai_comments" FOR DELETE USING (("public"."jwt_is_admin"() AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "ai_comments_insert" ON "public"."ai_comments" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "ai_comments_select" ON "public"."ai_comments" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "ai_comments_update" ON "public"."ai_comments" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_insert_service_role" ON "public"."appointments" FOR INSERT WITH CHECK (("public"."get_current_role"() = 'service_role'::"text"));



CREATE POLICY "appointments_select_for_staff" ON "public"."appointments" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert_service_role" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "audit_logs_select_for_admins" ON "public"."audit_logs" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_usage_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocks_delete_for_admin" ON "public"."blocks" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "blocks_insert_for_managers" ON "public"."blocks" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "blocks_select_for_staff" ON "public"."blocks" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "blocks_update_for_managers" ON "public"."blocks" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_insert" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions" "cs"
  WHERE (("cs"."id" = "chat_messages"."session_id") AND ("cs"."user_id" = "auth"."uid"())))));



CREATE POLICY "chat_messages_select" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions" "cs"
  WHERE (("cs"."id" = "chat_messages"."session_id") AND (("cs"."user_id" = "auth"."uid"()) OR (("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("cs"."clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("cs"."clinic_id")) OR (("cs"."clinic_id" IS NULL) AND "public"."jwt_is_admin"()))))))));



ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_sessions_delete" ON "public"."chat_sessions" FOR DELETE USING (("public"."jwt_is_admin"() AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR ("clinic_id" IS NULL))));



CREATE POLICY "chat_sessions_insert" ON "public"."chat_sessions" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



CREATE POLICY "chat_sessions_select" ON "public"."chat_sessions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"())))));



CREATE POLICY "chat_sessions_update" ON "public"."chat_sessions" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



ALTER TABLE "public"."clinic_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinic_settings_delete" ON "public"."clinic_settings" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "clinic_settings_insert" ON "public"."clinic_settings" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "clinic_settings_select" ON "public"."clinic_settings" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "clinic_settings_select_policy" ON "public"."clinic_settings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "p"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_permissions" "up"
  WHERE (("up"."staff_id" = "auth"."uid"()) AND ("up"."clinic_id" = "up"."clinic_id") AND (("up"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[])))))));



CREATE POLICY "clinic_settings_update" ON "public"."clinic_settings" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "clinic_settings_upsert_policy" ON "public"."clinic_settings" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "p"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_permissions" "up"
  WHERE (("up"."staff_id" = "auth"."uid"()) AND ("up"."clinic_id" = "up"."clinic_id") AND (("up"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[]))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "p"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_permissions" "up"
  WHERE (("up"."staff_id" = "auth"."uid"()) AND ("up"."clinic_id" = "up"."clinic_id") AND (("up"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[])))))));



ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinics_admin_insert" ON "public"."clinics" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("parent_id" IS NOT NULL) AND "public"."can_access_clinic"("parent_id")) OR (("parent_id" IS NULL) AND "public"."jwt_is_admin"()))));



CREATE POLICY "clinics_admin_select" ON "public"."clinics" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("id")));



CREATE POLICY "clinics_admin_update" ON "public"."clinics" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("id"))) WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("id")));



CREATE POLICY "clinics_delete_for_admin" ON "public"."clinics" FOR DELETE USING (("public"."get_current_role"() = 'admin'::"text"));



COMMENT ON POLICY "clinics_delete_for_admin" ON "public"."clinics" IS 'クリニックの物理削除は admin のみ。
通常運用ではソフトデリート（is_active = false への UPDATE）を推奨。';



CREATE POLICY "clinics_own_select" ON "public"."clinics" FOR SELECT USING ("public"."can_access_clinic"("id"));



ALTER TABLE "public"."critical_incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."csp_violations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "csp_violations_insert_any" ON "public"."csp_violations" FOR INSERT WITH CHECK (true);



CREATE POLICY "csp_violations_select_admin" ON "public"."csp_violations" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND (("clinic_id" IS NULL) OR "public"."can_access_clinic"("clinic_id"))));



CREATE POLICY "csp_violations_update_admin" ON "public"."csp_violations" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND (("clinic_id" IS NULL) OR "public"."can_access_clinic"("clinic_id"))));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_delete_for_admin" ON "public"."customers" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "customers_insert_for_staff" ON "public"."customers" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "customers_select_for_staff" ON "public"."customers" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "customers_update_for_staff" ON "public"."customers" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."daily_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_reports_delete_for_managers" ON "public"."daily_reports" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "daily_reports_insert_for_staff" ON "public"."daily_reports" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "daily_reports_select_for_staff" ON "public"."daily_reports" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "daily_reports_update_for_staff" ON "public"."daily_reports" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."encryption_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."improvement_backlog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "improvement_backlog_admin_all" ON "public"."improvement_backlog" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "improvement_backlog_authenticated_select" ON "public"."improvement_backlog" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menus_delete_for_admin" ON "public"."menus" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "menus_insert_for_managers" ON "public"."menus" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "menus_select_for_managers" ON "public"."menus" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "menus_select_for_staff" ON "public"."menus" FOR SELECT TO "authenticated" USING ((("public"."get_current_role"() = ANY (ARRAY['therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id") AND ("is_active" = true) AND ("is_deleted" = false)));



COMMENT ON POLICY "menus_select_for_staff" ON "public"."menus" IS 'therapist/staff は自テナントの公開中メニューのみ参照可。manager 以上は既存 menus_select_for_managers を使用。公開導線は /api/public/menus (service_role)。@spec spec-rls-menus-staff-preferences-hardening-v0.2.md Issue 1';



CREATE POLICY "menus_update_for_managers" ON "public"."menus" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."mfa_setup_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mfa_usage_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mfa_usage_stats_select_policy" ON "public"."mfa_usage_stats" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "mfa_usage_stats"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[]))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_service_role" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."onboarding_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_states_self_delete" ON "public"."onboarding_states" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "onboarding_states_self_insert" ON "public"."onboarding_states" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "onboarding_states_self_select" ON "public"."onboarding_states" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "onboarding_states_self_update" ON "public"."onboarding_states" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients_delete_for_managers" ON "public"."patients" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "patients_insert_legacy_block" ON "public"."patients" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "patients_select_for_staff" ON "public"."patients" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "patients_update_for_staff" ON "public"."patients" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_select" ON "public"."profiles" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND (("clinic_id" IS NULL) OR "public"."can_access_clinic"("clinic_id"))));



CREATE POLICY "profiles_self_select" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."registered_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registered_devices_admin_select" ON "public"."registered_devices" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "registered_devices_self_all" ON "public"."registered_devices" USING ((("auth"."uid"() = "user_id") AND "public"."can_access_clinic"("clinic_id"))) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."reservation_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservation_history_delete_for_admin" ON "public"."reservation_history" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "reservation_history"."reservation_id") AND "public"."can_access_clinic"("r"."clinic_id"))))))));



CREATE POLICY "reservation_history_insert_service_role" ON "public"."reservation_history" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "reservation_history_select_for_staff" ON "public"."reservation_history" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "reservation_history"."reservation_id") AND "public"."can_access_clinic"("r"."clinic_id"))))))));



CREATE POLICY "reservation_history_update_for_admin" ON "public"."reservation_history" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "reservation_history"."reservation_id") AND "public"."can_access_clinic"("r"."clinic_id"))))))));



ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_delete_for_managers" ON "public"."reservations" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "reservations_insert_for_staff" ON "public"."reservations" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "reservations_select_for_staff" ON "public"."reservations" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "reservations_update_for_staff" ON "public"."reservations" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resources_delete_for_admin" ON "public"."resources" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "resources_insert_for_managers" ON "public"."resources" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "resources_select_for_staff" ON "public"."resources" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "resources_update_for_managers" ON "public"."resources" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."revenues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "revenues_delete_for_admin" ON "public"."revenues" FOR DELETE USING ((("public"."get_current_role"() = 'admin'::"text") AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "revenues_insert_for_managers" ON "public"."revenues" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "revenues_select_for_managers" ON "public"."revenues" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "revenues_update_for_managers" ON "public"."revenues" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."security_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_alerts_insert_any" ON "public"."security_alerts" FOR INSERT WITH CHECK (true);



CREATE POLICY "security_alerts_select_admin" ON "public"."security_alerts" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND (("clinic_id" IS NULL) OR "public"."can_access_clinic"("clinic_id"))));



CREATE POLICY "security_alerts_update_admin" ON "public"."security_alerts" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND (("clinic_id" IS NULL) OR "public"."can_access_clinic"("clinic_id"))));



ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "security_events_admin_select" ON "public"."security_events" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



CREATE POLICY "security_events_admin_update" ON "public"."security_events" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



CREATE POLICY "security_events_insert_service_role" ON "public"."security_events" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "security_events_self_select" ON "public"."security_events" FOR SELECT USING ((("auth"."uid"() = "user_id") AND ((("clinic_id" IS NOT NULL) AND "public"."can_access_clinic"("clinic_id")) OR (("clinic_id" IS NULL) AND "public"."jwt_is_admin"()))));



ALTER TABLE "public"."session_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_policies_admin_all" ON "public"."session_policies" USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id"))) WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "session_policies_staff_select" ON "public"."session_policies" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_delete_for_managers" ON "public"."staff" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_insert_legacy_block" ON "public"."staff" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."staff_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_invites_clinic_admin_select" ON "public"."staff_invites" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_invites_creator_delete" ON "public"."staff_invites" FOR DELETE USING ((("created_by" = "auth"."uid"()) AND "public"."can_access_clinic"("clinic_id") AND ("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"]))));



CREATE POLICY "staff_invites_creator_insert" ON "public"."staff_invites" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."can_access_clinic"("clinic_id") AND ("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"]))));



CREATE POLICY "staff_invites_creator_select" ON "public"."staff_invites" FOR SELECT USING ((("created_by" = "auth"."uid"()) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_invites_creator_update" ON "public"."staff_invites" FOR UPDATE USING ((("created_by" = "auth"."uid"()) AND "public"."can_access_clinic"("clinic_id") AND ("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])))) WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."can_access_clinic"("clinic_id") AND ("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"]))));



ALTER TABLE "public"."staff_performance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_performance_delete_for_managers" ON "public"."staff_performance" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_performance_insert_for_staff" ON "public"."staff_performance" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_performance_select_for_staff" ON "public"."staff_performance" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_performance_update_for_staff" ON "public"."staff_performance" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."staff_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_preferences_delete" ON "public"."staff_preferences" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_delete_policy" ON "public"."staff_preferences" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_insert" ON "public"."staff_preferences" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_insert_policy" ON "public"."staff_preferences" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



COMMENT ON POLICY "staff_preferences_insert_policy" ON "public"."staff_preferences" IS '希望シフトの直接 INSERT は admin/clinic_admin/manager のみ許可。therapist/staff は本フェーズでは 403。self-service 登録は resources.user_id 導入後に対応。@spec spec-rls-menus-staff-preferences-hardening-v0.2.md Issue 2';



CREATE POLICY "staff_preferences_select" ON "public"."staff_preferences" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_select_policy" ON "public"."staff_preferences" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_update" ON "public"."staff_preferences" FOR UPDATE USING (("public"."can_access_clinic"("clinic_id") AND (("staff_id" = "auth"."uid"()) OR ("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])))));



CREATE POLICY "staff_preferences_update_policy" ON "public"."staff_preferences" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_preferences_upsert_policy" ON "public"."staff_preferences" USING ((("clinic_id" IN ( SELECT "up"."clinic_id"
   FROM "public"."user_permissions" "up"
  WHERE (("up"."staff_id" = "auth"."uid"()) AND (("up"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying])::"text"[]))))) OR ("staff_id" = "auth"."uid"())));



CREATE POLICY "staff_select_for_staff" ON "public"."staff" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."staff_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_shifts_delete" ON "public"."staff_shifts" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_delete_policy" ON "public"."staff_shifts" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_insert" ON "public"."staff_shifts" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_insert_policy" ON "public"."staff_shifts" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_select" ON "public"."staff_shifts" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_select_policy" ON "public"."staff_shifts" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_update" ON "public"."staff_shifts" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_shifts_update_policy" ON "public"."staff_shifts" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "staff_update_for_staff" ON "public"."staff" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."user_mfa_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_mfa_settings_select_policy" ON "public"."user_mfa_settings" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."clinic_id" = "user_mfa_settings"."clinic_id") AND (("p"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'clinic_admin'::character varying, 'manager'::character varying])::"text"[])))))));



ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_permissions_admin_manage" ON "public"."user_permissions" USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id"))) WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "user_permissions_self_select" ON "public"."user_permissions" FOR SELECT USING (("staff_id" = "auth"."uid"()));



ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_sessions_admin_delete" ON "public"."user_sessions" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "user_sessions_admin_select" ON "public"."user_sessions" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "user_sessions_self_insert" ON "public"."user_sessions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "user_sessions_self_select" ON "public"."user_sessions" FOR SELECT USING ((("auth"."uid"() = "user_id") AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "user_sessions_self_update" ON "public"."user_sessions" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."can_access_clinic"("clinic_id")));



ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visits_delete_for_managers" ON "public"."visits" FOR DELETE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "visits_insert_for_staff" ON "public"."visits" FOR INSERT WITH CHECK ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "visits_select_for_staff" ON "public"."visits" FOR SELECT USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



CREATE POLICY "visits_update_for_staff" ON "public"."visits" FOR UPDATE USING ((("public"."get_current_role"() = ANY (ARRAY['admin'::"text", 'clinic_admin'::"text", 'manager'::"text", 'therapist'::"text", 'staff'::"text"])) AND "public"."can_access_clinic"("clinic_id")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_invite"("invite_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invite"("invite_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invite"("invite_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."aggregate_mfa_stats"("p_clinic_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."aggregate_mfa_stats"("p_clinic_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."aggregate_mfa_stats"("p_clinic_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_patient_segments"("clinic_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_patient_segments"("clinic_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_patient_segments"("clinic_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_staff_efficiency"("clinic_uuid" "uuid", "analysis_period" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_staff_efficiency"("clinic_uuid" "uuid", "analysis_period" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_staff_efficiency"("clinic_uuid" "uuid", "analysis_period" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."belongs_to_clinic"("target_clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_churn_risk_score"("patient_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_churn_risk_score"("patient_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_churn_risk_score"("patient_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_patient_ltv"("patient_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_patient_ltv"("patient_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_patient_ltv"("patient_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_clinic"("target_clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_reservation_conflict"("p_staff_id" "uuid", "p_start_time" timestamp with time zone, "p_end_time" timestamp with time zone, "p_exclude_reservation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text", "p_phone_number" "text", "p_opening_date" "date", "p_parent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text", "p_phone_number" "text", "p_opening_date" "date", "p_parent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_with_admin"("p_name" "text", "p_address" "text", "p_phone_number" "text", "p_opening_date" "date", "p_parent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_mfa_secret"("encrypted_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrypt_patient_data"("encrypted_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_patient_data"("encrypted_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_patient_data"("encrypted_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_mfa_secret"("secret_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_patient_data"("plain_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_patient_data"("plain_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_patient_data"("plain_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_time_slots"("p_staff_id" "uuid", "p_date" "date", "p_duration_minutes" integer, "p_slot_interval_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clinic_settings"("p_clinic_id" "uuid", "p_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_clinic_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_revenue_pattern"("clinic_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_revenue_pattern"("clinic_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_revenue_pattern"("clinic_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_visit_pattern"("clinic_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_visit_pattern"("clinic_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_visit_pattern"("clinic_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_by_token"("invite_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_by_token"("invite_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_by_token"("invite_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sibling_clinic_ids"("clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jwt_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."jwt_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jwt_clinic_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_reservation_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_reservation_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_reservation_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_reservation_deleted"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_reservation_deleted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_reservation_deleted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_reservation_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_reservation_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_reservation_updated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."predict_revenue"("clinic_uuid" "uuid", "forecast_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."predict_revenue"("clinic_uuid" "uuid", "forecast_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."predict_revenue"("clinic_uuid" "uuid", "forecast_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_daily_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_daily_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_daily_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_customer_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_customer_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_customer_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_mfa_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_mfa_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_mfa_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_clinic_settings"("p_clinic_id" "uuid", "p_category" "text", "p_settings" "jsonb", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_blocks_clinic_refs"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_blocks_clinic_refs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_blocks_clinic_refs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_reservation_history_clinic_refs"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_reservation_history_clinic_refs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_reservation_history_clinic_refs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_reservations_clinic_refs"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_reservations_clinic_refs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_reservations_clinic_refs"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_comments" TO "anon";
GRANT ALL ON TABLE "public"."ai_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_comments" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."beta_feedback" TO "anon";
GRANT ALL ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."beta_usage_metrics" TO "anon";
GRANT ALL ON TABLE "public"."beta_usage_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_usage_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."blocks" TO "anon";
GRANT ALL ON TABLE "public"."blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."blocks" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_hierarchy" TO "anon";
GRANT ALL ON TABLE "public"."clinic_hierarchy" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_hierarchy" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_settings" TO "anon";
GRANT ALL ON TABLE "public"."clinic_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_settings" TO "service_role";



GRANT ALL ON TABLE "public"."critical_incidents" TO "anon";
GRANT ALL ON TABLE "public"."critical_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."critical_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."csp_violations" TO "anon";
GRANT ALL ON TABLE "public"."csp_violations" TO "authenticated";
GRANT ALL ON TABLE "public"."csp_violations" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_reports" TO "anon";
GRANT ALL ON TABLE "public"."daily_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_reports" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."daily_reservation_stats" TO "anon";
GRANT ALL ON TABLE "public"."daily_reservation_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_reservation_stats" TO "service_role";



GRANT ALL ON TABLE "public"."daily_revenue_summary" TO "anon";
GRANT ALL ON TABLE "public"."daily_revenue_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_revenue_summary" TO "service_role";



GRANT ALL ON TABLE "public"."encryption_keys" TO "anon";
GRANT ALL ON TABLE "public"."encryption_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."encryption_keys" TO "service_role";



GRANT ALL ON TABLE "public"."improvement_backlog" TO "anon";
GRANT ALL ON TABLE "public"."improvement_backlog" TO "authenticated";
GRANT ALL ON TABLE "public"."improvement_backlog" TO "service_role";



GRANT ALL ON TABLE "public"."master_categories" TO "anon";
GRANT ALL ON TABLE "public"."master_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."master_categories" TO "service_role";



GRANT ALL ON TABLE "public"."master_patient_types" TO "anon";
GRANT ALL ON TABLE "public"."master_patient_types" TO "authenticated";
GRANT ALL ON TABLE "public"."master_patient_types" TO "service_role";



GRANT ALL ON TABLE "public"."master_payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."master_payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."master_payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";



GRANT ALL ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_setup_sessions" TO "anon";
GRANT ALL ON TABLE "public"."mfa_setup_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_setup_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_usage_stats" TO "anon";
GRANT ALL ON TABLE "public"."mfa_usage_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_usage_stats" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_states" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_states" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_states" TO "service_role";



GRANT ALL ON TABLE "public"."patient_visit_summary" TO "anon";
GRANT ALL ON TABLE "public"."patient_visit_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_visit_summary" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("phone_number") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("last_login_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("language_preference") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("timezone") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."registered_devices" TO "anon";
GRANT ALL ON TABLE "public"."registered_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."registered_devices" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_history" TO "anon";
GRANT ALL ON TABLE "public"."reservation_history" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_history" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_list_view" TO "anon";
GRANT ALL ON TABLE "public"."reservation_list_view" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_list_view" TO "service_role";



GRANT ALL ON TABLE "public"."revenues" TO "anon";
GRANT ALL ON TABLE "public"."revenues" TO "authenticated";
GRANT ALL ON TABLE "public"."revenues" TO "service_role";



GRANT ALL ON TABLE "public"."security_alerts" TO "anon";
GRANT ALL ON TABLE "public"."security_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."security_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."session_policies" TO "anon";
GRANT ALL ON TABLE "public"."session_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."session_policies" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invites" TO "anon";
GRANT ALL ON TABLE "public"."staff_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invites" TO "service_role";



GRANT ALL ON TABLE "public"."staff_performance" TO "anon";
GRANT ALL ON TABLE "public"."staff_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_performance" TO "service_role";



GRANT ALL ON TABLE "public"."staff_performance_summary" TO "anon";
GRANT ALL ON TABLE "public"."staff_performance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_performance_summary" TO "service_role";



GRANT ALL ON TABLE "public"."staff_preferences" TO "anon";
GRANT ALL ON TABLE "public"."staff_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."staff_shifts" TO "anon";
GRANT ALL ON TABLE "public"."staff_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_menu_records" TO "anon";
GRANT ALL ON TABLE "public"."treatment_menu_records" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_menu_records" TO "service_role";



GRANT ALL ON TABLE "public"."treatments" TO "anon";
GRANT ALL ON TABLE "public"."treatments" TO "authenticated";
GRANT ALL ON TABLE "public"."treatments" TO "service_role";



GRANT ALL ON TABLE "public"."user_mfa_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_mfa_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mfa_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







