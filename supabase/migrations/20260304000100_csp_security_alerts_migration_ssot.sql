-- ================================================================
-- CSP/セキュリティテーブルを migration SSOT に編入
-- ================================================================
-- 問題:
--   1. csp_violations / security_alerts が src/lib/database/ の管理外SQLで定義
--   2. clinic_id カラムなし（テナント分離不可）
--   3. RLS が 旧テーブル 依存（非推奨パターン）
--   4. security_alerts.type CHECK に 'system' がない（トリガー違反）
-- 対応:
--   1. clinic_id カラム追加（NULLable — 未認証レポートも記録可能）
--   2. RLS を can_access_clinic() パターンに統一
--   3. CHECK 制約に 'system' 追加
-- ロールバック: 20260304000100_csp_security_alerts_migration_ssot_rollback.sql
-- ================================================================

BEGIN;

-- ================================================================
-- 1. csp_violations テーブル: clinic_id 追加
-- ================================================================

-- テーブルが存在する場合のみ ALTER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'csp_violations'
  ) THEN
    -- clinic_id カラムが未存在なら追加
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'csp_violations'
        AND column_name = 'clinic_id'
    ) THEN
      ALTER TABLE public.csp_violations
        ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_csp_violations_clinic_id
        ON public.csp_violations(clinic_id);
    END IF;
  ELSE
    -- テーブルが未存在なら CREATE（基本カラム + clinic_id）
    CREATE TABLE public.csp_violations (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
      document_uri TEXT NOT NULL,
      violated_directive TEXT NOT NULL,
      blocked_uri TEXT,
      effective_directive TEXT,
      original_policy TEXT,
      disposition TEXT CHECK (disposition IN ('enforce', 'report')) DEFAULT 'report',
      line_number INTEGER,
      column_number INTEGER,
      source_file TEXT,
      script_sample TEXT,
      referrer TEXT,
      client_ip INET,
      user_agent TEXT,
      severity TEXT NOT NULL DEFAULT 'low'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      threat_score INTEGER DEFAULT 0 CHECK (threat_score >= 0 AND threat_score <= 100),
      is_false_positive BOOLEAN DEFAULT FALSE,
      notes TEXT,
      reviewed_by UUID REFERENCES auth.users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE public.csp_violations ENABLE ROW LEVEL SECURITY;

    CREATE INDEX idx_csp_violations_clinic_id ON public.csp_violations(clinic_id);
    CREATE INDEX idx_csp_violations_created_at ON public.csp_violations(created_at DESC);
    CREATE INDEX idx_csp_violations_severity ON public.csp_violations(severity);
  END IF;
END $$;

-- ================================================================
-- 2. csp_violations RLS: 旧テーブル → can_access_clinic()
-- ================================================================

-- 旧ポリシーを安全に DROP
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'csp_violations' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.csp_violations', pol.policyname);
  END LOOP;
END $$;

-- 新 RLS ポリシー: can_access_clinic パターン
-- INSERT: 認証不要（CSPレポートはブラウザから送信される）
CREATE POLICY csp_violations_insert_any
  ON public.csp_violations FOR INSERT
  WITH CHECK (true);

-- SELECT: 管理者は自テナントの違反を参照可能
CREATE POLICY csp_violations_select_admin
  ON public.csp_violations FOR SELECT
  USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
      clinic_id IS NULL
      OR public.can_access_clinic(clinic_id)
    )
  );

-- UPDATE: 管理者は自テナントの違反をレビュー可能
CREATE POLICY csp_violations_update_admin
  ON public.csp_violations FOR UPDATE
  USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
      clinic_id IS NULL
      OR public.can_access_clinic(clinic_id)
    )
  );

-- ================================================================
-- 3. security_alerts テーブル: clinic_id 追加 + CHECK 修正
-- ================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'security_alerts'
  ) THEN
    -- clinic_id カラムが未存在なら追加
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'security_alerts'
        AND column_name = 'clinic_id'
    ) THEN
      ALTER TABLE public.security_alerts
        ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_security_alerts_clinic_id
        ON public.security_alerts(clinic_id);
    END IF;

    -- type CHECK 制約を DROP & 再作成（'system' を追加）
    -- 既存の CHECK 制約名を探して DROP
    BEGIN
      ALTER TABLE public.security_alerts
        DROP CONSTRAINT IF EXISTS security_alerts_type_check;
    EXCEPTION WHEN undefined_object THEN
      NULL; -- 制約が存在しない場合は無視
    END;

    ALTER TABLE public.security_alerts
      ADD CONSTRAINT security_alerts_type_check
      CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach', 'system'));

  ELSE
    -- テーブルが未存在なら CREATE
    CREATE TABLE public.security_alerts (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach', 'system')),
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      details JSONB,
      client_ip INET,
      user_agent TEXT,
      source TEXT,
      status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'false_positive')),
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

    CREATE INDEX idx_security_alerts_clinic_id ON public.security_alerts(clinic_id);
    CREATE INDEX idx_security_alerts_created_at ON public.security_alerts(created_at DESC);
    CREATE INDEX idx_security_alerts_type ON public.security_alerts(type);
    CREATE INDEX idx_security_alerts_severity ON public.security_alerts(severity);
  END IF;
END $$;

-- ================================================================
-- 4. security_alerts RLS: 旧テーブル → can_access_clinic()
-- ================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'security_alerts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.security_alerts', pol.policyname);
  END LOOP;
END $$;

-- INSERT: システムおよび認証済みユーザーが作成可能
CREATE POLICY security_alerts_insert_any
  ON public.security_alerts FOR INSERT
  WITH CHECK (true);

-- SELECT: 管理者は自テナントのアラートを参照可能
CREATE POLICY security_alerts_select_admin
  ON public.security_alerts FOR SELECT
  USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
      clinic_id IS NULL
      OR public.can_access_clinic(clinic_id)
    )
  );

-- UPDATE: 管理者は自テナントのアラートを更新可能
CREATE POLICY security_alerts_update_admin
  ON public.security_alerts FOR UPDATE
  USING (
    public.get_current_role() IN ('admin', 'clinic_admin')
    AND (
      clinic_id IS NULL
      OR public.can_access_clinic(clinic_id)
    )
  );

COMMIT;
