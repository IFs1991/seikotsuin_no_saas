# Rollback Plan: Performance Advisor Multiple Permissive Exact Duplicates v0.1

- forward migration: `supabase/migrations/20260413000500_multiple_permissive_exact_duplicate_cleanup.sql`
- rollback SQL: `supabase/rollbacks/20260413000500_multiple_permissive_exact_duplicate_cleanup_rollback.sql`

## 1. 目的

`20260413000500_multiple_permissive_exact_duplicate_cleanup.sql` 適用後に、想定外の policy 差分や Advisor 件数の不一致が出た場合に、削除した duplicate policy 6 件を元に戻す。

## 2. ロールバック対象

1. `public.staff_shifts`
   - `staff_shifts_delete_policy`
   - `staff_shifts_insert_policy`
   - `staff_shifts_select_policy`
   - `staff_shifts_update_policy`
2. `public.staff_preferences`
   - `staff_preferences_delete_policy`
   - `staff_preferences_select_policy`

## 3. 手順

1. `supabase/rollbacks/20260413000500_multiple_permissive_exact_duplicate_cleanup_rollback.sql` を適用する
2. `pg_policies` で 6 policy が復元されていることを確認する
3. `supabase db advisors --local --type performance -o json` で exact duplicate 分の warning が戻ることを確認する

## 4. 検証観点

1. rollback 後、6 policy が `pg_policies` に再出現する
2. 復元された policy の `cmd`, `permissive`, `roles`, `qual`, `with_check` が baseline と一致する
3. `staff_preferences_insert_policy`, `staff_preferences_update_policy`, `clinic_settings_*`, `menus_*` など非対象 policy に変更が入っていない

## 5. 注意点

1. rollback は `multiple_permissive_policies` warning を再発させる
2. rollback は性能面の二重評価を元に戻す
3. rollback しても RLS 境界は baseline と同じで、権限拡大は起きない
