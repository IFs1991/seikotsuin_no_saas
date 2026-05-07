# Supabase Advisor Security Lints Runbook

Date: 2026-05-07

## 対象

- CSV: `Supabase Performance Security Lints (qnanuoqveidwvacvbhqp).csv`
- DB lint:
  - `function_search_path_mutable`
  - `anon_security_definer_function_executable`
  - `authenticated_security_definer_function_executable`
- Auth lint:
  - `auth_leaked_password_protection`

## DB lint 対応

`supabase/migrations/20260507000200_security_advisor_rpc_hardening.sql` を適用する。

- RLS helper と custom access token hook は `app_private` schema に寄せる。
- `app_private` は `supabase/config.toml` の `[api].schemas` に含めない。
- public schema 上の Advisor 対象 `SECURITY DEFINER` 関数は `anon` / `authenticated` の `EXECUTE` を剥奪する。
- RLS policy は `public.*` helper ではなく `app_private.*` helper を参照する。

Rollback は `supabase/rollbacks/20260507000200_security_advisor_rpc_hardening_rollback.sql` を使う。

## Auth lint 対応

Leaked Password Protection は hosted Supabase の Auth 設定で有効化する。

1. Supabase Dashboard を開く。
2. 対象 project `qnanuoqveidwvacvbhqp` を選択する。
3. `Authentication` -> `Providers` または `Security` の password protection 設定を開く。
4. `Leaked Password Protection` を有効化する。
5. 保存後、Security Advisor を再実行する。

## 確認

- `supabase/config.toml` の custom access token hook URI が `pg-functions://postgres/app_private/custom_access_token_hook` である。
- Security Advisor を再実行し、対象 CSV の 59 件が再発していないことを確認する。
- 招待フローと onboarding clinic 作成が UI 上で従来通り動くことを確認する。

