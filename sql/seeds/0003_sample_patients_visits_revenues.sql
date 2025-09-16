-- サンプル患者/来院/売上 Seed
-- 適用順: 3 (マスタ/テナント/ユーザー Seed の後)
BEGIN;

-- クリニックAの患者
WITH cA AS (
  SELECT '22222222-2222-2222-2222-222222222222'::uuid AS clinic_id
), menu AS (
  SELECT 
    (SELECT id FROM master_treatment_menus WHERE name='整体') AS menu_seitai,
    (SELECT id FROM master_treatment_menus WHERE name='マッサージ') AS menu_massage,
    (SELECT id FROM master_treatment_menus WHERE name='鍼灸') AS menu_shinkyu
), cat AS (
  SELECT 
    (SELECT id FROM master_categories WHERE name='保険診療') AS cat_ins,
    (SELECT id FROM master_categories WHERE name='自費診療') AS cat_self
), pay AS (
  SELECT 
    (SELECT id FROM master_payment_methods WHERE name='現金') AS pay_cash,
    (SELECT id FROM master_payment_methods WHERE name='クレジットカード') AS pay_card
)
INSERT INTO patients (id, clinic_id, name, gender, date_of_birth, phone_number, address, registration_date, last_visit_date)
SELECT 
  'aaaa1111-1111-1111-1111-aaaaaaaaaaa1', clinic_id, '田中太郎', 'male', '1985-01-15', '090-1111-1111', '東京都新宿区', CURRENT_DATE - 30, CURRENT_DATE - 1 FROM cA
UNION ALL
SELECT 'aaaa1111-1111-1111-1111-aaaaaaaaaaa2', clinic_id, '山田花子', 'female', '1990-05-20', '090-2222-2222', '東京都新宿区', CURRENT_DATE - 25, CURRENT_DATE - 2 FROM cA
ON CONFLICT (id) DO NOTHING;

-- クリニックBの患者
WITH cB AS (
  SELECT '33333333-3333-3333-3333-333333333333'::uuid AS clinic_id
)
INSERT INTO patients (id, clinic_id, name, gender, date_of_birth, phone_number, address, registration_date, last_visit_date)
SELECT 
  'bbbb1111-1111-1111-1111-bbbbbbbbbbb1', clinic_id, '佐藤次郎', 'male', '1982-03-10', '090-3333-3333', '東京都渋谷区', CURRENT_DATE - 20, CURRENT_DATE - 3 FROM cB
UNION ALL
SELECT 'bbbb1111-1111-1111-1111-bbbbbbbbbbb2', clinic_id, '鈴木三郎', 'male', '1978-08-08', '090-4444-4444', '東京都渋谷区', CURRENT_DATE - 15, CURRENT_DATE - 1 FROM cB
ON CONFLICT (id) DO NOTHING;

-- 来院と売上（A院）
WITH ids AS (
  SELECT 
    '22222222-2222-2222-2222-222222222222'::uuid AS clinic_id,
    '77777777-7777-7777-7777-777777777777'::uuid AS therapist_id,
    'aaaa1111-1111-1111-1111-aaaaaaaaaaa1'::uuid AS p1,
    'aaaa1111-1111-1111-1111-aaaaaaaaaaa2'::uuid AS p2
), ref AS (
  SELECT 
    (SELECT id FROM master_treatment_menus WHERE name='整体') AS m1,
    (SELECT id FROM master_treatment_menus WHERE name='マッサージ') AS m2,
    (SELECT id FROM master_categories WHERE name='保険診療') AS cat_ins,
    (SELECT id FROM master_categories WHERE name='自費診療') AS cat_self,
    (SELECT id FROM master_payment_methods WHERE name='現金') AS pay_cash,
    (SELECT id FROM master_payment_methods WHERE name='クレジットカード') AS pay_card
)
INSERT INTO visits (id, patient_id, clinic_id, visit_date, therapist_id, notes)
SELECT 'a-v-001', p1, clinic_id, (CURRENT_DATE - 2) + TIME '10:00', therapist_id, '首肩こり' FROM ids
UNION ALL
SELECT 'a-v-002', p2, clinic_id, (CURRENT_DATE - 1) + TIME '15:00', therapist_id, '腰痛' FROM ids
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenues (id, visit_id, clinic_id, patient_id, revenue_date, amount, insurance_revenue, private_revenue, payment_method_id, treatment_menu_id, category_id)
SELECT 'a-r-001', 'a-v-001', clinic_id, p1, CURRENT_DATE - 2, 5000, 3000, 2000, (SELECT pay_cash FROM ref), (SELECT m1 FROM ref), (SELECT cat_ins FROM ref) FROM ids
UNION ALL
SELECT 'a-r-002', 'a-v-002', clinic_id, p2, CURRENT_DATE - 1, 6000, 0, 6000, (SELECT pay_card FROM ref), (SELECT m2 FROM ref), (SELECT cat_self FROM ref) FROM ids
ON CONFLICT (id) DO NOTHING;

-- 来院と売上（B院）
WITH ids AS (
  SELECT 
    '33333333-3333-3333-3333-333333333333'::uuid AS clinic_id,
    '88888888-8888-8888-8888-888888888888'::uuid AS therapist_id,
    'bbbb1111-1111-1111-1111-bbbbbbbbbbb1'::uuid AS p1,
    'bbbb1111-1111-1111-1111-bbbbbbbbbbb2'::uuid AS p2
), ref AS (
  SELECT 
    (SELECT id FROM master_treatment_menus WHERE name='鍼灸') AS m3,
    (SELECT id FROM master_categories WHERE name='自費診療') AS cat_self,
    (SELECT id FROM master_payment_methods WHERE name='現金') AS pay_cash
)
INSERT INTO visits (id, patient_id, clinic_id, visit_date, therapist_id, notes)
SELECT 'b-v-001', p1, clinic_id, (CURRENT_DATE - 1) + TIME '11:30', therapist_id, '膝痛' FROM ids
UNION ALL
SELECT 'b-v-002', p2, clinic_id, (CURRENT_DATE - 1) + TIME '16:00', therapist_id, '背中の張り' FROM ids
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenues (id, visit_id, clinic_id, patient_id, revenue_date, amount, insurance_revenue, private_revenue, payment_method_id, treatment_menu_id, category_id)
SELECT 'b-r-001', 'b-v-001', clinic_id, p1, CURRENT_DATE - 1, 6000, 0, 6000, (SELECT pay_cash FROM ref), (SELECT m3 FROM ref), (SELECT cat_self FROM ref) FROM ids
UNION ALL
SELECT 'b-r-002', 'b-v-002', clinic_id, p2, CURRENT_DATE - 1, 6000, 0, 6000, (SELECT pay_cash FROM ref), (SELECT m3 FROM ref), (SELECT cat_self FROM ref) FROM ids
ON CONFLICT (id) DO NOTHING;

COMMIT;

