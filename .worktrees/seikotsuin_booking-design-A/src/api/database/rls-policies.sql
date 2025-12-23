-- Row Level Security (RLS) ポリシー設定
-- 医療データ保護のための包括的なアクセス制御
-- エンタープライズレベルのセキュリティ実装
-- 準拠法規: 個人情報保護法、医療法、GDPR
-- 作成日: 2025年8月23日

-- すべてのテーブルでRLSを有効化
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_ai_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- エンタープライズレベル セキュリティ関数
-- ===========================================

-- JWT からユーザー情報を取得するヘルパー関数 (Supabase準拠)
CREATE OR REPLACE FUNCTION auth.get_current_clinic_id()
RETURNS UUID AS $$
BEGIN
  -- 優先度1: JWT から clinic_id を取得 (Supabase Auth)
  DECLARE
    jwt_clinic_id UUID;
  BEGIN
    jwt_clinic_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'clinic_id')::uuid;
    IF jwt_clinic_id IS NOT NULL THEN
      RETURN jwt_clinic_id;
    END IF;
  EXCEPTION
    WHEN others THEN NULL;
  END;
  
  -- フォールバック: user_permissions テーブルから取得
  DECLARE
    db_clinic_id UUID;
  BEGIN
    SELECT up.clinic_id INTO db_clinic_id
    FROM user_permissions up
    WHERE up.staff_id = auth.uid();
    RETURN db_clinic_id;
  EXCEPTION
    WHEN others THEN RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.get_current_role()
RETURNS TEXT AS $$
BEGIN
  -- 優先度1: JWT から user_role を取得 (Supabase Auth)
  DECLARE
    jwt_role TEXT;
  BEGIN
    jwt_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role');
    IF jwt_role IS NOT NULL AND jwt_role != '' THEN
      RETURN jwt_role;
    END IF;
  EXCEPTION
    WHEN others THEN NULL;
  END;
  
  -- フォールバック: user_permissions テーブルから取得
  DECLARE
    db_role TEXT;
  BEGIN
    SELECT role INTO db_role
    FROM user_permissions 
    WHERE staff_id = auth.uid();
    RETURN COALESCE(db_role, 'anonymous');
  EXCEPTION
    WHEN others THEN RETURN 'anonymous';
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 患者本人認証用関数
CREATE OR REPLACE FUNCTION auth.is_patient_self(target_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 患者自身のアクセスかチェック
  RETURN target_patient_id = auth.uid();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 担当患者関係チェック関数
CREATE OR REPLACE FUNCTION auth.is_assigned_to_patient(target_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- 管理者・院長は無制限アクセス
  IF auth.get_current_role() IN ('admin', 'clinic_admin') THEN
    RETURN TRUE;
  END IF;
  
  -- 同一クリニック内での担当関係確認
  RETURN EXISTS (
    SELECT 1
    FROM public.therapist_patient_assignments tpa
    WHERE tpa.patient_id = target_patient_id
      AND tpa.therapist_id = auth.uid()
      AND tpa.clinic_id = auth.get_current_clinic_id()
      AND tpa.is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 監査ログ記録関数
CREATE OR REPLACE FUNCTION auth.log_data_access(
  operation_type TEXT,
  table_name TEXT,
  record_id UUID DEFAULT NULL,
  old_data JSONB DEFAULT NULL,
  new_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, user_role, clinic_id, operation_type, table_name, 
    record_id, old_data, new_data, ip_address, timestamp
  ) VALUES (
    auth.uid(),
    auth.get_current_role(),
    auth.get_current_clinic_id(),
    operation_type,
    table_name,
    record_id,
    old_data,
    new_data,
    COALESCE(inet_client_addr(), '127.0.0.1'::inet),
    NOW()
  );
EXCEPTION
  WHEN others THEN
    -- 監査ログ失敗時もメイン処理は継続（可用性確保）
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 下位互換性のためのエイリアス関数
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.get_current_role();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_clinic_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.get_current_clinic_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ===========================================
-- クリニック（clinics）のRLSポリシー
-- ===========================================

-- 管理者は全クリニック参照可能
CREATE POLICY admin_clinics_all ON clinics
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックのみ参照可能
CREATE POLICY clinic_manager_clinics_own ON clinics
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND id = get_current_user_clinic_id()
    );

-- スタッフ・施術者は自分のクリニック情報のみ参照可能（読み取り専用）
CREATE POLICY staff_clinics_own_read ON clinics
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() IN ('therapist', 'staff') 
        AND id = get_current_user_clinic_id()
    );

-- ===========================================
-- スタッフ（staff）のRLSポリシー
-- ===========================================

-- 管理者は全スタッフ情報アクセス可能
CREATE POLICY admin_staff_all ON staff
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックのスタッフのみアクセス可能
CREATE POLICY clinic_manager_staff_own_clinic ON staff
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- スタッフ・施術者は自分の情報と同じクリニックのスタッフ情報のみ参照可能
CREATE POLICY staff_staff_own_clinic_read ON staff
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() IN ('therapist', 'staff') 
        AND (clinic_id = get_current_user_clinic_id() OR id = auth.uid())
    );

-- スタッフは自分の情報のみ更新可能
CREATE POLICY staff_staff_own_update ON staff
    FOR UPDATE TO authenticated
    USING (
        get_current_user_role() IN ('therapist', 'staff') 
        AND id = auth.uid()
    );

-- ===========================================
-- 患者（patients）のRLSポリシー - 最重要
-- ===========================================

-- 管理者は全患者情報アクセス可能
CREATE POLICY admin_patients_all ON patients
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックの患者のみアクセス可能
CREATE POLICY clinic_manager_patients_own_clinic ON patients
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 施術者は自分のクリニックの患者情報のみ参照・更新可能
CREATE POLICY therapist_patients_own_clinic ON patients
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'therapist' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 一般スタッフは自分のクリニックの患者情報を参照のみ可能
CREATE POLICY staff_patients_own_clinic_read ON patients
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() = 'staff' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- ===========================================
-- 来院記録（visits）のRLSポリシー
-- ===========================================

-- 管理者は全記録アクセス可能
CREATE POLICY admin_visits_all ON visits
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックの記録のみアクセス可能
CREATE POLICY clinic_manager_visits_own_clinic ON visits
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 施術者は自分のクリニックの来院記録をアクセス可能
CREATE POLICY therapist_visits_own_clinic ON visits
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'therapist' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 一般スタッフは自分のクリニックの来院記録を参照のみ可能
CREATE POLICY staff_visits_own_clinic_read ON visits
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() = 'staff' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- ===========================================
-- 売上データ（revenues）のRLSポリシー
-- ===========================================

-- 管理者は全売上データアクセス可能
CREATE POLICY admin_revenues_all ON revenues
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックの売上データのみアクセス可能
CREATE POLICY clinic_manager_revenues_own_clinic ON revenues
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 施術者は自分のクリニックの売上データを参照のみ可能
CREATE POLICY therapist_revenues_own_clinic_read ON revenues
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() = 'therapist' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 一般スタッフは売上データアクセス不可（機密情報のため）
-- ポリシー無し = アクセス拒否

-- ===========================================
-- 日報（daily_reports）のRLSポリシー
-- ===========================================

-- 管理者は全日報アクセス可能
CREATE POLICY admin_daily_reports_all ON daily_reports
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックの日報のみアクセス可能
CREATE POLICY clinic_manager_daily_reports_own_clinic ON daily_reports
    FOR ALL TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- スタッフ・施術者は自分のクリニックの日報を参照のみ可能
CREATE POLICY staff_daily_reports_own_clinic_read ON daily_reports
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() IN ('therapist', 'staff') 
        AND clinic_id = get_current_user_clinic_id()
    );

-- ===========================================
-- ユーザー権限（user_permissions）のRLSポリシー
-- ===========================================

-- 管理者は全ユーザー権限管理可能
CREATE POLICY admin_user_permissions_all ON user_permissions
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- クリニック管理者は自分のクリニックのユーザー権限のみ参照可能
CREATE POLICY clinic_manager_user_permissions_own_clinic ON user_permissions
    FOR SELECT TO authenticated
    USING (
        get_current_user_role() = 'clinic_manager' 
        AND clinic_id = get_current_user_clinic_id()
    );

-- 一般ユーザーは自分の権限情報のみ参照可能
CREATE POLICY user_permissions_own ON user_permissions
    FOR SELECT TO authenticated
    USING (staff_id = auth.uid());

-- ===========================================
-- 監査ログ（audit_logs）のRLSポリシー
-- ===========================================

-- 管理者のみ監査ログアクセス可能（セキュリティ上重要）
CREATE POLICY admin_audit_logs_all ON audit_logs
    FOR SELECT TO authenticated
    USING (get_current_user_role() = 'admin');

-- 監査ログの挿入は system role のみ可能（アプリケーションから）
CREATE POLICY system_audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true); -- アプリケーションレベルで制御

-- ===========================================
-- チャット関連のRLSポリシー
-- ===========================================

-- ユーザーは自分のチャットセッションのみアクセス可能
CREATE POLICY user_chat_sessions_own ON chat_sessions
    FOR ALL TO authenticated
    USING (user_id = auth.uid());

-- ユーザーは自分のチャットメッセージのみアクセス可能
CREATE POLICY user_chat_messages_own ON chat_messages
    FOR ALL TO authenticated
    USING (
        session_id IN (
            SELECT id FROM chat_sessions WHERE user_id = auth.uid()
        )
    );

-- ===========================================
-- マスターデータのRLSポリシー
-- ===========================================

-- マスターデータは認証済み全ユーザーが参照可能
CREATE POLICY authenticated_master_treatment_menus_read ON master_treatment_menus
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY authenticated_master_payment_methods_read ON master_payment_methods
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY authenticated_master_patient_types_read ON master_patient_types
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY authenticated_master_categories_read ON master_categories
    FOR SELECT TO authenticated
    USING (true);

-- マスターデータの変更は管理者のみ可能
CREATE POLICY admin_master_treatment_menus_modify ON master_treatment_menus
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

CREATE POLICY admin_master_payment_methods_modify ON master_payment_methods
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

CREATE POLICY admin_master_patient_types_modify ON master_patient_types
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

CREATE POLICY admin_master_categories_modify ON master_categories
    FOR ALL TO authenticated
    USING (get_current_user_role() = 'admin');

-- ===========================================
-- RLSテスト用のデバッグ関数
-- ===========================================

-- ===========================================
-- 監査ログトリガー実装
-- ===========================================

-- 汎用監査ログトリガー関数
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT 操作
  IF (TG_OP = 'INSERT') THEN
    PERFORM auth.log_data_access('INSERT', TG_TABLE_NAME, NEW.id, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  
  -- UPDATE 操作
  IF (TG_OP = 'UPDATE') THEN
    PERFORM auth.log_data_access('UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  
  -- DELETE 操作
  IF (TG_OP = 'DELETE') THEN
    PERFORM auth.log_data_access('DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 監査対象テーブルにトリガー適用
DROP TRIGGER IF EXISTS audit_patients_trigger ON public.patients;
CREATE TRIGGER audit_patients_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_visits_trigger ON public.visits;
CREATE TRIGGER audit_visits_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_staff_trigger ON public.staff;
CREATE TRIGGER audit_staff_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_revenues_trigger ON public.revenues;
CREATE TRIGGER audit_revenues_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.revenues
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- ===========================================
-- パフォーマンス最適化インデックス
-- ===========================================

-- RLS ポリシー最適化用インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_clinic_id ON public.staff(clinic_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visits_clinic_id ON public.visits(clinic_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_revenues_clinic_id ON public.revenues(clinic_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_reports_clinic_id ON public.daily_reports(clinic_id);

-- ユーザー権限検索用インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_permissions_staff_id ON public.user_permissions(staff_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_permissions_clinic_staff ON public.user_permissions(clinic_id, staff_id);

-- 担当関係確認用インデックス（将来対応）
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_therapist_assignments_patient ON public.therapist_patient_assignments(patient_id, therapist_id, clinic_id);

-- 監査ログ検索用インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_clinic_timestamp ON public.audit_logs(clinic_id, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp ON public.audit_logs(user_id, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);

-- ===========================================
-- セキュリティ検証・デバッグ用関数
-- ===========================================

CREATE OR REPLACE FUNCTION debug_current_user_info()
RETURNS TABLE(
    user_id UUID,
    user_role TEXT,
    clinic_id UUID,
    email TEXT,
    jwt_claims JSONB,
    timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        auth.uid() as user_id,
        auth.get_current_role() as user_role,
        auth.get_current_clinic_id() as clinic_id,
        auth.email() as email,
        COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) as jwt_claims,
        NOW() as timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS テストクエリ用関数
CREATE OR REPLACE FUNCTION test_rls_access(test_table_name TEXT)
RETURNS TABLE(
    accessible_records BIGINT,
    user_info JSONB
) AS $$
DECLARE
    query_text TEXT;
    rec_count BIGINT;
BEGIN
    -- 動的クエリでテーブルのレコード数を取得
    query_text := format('SELECT COUNT(*) FROM public.%I', test_table_name);
    EXECUTE query_text INTO rec_count;
    
    RETURN QUERY
    SELECT 
        rec_count as accessible_records,
        jsonb_build_object(
            'user_id', auth.uid(),
            'role', auth.get_current_role(),
            'clinic_id', auth.get_current_clinic_id(),
            'table_tested', test_table_name
        ) as user_info;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- セキュリティポリシー有効化確認
-- ===========================================

-- 全テーブルのRLS有効状態を確認するビュー
CREATE OR REPLACE VIEW security_policy_status AS
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename) as policy_count
FROM pg_tables t
WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE 'information_schema%'
ORDER BY tablename;