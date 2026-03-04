# Final Schema Inventory (post-squash)

**Generated**: 2026-03-05
**Migration**: `00000000000001_squashed_baseline.sql` (6,055 lines)
**Squashed from**: 58 individual migrations (2025-08 ~ 2026-03)

---

## Tables (46)

### Core Business
| Table | Description |
|-------|-------------|
| `clinics` | クリニックマスター |
| `customers` | 顧客マスター |
| `menus` | 施術メニューマスター |
| `resources` | リソース（スタッフ・施術室・設備） |
| `reservations` | 予約トランザクション |
| `blocks` | 販売停止（ブロック） |
| `reservation_history` | 予約変更履歴（監査ログ） |
| `profiles` | ユーザープロファイル (auth.users連携) |
| `user_permissions` | ユーザー権限 |

### Onboarding & Settings
| Table | Description |
|-------|-------------|
| `onboarding_states` | オンボーディング進捗 |
| `staff_invites` | スタッフ招待管理 |
| `clinic_settings` | クリニック設定 |
| `staff_shifts` | スタッフシフト |
| `staff_preferences` | スタッフ勤務希望 |

### AI & Analytics
| Table | Description |
|-------|-------------|
| `ai_comments` | AI生成日次コメント |
| `improvement_backlog` | 改善バックログ |
| `menu_categories` | メニューカテゴリ |
| `treatments` | 施術記録 |
| `treatment_menu_records` | 施術メニュー記録 |
| `master_categories` | マスターカテゴリ |
| `master_patient_types` | 患者タイプマスター |
| `master_payment_methods` | 支払方法マスター |

### Security & Session
| Table | Description |
|-------|-------------|
| `user_sessions` | ユーザーセッション管理 |
| `session_policies` | セッションポリシー |
| `registered_devices` | 登録デバイス |
| `security_events` | セキュリティイベント |
| `security_alerts` | セキュリティアラート |
| `csp_violations` | CSP違反レポート |
| `critical_incidents` | 重大インシデント |
| `notifications` | 通知 |
| `encryption_keys` | 暗号化キー |
| `user_mfa_settings` | MFA設定 |
| `mfa_setup_sessions` | MFAセットアップセッション |
| `mfa_usage_stats` | MFA利用統計 |
| `audit_logs` | 監査ログ |

### Beta / Operational
| Table | Description |
|-------|-------------|
| `beta_feedback` | ベータフィードバック |
| `beta_usage_metrics` | ベータ利用メトリクス |
| `chat_sessions` | チャットセッション |
| `chat_messages` | チャットメッセージ |
| `daily_reports` | 日次レポート |
| `revenues` | 収益 |
| `staff_performance` | スタッフ成績 |

### Legacy (INSERT blocked)
| Table | Description | Replacement |
|-------|-------------|-------------|
| `appointments` | 旧予約テーブル (Read-Only) | `reservations` |
| `patients` | 旧患者テーブル (INSERT blocked) | `customers` |
| `staff` | 旧スタッフテーブル (INSERT blocked) | `resources (type='staff')` |
| `visits` | 来院記録 | — |

---

## Views (5)

| View | Description |
|------|-------------|
| `reservation_list_view` | 予約一覧ビュー |
| `daily_revenue_summary` | 日次収益サマリー |
| `staff_performance_summary` | スタッフ成績サマリー |
| `patient_visit_summary` | 患者来院サマリー |
| `clinic_hierarchy` | クリニック階層ビュー |

---

## Functions (Custom, excluding pg_trgm internals)

### Authentication & Authorization
| Function | Description |
|----------|-------------|
| `custom_access_token_hook` | JWT カスタムクレーム付与 |
| `can_access_clinic` | クリニックアクセス判定 |
| `get_current_role` | 現在のロール取得 |
| `get_current_clinic_id` | 現在のクリニックID取得 |
| `is_admin` | 管理者判定 |
| `jwt_clinic_id` | JWT からクリニックID取得 |
| `jwt_is_admin` | JWT から管理者判定 |
| `user_role` | ユーザーロール取得 |
| `belongs_to_clinic` | クリニック所属判定 |
| `get_sibling_clinic_ids` | 兄弟クリニックID取得 |

### Clinic & Onboarding
| Function | Description |
|----------|-------------|
| `create_clinic_with_admin` | クリニック作成（管理者同時作成） |
| `get_invite_by_token` | 招待トークンで招待取得 |
| `accept_invite` | 招待承認 |
| `get_clinic_settings` | クリニック設定取得 |
| `upsert_clinic_settings` | クリニック設定更新 |

### Reservation
| Function | Description |
|----------|-------------|
| `check_reservation_conflict` | 予約競合チェック |
| `get_available_time_slots` | 空き時間枠取得 |
| `log_reservation_created` | 予約作成ログ（トリガー用） |
| `log_reservation_updated` | 予約更新ログ（トリガー用） |
| `log_reservation_deleted` | 予約削除ログ（トリガー用） |
| `update_customer_stats` | 顧客統計更新（トリガー用） |

### Security & MFA
| Function | Description |
|----------|-------------|
| `encrypt_mfa_secret` | MFA秘密鍵暗号化 |
| `decrypt_mfa_secret` | MFA秘密鍵復号化 |
| `encrypt_patient_data` | 患者データ暗号化 |
| `decrypt_patient_data` | 患者データ復号化 |
| `aggregate_mfa_stats` | MFA統計集約 |
| `update_mfa_settings_updated_at` | MFA設定updated_at更新 |

### Analytics
| Function | Description |
|----------|-------------|
| `analyze_patient_segments` | 患者セグメント分析 |
| `analyze_staff_efficiency` | スタッフ効率分析 |
| `calculate_churn_risk_score` | 離脱リスクスコア算出 |
| `calculate_patient_ltv` | 患者LTV算出 |
| `get_hourly_revenue_pattern` | 時間帯別収益パターン |
| `get_hourly_visit_pattern` | 時間帯別来院パターン |
| `predict_revenue` | 収益予測 |
| `refresh_daily_stats` | 日次統計リフレッシュ |

### Utility
| Function | Description |
|----------|-------------|
| `update_updated_at_column` | updated_at自動更新（汎用トリガー） |
| `set_updated_at` | updated_at設定（トリガー） |
| `validate_blocks_clinic_refs` | blocksクリニック参照検証 |
| `validate_reservations_clinic_refs` | reservationsクリニック参照検証 |
| `validate_reservation_history_clinic_refs` | reservation_historyクリニック参照検証 |

---

## RLS Policies (148)

Total: 148 policies across 38 tables with RLS enabled.

Key patterns:
- **Tenant isolation**: `can_access_clinic()` で全予約系テーブルのクリニック境界を保護
- **Role-based access**: admin/clinic_admin/staff/customer の4層ロール
- **Legacy table guard**: staff/patients に INSERT blocking ポリシー
- **Service role bypass**: reservation_history, audit_logs 等はサービスロール経由のみINSERT可

---

## Triggers (28)

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `blocks_clinic_ref_check` | blocks | BEFORE INSERT/UPDATE | `validate_blocks_clinic_refs` |
| `reservations_clinic_ref_check` | reservations | BEFORE INSERT/UPDATE | `validate_reservations_clinic_refs` |
| `reservation_history_clinic_ref_check` | reservation_history | BEFORE INSERT/UPDATE | `validate_reservation_history_clinic_refs` |
| `reservation_created_log` | reservations | AFTER INSERT | `log_reservation_created` |
| `reservation_updated_log` | reservations | AFTER UPDATE | `log_reservation_updated` |
| `reservation_deleted_log` | reservations | AFTER DELETE | `log_reservation_deleted` |
| `update_customer_stats_trigger` | reservations | AFTER INSERT/UPDATE | `update_customer_stats` |
| `update_*_updated_at` | (multiple) | BEFORE UPDATE | `update_updated_at_column` |
| `set_updated_at_*` | menu_categories, treatments | BEFORE UPDATE | `set_updated_at` |
| `update_mfa_settings_updated_at_trigger` | user_mfa_settings | BEFORE UPDATE | `update_mfa_settings_updated_at` |

---

## Rollback Strategy

- **Git tag**: `pre-squash-backup-20260305` — 全58マイグレーション復元可能
- **Restore command**: `git checkout pre-squash-backup-20260305 -- supabase/migrations/`
- **Remote DB**: スキーマ変更なし（schema_migrations tracking tableのみ影響）

---

## Verification Results

| Check | Result |
|-------|--------|
| `supabase db reset --local --no-seed` | Pass |
| `supabase db reset --local` (with seed) | Pass |
| `supabase db diff --local` | No schema changes found |
| TypeScript type generation | 3,668 lines generated |
