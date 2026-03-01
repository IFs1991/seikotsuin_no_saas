-- ================================================================
-- Phase 9: Index Optimization
-- ================================================================
-- 問題:
--   1. reservation_history に clinic_id のインデックスがない
--   2. notifications に複合インデックス不足
--   3. user_sessions の部分インデックスが不十分
-- リスク: 低（インデックス追加のみ）
-- ロールバック: DROP INDEX
-- ================================================================

BEGIN;

-- ================================================================
-- 1. reservation_history インデックス
-- ================================================================

-- clinic_id インデックス（RLSパフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_reservation_history_clinic_id
ON public.reservation_history(clinic_id);

-- clinic_id + created_at 複合インデックス（テナント内の時系列クエリ最適化）
CREATE INDEX IF NOT EXISTS idx_reservation_history_clinic_created
ON public.reservation_history(clinic_id, created_at DESC);

-- reservation_id インデックス（予約に紐づく履歴検索）
CREATE INDEX IF NOT EXISTS idx_reservation_history_reservation_id
ON public.reservation_history(reservation_id);

-- ================================================================
-- 2. notifications インデックス
-- ================================================================

-- ユーザー + 未読 複合インデックス（通知一覧の最頻出クエリ）
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON public.notifications(user_id, created_at DESC)
WHERE is_read = false;

-- clinic_id + type 複合インデックス（テナント内の通知種別検索）
CREATE INDEX IF NOT EXISTS idx_notifications_clinic_type
ON public.notifications(clinic_id, type);

-- ================================================================
-- 3. user_sessions インデックス
-- ================================================================

-- アクティブセッションの有効期限チェック（定期クリーンアップ用）
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_expires
ON public.user_sessions(expires_at)
WHERE is_active = true AND is_revoked = false;

-- 注意: idx_user_sessions_active (user_id, clinic_id WHERE is_active = true) が
-- 既に存在するため、ユーザーごとのカウント用インデックスは追加しない。
-- is_revoked = false の条件が必要な場合は既存インデックスでもカバーされる
-- （is_revoked = true のアクティブセッションは通常存在しない）。

-- ================================================================
-- 4. security_events 追加インデックス
-- ================================================================

-- clinic_id + severity + created_at 複合インデックス（テナント内のセキュリティダッシュボード）
CREATE INDEX IF NOT EXISTS idx_security_events_clinic_severity
ON public.security_events(clinic_id, severity_level, created_at DESC);

-- ================================================================
-- 5. user_permissions 追加インデックス
-- ================================================================

-- role + clinic_id 複合インデックス（ロールベースのクエリ最適化）
CREATE INDEX IF NOT EXISTS idx_user_permissions_role_clinic
ON public.user_permissions(role, clinic_id);

COMMIT;
