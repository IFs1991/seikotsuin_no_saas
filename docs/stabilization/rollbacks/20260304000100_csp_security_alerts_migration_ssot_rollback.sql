-- ================================================================
-- ROLLBACK: CSP/セキュリティテーブル migration SSOT
-- ================================================================
-- 20260304000100_csp_security_alerts_migration_ssot.sql の逆操作
-- ================================================================

BEGIN;

-- 1. csp_violations: clinic_id カラム削除
ALTER TABLE public.csp_violations DROP COLUMN IF EXISTS clinic_id;
DROP INDEX IF EXISTS idx_csp_violations_clinic_id;

-- 2. security_alerts: clinic_id カラム削除
ALTER TABLE public.security_alerts DROP COLUMN IF EXISTS clinic_id;
DROP INDEX IF EXISTS idx_security_alerts_clinic_id;

-- 3. security_alerts: type CHECK を元に戻す（'system' なし）
ALTER TABLE public.security_alerts
  DROP CONSTRAINT IF EXISTS security_alerts_type_check;
ALTER TABLE public.security_alerts
  ADD CONSTRAINT security_alerts_type_check
  CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach'));

-- 4. RLS ポリシーは手動で旧ポリシーに復元する必要あり
-- 旧パターン（clinic_users 参照）は非推奨のため自動復元しない

COMMIT;
