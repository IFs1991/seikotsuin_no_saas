# Supabaseローカル計画

## 目的
- Supabase をローカル（Docker + CLI）で安定稼働させる
- 本番/検証の変更混在を防ぎ、ローカルで整備してから一括デプロイする

## 前提
- このリポジトリは **レガシー系スキーマ（`src/api/database/schema.sql`）** を前提に API が実装されている
- そのため **Supabase CLI の migrations は「レガシー互換」を正** として集約する

## 採用方針（正のソース）
- 正のスキーマ: `src/api/database/schema.sql`
- 正の関数: `src/api/database/functions.sql`
- 予約システム: `sql/migrations/reservation_system_schema.sql`, `sql/migrations/reservation_system_rls.sql`
- 認証連携で必要な `profiles` は **追加の専用 migration** で補完
- `treatments` が参照する `appointments` は **追加の専用 migration** で補完

## Supabase migrations 集約状況
### 追加/採用
- `supabase/migrations/20250817000100_schema.sql`
- `supabase/migrations/20250817000200_functions.sql`
- `supabase/migrations/20250817000300_profiles.sql`（auth.users 連携）
- `supabase/migrations/20250817000400_appointments.sql`（treatments FK 対応）
- `supabase/migrations/20250825000500_05_session_management.sql`
- `supabase/migrations/20250826000600_06_mfa_tables.sql`
- `supabase/migrations/20251011000100_005_beta_operations.sql`
- `supabase/migrations/20251104000100_reservation_system_schema.sql`
- `supabase/migrations/20251104000200_reservation_system_rls.sql`

### 除外
- `supabase/migrations/20250818000100_01_core_tables.sql`
- `supabase/migrations/20250818000200_02_master_data.sql`
- `supabase/migrations/20250818000300_03_transaction_tables.sql`
- `supabase/migrations/20250818000400_04_system_tables.sql`
- `supabase/migrations/20251023045022_20251001_create_kpi_views.sql`

除外理由:
- 現行 API が参照する列名/構造（`revenues.amount`, `patients.name`, `master_*`）と衝突する
- KPI ビューの migration は `visits` の構造を変更し互換性を破る

## ローカル起動手順
1) `.env.local` を実値に更新
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`（通常は `http://127.0.0.1:54321`）

2) Supabase CLI 起動
```bash
supabase start
```

3) DB リセット（migration 適用）
```bash
supabase db reset
```

4) 型生成
```bash
npm run supabase:types
```

5) 接続確認
```bash
npm run verify:supabase
```

## 重要メモ
- 予約 UI は `/reservations` が `profiles.clinic_id` を参照するため、ローカルでも `profiles` の存在が必須
- 本番/検証へ反映する前に、**ローカルで `supabase db reset` が毎回通る** 状態を維持する

## 次の作業候補（必要になったら）
- KPI 系ビューを **レガシー互換ビュー** として再導入
- `auth_policies.sql` を migrations に組み込み、RLS を本運用に合わせる
- ローカル seed データの整備（`supabase/seed.sql` の追加）
