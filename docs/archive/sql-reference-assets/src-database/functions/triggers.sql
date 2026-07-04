-- ================================================================
-- 整骨院管理SaaS - トリガー・ストアドプロシージャ定義
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: 自動処理、データ整合性チェック、ビジネスロジック用の関数・トリガー

-- ================================================================
-- 共通トリガー関数
-- ================================================================

-- updated_at自動更新トリガー関数
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 監査ログ記録トリガー関数
CREATE OR REPLACE FUNCTION trigger_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  audit_action TEXT;
  old_data JSONB;
  new_data JSONB;
BEGIN
  -- 操作タイプを設定
  IF TG_OP = 'DELETE' THEN
    audit_action := 'DELETE';
    old_data := to_jsonb(OLD);
    new_data := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    audit_action := 'UPDATE';
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    audit_action := 'INSERT';
    old_data := NULL;
    new_data := to_jsonb(NEW);
  END IF;

  -- 監査ログを挿入
  INSERT INTO public.audit_logs (
    user_id,
    clinic_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    severity,
    category
  ) VALUES (
    auth.uid(),
    COALESCE(NEW.clinic_id, OLD.clinic_id),
    audit_action || '_' || upper(TG_TABLE_NAME),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    old_data,
    new_data,
    'info',
    'data_modification'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- updated_atトリガーの設定
-- ================================================================

-- 全ての主要テーブルにupdated_atトリガーを設定
CREATE TRIGGER set_updated_at_clinics
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_patients
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_staff
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_treatment_menus
  BEFORE UPDATE ON public.treatment_menus
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_appointments
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_treatments
  BEFORE UPDATE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_revenues
  BEFORE UPDATE ON public.revenues
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_daily_reports
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ================================================================
-- 患者関連のトリガー
-- ================================================================

-- 患者統計更新トリガー関数
CREATE OR REPLACE FUNCTION trigger_update_patient_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 新規治療記録の場合、患者の統計を更新
    UPDATE public.patients SET
      last_visit_date = NEW.treatment_date,
      total_visits = total_visits + 1,
      updated_at = NOW()
    WHERE id = NEW.patient_id;
    
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'completed' THEN
    -- 治療完了時の統計更新
    UPDATE public.patients SET
      last_visit_date = NEW.treatment_date,
      updated_at = NOW()
    WHERE id = NEW.patient_id;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- 治療記録削除時の統計更新
    UPDATE public.patients SET
      total_visits = total_visits - 1,
      updated_at = NOW()
    WHERE id = OLD.patient_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 患者統計更新トリガー
CREATE TRIGGER update_patient_stats_on_treatment
  AFTER INSERT OR UPDATE OR DELETE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION trigger_update_patient_stats();

-- 売上統計更新トリガー関数
CREATE OR REPLACE FUNCTION trigger_update_patient_revenue()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 新規売上の場合
    UPDATE public.patients SET
      total_revenue = total_revenue + NEW.total_amount,
      updated_at = NOW()
    WHERE id = NEW.patient_id;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- 売上更新の場合
    UPDATE public.patients SET
      total_revenue = total_revenue - OLD.total_amount + NEW.total_amount,
      updated_at = NOW()
    WHERE id = NEW.patient_id;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- 売上削除の場合
    UPDATE public.patients SET
      total_revenue = total_revenue - OLD.total_amount,
      updated_at = NOW()
    WHERE id = OLD.patient_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 患者売上統計更新トリガー
CREATE TRIGGER update_patient_revenue_on_sale
  AFTER INSERT OR UPDATE OR DELETE ON public.revenues
  FOR EACH ROW EXECUTE FUNCTION trigger_update_patient_revenue();

-- ================================================================
-- 予約関連のトリガー
-- ================================================================

-- 予約番号自動生成トリガー関数
CREATE OR REPLACE FUNCTION trigger_generate_appointment_number()
RETURNS TRIGGER AS $$
DECLARE
  next_number INTEGER;
  number_prefix TEXT;
BEGIN
  IF NEW.appointment_number IS NULL THEN
    -- 日付ベースのプレフィックス（例: 20250818）
    number_prefix := to_char(NEW.appointment_date, 'YYYYMMDD');
    
    -- その日の最大番号を取得
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(appointment_number FROM '[0-9]+$') AS INTEGER)), 0
    ) + 1
    INTO next_number
    FROM public.appointments
    WHERE clinic_id = NEW.clinic_id
    AND appointment_date = NEW.appointment_date
    AND appointment_number LIKE number_prefix || '%';
    
    -- 番号を生成（例: 20250818001）
    NEW.appointment_number := number_prefix || LPAD(next_number::TEXT, 3, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 予約番号生成トリガー
CREATE TRIGGER generate_appointment_number
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_appointment_number();

-- ================================================================
-- 売上関連のトリガー
-- ================================================================

-- 売上番号・レシート番号自動生成トリガー関数
CREATE OR REPLACE FUNCTION trigger_generate_revenue_numbers()
RETURNS TRIGGER AS $$
DECLARE
  next_revenue_number INTEGER;
  next_receipt_number INTEGER;
  date_prefix TEXT;
BEGIN
  date_prefix := to_char(NEW.revenue_date, 'YYYYMMDD');
  
  -- 売上番号生成
  IF NEW.revenue_number IS NULL THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(revenue_number FROM '[0-9]+$') AS INTEGER)), 0
    ) + 1
    INTO next_revenue_number
    FROM public.revenues
    WHERE clinic_id = NEW.clinic_id
    AND revenue_date = NEW.revenue_date;
    
    NEW.revenue_number := 'REV-' || date_prefix || '-' || LPAD(next_revenue_number::TEXT, 4, '0');
  END IF;
  
  -- レシート番号生成
  IF NEW.receipt_number IS NULL THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(receipt_number FROM '[0-9]+$') AS INTEGER)), 0
    ) + 1
    INTO next_receipt_number
    FROM public.revenues
    WHERE clinic_id = NEW.clinic_id
    AND revenue_date = NEW.revenue_date;
    
    NEW.receipt_number := 'RCP-' || date_prefix || '-' || LPAD(next_receipt_number::TEXT, 4, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 売上番号生成トリガー
CREATE TRIGGER generate_revenue_numbers
  BEFORE INSERT ON public.revenues
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_revenue_numbers();

-- ================================================================
-- 日報関連のトリガー
-- ================================================================

-- 日報統計自動計算トリガー関数
CREATE OR REPLACE FUNCTION trigger_calculate_daily_report_stats()
RETURNS TRIGGER AS $$
DECLARE
  revenue_stats RECORD;
  patient_stats RECORD;
  staff_stats RECORD;
BEGIN
  -- 売上統計を計算
  SELECT 
    COALESCE(SUM(total_amount), 0) as total_revenue,
    COALESCE(SUM(insurance_coverage_amount), 0) as insurance_revenue,
    COALESCE(SUM(patient_payment_amount), 0) as self_pay_revenue,
    COALESCE(AVG(total_amount), 0) as avg_revenue_per_patient
  INTO revenue_stats
  FROM public.revenues
  WHERE clinic_id = NEW.clinic_id
  AND revenue_date = NEW.report_date;
  
  -- 患者統計を計算
  SELECT 
    COUNT(DISTINCT t.patient_id) as total_patients,
    COUNT(DISTINCT CASE WHEN p.first_visit_date = NEW.report_date THEN t.patient_id END) as new_patients,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'cancelled') as cancelled_appointments,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'no_show') as no_show_appointments
  INTO patient_stats
  FROM public.treatments t
  LEFT JOIN public.patients p ON t.patient_id = p.id
  LEFT JOIN public.appointments a ON t.appointment_id = a.id
  WHERE t.clinic_id = NEW.clinic_id
  AND t.treatment_date = NEW.report_date;
  
  -- スタッフ統計を計算
  SELECT 
    COUNT(DISTINCT s.id) as staff_count,
    COUNT(DISTINCT s.id) FILTER (WHERE s.is_therapist = true) as therapist_count
  INTO staff_stats
  FROM public.staff s
  WHERE s.clinic_id = NEW.clinic_id
  AND s.is_active = true;
  
  -- 統計値を設定
  NEW.total_revenue := revenue_stats.total_revenue;
  NEW.insurance_revenue := revenue_stats.insurance_revenue;
  NEW.self_pay_revenue := revenue_stats.self_pay_revenue;
  NEW.average_revenue_per_patient := revenue_stats.avg_revenue_per_patient;
  NEW.total_patients := patient_stats.total_patients;
  NEW.new_patients := patient_stats.new_patients;
  NEW.returning_patients := patient_stats.total_patients - patient_stats.new_patients;
  NEW.cancelled_appointments := patient_stats.cancelled_appointments;
  NEW.no_show_appointments := patient_stats.no_show_appointments;
  NEW.staff_count := staff_stats.staff_count;
  NEW.therapist_count := staff_stats.therapist_count;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 日報統計計算トリガー
CREATE TRIGGER calculate_daily_report_stats
  BEFORE INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_daily_report_stats();

-- ================================================================
-- セキュリティ関連のトリガー
-- ================================================================

-- プロファイル作成時の初期設定トリガー関数
CREATE OR REPLACE FUNCTION trigger_setup_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- 新規ユーザーのデフォルト設定
  IF NEW.role IS NULL THEN
    NEW.role := 'staff';
  END IF;
  
  -- 最終ログイン時刻を現在時刻に設定
  NEW.last_login_at := NOW();
  
  -- 通知: 新規ユーザー登録の管理者通知
  INSERT INTO public.notifications (
    user_id,
    clinic_id,
    type,
    title,
    message,
    priority
  )
  SELECT 
    p.user_id,
    NEW.clinic_id,
    'new_user_registration',
    '新規ユーザー登録',
    '新しいユーザー「' || NEW.full_name || '」が登録されました。',
    'normal'
  FROM public.profiles p
  WHERE p.clinic_id = NEW.clinic_id
  AND p.role IN ('admin', 'manager')
  AND p.is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- プロファイル作成トリガー
CREATE TRIGGER setup_new_profile
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_setup_new_profile();

-- ================================================================
-- システムイベント記録トリガー
-- ================================================================

-- 重要なイベントを自動記録するトリガー関数
CREATE OR REPLACE FUNCTION trigger_log_system_event()
RETURNS TRIGGER AS $$
DECLARE
  event_title TEXT;
  event_description TEXT;
  event_severity TEXT := 'info';
BEGIN
  -- テーブルと操作に応じたイベント内容を設定
  CASE TG_TABLE_NAME
    WHEN 'staff' THEN
      IF TG_OP = 'INSERT' THEN
        event_title := 'スタッフ追加';
        event_description := 'スタッフ「' || NEW.job_title || '」が追加されました。';
      ELSIF TG_OP = 'UPDATE' AND OLD.is_active != NEW.is_active THEN
        event_title := 'スタッフステータス変更';
        event_description := 'スタッフ「' || NEW.job_title || '」のステータスが変更されました。';
        event_severity := CASE WHEN NEW.is_active = false THEN 'warning' ELSE 'info' END;
      END IF;
    
    WHEN 'revenues' THEN
      IF TG_OP = 'INSERT' AND NEW.total_amount > 50000 THEN
        event_title := '高額売上発生';
        event_description := '高額売上（' || NEW.total_amount || '円）が発生しました。';
        event_severity := 'info';
      END IF;
    
    WHEN 'daily_reports' THEN
      IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'approved' THEN
        event_title := '日報承認';
        event_description := NEW.report_date || 'の日報が承認されました。';
      END IF;
  END CASE;
  
  -- イベントを記録
  IF event_title IS NOT NULL THEN
    INSERT INTO public.system_events (
      event_type,
      event_category,
      title,
      description,
      severity,
      clinic_id,
      user_id,
      related_resource_type,
      related_resource_id
    ) VALUES (
      lower(replace(event_title, ' ', '_')),
      'business',
      event_title,
      event_description,
      event_severity,
      COALESCE(NEW.clinic_id, OLD.clinic_id),
      auth.uid(),
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id)
    );
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- システムイベント記録トリガー
CREATE TRIGGER log_system_event_staff
  AFTER INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION trigger_log_system_event();

CREATE TRIGGER log_system_event_revenues
  AFTER INSERT ON public.revenues
  FOR EACH ROW EXECUTE FUNCTION trigger_log_system_event();

CREATE TRIGGER log_system_event_daily_reports
  AFTER UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_log_system_event();

-- ================================================================
-- データ整合性チェック関数
-- ================================================================

-- データベースの整合性をチェックする関数
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  issue_count INTEGER,
  details TEXT
) AS $$
BEGIN
  -- 孤立した患者レコードのチェック
  RETURN QUERY
  SELECT 
    'Orphaned Patients'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
    COUNT(*)::INTEGER,
    'Patients without valid clinic reference'::TEXT
  FROM public.patients p
  LEFT JOIN public.clinics c ON p.clinic_id = c.id
  WHERE c.id IS NULL;
  
  -- 売上データの整合性チェック
  RETURN QUERY
  SELECT 
    'Revenue Calculation'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
    COUNT(*)::INTEGER,
    'Revenues where total != insurance + patient payment'::TEXT
  FROM public.revenues
  WHERE total_amount != (insurance_coverage_amount + patient_payment_amount);
  
  -- 日報データの整合性チェック
  RETURN QUERY
  SELECT 
    'Daily Report Totals'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
    COUNT(*)::INTEGER,
    'Daily reports where total revenue != insurance + self-pay'::TEXT
  FROM public.daily_reports
  WHERE total_revenue != (insurance_revenue + self_pay_revenue);
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;