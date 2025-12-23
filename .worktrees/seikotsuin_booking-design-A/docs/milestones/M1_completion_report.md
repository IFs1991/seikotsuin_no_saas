# M1 完了レポート: データ連携有効化

- **スキーマ/ビュー拡張**: `sql/migrations/20251001_create_kpi_views.sql`
  - `daily_revenue_summary`, `daily_ai_comments`, `visits` の互換ビューを整備し API が Supabase 実データを参照可能に
  - KPI向けマテビュー (月次/患者再来/スタッフ生産性) を追加
  - `staging.stg_monthly_kpi_snapshot` と `clinic_mapping` を新設し、RLSポリシーを適用
- **シードデータ**: `sql/seeds/20251001_sample_transactions.sql`
  - ステージング検証用のクリニック/患者/施術/売上/日報/AIコメントを投入
  - `auth.users` / `public.profiles` / `public.staff` の関連整合性を保持
- **運用Runbook**: `docs/milestones/M1_migration_runbook.md`
  - Supabase CLIでのマイグレーション/シード実行手順
  - マテビュー更新と `npm run verify:supabase` チェック手順
- **接続検証スクリプト**: `scripts/verify-supabase-connection.mjs` (`package.json` に `verify:supabase` 追加)
  - `clinics`/`mv_monthly_kpi_summary`/`daily_revenue_summary`/`visits`/`get_hourly_visit_pattern` が到達可能か確認
- **API統合テスト**: `src/__tests__/integration/api-staging-data.test.ts`
  - Dashboard/Patients/Daily-Reports 各APIがSupabaseのビュー/RPC応答を正しく整形することを検証
- **認証E2Eフロー**: `src/__tests__/e2e/auth-login-flow.test.ts`
  - ログイン成功→ダッシュボードリダイレクト
  - 認証失敗時のエラーメッセージ
  - ログアウト成功/失敗時のリダイレクト挙動

上記により、M1のエントリーゲートで求められる Supabase 連携基盤・主要APIテスト・認証E2E確認が完了しました。次フェーズ (M2) では、実データをダッシュボード／日報／患者分析画面へ統合し、フォームバリデーションと統合テストの拡充に着手します。
