# Rollback Plan: Security Advisor Lints v0.1

- forward migration: `supabase/migrations/20260413000100_security_advisor_lints_hardening.sql`
- rollback SQL: `supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql`

## 1. 目的

`20260413000100_security_advisor_lints_hardening.sql` 適用後に、アプリ側の service role write 変更または `pg_trgm` schema 移動で不整合が出た場合に、元の DB 状態へ戻す。

## 2. ロールバック対象

1. `public` 関数群の固定 `search_path`
2. `pg_trgm` の `extensions` schema 配置
3. `public.daily_reservation_stats` の非公開 grant
4. `public.clinic_hierarchy` / `public.staff_performance_summary` / `public.patient_visit_summary` / `public.daily_revenue_summary` / `public.reservation_list_view` の `security_invoker = true`
5. `beta_usage_metrics` / `csp_violations` / `security_alerts` の service-role-only INSERT policy

## 3. 手順

1. アプリ側デプロイを停止し、service role write 前提の新コードを切り戻す
2. `supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql` を適用する
3. `pg_extension` / `pg_policies` / `information_schema.role_table_grants` を確認する

## 4. 検証観点

- `pg_trgm` が `public` schema に戻っている
- `daily_reservation_stats` に `anon` / `authenticated` grant が戻っている
- 対象 5 view が `security_invoker = false` に戻っている
- 3 つの INSERT policy が `WITH CHECK (true)` に戻っている
- 対象関数の `search_path` が `RESET` されている

## 5. 注意点

- rollback は Security Advisor warning を再発させる
- rollback 後は `security_definer_view` error も再発する
- `csp-report` / `security_alerts` / `beta metrics` のサーバーコードを先に戻さずに DB だけ戻すと、権限まわりの動作確認が難しくなる
