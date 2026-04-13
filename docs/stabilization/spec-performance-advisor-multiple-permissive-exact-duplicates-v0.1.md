# Supabase Performance Advisor Multiple Permissive Exact Duplicates Spec v0.1

- 作成日: 2026-04-13
- ステータス: APPROVED
- 入力証跡:
  - `C:/Users/seekf/Downloads/Supabase Performance Security Lints 3(qnanuoqveidwvacvbhqp) (1).csv`
  - local `supabase db advisors --local --type performance -o json`
  - local `pg_policies` 実測
- 関連 DoD: `docs/stabilization/DoD-v0.1.md` の `DOD-04`, `DOD-08`
- 提案正本: `docs/stabilization/performance-advisor-multiple-permissive-proposal-v0.1.md`
- 実装ファイル: `supabase/migrations/20260413000500_multiple_permissive_exact_duplicate_cleanup.sql`
- rollback: `supabase/rollbacks/20260413000500_multiple_permissive_exact_duplicate_cleanup_rollback.sql`

## 1. 目的

Supabase Performance Advisor の `multiple_permissive_policies` 残件のうち、権限意味論を一切変えずに処理できる exact duplicate 6 件だけを新規 migration で解消する。

対象は以下に限定する。

1. `public.staff_shifts`
   - `staff_shifts_delete_policy`
   - `staff_shifts_insert_policy`
   - `staff_shifts_select_policy`
   - `staff_shifts_update_policy`
2. `public.staff_preferences`
   - `staff_preferences_delete_policy`
   - `staff_preferences_select_policy`

## 2. 現状と根拠

### 2.1 `public.staff_shifts`

- 根拠:
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5342`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5346`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5350`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5354`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5358`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5362`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5366`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5370`
- local `pg_policies` 実測:
  - `staff_shifts_delete` と `staff_shifts_delete_policy` は `DELETE`, `PERMISSIVE`, `roles=public`, `USING` が一致
  - `staff_shifts_insert` と `staff_shifts_insert_policy` は `INSERT`, `PERMISSIVE`, `roles=public`, `WITH CHECK` が一致
  - `staff_shifts_select` と `staff_shifts_select_policy` は `SELECT`, `PERMISSIVE`, `roles=public`, `USING` が一致
  - `staff_shifts_update` と `staff_shifts_update_policy` は `UPDATE`, `PERMISSIVE`, `roles=public`, `USING` が一致

### 2.2 `public.staff_preferences`

- 根拠:
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5293`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5297`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5313`
  - `supabase/migrations/00000000000001_squashed_baseline.sql:5317`
- local `pg_policies` 実測:
  - `staff_preferences_delete` と `staff_preferences_delete_policy` は `DELETE`, `PERMISSIVE`, `roles=public`, `USING` が一致
  - `staff_preferences_select` と `staff_preferences_select_policy` は `SELECT`, `PERMISSIVE`, `roles=public`, `USING` が一致

## 3. 変更方針

### 3.1 Migration

新規 migration `supabase/migrations/20260413000500_multiple_permissive_exact_duplicate_cleanup.sql` で以下を行う。

1. `pg_policies` から 6 組の keep/drop policy ペアを検証する
2. `cmd`, `permissive`, `roles`, `qual`, `with_check` が完全一致しない場合は `raise exception` で停止する
3. 一致が確認できた場合だけ duplicate 側 policy を `drop policy if exists` で削除する

### 3.2 非スコープ

以下は今回触らない。

1. `staff_preferences_insert_policy`
2. `staff_preferences_update_policy`
3. `clinic_settings_*`
4. `improvement_backlog_*`
5. `menus_select_for_managers` / `menus_select_for_staff`
6. `clinics_*`, `profiles_*`, `user_sessions_*`, `user_permissions_*`, `user_mfa_settings_*`, `staff_invites_*`, `session_policies_*`, `security_events_*`, `registered_devices_*`

## 4. 安全性

### 4.1 権限上の安全性

1. 削除するのは exact duplicate 側だけで、surviving policy の定義はそのまま残る
2. `admin` / `authenticated` / `anon` の意味は変えない
3. `USING` / `WITH CHECK` の式は surviving policy に残るため、真偽集合は変わらない
4. `TO role` は全対象で `public` のまま不変

### 4.2 性能上の意図

1. 同一 action に対する二重評価を減らす
2. `multiple_permissive_policies` の exact duplicate 分だけ Advisor 警告を減らす

## 5. 受入条件

1. 新規 spec / rollback plan / migration / rollback / test が追加されている
2. migration は対象 6 件以外の policy に触れない
3. migration は `pg_policies` の完全一致検証を含む
4. rollback は削除した 6 policy を baseline 定義で復元できる
5. テストは high-risk policy を触っていないことを検証する
