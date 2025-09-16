-- 初期マスタデータ Seed
-- 適用順: 1 (schema.sql 適用後、RLS前を推奨)
BEGIN;

-- カテゴリ（保険/自費/交通事故など）
INSERT INTO master_categories (id, name, description)
VALUES 
  ('aaaa0000-0000-0000-0000-000000000001', '保険診療', '保険適用の診療'),
  ('aaaa0000-0000-0000-0000-000000000002', '自費診療', '保険対象外の自費診療'),
  ('aaaa0000-0000-0000-0000-000000000003', '交通事故', '交通事故対応')
ON CONFLICT (id) DO NOTHING;

-- 支払い方法
INSERT INTO master_payment_methods (id, name, is_active)
VALUES 
  ('bbbb0000-0000-0000-0000-000000000001', '現金', true),
  ('bbbb0000-0000-0000-0000-000000000002', 'クレジットカード', true),
  ('bbbb0000-0000-0000-0000-000000000003', '保険請求', true)
ON CONFLICT (id) DO NOTHING;

-- 患者区分
INSERT INTO master_patient_types (id, name, description)
VALUES 
  ('cccc0000-0000-0000-0000-000000000001', '初診', '初回の来院'),
  ('cccc0000-0000-0000-0000-000000000002', '再診', '2回目以降の来院')
ON CONFLICT (id) DO NOTHING;

-- 施術メニュー
INSERT INTO master_treatment_menus (id, name, price, description, is_active)
VALUES 
  ('dddd0000-0000-0000-0000-000000000001', '整体', 5000, '全身整体', true),
  ('dddd0000-0000-0000-0000-000000000002', 'マッサージ', 4000, 'ボディケア', true),
  ('dddd0000-0000-0000-0000-000000000003', '鍼灸', 6000, '鍼灸治療', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;

