-- ================================================================
-- KPI/E2Eテスト用ステージングサンプルデータ
-- 作成日: 2025-10-01
-- ================================================================
BEGIN;

-- クリニック
INSERT INTO public.clinics (id, name, prefecture, city, is_active)
VALUES
  ('11111111-1111-4111-8111-111111111111', '渋谷整骨院', '東京都', '渋谷区', true),
  ('22222222-2222-4222-8222-222222222222', '梅田整骨院', '大阪府', '大阪市北区', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Supabase Auth ユーザー（サービスロールで投入することを想定）
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role
)
VALUES
  ('bbbbbbb1-0000-4000-8000-bbbbbbbb0001', 'shibuya-admin@example.com', '$2a$10$abcdefghijklmnopqrstuv', NOW(), NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}', '{"clinic_id":"11111111-1111-4111-8111-111111111111"}', 'authenticated', 'authenticated'),
  ('bbbbbbb2-0000-4000-8000-bbbbbbbb0002', 'umeda-admin@example.com', '$2a$10$abcdefghijklmnopqrstuv', NOW(), NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}', '{"clinic_id":"22222222-2222-4222-8222-222222222222"}', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- プロファイル
INSERT INTO public.profiles (
  id, user_id, clinic_id, email, full_name, role, is_active, created_at
)
VALUES
  ('ccccccc1-0000-4000-8000-cccccccc0001', 'bbbbbbb1-0000-4000-8000-bbbbbbbb0001', '11111111-1111-4111-8111-111111111111',
    'shibuya-admin@example.com', '渋谷 太郎', 'manager', true, NOW()),
  ('ccccccc2-0000-4000-8000-cccccccc0002', 'bbbbbbb2-0000-4000-8000-bbbbbbbb0002', '22222222-2222-4222-8222-222222222222',
    'umeda-admin@example.com', '梅田 花子', 'manager', true, NOW())
ON CONFLICT (id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id;

-- スタッフ
INSERT INTO public.staff (
  id, profile_id, clinic_id, staff_number, job_title, hire_date, is_active, is_therapist
)
VALUES
  ('aaaaaaa1-0000-4000-8000-aaaaaaaa0001', 'ccccccc1-0000-4000-8000-cccccccc0001', '11111111-1111-4111-8111-111111111111', 'TK-001', '院長', '2020-01-10', true, true),
  ('aaaaaaa2-0000-4000-8000-aaaaaaaa0002', 'ccccccc2-0000-4000-8000-cccccccc0002', '22222222-2222-4222-8222-222222222222', 'OS-001', '院長', '2019-05-01', true, true)
ON CONFLICT (id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id;

-- 患者
INSERT INTO public.patients (
  id, clinic_id, patient_number, last_name, first_name, date_of_birth,
  phone_number, first_visit_date, last_visit_date, total_visits, total_revenue, risk_score
)
VALUES
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', 'TK-P001', '佐藤', '花子', '1990-04-01', '09011112222', '2024-08-10', '2025-09-26', 12, 82000, 30),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', 'TK-P002', '鈴木', '太郎', '1984-02-11', '09012345678', '2025-09-01', '2025-09-26', 3, 18000, 10),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'OS-P001', '田中', '美咲', '1993-12-24', '08098765432', '2024-05-18', '2025-09-27', 20, 135000, 65)
ON CONFLICT (id) DO UPDATE SET last_visit_date = EXCLUDED.last_visit_date;

-- 施術記録
INSERT INTO public.treatments (
  id, appointment_id, clinic_id, patient_id, primary_staff_id, treatment_date,
  start_time, end_time, status, treatment_performed, pain_level_before, pain_level_after
)
VALUES
  ('44444444-4444-4444-8444-444444444441', NULL, '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333331', 'aaaaaaa1-0000-4000-8000-aaaaaaaa0001', '2025-09-26', '10:00', '10:30', 'completed', '全身調整＋電気療法', 6, 3),
  ('44444444-4444-4444-8444-444444444442', NULL, '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333332', 'aaaaaaa1-0000-4000-8000-aaaaaaaa0001', '2025-09-27', '11:00', '11:25', 'completed', '局所マッサージ', 5, 2),
  ('44444444-4444-4444-8444-444444444443', NULL, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'aaaaaaa2-0000-4000-8000-aaaaaaaa0002', '2025-09-27', '15:00', '15:35', 'completed', '骨盤矯正＋ストレッチ', 7, 4)
ON CONFLICT (id) DO NOTHING;

-- 売上
INSERT INTO public.revenues (
  id, clinic_id, treatment_id, patient_id, revenue_number, revenue_date, revenue_time,
  total_amount, insurance_coverage_amount, patient_payment_amount, payment_status, paid_at
)
VALUES
  ('55555555-5555-4555-8555-555555555551', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'TK-20250926-01', '2025-09-26', '10:35', 8200, 3200, 5000, 'completed', '2025-09-26 10:40:00+09'),
  ('55555555-5555-4555-8555-555555555552', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333332', 'TK-20250927-01', '2025-09-27', '11:30', 6000, 0, 6000, 'completed', '2025-09-27 11:32:00+09'),
  ('55555555-5555-4555-8555-555555555553', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444443', '33333333-3333-4333-8333-333333333333', 'OS-20250927-01', '2025-09-27', '15:40', 12500, 4500, 8000, 'completed', '2025-09-27 15:45:00+09')
ON CONFLICT (id) DO NOTHING;

-- 日報
INSERT INTO public.daily_reports (
  id, clinic_id, report_date, total_patients, new_patients, returning_patients,
  total_revenue, insurance_revenue, private_revenue, staff_summary, issues, actions, status, submitted_at
)
VALUES
  ('66666666-6666-4666-8666-666666666661', '11111111-1111-4111-8111-111111111111', '2025-09-27', 35, 5, 30, 450000, 180000, 270000, '新規患者が増加。デジタル問診が好評。', '昼ピークの待ち時間増', 'スタッフ配置を再調整予定', 'submitted', '2025-09-27 22:05:00+09'),
  ('66666666-6666-4666-8666-666666666662', '22222222-2222-4222-8222-222222222222', '2025-09-27', 28, 3, 25, 380000, 160000, 220000, 'リピート患者の姿勢改善が好調。', 'キャンセル2件', '前日リマインダー強化', 'submitted', '2025-09-27 21:45:00+09')
ON CONFLICT (id) DO UPDATE SET total_patients = EXCLUDED.total_patients;

-- AIコメント
INSERT INTO public.ai_comments (
  id, clinic_id, daily_report_id, comment_date, summary, good_points, improvement_points,
  recommendations, raw_ai_response, comment_type, created_at
)
VALUES
  ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666661', '2025-09-27',
    '新規患者の増加が顕著。既存患者の満足度も高水準です。',
    ARRAY['問診フロー改善で初診満足度向上'],
    ARRAY['昼ピークのリードタイム短縮が課題'],
    ARRAY['受付スタッフの増員とセルフチェックイン導入を検討'],
    '{"model":"gemini-pro","score":0.78}',
    'daily_summary',
    '2025-09-27 22:10:00+09'
  ),
  ('77777777-7777-4777-8777-777777777772', '22222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666662', '2025-09-27',
    'リピート患者の体感改善が継続。キャンセル対策が急務です。',
    ARRAY['トレーニングメニューの継続利用率75%'],
    ARRAY['キャンセル率7%を警戒'],
    ARRAY['SMSリマインダーと前日確認コールを再開'],
    '{"model":"gemini-pro","score":0.72}',
    'daily_summary',
    '2025-09-27 21:50:00+09'
  )
ON CONFLICT (id) DO UPDATE SET summary = EXCLUDED.summary;

COMMIT;
