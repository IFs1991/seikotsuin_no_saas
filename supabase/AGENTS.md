# Supabase migration rules

- 適用済みmigrationを編集しない
- migration追加時はspec、SQL test、rollback/forward-fix runbookを同梱する
- RLS、GRANT、FK、function EXECUTEは実DBtest必須
- tenant relationは `(foreign_id, clinic_id) -> (id, clinic_id)` を優先する
- backfill不明rowが1件でもあれば停止する
- `GRANT ALL` to anon/authenticatedは禁止する
- policyは対象roleを明示する
- service_role policyを追加しない
- SECURITY DEFINERはfixed search_path + minimum EXECUTEにする
- migration前後のcatalog snapshotを保存する
- security-regressive rollbackは禁止する
