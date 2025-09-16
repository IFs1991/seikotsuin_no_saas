-- 日報/AIコメント Seed
-- 適用順: 4 (患者/来院/売上 Seed の後)
BEGIN;

-- クリニックA/Bの直近日報を作成
INSERT INTO daily_reports (id, clinic_id, report_date, staff_id, total_patients, new_patients, total_revenue, insurance_revenue, private_revenue, report_text)
VALUES
  ('rep-a-001', '22222222-2222-2222-2222-222222222222', CURRENT_DATE - 1, '55555555-5555-5555-5555-555555555555', 2, 1, 11000, 3000, 8000, 'A院 日報'),
  ('rep-b-001', '33333333-3333-3333-3333-333333333333', CURRENT_DATE - 1, '66666666-6666-6666-6666-666666666666', 2, 0, 12000, 0, 12000, 'B院 日報')
ON CONFLICT (id) DO NOTHING;

-- AIコメント（ダミー）
INSERT INTO daily_ai_comments (id, clinic_id, comment_date, summary, good_points, improvement_points, suggestion_for_tomorrow, raw_ai_response)
VALUES
  ('ai-a-001', '22222222-2222-2222-2222-222222222222', CURRENT_DATE - 1,
    '患者数・売上ともに安定。保険/自費のバランス良好。',
    '午後の時間帯の回転率が高い',
    '自費メニューの提案機会を増やす',
    '午後の枠を若干拡大',
    '{"source":"seed","quality":"good"}'::jsonb
  ),
  ('ai-b-001', '33333333-3333-3333-3333-333333333333', CURRENT_DATE - 1,
    '自費比率が高く、単価が良好。',
    '来院単価が高い',
    '新患獲得を強化',
    'キャンペーン実施検討',
    '{"source":"seed","quality":"good"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

