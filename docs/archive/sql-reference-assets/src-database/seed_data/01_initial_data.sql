-- ================================================================
-- 整骨院管理SaaS - 初期データ・マスターデータ投入
-- ================================================================
-- 作成日: 2025-08-18
-- 説明: システム運用に必要な初期データとマスターデータの投入

-- ================================================================
-- 1. 権限ロールの初期データ
-- ================================================================

INSERT INTO public.roles (id, name, display_name, description, level, color_code, is_system_role) VALUES
  (uuid_generate_v4(), 'admin', 'システム管理者', '全ての機能にアクセス可能な最高権限', 100, '#DC2626', true),
  (uuid_generate_v4(), 'manager', '店舗管理者', '店舗の運営管理を行う管理者権限', 80, '#059669', true),
  (uuid_generate_v4(), 'practitioner', '施術者', '患者の施術を行うスタッフ', 60, '#2563EB', true),
  (uuid_generate_v4(), 'receptionist', '受付スタッフ', '受付業務を行うスタッフ', 40, '#7C3AED', true),
  (uuid_generate_v4(), 'staff', '一般スタッフ', '基本的な機能のみ利用可能', 20, '#6B7280', true);

-- ================================================================
-- 2. 権限の初期データ
-- ================================================================

-- 患者管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'patient:read', 'patient', 'read', '患者情報の参照', false),
  (uuid_generate_v4(), 'patient:create', 'patient', 'create', '患者情報の新規作成', false),
  (uuid_generate_v4(), 'patient:update', 'patient', 'update', '患者情報の更新', false),
  (uuid_generate_v4(), 'patient:delete', 'patient', 'delete', '患者情報の削除', true),
  (uuid_generate_v4(), 'patient:export', 'patient', 'export', '患者データの出力', false);

-- 施術管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'treatment:read', 'treatment', 'read', '施術記録の参照', false),
  (uuid_generate_v4(), 'treatment:create', 'treatment', 'create', '施術記録の作成', false),
  (uuid_generate_v4(), 'treatment:update', 'treatment', 'update', '施術記録の更新', false),
  (uuid_generate_v4(), 'treatment:delete', 'treatment', 'delete', '施術記録の削除', true);

-- 売上管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'revenue:read', 'revenue', 'read', '売上データの参照', false),
  (uuid_generate_v4(), 'revenue:create', 'revenue', 'create', '売上データの作成', false),
  (uuid_generate_v4(), 'revenue:update', 'revenue', 'update', '売上データの更新', false),
  (uuid_generate_v4(), 'revenue:delete', 'revenue', 'delete', '売上データの削除', true),
  (uuid_generate_v4(), 'revenue:report', 'revenue', 'report', '売上レポートの作成', false);

-- 予約管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'appointment:read', 'appointment', 'read', '予約情報の参照', false),
  (uuid_generate_v4(), 'appointment:create', 'appointment', 'create', '予約の作成', false),
  (uuid_generate_v4(), 'appointment:update', 'appointment', 'update', '予約の更新', false),
  (uuid_generate_v4(), 'appointment:delete', 'appointment', 'delete', '予約の削除', false);

-- スタッフ管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'staff:read', 'staff', 'read', 'スタッフ情報の参照', false),
  (uuid_generate_v4(), 'staff:create', 'staff', 'create', 'スタッフの新規登録', false),
  (uuid_generate_v4(), 'staff:update', 'staff', 'update', 'スタッフ情報の更新', false),
  (uuid_generate_v4(), 'staff:delete', 'staff', 'delete', 'スタッフの削除', true),
  (uuid_generate_v4(), 'staff:manage_permissions', 'staff', 'manage_permissions', 'スタッフ権限の管理', true);

-- 店舗管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'clinic:read', 'clinic', 'read', '店舗情報の参照', false),
  (uuid_generate_v4(), 'clinic:update', 'clinic', 'update', '店舗情報の更新', false),
  (uuid_generate_v4(), 'clinic:settings', 'clinic', 'settings', '店舗設定の管理', false);

-- システム管理権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'system:read', 'system', 'read', 'システム情報の参照', false),
  (uuid_generate_v4(), 'system:backup', 'system', 'backup', 'システムバックアップの実行', false),
  (uuid_generate_v4(), 'system:audit', 'system', 'audit', '監査ログの参照', false),
  (uuid_generate_v4(), 'system:settings', 'system', 'settings', 'システム設定の管理', true);

-- レポート権限
INSERT INTO public.permissions (id, name, resource, action, description, is_dangerous) VALUES
  (uuid_generate_v4(), 'report:daily', 'report', 'daily', '日報の作成・参照', false),
  (uuid_generate_v4(), 'report:weekly', 'report', 'weekly', '週報の作成・参照', false),
  (uuid_generate_v4(), 'report:monthly', 'report', 'monthly', '月報の作成・参照', false),
  (uuid_generate_v4(), 'report:analytics', 'report', 'analytics', '分析レポートの参照', false);

-- ================================================================
-- 3. ロール権限の関連付け
-- ================================================================

-- システム管理者（全ての権限）
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin';

-- 店舗管理者
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'manager'
AND p.name NOT IN (
  'patient:delete',
  'treatment:delete', 
  'revenue:delete',
  'staff:delete',
  'staff:manage_permissions',
  'system:settings'
);

-- 施術者
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'practitioner'
AND p.name IN (
  'patient:read', 'patient:create', 'patient:update',
  'treatment:read', 'treatment:create', 'treatment:update',
  'revenue:read', 'revenue:create',
  'appointment:read', 'appointment:create', 'appointment:update',
  'report:daily'
);

-- 受付スタッフ
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist'
AND p.name IN (
  'patient:read', 'patient:create', 'patient:update',
  'appointment:read', 'appointment:create', 'appointment:update', 'appointment:delete',
  'revenue:read', 'revenue:create',
  'report:daily'
);

-- 一般スタッフ
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'staff'
AND p.name IN (
  'patient:read',
  'appointment:read',
  'report:daily'
);

-- ================================================================
-- 4. メニューカテゴリの初期データ
-- ================================================================

INSERT INTO public.menu_categories (id, name, description, color_code, icon_name, display_order) VALUES
  (uuid_generate_v4(), '基本施術', '基本的な手技療法', '#3B82F6', 'hand', 1),
  (uuid_generate_v4(), '物理療法', '電気治療・温熱療法等', '#10B981', 'zap', 2),
  (uuid_generate_v4(), '運動療法', 'リハビリテーション・運動指導', '#F59E0B', 'activity', 3),
  (uuid_generate_v4(), '特別施術', '特殊な施術・自費診療', '#8B5CF6', 'star', 4),
  (uuid_generate_v4(), '検査・相談', '各種検査・カウンセリング', '#EF4444', 'search', 5);

-- ================================================================
-- 5. 保険種別の初期データ
-- ================================================================

INSERT INTO public.insurance_types (id, code, name, type, coverage_rate, co_payment_rate, point_value) VALUES
  (uuid_generate_v4(), '01', '国民健康保険', 'health_insurance', 0.70, 0.30, 10.00),
  (uuid_generate_v4(), '02', '健康保険（社会保険）', 'health_insurance', 0.70, 0.30, 10.00),
  (uuid_generate_v4(), '03', '後期高齢者医療制度', 'health_insurance', 0.90, 0.10, 10.00),
  (uuid_generate_v4(), '06', '労災保険', 'workers_compensation', 1.00, 0.00, 10.00),
  (uuid_generate_v4(), '07', '自動車保険（自賠責）', 'auto_insurance', 1.00, 0.00, 10.00),
  (uuid_generate_v4(), '99', '自費診療', 'self_pay', 0.00, 1.00, 0.00);

-- ================================================================
-- 6. 基本的な支払い方法
-- ================================================================

INSERT INTO public.payment_methods (id, name, type, processing_fee_rate, processing_fee_fixed, settlement_days, is_default, display_order) VALUES
  (uuid_generate_v4(), '現金', 'cash', 0.0000, 0.00, 0, true, 1),
  (uuid_generate_v4(), 'クレジットカード', 'credit_card', 0.0320, 0.00, 3, false, 2),
  (uuid_generate_v4(), '電子マネー', 'electronic_money', 0.0280, 0.00, 1, false, 3),
  (uuid_generate_v4(), 'QRコード決済', 'electronic_money', 0.0300, 0.00, 1, false, 4),
  (uuid_generate_v4(), '銀行振込', 'bank_transfer', 0.0000, 440.00, 1, false, 5),
  (uuid_generate_v4(), '保険請求', 'insurance', 0.0000, 0.00, 30, false, 6);

-- ================================================================
-- 7. 基本的な施術メニュー（全店舗共通）
-- ================================================================

-- 基本施術カテゴリのメニュー
INSERT INTO public.treatment_menus (id, clinic_id, category_id, code, name, description, price, duration_minutes, is_insurance_applicable, insurance_points, display_order) VALUES
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '基本施術'), 'BASIC_001', '基本整体', '全身の歪みを整える基本的な手技療法', 3000.00, 30, true, 150, 1),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '基本施術'), 'BASIC_002', '部分調整', '特定部位の調整を行う施術', 2000.00, 20, true, 100, 2),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '基本施術'), 'BASIC_003', 'マッサージ', 'リラクゼーションマッサージ', 2500.00, 25, false, NULL, 3);

-- 物理療法カテゴリのメニュー
INSERT INTO public.treatment_menus (id, clinic_id, category_id, code, name, description, price, duration_minutes, is_insurance_applicable, insurance_points, display_order) VALUES
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '物理療法'), 'PHYS_001', '電気治療', '低周波・中周波による電気治療', 1500.00, 15, true, 75, 1),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '物理療法'), 'PHYS_002', '温熱療法', 'ホットパック・赤外線治療', 1000.00, 10, true, 50, 2),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '物理療法'), 'PHYS_003', '超音波治療', '深部組織への超音波治療', 2000.00, 15, true, 100, 3);

-- 運動療法カテゴリのメニュー
INSERT INTO public.treatment_menus (id, clinic_id, category_id, code, name, description, price, duration_minutes, is_insurance_applicable, insurance_points, display_order) VALUES
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '運動療法'), 'EXER_001', '機能訓練', '関節可動域・筋力向上訓練', 2500.00, 30, true, 125, 1),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '運動療法'), 'EXER_002', '姿勢指導', '正しい姿勢の指導・練習', 2000.00, 20, true, 100, 2),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '運動療法'), 'EXER_003', 'ストレッチ指導', '個別ストレッチプログラム', 1500.00, 15, false, NULL, 3);

-- 特別施術カテゴリのメニュー
INSERT INTO public.treatment_menus (id, clinic_id, category_id, code, name, description, price, duration_minutes, is_insurance_applicable, insurance_points, display_order) VALUES
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '特別施術'), 'SPEC_001', '鍼灸治療', 'はり・きゅう施術', 4000.00, 45, false, NULL, 1),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '特別施術'), 'SPEC_002', '美容整体', '美容目的の整体施術', 5000.00, 60, false, NULL, 2),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '特別施術'), 'SPEC_003', 'アロマトリートメント', 'アロマオイルを使用したトリートメント', 6000.00, 60, false, NULL, 3);

-- 検査・相談カテゴリのメニュー
INSERT INTO public.treatment_menus (id, clinic_id, category_id, code, name, description, price, duration_minutes, is_insurance_applicable, insurance_points, display_order) VALUES
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '検査・相談'), 'EXAM_001', '初診・問診', '初回来院時の詳細問診', 1000.00, 20, true, 50, 1),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '検査・相談'), 'EXAM_002', '姿勢分析', 'デジタル姿勢分析', 2000.00, 15, false, NULL, 2),
  (uuid_generate_v4(), NULL, (SELECT id FROM public.menu_categories WHERE name = '検査・相談'), 'EXAM_003', '生活指導', '日常生活における注意点指導', 1500.00, 15, true, 75, 3);

-- ================================================================
-- 8. 患者タイプの初期データ
-- ================================================================

INSERT INTO public.patient_types (id, name, description, default_insurance_type_id, color_code, display_order) VALUES
  (uuid_generate_v4(), '一般患者', '通常の保険診療患者', (SELECT id FROM public.insurance_types WHERE name = '国民健康保険'), '#3B82F6', 1),
  (uuid_generate_v4(), '自費患者', '自費診療専門患者', (SELECT id FROM public.insurance_types WHERE name = '自費診療'), '#10B981', 2),
  (uuid_generate_v4(), '労災患者', '労災保険適用患者', (SELECT id FROM public.insurance_types WHERE name = '労災保険'), '#F59E0B', 3),
  (uuid_generate_v4(), '交通事故患者', '自動車保険適用患者', (SELECT id FROM public.insurance_types WHERE name = '自動車保険（自賠責）'), '#EF4444', 4),
  (uuid_generate_v4(), '高齢者', '後期高齢者医療制度適用患者', (SELECT id FROM public.insurance_types WHERE name = '後期高齢者医療制度'), '#8B5CF6', 5);

-- ================================================================
-- 9. システム設定の初期データ
-- ================================================================

-- 全体設定
INSERT INTO public.system_settings (id, clinic_id, key, value, data_type, description, is_editable, is_public) VALUES
  (uuid_generate_v4(), NULL, 'system_name', '"整骨院管理SaaS"', 'string', 'システム名', false, true),
  (uuid_generate_v4(), NULL, 'system_version', '"1.0.0"', 'string', 'システムバージョン', false, true),
  (uuid_generate_v4(), NULL, 'maintenance_mode', 'false', 'boolean', 'メンテナンスモード', true, false),
  (uuid_generate_v4(), NULL, 'max_file_upload_size', '10485760', 'number', 'ファイルアップロード最大サイズ（バイト）', true, false),
  (uuid_generate_v4(), NULL, 'session_timeout_minutes', '60', 'number', 'セッションタイムアウト（分）', true, false),
  (uuid_generate_v4(), NULL, 'password_min_length', '8', 'number', 'パスワード最小文字数', true, false),
  (uuid_generate_v4(), NULL, 'backup_retention_days', '90', 'number', 'バックアップ保持期間（日）', true, false),
  (uuid_generate_v4(), NULL, 'default_timezone', '"Asia/Tokyo"', 'string', 'デフォルトタイムゾーン', true, true),
  (uuid_generate_v4(), NULL, 'default_language', '"ja"', 'string', 'デフォルト言語', true, true);

-- 業務設定のデフォルト値
INSERT INTO public.system_settings (id, clinic_id, key, value, data_type, description, is_editable, is_public) VALUES
  (uuid_generate_v4(), NULL, 'default_appointment_duration', '30', 'number', 'デフォルト予約時間（分）', true, true),
  (uuid_generate_v4(), NULL, 'business_hours_start', '"09:00"', 'string', '営業開始時間', true, true),
  (uuid_generate_v4(), NULL, 'business_hours_end', '"18:00"', 'string', '営業終了時間', true, true),
  (uuid_generate_v4(), NULL, 'lunch_break_start', '"12:00"', 'string', '昼休み開始時間', true, true),
  (uuid_generate_v4(), NULL, 'lunch_break_end', '"13:00"', 'string', '昼休み終了時間', true, true),
  (uuid_generate_v4(), NULL, 'regular_holidays', '["日曜日"]', 'array', '定休日', true, true),
  (uuid_generate_v4(), NULL, 'max_daily_appointments', '50', 'number', '1日の最大予約数', true, true);

-- ================================================================
-- データ投入完了メッセージ
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '初期データの投入が完了しました。';
  RAISE NOTICE '作成されたロール数: %', (SELECT COUNT(*) FROM public.roles);
  RAISE NOTICE '作成された権限数: %', (SELECT COUNT(*) FROM public.permissions);
  RAISE NOTICE '作成されたメニューカテゴリ数: %', (SELECT COUNT(*) FROM public.menu_categories);
  RAISE NOTICE '作成された施術メニュー数: %', (SELECT COUNT(*) FROM public.treatment_menus);
  RAISE NOTICE '作成された保険種別数: %', (SELECT COUNT(*) FROM public.insurance_types);
  RAISE NOTICE '作成された支払い方法数: %', (SELECT COUNT(*) FROM public.payment_methods);
END $$;