# Migration Execution Order & Dependency Map (2026-03-02)

> **ARCHIVED**: このドキュメントはスクイッシュ前（2026-03-02時点）の依存解析です。
> 2026-03-05 に全58マイグレーションが `00000000000001_squashed_baseline.sql` に統合されたため、
> 個別ファイル間の順序依存は解消されています。
> 現行スキーマの正確な情報は [`final-schema-inventory.md`](./final-schema-inventory.md) を参照してください。
> スクイッシュコミット: `4dc5441` / バックアップタグ: `pre-squash-backup-20260305`

## Scope
- Target: `supabase/migrations/*.sql` (57 files, pre-squash)
- **Analyzed at**: git ref `28db648` (commit: `chore: commit pending migrations...`, 2026-03-05)
- Config: `supabase/config.toml` の `[db.migrations].enabled = true`
- Method: SQLファイル静的解析（`CREATE/ALTER/POLICY/FUNCTION/VIEW/TRIGGER` と参照先を抽出）
- Note: DB未起動のため、applied/pending は未確認

## Execution Order (結論)
- Supabaseの実行順はファイル名昇順（timestamp prefix）で固定。
- 本リポジトリの57本について、依存参照を照合した結果、**前方依存（future file dependency）は検出なし**。
- したがって、**トポロジカル順 = ファイル名昇順**。

### Ordered File List (Executable `*.sql`)
1. `20250817000100_schema.sql`
2. `20250817000200_functions.sql`
3. `20250817000300_profiles.sql`
4. `20250817000400_appointments.sql`
5. `20250825000500_05_session_management.sql`
6. `20250826000600_06_mfa_tables.sql`
7. `20251011000100_005_beta_operations.sql`
8. `20251018150432_init_from_local.sql`
9. `20251023043212_bootstrap_public.sql` (empty)
10. `20251104000100_reservation_system_schema.sql`
11. `20251104000200_reservation_system_rls.sql`
12. `20251222000100_add_clinic_id_reservation_tables.sql`
13. `20251224000100_extend_menus_table.sql`
14. `20251224000200_create_improvement_backlog.sql`
15. `20251224000300_migrate_menu_data.sql`
16. `20251224000400_rename_ai_comments.sql`
17. `20251224000500_admin_clinic_permissions_rls.sql`
18. `20251224001000_auth_helper_functions.sql`
19. `20251224002000_recreate_ai_insights_views.sql`
20. `20251225000100_onboarding_tables.sql`
21. `20251231000100_clinic_settings_table.sql`
22. `20251231000101_staff_shifts_preferences.sql`
23. `20251231000200_clinic_settings_rls_fix.sql`
24. `20260101000100_security_events_operations.sql`
25. `20260102000100_security_events_severity_normalization.sql`
26. `20260102000200_notifications_dedupe_unique.sql`
27. `20260102000300_mfa_rls_role_alignment.sql`
28. `20260102000400_rls_dod08_align.sql`
29. `20260109000100_migrate_clinic_manager_to_clinic_admin.sql`
30. `20260110000100_dod08_clinic_manager_complete_fix.sql`
31. `20260110000200_fix_auth_users_clinic_manager_meta.sql`
32. `20260110000300_fix_rls_clinic_manager_roles.sql`
33. `20260111000100_rls_tenant_boundary_fix.sql`
34. `20260111000200_rls_parent_scope_alignment.sql`
35. `20260112000100_add_clinics_parent_id.sql`
36. `20260114000100_onboarding_parent_id_support.sql`
37. `20260114000200_rls_parent_scope_remaining.sql`
38. `20260115000100_rls_reservation_history_insert_guard.sql`
39. `20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`
40. `20260126000100_rls_hardening_profiles_legacy_tables.sql`
41. `20260126000200_appointments_read_only.sql`
42. `20260126000300_appointments_read_only_role_alignment.sql`
43. `20260127000100_clinics_parent_id_self_check.sql`
44. `20260127000200_clinics_parent_id_self_check_validate.sql`
45. `20260127000300_tenant_ref_integrity_triggers.sql`
46. `20260218000100_deprecate_legacy_tables.sql`
47. `20260218000200_rls_reservation_tables_tenant_boundary.sql`
48. `20260218000300_rls_session_tables_can_access_clinic.sql`
49. `20260218000400_rls_shift_tables_role_alignment.sql`
50. `20260218000500_clinic_id_not_null_reservation_tables.sql`
51. `20260218000600_security_hardening_mfa_legacy.sql`
52. `20260218000700_rls_clinics_own_select_fix.sql`
53. `20260218000800_role_check_constraints.sql`
54. `20260218000900_index_optimization.sql`
55. `20260222000100_fix_staff_invites_role_mfa_permissions.sql`
56. `20260302000100_rls_menus_public_remove_add_staff_select.sql`
57. `20260302000200_rls_staff_preferences_insert_guard.sql`

## Dependency Inventory (主要チェーン)

### 1) Reservation Domain + clinic_id 整合性チェーン
- `supabase/migrations/20251104000100_reservation_system_schema.sql`
  - `public.customers`, `public.menus`, `public.resources`, `public.reservations`, `public.blocks`, `public.reservation_history`, `public.reservation_list_view` を作成。
- `supabase/migrations/20251222000100_add_clinic_id_reservation_tables.sql`
  - 上記6テーブルへ `clinic_id` 追加（`ALTER TABLE ... ADD COLUMN ... REFERENCES public.clinics(id)`）。
  - `public.reservation_list_view` を再作成。
- `supabase/migrations/20260127000300_tenant_ref_integrity_triggers.sql`
  - `public.validate_reservations_clinic_refs`, `public.validate_blocks_clinic_refs`, `public.validate_reservation_history_clinic_refs` と対応トリガーを追加。
- `supabase/migrations/20260218000500_clinic_id_not_null_reservation_tables.sql`
  - 6テーブルの `clinic_id` を `SET NOT NULL` 化。

依存関係:
- `20260218000500` は `20251222000100` で列追加済みであることが前提。
- `20260127000300` は reservation系テーブル存在が前提（`20251104000100`）。

### 2) Auth Helper / JWT / Tenant Scope 関数チェーン
- `supabase/migrations/20251224001000_auth_helper_functions.sql`
  - `public.get_current_role`, `public.get_current_clinic_id`, `public.is_admin`, `public.belongs_to_clinic`, `public.user_role`。
- `supabase/migrations/20260111000100_rls_tenant_boundary_fix.sql`
  - `public.jwt_clinic_id`, `public.jwt_is_admin`, `public.can_access_clinic`, `public.custom_access_token_hook`。
- `supabase/migrations/20260111000200_rls_parent_scope_alignment.sql`
  - `public.can_access_clinic` / `public.custom_access_token_hook` / `public.belongs_to_clinic` を parent-scope 対応で再定義。
- `supabase/migrations/20260116000100_rls_clinics_user_permissions_can_access_clinic.sql`
  - `public.custom_access_token_hook` を再定義（HQ `parent_id IS NULL` ケース修正）。

依存関係:
- `20260102000400_rls_dod08_align.sql`, `20260218000200_rls_reservation_tables_tenant_boundary.sql`, `20260302000100_rls_menus_public_remove_add_staff_select.sql`, `20260302000200_rls_staff_preferences_insert_guard.sql` は `public.get_current_role` / `public.can_access_clinic` 利用。
- そのため `20251224001000` と `20260111000100` 系列が先行必須。

### 3) Parent-Child Clinic 階層チェーン
- `supabase/migrations/20260112000100_add_clinics_parent_id.sql`
  - `public.clinics.parent_id`、`public.get_sibling_clinic_ids`, `public.clinic_hierarchy` を追加。
- `supabase/migrations/20260114000100_onboarding_parent_id_support.sql`
  - `public.create_clinic_with_admin(..., p_parent_id UUID DEFAULT NULL)` に更新。
- `supabase/migrations/20260127000100_clinics_parent_id_self_check.sql`
  - `clinics_parent_id_not_self` 制約を `NOT VALID` で追加。
- `supabase/migrations/20260127000200_clinics_parent_id_self_check_validate.sql`
  - 上記制約を `VALIDATE`。

依存関係:
- `20260114000100` は `20260112000100` の `parent_id` 列が前提（ファイル内コメントにも明示）。
- `20260127000200` は `20260127000100` で制約作成済みが前提。

### 4) Legacy -> New Domain 移行チェーン（メニュー/AIコメント）
- `supabase/migrations/20251018150432_init_from_local.sql`
  - `public.treatment_menus`, `public.treatment_menu_records`, `public.ai_comments` など作成。
- `supabase/migrations/20251224000300_migrate_menu_data.sql`
  - `public.revenues`, `public.treatment_menu_records` の移行処理、`public.treatment_menus` の削除。
- `supabase/migrations/20251224000400_rename_ai_comments.sql`
  - `public.daily_ai_comments` -> `public.ai_comments` リネーム。
- `supabase/migrations/20260218000100_deprecate_legacy_tables.sql`
  - `public.staff`, `public.patients`, `public.master_treatment_menus`, `public.appointments` を legacy運用方針に固定。

## Re-defined Objects (順序依存が強いもの)
- `public.custom_access_token_hook`:
  - `20260111000100` -> `20260111000200` -> `20260116000100`（最終定義は `20260116000100`）
- `public.can_access_clinic`:
  - `20260111000100` -> `20260111000200`（最終定義は `20260111000200`）
- `public.user_role`:
  - `20251104000200` -> `20251224001000`（最終定義は `20251224001000`）
- `public.create_clinic_with_admin`:
  - `20251225000100` -> `20260114000100`（最終定義は `20260114000100`）
- `public.update_updated_at_column`:
  - `20250825000500` -> `20251011000100` -> `20251104000100` -> `20251231000101`
- `public.log_reservation_created|updated|deleted`:
  - `20251104000200` -> `20260127000300` -> `20260218000600`
- `public.decrypt_mfa_secret` / `public.encrypt_mfa_secret`:
  - `20250826000600` -> `20260218000600`
- `public.reservation_list_view`:
  - `20251104000100` -> `20251222000100`

## DoD Tie-in — Results (2026-03-05, post-squash)

### DOD-02 (idempotent apply)
- **Command**: `supabase db reset --local --no-seed`
- **Executed**: 2026-03-05 (squashed baseline `00000000000001`)
- **Result**: PASS — 順序依存は単一ファイルに統合されたため自動的に解消
- **Commit**: `4dc5441`

### DOD-04 (drift visibility)
- **Command**: `supabase db diff --local`
- **Executed**: 2026-03-05
- **Result**: PASS — `No schema changes found`
- **Commit**: `4c8f130`

### DOD-08 (tenant boundary consistency)
- 再定義関数の最終状態はベースラインに1回のみ定義（`CREATE OR REPLACE`）
- `public.can_access_clinic`, `public.custom_access_token_hook`, `public.get_current_role` が
  ベースライン内で定義されていることを確認済み
- RLSポリシー全148件がベースラインに含まれ、重複定義なし

