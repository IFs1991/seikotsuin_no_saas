# Supabase Security Advisor Lints Spec v0.1

- 作成日: 2026-04-13
- ステータス: APPROVED
- 入力証跡: `C:/Users/seekf/Downloads/Supabase Performance Security Lints Error(qnanuoqveidwvacvbhqp).csv`
- 関連 DoD: `docs/stabilization/DoD-v0.1.md` の `DOD-04`, `DOD-08`, `DOD-09`
- 実装ファイル: `supabase/migrations/20260413000100_security_advisor_lints_hardening.sql`
- rollback: `supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql`

## 1. 目的

Supabase Security Advisor が検出した以下 5 系統の warning / error を、過去 migration を直接編集せず新規 migration で収束させる。

1. `function_search_path_mutable`
2. `extension_in_public`
3. `materialized_view_in_api`
4. `security_definer_view`
5. `rls_policy_always_true`

## 2. 現状と原因

### 2.1 Function Search Path Mutable

- 根拠: `supabase/migrations/00000000000001_squashed_baseline.sql`
- 対象関数:
  - `public.aggregate_mfa_stats`
  - `public.custom_access_token_hook`
  - `public.get_current_role`
  - `public.refresh_daily_stats`
  - 他、CSV 記載の `public` 関数群
- 原因: 関数定義に固定 `search_path` がなく、呼び出しロール依存の探索順序になっている。

### 2.2 Extension In Public

- 根拠: `supabase/migrations/00000000000001_squashed_baseline.sql:7`
- 設定: `CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";`
- 原因: `pg_trgm` が `public` に配置されている。

### 2.3 Materialized View In API

- 根拠:
  - `supabase/migrations/00000000000001_squashed_baseline.sql:2056`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5784`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5785`
- 対象: `public.daily_reservation_stats`
- 原因: `anon` / `authenticated` に公開 grant が残っている。

### 2.4 Security Definer View

- 根拠:
  - `supabase/migrations/00000000000001_squashed_baseline.sql:1800`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:2074`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:2397`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:2582`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:2804`
- 入力 CSV 上の対象:
  - `public.clinic_hierarchy`
  - `public.staff_performance_summary`
  - `public.patient_visit_summary`
  - `public.daily_revenue_summary`
  - `public.reservation_list_view`
- 原因: 上記 view は `security_invoker` 未設定のため view owner 権限で評価され、Supabase Security Advisor の `security_definer_view` error に該当する。

### 2.5 RLS Policy Always True

- 根拠:
  - `supabase/migrations/00000000000001_squashed_baseline.sql:4711`
  - `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot.sql:76`
  - `supabase/migrations/20260304000100_csp_security_alerts_migration_ssot.sql:146`
- 対象:
  - `public.beta_usage_metrics` / `System can insert metrics`
  - `public.csp_violations` / `csp_violations_insert_any`
  - `public.security_alerts` / `security_alerts_insert_any`
- 原因: `WITH CHECK (true)` により INSERT 時の RLS が実質無効化されている。

## 3. 変更方針

### 3.1 DB migration

新規 migration `supabase/migrations/20260413000100_security_advisor_lints_hardening.sql` で以下を行う。

1. 対象 `public` 関数に `SET search_path = public, auth, extensions` を付与
2. `pg_trgm` を `extensions` schema へ移動
3. `public.daily_reservation_stats` から `anon` / `authenticated` の grant を剥奪
4. `public.clinic_hierarchy`, `public.staff_performance_summary`, `public.patient_visit_summary`, `public.daily_revenue_summary`, `public.reservation_list_view` に `ALTER VIEW ... SET (security_invoker = true)` を適用
5. 3 つの INSERT policy を `WITH CHECK (auth.role() = 'service_role')` に変更
6. 上記 3 テーブルの `INSERT` 権限を `anon` / `authenticated` から剥奪し `service_role` に限定

### 3.2 アプリ側前提変更

RLS tightening に合わせ、サーバー側コードを service role write に寄せる。

- `src/app/api/security/csp-report/route.ts`
  - `csp_violations` INSERT を `createAdminClient()` で実行
- `src/lib/notifications/security-alerts.ts`
  - `security_alerts` INSERT / count / invoke を `createAdminClient()` ベースに統一
- `src/app/api/beta/metrics/route.ts`
  - 管理者認証後の `beta_usage_metrics` INSERT を `createAdminClient()` で実行

## 4. 非スコープ

- 既存 baseline migration の書き換え
- `daily_reservation_stats` の定義変更
- `pg_trgm` 利用箇所の機能追加
- 対象 5 view の列定義変更
- `supabase db push` / `supabase db reset` の実行

## 5. 受入条件

1. 新規 migration / rollback が追加されている
2. `csp_violations`, `security_alerts`, `beta_usage_metrics` の INSERT 導線が service role 前提になっている
3. migration に `ALTER EXTENSION pg_trgm SET SCHEMA extensions` が含まれる
4. migration に `REVOKE ALL ON TABLE public.daily_reservation_stats FROM anon/authenticated` が含まれる
5. migration に 5 view 分の `ALTER VIEW ... SET (security_invoker = true)` が含まれる
6. migration に `SET search_path = public, auth, extensions` が含まれる

## 6. ロールバック方針

- 正本: `supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql`
- 内容:
  - 関数 `search_path` を `RESET`
  - `pg_trgm` を `public` に戻す
  - `daily_reservation_stats` の grant を復元
  - 対象 5 view を `security_invoker = false` に戻す
  - 3 つの INSERT policy / grant を元の permissive 状態に戻す
