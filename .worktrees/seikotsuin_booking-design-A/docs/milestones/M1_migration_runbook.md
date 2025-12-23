# M1: Supabase マイグレーション & シード実行手順

M1成果物として整備したスキーマ/ビュー/シードをステージング/本番環境へ適用する際の手順を整理します。対象バージョン: `sql/migrations/20251001_create_kpi_views.sql` および `sql/seeds/20251001_sample_transactions.sql`。

## 1. 前提
- Supabase CLI v1.216.7 以降
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が `.env.staging` などに設定済み
- `supabase link --project-ref <project_id>` 済みで、`supabase/config.toml` に staging/production が登録されていること
- ステージング環境はサービスロールでのシード投入が許可されていること

## 2. マイグレーション適用
```bash
# ステージング
supabase link --project-ref <STAGING_PROJECT_ID>
supabase db push --file sql/migrations/20251001_create_kpi_views.sql

# 本番 (レビュー後)
supabase link --project-ref <PRODUCTION_PROJECT_ID>
supabase db push --file sql/migrations/20251001_create_kpi_views.sql
```

適用内容:
- `staging.stg_monthly_kpi_snapshot` テーブル + RLS(policy: service_role専用)
- `public.clinic_mapping` テーブル + admin/service_roleポリシー
- KPI互換ビュー `daily_revenue_summary`, `daily_ai_comments`, `visits`
- RPC `get_hourly_visit_pattern`
- マテビュー `mv_monthly_kpi_summary`, `mv_patient_repeat_metrics`, `mv_staff_productivity`

## 3. シード投入
```bash
# ステージングのみ
supabase db push --file sql/seeds/20251001_sample_transactions.sql
```

**注意:** シードは `auth.users` / `public.profiles` にもデータを挿入するため、サービスロールキーで実行すること。既存データと衝突しないよう UUID を固定しています。

## 4. マテビュー更新
```bash
supabase db remote commit --schema public   --command "REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_kpi_summary;"

supabase db remote commit --schema public   --command "REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_patient_repeat_metrics;"

supabase db remote commit --schema public   --command "REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_staff_productivity;"
```

## 5. 接続確認
```bash
# Envファイルを読み込んで実行 (例: .env.staging)
NODE_OPTIONS="--env-file=.env.staging" npm run verify:supabase
```

`verify-supabase-connection.mjs` が以下を確認します:
- `clinics` テーブルへ接続できること
- `mv_monthly_kpi_summary` / `daily_revenue_summary` / `visits` が参照できること
- RPC `get_hourly_visit_pattern` が呼び出せること

## 6. エラー時のリカバリ
- マイグレーション失敗時: `supabase db remote commit --command "DROP MATERIALIZED VIEW IF EXISTS ..."` などでロールバックし、SQLを修正
- シード失敗時: `BEGIN; DELETE FROM ...; COMMIT;` で今回投入分のみ削除
- `clinic_mapping` の整合性: `SELECT * FROM public.clinic_mapping ORDER BY synced_at DESC;` で確認

## 7. 本番反映チェックリスト
- [ ] supabase migration / seed の `db push` ログを保存
- [ ] `npm run verify:supabase` が成功 (本番は `NODE_OPTIONS="--env-file=.env.production"`)
- [ ] Dashboard API (`/api/dashboard`) が200でレスポンスを返すことをPostmanなどで確認
- [ ] `mv_staff_productivity` の件数が想定通り（ステージングでは>=1件）

---
上記手順により、M1で定義したSupabaseスキーマとシードを安全に適用できます。Runbook の更新は `docs/milestones/M1_migration_runbook.md` を改訂してください。
