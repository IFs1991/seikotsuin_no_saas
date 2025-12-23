# SQLの配置場所と用途まとめ（MVP）

このドキュメントは、本リポジトリ内のSQL関連ファイルの配置場所と用途、適用順、APIとの対応関係を整理したものです。

## 1) 配置一覧（パスと役割）

- `src/api/database/schema.sql`
  - 役割: コアDBスキーマ定義（テーブル・ビュー・関数・インデックス）
  - 主なテーブル: `clinics`, `staff`, `patients`, `visits`, `revenues`, `staff_performance`, `daily_reports`, `daily_ai_comments`, `user_permissions`, `chat_sessions`, `chat_messages`, `audit_logs`, `encryption_keys`
  - 主なビュー: `patient_visit_summary`, `staff_performance_summary`, `daily_revenue_summary`
  - 主な関数: `calculate_churn_risk_score(uuid)`, `calculate_patient_ltv(uuid)`, `encrypt_patient_data(text)`, `decrypt_patient_data(text)`
  - 主なインデックス: `idx_revenues_clinic_date`, `idx_visits_clinic_date`, `idx_patients_clinic`, `idx_staff_clinic`, `idx_daily_reports_clinic_date` ほか

- `src/api/database/functions.sql`
  - 役割: 追加の分析/集計用関数、インデックス
  - 主な関数:
    - `get_hourly_visit_pattern(clinic_uuid uuid)` 時間別来院パターン
    - `get_hourly_revenue_pattern(clinic_uuid uuid)` 時間別収益パターン
    - `analyze_patient_segments(clinic_uuid uuid)` 患者セグメント分析
    - `analyze_staff_efficiency(clinic_uuid uuid, analysis_period int)` スタッフ効率分析
    - `predict_revenue(clinic_uuid uuid, forecast_days int)` 収益予測

- `src/api/database/rls-policies.sql`
  - 役割: 各テーブルのRow Level Security（RLS）ポリシー・検査関数群
  - 注意: 一部で `therapist_patient_assignments` や `security_policy_status` 参照あり（本スキーマ未定義。RLS拡張時に追加するか該当箇所を無効化）

- `validate_rls.sql`
  - 役割: RLS実装の確認スクリプト（有効化状態、ポリシー数、関数存在、インデックス、監査ログなど）
  - 使用: Supabase SQL Editor などで実行し、実装チェックに利用

- `deploy_rls.sh`
  - 役割: RLS関連の適用/検証を自動化するシェル（`psql`で`rls-policies.sql`を実行、状態確認）
  - 前提: `SUPABASE_DB_URL` or `DATABASE_URL` が環境変数で設定済み

- `src/lib/database/csp-violations-schema.sql`
  - 役割: CSP違反ログテーブル・ビュー・インデックス・トリガ・RLSポリシー
  - 注意: ポリシーで `clinic_users` を参照（本スキーマ未定義。必要なら後続で追加）

- `src/lib/database/csp-alert-functions.sql`
  - 役割: CSP違反検知/アラート用の補助関数・トリガ類

- `sql/table_metadata_functions.sql`
  - 役割: メタデータ取得用関数（テーブル/カラム一覧等）。運用・デバッグ補助

## 2) 適用順（推奨）

1. `src/api/database/schema.sql`（テーブル・ビュー・コア関数・インデックス）
2. `src/api/database/functions.sql`（追加関数と補助インデックス）
3. `src/api/database/rls-policies.sql`（RLS導入時）
4. 任意（CSP導入時）`src/lib/database/csp-violations-schema.sql` → `src/lib/database/csp-alert-functions.sql`
5. （RLS導入時の確認）`validate_rls.sql`

補足:

- 暗号化ヘルパーは `current_setting('app.encryption_key', true)` を参照します。必要に応じてDB側で設定してください。
- RLS適用時は、JWTクレームや`user_permissions`の整合が前提です。

### Seed（初期データ）適用順

0. 上記 1→2 を適用した後に、以下のSeedを順番に実行（RLS前を推奨）
   - `sql/seeds/0001_master_data.sql`
   - `sql/seeds/0002_tenants_and_users.sql`
   - `sql/seeds/0003_sample_patients_visits_revenues.sql`
   - `sql/seeds/0004_daily_reports_and_ai.sql`

注: 管理者（親テナント）は`user_permissions.role='admin'`で作成しています（`clinic_id`はNULL可）。各クリニックの管理者は`clinic_manager`、施術者は`therapist`を付与しています。

## 3) API ⇔ SQL 対応関係（主要）

- `/api/daily-reports`
  - 使用: `daily_reports` テーブル（一覧/保存/削除）

- `/api/revenue`
  - 使用: `revenues` テーブル、`daily_revenue_summary` ビュー、`get_hourly_revenue_pattern(uuid)` 関数
  - 参照: `master_treatment_menus`, `master_categories`, `patients`

- `/api/patients`
  - 使用: `patient_visit_summary` ビュー、`calculate_patient_ltv(uuid)`, `calculate_churn_risk_score(uuid)` 関数
  - RLS: 認証済みクライアントでのアクセスを前提

- `/api/dashboard`
  - 使用: `daily_revenue_summary` ビュー、`visits` テーブル、`daily_ai_comments` テーブル、`get_hourly_visit_pattern(uuid)` 関数

- `/api/ai-comments`
  - 使用: `daily_revenue_summary` ビュー（参照）、`daily_ai_comments` テーブル（upsert）

- `/api/staff`
  - 使用: `staff_performance_summary` ビュー、`staff_performance` テーブル、`staff` テーブル

- `/api/security/csp-report`, `/api/admin/security/csp-*`
  - 使用: `csp_violations` テーブル（集計/明細）

- 監査ロガー（`src/lib/audit-logger.ts`）
  - 使用: `audit_logs` テーブル（`schema.sql`）

## 4) 実行例（psql）

環境変数`SUPABASE_DB_URL`が設定済みとして:

```bash
# スキーマ適用
psql "$SUPABASE_DB_URL" -f src/api/database/schema.sql

# 追加関数
psql "$SUPABASE_DB_URL" -f src/api/database/functions.sql

# Seed（RLS適用前を推奨）
psql "$SUPABASE_DB_URL" -f sql/seeds/0001_master_data.sql
psql "$SUPABASE_DB_URL" -f sql/seeds/0002_tenants_and_users.sql
psql "$SUPABASE_DB_URL" -f sql/seeds/0003_sample_patients_visits_revenues.sql
psql "$SUPABASE_DB_URL" -f sql/seeds/0004_daily_reports_and_ai.sql

# RLS（必要時）
psql "$SUPABASE_DB_URL" -f src/api/database/rls-policies.sql

# CSP（必要時）
psql "$SUPABASE_DB_URL" -f src/lib/database/csp-violations-schema.sql
psql "$SUPABASE_DB_URL" -f src/lib/database/csp-alert-functions.sql

# RLS検証（必要時）
psql "$SUPABASE_DB_URL" -f validate_rls.sql
```

## 5) 注意事項（既知の補足）

- `src/api/database/rls-policies.sql`:
  - `therapist_patient_assignments`、`security_policy_status` を参照する箇所があります。MVPでは未使用のため、本番適用時はテーブル/ビューを追加するか該当参照を無効化してください。
- `src/lib/database/csp-violations-schema.sql`:
  - RLSポリシーに `clinic_users` 参照があります。必要に応じてスキーマを追加してください（CSPはMVPスコープ外）。
- 暗号化関数:
  - デモ実装のため、実運用では鍵管理方法を見直してください（KMS/Secret Manager等）。

以上。
