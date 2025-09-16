-- 親テナント（HQ）と子テナント（各クリニック）/ユーザー Seed
-- 適用順: 2 (schema.sql → 0001_master_data.sql の後、RLS前を推奨)
BEGIN;

-- クリニック（親: HQ + 子テナント: A/B）
INSERT INTO clinics (id, name, address, phone_number, opening_date, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'グループ本部（HQ）', '東京都千代田区1-1-1', '03-0000-0000', CURRENT_DATE, true),
  ('22222222-2222-2222-2222-222222222222', '整骨院A', '東京都新宿区2-2-2', '03-1111-1111', CURRENT_DATE, true),
  ('33333333-3333-3333-3333-333333333333', '整骨院B', '東京都渋谷区3-3-3', '03-2222-2222', CURRENT_DATE, true)
ON CONFLICT (id) DO NOTHING;

-- スタッフ（HQ 管理者、各院の管理者/施術者）
INSERT INTO staff (id, clinic_id, name, role, hire_date, is_therapist, email, password_hash)
VALUES
  -- HQ 管理者（グループ管理者）
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'グループ管理者', 'admin', CURRENT_DATE, false, 'admin@group.example.com', 'dummy_hash'),
  -- クリニックA
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'A院 管理者', 'clinic_manager', CURRENT_DATE, false, 'manager.a@clinic.example.com', 'dummy_hash'),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'A院 施術者', 'therapist', CURRENT_DATE, true, 'therapist.a@clinic.example.com', 'dummy_hash'),
  -- クリニックB
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'B院 管理者', 'clinic_manager', CURRENT_DATE, false, 'manager.b@clinic.example.com', 'dummy_hash'),
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'B院 施術者', 'therapist', CURRENT_DATE, true, 'therapist.b@clinic.example.com', 'dummy_hash')
ON CONFLICT (id) DO NOTHING;

-- ユーザー権限（HQ 管理者は全クリニックを管理、各院は clinic_manager/therapist）
-- 注意: Supabase AuthのユーザーIDと staff.id を一致させたい場合は、サインアップ後に staff.id をそのUUIDに更新してください。
INSERT INTO user_permissions (id, staff_id, username, hashed_password, role, clinic_id, last_login_at)
VALUES
  -- HQ 管理者（全院管理） clinic_id は NULL 可
  ('99990000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin@group', 'temp_hash', 'admin', NULL, NOW()),
  -- クリニックA
  ('99990000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'manager.a', 'temp_hash', 'clinic_manager', '22222222-2222-2222-2222-222222222222', NOW()),
  ('99990000-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777', 'therapist.a', 'temp_hash', 'therapist', '22222222-2222-2222-2222-222222222222', NOW()),
  -- クリニックB
  ('99990000-0000-0000-0000-000000000004', '66666666-6666-6666-6666-666666666666', 'manager.b', 'temp_hash', 'clinic_manager', '33333333-3333-3333-3333-333333333333', NOW()),
  ('99990000-0000-0000-0000-000000000005', '88888888-8888-8888-8888-888888888888', 'therapist.b', 'temp_hash', 'therapist', '33333333-3333-3333-3333-333333333333', NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

