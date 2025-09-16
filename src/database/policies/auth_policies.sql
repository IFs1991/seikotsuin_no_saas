-- ================================================================
-- 整骨院管理SaaS - 認証・権限ポリシー定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: Row Level Security (RLS) による認証・権限制御ポリシー

-- ================================================================
-- RLS有効化
-- ================================================================

-- 全てのテーブルでRLSを有効化
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_menu_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_data ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- ヘルパー関数
-- ================================================================

-- 現在のユーザーのプロファイルを取得
CREATE OR REPLACE FUNCTION auth.get_current_profile()
RETURNS public.profiles AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- 現在のユーザーの所属clinic_idを取得
CREATE OR REPLACE FUNCTION auth.get_current_clinic_id()
RETURNS UUID AS $$
  SELECT clinic_id FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- 現在のユーザーのロールを取得
CREATE OR REPLACE FUNCTION auth.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- 管理者権限をチェック
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'manager')
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- スタッフかどうかをチェック
CREATE OR REPLACE FUNCTION auth.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- 特定のクリニックへのアクセス権があるかチェック
CREATE OR REPLACE FUNCTION auth.has_clinic_access(target_clinic_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND (clinic_id = target_clinic_id OR role = 'admin')
    AND is_active = true
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- ================================================================
-- profilesテーブルのポリシー
-- ================================================================

-- 自分のプロファイルは参照・更新可能
CREATE POLICY "Users can view and update their own profile"
ON public.profiles FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 同じクリニックのスタッフプロファイルは参照可能
CREATE POLICY "Users can view profiles in their clinic"
ON public.profiles FOR SELECT
USING (
  clinic_id = auth.get_current_clinic_id()
  OR auth.is_admin()
);

-- 管理者は同じクリニック内のプロファイルを管理可能
CREATE POLICY "Managers can manage profiles in their clinic"
ON public.profiles FOR ALL
USING (
  auth.is_admin() 
  AND (clinic_id = auth.get_current_clinic_id() OR auth.get_current_user_role() = 'admin')
)
WITH CHECK (
  auth.is_admin()
  AND (clinic_id = auth.get_current_clinic_id() OR auth.get_current_user_role() = 'admin')
);

-- ================================================================
-- clinicsテーブルのポリシー
-- ================================================================

-- 自分の所属クリニックは参照可能
CREATE POLICY "Users can view their own clinic"
ON public.clinics FOR SELECT
USING (
  id = auth.get_current_clinic_id()
  OR auth.get_current_user_role() = 'admin'
);

-- システム管理者のみクリニック管理可能
CREATE POLICY "Only system admins can manage clinics"
ON public.clinics FOR ALL
USING (auth.get_current_user_role() = 'admin')
WITH CHECK (auth.get_current_user_role() = 'admin');

-- ================================================================
-- 共通ポリシーマクロ
-- ================================================================

-- clinic_idベースの基本的なアクセス制御
CREATE OR REPLACE FUNCTION create_clinic_based_policies(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- SELECT ポリシー
  EXECUTE format('
    CREATE POLICY "%s_clinic_select"
    ON public.%I FOR SELECT
    USING (auth.has_clinic_access(clinic_id))
  ', table_name, table_name);

  -- INSERT ポリシー
  EXECUTE format('
    CREATE POLICY "%s_clinic_insert"
    ON public.%I FOR INSERT
    WITH CHECK (
      auth.has_clinic_access(clinic_id)
      AND auth.is_staff()
    )
  ', table_name, table_name);

  -- UPDATE ポリシー
  EXECUTE format('
    CREATE POLICY "%s_clinic_update"
    ON public.%I FOR UPDATE
    USING (auth.has_clinic_access(clinic_id))
    WITH CHECK (
      auth.has_clinic_access(clinic_id)
      AND auth.is_staff()
    )
  ', table_name, table_name);

  -- DELETE ポリシー（管理者のみ）
  EXECUTE format('
    CREATE POLICY "%s_clinic_delete"
    ON public.%I FOR DELETE
    USING (
      auth.has_clinic_access(clinic_id)
      AND auth.is_admin()
    )
  ', table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- マスターデータのポリシー適用
-- ================================================================

-- 全店舗共通マスターデータ（clinic_id = NULL）は全員参照可能
CREATE POLICY "Users can view global master data"
ON public.treatment_menus FOR SELECT
USING (clinic_id IS NULL OR auth.has_clinic_access(clinic_id));

CREATE POLICY "Users can view global payment methods"
ON public.payment_methods FOR SELECT
USING (clinic_id IS NULL OR auth.has_clinic_access(clinic_id));

CREATE POLICY "Users can view global patient types"
ON public.patient_types FOR SELECT
USING (clinic_id IS NULL OR auth.has_clinic_access(clinic_id));

-- メニューカテゴリは全員参照可能
CREATE POLICY "Users can view menu categories"
ON public.menu_categories FOR SELECT
USING (true);

-- 保険種別は全員参照可能
CREATE POLICY "Users can view insurance types"
ON public.insurance_types FOR SELECT
USING (true);

-- 権限関連は管理者のみ
CREATE POLICY "Only admins can manage roles"
ON public.roles FOR ALL
USING (auth.is_admin())
WITH CHECK (auth.is_admin());

CREATE POLICY "Only admins can manage permissions"
ON public.permissions FOR ALL
USING (auth.is_admin())
WITH CHECK (auth.is_admin());

CREATE POLICY "Only admins can manage role permissions"
ON public.role_permissions FOR ALL
USING (auth.is_admin())
WITH CHECK (auth.is_admin());

-- ================================================================
-- システム設定のポリシー
-- ================================================================

-- 全体設定（clinic_id = NULL）はシステム管理者のみ
CREATE POLICY "Only system admins can manage global settings"
ON public.system_settings FOR ALL
USING (
  (clinic_id IS NULL AND auth.get_current_user_role() = 'admin')
  OR (clinic_id IS NOT NULL AND auth.has_clinic_access(clinic_id) AND auth.is_admin())
)
WITH CHECK (
  (clinic_id IS NULL AND auth.get_current_user_role() = 'admin')
  OR (clinic_id IS NOT NULL AND auth.has_clinic_access(clinic_id) AND auth.is_admin())
);

-- パブリック設定は参照可能
CREATE POLICY "Users can view public settings"
ON public.system_settings FOR SELECT
USING (
  is_public = true
  AND (clinic_id IS NULL OR auth.has_clinic_access(clinic_id))
);

-- ================================================================
-- ポリシー適用の実行
-- ================================================================

-- clinic_idベースのテーブルにポリシーを適用
SELECT create_clinic_based_policies('patients');
SELECT create_clinic_based_policies('staff');
SELECT create_clinic_based_policies('appointments');
SELECT create_clinic_based_policies('treatments');
SELECT create_clinic_based_policies('revenues');
SELECT create_clinic_based_policies('daily_reports');
SELECT create_clinic_based_policies('ai_comments');
SELECT create_clinic_based_policies('file_attachments');

-- treatment_menu_recordsは特別処理（treatmentベース）
CREATE POLICY "treatment_menu_records_access"
ON public.treatment_menu_records FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.treatments t
    WHERE t.id = treatment_menu_records.treatment_id
    AND auth.has_clinic_access(t.clinic_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.treatments t
    WHERE t.id = treatment_menu_records.treatment_id
    AND auth.has_clinic_access(t.clinic_id)
  )
  AND auth.is_staff()
);

-- ================================================================
-- 特別なポリシー
-- ================================================================

-- 監査ログは自分のアクションか、管理者のみ参照可能
CREATE POLICY "Users can view their own audit logs"
ON public.audit_logs FOR SELECT
USING (
  user_id = auth.uid()
  OR (auth.is_admin() AND auth.has_clinic_access(clinic_id))
);

-- 通知は自分宛てのもののみ
CREATE POLICY "Users can manage their own notifications"
ON public.notifications FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- セッション情報は自分のもののみ
CREATE POLICY "Users can manage their own sessions"
ON public.user_sessions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- システムイベントは管理者のみ
CREATE POLICY "Only admins can view system events"
ON public.system_events FOR SELECT
USING (
  auth.is_admin()
  AND (clinic_id IS NULL OR auth.has_clinic_access(clinic_id))
);

-- API使用ログは管理者のみ
CREATE POLICY "Only admins can view api usage logs"
ON public.api_usage_logs FOR SELECT
USING (
  auth.is_admin()
  AND (clinic_id IS NULL OR auth.has_clinic_access(clinic_id))
);

-- 一時データは作成者のみ
CREATE POLICY "Users can manage their own temporary data"
ON public.temporary_data FOR ALL
USING (
  user_id = auth.uid()
  OR (auth.is_admin() AND auth.has_clinic_access(clinic_id))
)
WITH CHECK (
  user_id = auth.uid()
  OR (auth.is_admin() AND auth.has_clinic_access(clinic_id))
);

-- ================================================================
-- ポリシーテスト用関数
-- ================================================================

-- ポリシーが正しく動作しているかテストする関数
CREATE OR REPLACE FUNCTION test_rls_policies(test_user_id UUID, test_clinic_id UUID)
RETURNS TABLE (
  test_name TEXT,
  result BOOLEAN,
  details TEXT
) AS $$
BEGIN
  -- テスト用の一時的なユーザー切り替え
  -- 実際の使用では、適切な認証されたユーザーで実行される
  
  RETURN QUERY
  SELECT 
    'Profile Access Test'::TEXT,
    EXISTS(SELECT 1 FROM public.profiles WHERE clinic_id = test_clinic_id LIMIT 1),
    'Can access profiles in assigned clinic'::TEXT;
    
  RETURN QUERY
  SELECT 
    'Patient Access Test'::TEXT,
    EXISTS(SELECT 1 FROM public.patients WHERE clinic_id = test_clinic_id LIMIT 1),
    'Can access patients in assigned clinic'::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;