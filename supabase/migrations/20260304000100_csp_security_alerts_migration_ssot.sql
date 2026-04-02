-- ================================================================
-- Migration: CSP/Security Alerts テーブル SSOT
-- ================================================================
-- ファイル: 20260304000100_csp_security_alerts_migration_ssot.sql
-- 作成日:  2026-03-04 (タイムスタンプ) / 文書化: 2026-03-31
-- 目的:    csp_violations + security_alerts を SSOT migration として形式化
-- 背景:    両テーブルは squashed baseline (00000000000001) に存在済み。
--          本 migration は冪等宣言であり、スキーマ変更ではない。
-- 関連:    docs/stabilization/spec-csp-migration-v0.1.md
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. csp_violations テーブル（冪等）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.csp_violations (
    id                  uuid    DEFAULT gen_random_uuid() NOT NULL,
    clinic_id           uuid,
    document_uri        text    NOT NULL,
    violated_directive  text    NOT NULL,
    blocked_uri         text,
    effective_directive text,
    original_policy     text,
    disposition         text    DEFAULT 'report',
    line_number         integer,
    column_number       integer,
    source_file         text,
    script_sample       text,
    referrer            text,
    client_ip           inet,
    user_agent          text,
    severity            text    DEFAULT 'low' NOT NULL,
    threat_score        integer DEFAULT 0,
    is_false_positive   boolean DEFAULT false,
    notes               text,
    reviewed_by         uuid,
    reviewed_at         timestamp with time zone,
    created_at          timestamp with time zone DEFAULT now(),
    updated_at          timestamp with time zone DEFAULT now(),
    CONSTRAINT csp_violations_pkey               PRIMARY KEY (id),
    CONSTRAINT csp_violations_disposition_check  CHECK (disposition IN ('enforce', 'report')),
    CONSTRAINT csp_violations_severity_check     CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT csp_violations_threat_score_check CHECK (threat_score >= 0 AND threat_score <= 100)
);

-- FK: clinic_id → clinics.id
DO $$ BEGIN
    ALTER TABLE public.csp_violations
        ADD CONSTRAINT csp_violations_clinic_id_fkey
        FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: reviewed_by → auth.users
DO $$ BEGIN
    ALTER TABLE public.csp_violations
        ADD CONSTRAINT csp_violations_reviewed_by_fkey
        FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INDEX
CREATE INDEX IF NOT EXISTS idx_csp_violations_clinic_id  ON public.csp_violations (clinic_id);
CREATE INDEX IF NOT EXISTS idx_csp_violations_created_at ON public.csp_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violations_severity   ON public.csp_violations (severity);

-- RLS
ALTER TABLE public.csp_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csp_violations_insert_any"   ON public.csp_violations;
DROP POLICY IF EXISTS "csp_violations_select_admin" ON public.csp_violations;
DROP POLICY IF EXISTS "csp_violations_update_admin" ON public.csp_violations;

-- 未認証ユーザーからの CSP レポートも受け付けるため INSERT は全許可
CREATE POLICY "csp_violations_insert_any" ON public.csp_violations
    FOR INSERT WITH CHECK (true);

-- 閲覧・更新は admin/clinic_admin かつクリニックスコープ内のみ
CREATE POLICY "csp_violations_select_admin" ON public.csp_violations
    FOR SELECT USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

CREATE POLICY "csp_violations_update_admin" ON public.csp_violations
    FOR UPDATE USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

-- ----------------------------------------------------------------
-- 2. security_alerts テーブル（冪等）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id          uuid  DEFAULT gen_random_uuid() NOT NULL,
    clinic_id   uuid,
    type        text  NOT NULL,
    severity    text  NOT NULL,
    title       text  NOT NULL,
    message     text  NOT NULL,
    details     jsonb,
    client_ip   inet,
    user_agent  text,
    source      text,
    status      text  DEFAULT 'new',
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at  timestamp with time zone DEFAULT now(),
    updated_at  timestamp with time zone DEFAULT now(),
    CONSTRAINT security_alerts_pkey           PRIMARY KEY (id),
    CONSTRAINT security_alerts_type_check     CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach', 'system')),
    CONSTRAINT security_alerts_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT security_alerts_status_check   CHECK (status IN ('new', 'reviewing', 'resolved', 'false_positive'))
);

-- FK: clinic_id → clinics.id
DO $$ BEGIN
    ALTER TABLE public.security_alerts
        ADD CONSTRAINT security_alerts_clinic_id_fkey
        FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: resolved_by → auth.users
DO $$ BEGIN
    ALTER TABLE public.security_alerts
        ADD CONSTRAINT security_alerts_resolved_by_fkey
        FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INDEX
CREATE INDEX IF NOT EXISTS idx_security_alerts_clinic_id  ON public.security_alerts (clinic_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON public.security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity   ON public.security_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type       ON public.security_alerts (type);

-- RLS
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_alerts_insert_any"   ON public.security_alerts;
DROP POLICY IF EXISTS "security_alerts_select_admin" ON public.security_alerts;
DROP POLICY IF EXISTS "security_alerts_update_admin" ON public.security_alerts;

CREATE POLICY "security_alerts_insert_any" ON public.security_alerts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "security_alerts_select_admin" ON public.security_alerts
    FOR SELECT USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

CREATE POLICY "security_alerts_update_admin" ON public.security_alerts
    FOR UPDATE USING (
        public.get_current_role() = ANY (ARRAY['admin', 'clinic_admin'])
        AND (clinic_id IS NULL OR public.can_access_clinic(clinic_id))
    );

COMMIT;
