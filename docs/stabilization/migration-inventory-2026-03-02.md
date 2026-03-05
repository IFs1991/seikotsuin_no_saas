# Migration Inventory Snapshot (2026-03-02)

> **ARCHIVED**: このドキュメントはスクイッシュ前（2026-03-02時点）の棚卸しスナップショットです。
> 2026-03-05 に全58マイグレーションが `00000000000001_squashed_baseline.sql` に統合されました。
> 現行スキーマの正確な情報は [`final-schema-inventory.md`](./final-schema-inventory.md) を参照してください。
> スクイッシュコミット: `4dc5441` / バックアップタグ: `pre-squash-backup-20260305`

## Scope
- Target: `supabase/migrations` (at `28db648`, pre-squash)
- Config source: `supabase/config.toml` (`[db.migrations].enabled = true`)
- Notes: this is a file-system inventory only. Local DB was not running, so applied-vs-pending status is not included.

## Counts (pre-squash)
- Total files: 64
- Executable migration files (*.sql): 57
- Rollback artifacts (*.sql.backup): 7
- Empty SQL files: 1
  - 20251023043212_bootstrap_public.sql

## Monthly Distribution (all files)
- 202508: 6
- 202510: 3
- 202511: 2
- 202512: 12
- 202601: 28
- 202602: 11
- 202603: 2

## High Policy-Churn Migrations (Top 10)
| file | policy statements | create | drop |
|---|---:|---:|---:|
| 20260126000100_rls_hardening_profiles_legacy_tables.sql | 80 | 40 | 40 |
| 20260111000200_rls_parent_scope_alignment.sql | 71 | 34 | 37 |
| 20260102000400_rls_dod08_align.sql | 63 | 28 | 35 |
| 20260218000200_rls_reservation_tables_tenant_boundary.sql | 58 | 25 | 33 |
| 20251104000200_reservation_system_rls.sql | 29 | 29 | 0 |
| 20260114000200_rls_parent_scope_remaining.sql | 25 | 12 | 13 |
| 20260111000100_rls_tenant_boundary_fix.sql | 22 | 10 | 12 |
| 20260218000300_rls_session_tables_can_access_clinic.sql | 22 | 12 | 10 |
| 20260110000100_dod08_clinic_manager_complete_fix.sql | 20 | 10 | 10 |
| 20260110000300_fix_rls_clinic_manager_roles.sql | 16 | 8 | 8 |

## File List by Month

### 202508
- 20250817000100_schema.sql
- 20250817000200_functions.sql
- 20250817000300_profiles.sql
- 20250817000400_appointments.sql
- 20250825000500_05_session_management.sql
- 20250826000600_06_mfa_tables.sql

### 202510
- 20251011000100_005_beta_operations.sql
- 20251018150432_init_from_local.sql
- 20251023043212_bootstrap_public.sql

### 202511
- 20251104000100_reservation_system_schema.sql
- 20251104000200_reservation_system_rls.sql

### 202512
- 20251222000100_add_clinic_id_reservation_tables.sql
- 20251224000100_extend_menus_table.sql
- 20251224000200_create_improvement_backlog.sql
- 20251224000300_migrate_menu_data.sql
- 20251224000400_rename_ai_comments.sql
- 20251224000500_admin_clinic_permissions_rls.sql
- 20251224001000_auth_helper_functions.sql
- 20251224002000_recreate_ai_insights_views.sql
- 20251225000100_onboarding_tables.sql
- 20251231000100_clinic_settings_table.sql
- 20251231000101_staff_shifts_preferences.sql
- 20251231000200_clinic_settings_rls_fix.sql

### 202601
- 20260101000100_security_events_operations.sql
- 20260102000100_security_events_severity_normalization.sql
- 20260102000200_notifications_dedupe_unique.sql
- 20260102000300_mfa_rls_role_alignment.sql
- 20260102000400_rls_dod08_align.sql
- 20260109000100_migrate_clinic_manager_to_clinic_admin.sql
- 20260110000100_dod08_clinic_manager_complete_fix.sql
- 20260110000200_fix_auth_users_clinic_manager_meta.sql
- 20260110000300_fix_rls_clinic_manager_roles.sql
- 20260111000100_rls_tenant_boundary_fix.sql
- 20260111000101_rls_tenant_boundary_fix_rollback.sql.backup
- 20260111000200_rls_parent_scope_alignment.sql
- 20260112000100_add_clinics_parent_id.sql
- 20260112000101_add_clinics_parent_id_rollback.sql.backup
- 20260114000100_onboarding_parent_id_support.sql
- 20260114000200_rls_parent_scope_remaining.sql
- 20260115000100_rls_reservation_history_insert_guard.sql
- 20260115000101_rls_reservation_history_insert_guard_rollback.sql.backup
- 20260116000100_rls_clinics_user_permissions_can_access_clinic.sql
- 20260126000100_rls_hardening_profiles_legacy_tables_rollback.sql.backup
- 20260126000100_rls_hardening_profiles_legacy_tables.sql
- 20260126000200_appointments_read_only_rollback.sql.backup
- 20260126000200_appointments_read_only.sql
- 20260126000300_appointments_read_only_role_alignment.sql
- 20260127000100_clinics_parent_id_self_check.sql
- 20260127000101_clinics_parent_id_self_check_rollback.sql.backup
- 20260127000200_clinics_parent_id_self_check_validate.sql
- 20260127000300_tenant_ref_integrity_triggers.sql

### 202602
- 20260218000100_deprecate_legacy_tables.sql
- 20260218000200_rls_reservation_tables_tenant_boundary.sql
- 20260218000300_rls_session_tables_can_access_clinic.sql
- 20260218000400_rls_shift_tables_role_alignment.sql
- 20260218000500_clinic_id_not_null_reservation_tables.sql
- 20260218000600_security_hardening_mfa_legacy.sql
- 20260218000700_rls_clinics_own_select_fix.sql
- 20260218000800_role_check_constraints.sql
- 20260218000900_index_optimization.sql
- 20260222000100_fix_staff_invites_role_mfa_permissions_rollback.sql.backup
- 20260222000100_fix_staff_invites_role_mfa_permissions.sql

### 202603
- 20260302000100_rls_menus_public_remove_add_staff_select.sql
- 20260302000200_rls_staff_preferences_insert_guard.sql

## Follow-up Verification (DoD) — Results

### DOD-02: Idempotent migration apply
- **Command**: `supabase db reset --local --no-seed`
- **Executed**: 2026-03-05 (post-squash, single baseline)
- **Result**: PASS — `Finished supabase db reset on branch main.`
- **Commit**: `4dc5441`

### DOD-04: Schema drift visibility
- **Command**: `supabase db diff --local`
- **Executed**: 2026-03-05
- **Result**: PASS — `No schema changes found`
- **Commit**: `4c8f130`

### Additional verifications (2026-03-05)
- `supabase db reset --local` (with seed): PASS
- TypeScript type generation (`supabase gen types typescript`): PASS — 3,668 lines
- Backup tag pushed: `pre-squash-backup-20260305`
