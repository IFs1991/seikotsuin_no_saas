-- ベータ運用検証（M4）関連テーブル
-- 作成日: 2025-10-11
-- 目的: ベータ運用モニタリング、フィードバック収集、改善バックログ管理

-- ===============================================
-- 1. ベータ利用状況メトリクステーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS beta_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- 利用状況メトリクス
  login_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  dashboard_view_count INTEGER NOT NULL DEFAULT 0,
  daily_report_submissions INTEGER NOT NULL DEFAULT 0,
  patient_analysis_view_count INTEGER NOT NULL DEFAULT 0,

  -- エンゲージメント指標
  average_session_duration DECIMAL(10, 2) NOT NULL DEFAULT 0, -- 分単位
  daily_active_rate DECIMAL(5, 2) NOT NULL DEFAULT 0, -- パーセント
  feature_adoption_rate JSONB NOT NULL DEFAULT '{}',

  -- データ品質
  daily_report_completion_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  data_accuracy DECIMAL(5, 2) NOT NULL DEFAULT 0,

  -- パフォーマンス
  average_load_time INTEGER NOT NULL DEFAULT 0, -- ミリ秒
  error_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT period_check CHECK (period_end > period_start),
  CONSTRAINT unique_clinic_period UNIQUE (clinic_id, period_start, period_end)
);

-- インデックス
CREATE INDEX idx_beta_usage_metrics_clinic_id ON beta_usage_metrics(clinic_id);
CREATE INDEX idx_beta_usage_metrics_period ON beta_usage_metrics(period_start, period_end);

-- RLS有効化
ALTER TABLE beta_usage_metrics ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 自分のクリニックのメトリクスのみ参照可能
CREATE POLICY "Users can view their clinic metrics"
  ON beta_usage_metrics
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- RLSポリシー: システム管理者はすべてのメトリクスを参照可能
CREATE POLICY "Admins can view all metrics"
  ON beta_usage_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLSポリシー: システムが自動的にメトリクスを記録
CREATE POLICY "System can insert metrics"
  ON beta_usage_metrics
  FOR INSERT
  WITH CHECK (true);

-- ===============================================
-- 2. ベータフィードバックテーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,

  -- フィードバック内容
  category TEXT NOT NULL CHECK (category IN ('feature_request', 'bug_report', 'usability', 'performance', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- 関連情報
  affected_feature TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  attachments TEXT[] DEFAULT '{}',

  -- ステータス
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'p3' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),

  -- 対応情報
  assigned_to UUID,
  resolution TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_beta_feedback_clinic_id ON beta_feedback(clinic_id);
CREATE INDEX idx_beta_feedback_user_id ON beta_feedback(user_id);
CREATE INDEX idx_beta_feedback_status ON beta_feedback(status);
CREATE INDEX idx_beta_feedback_priority ON beta_feedback(priority);
CREATE INDEX idx_beta_feedback_category ON beta_feedback(category);

-- RLS有効化
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 自分のクリニックのフィードバックを参照・作成
CREATE POLICY "Users can view their clinic feedback"
  ON beta_feedback
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their clinic feedback"
  ON beta_feedback
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- RLSポリシー: 管理者はすべてのフィードバックを参照・更新
CREATE POLICY "Admins can view all feedback"
  ON beta_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update feedback"
  ON beta_feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ===============================================
-- 3. 改善バックログテーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS improvement_backlog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- バックログ情報
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feature', 'enhancement', 'bug_fix', 'technical_debt', 'documentation')),

  -- 優先度・見積もり
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  estimated_effort TEXT NOT NULL CHECK (estimated_effort IN ('xs', 's', 'm', 'l', 'xl')),
  business_value INTEGER NOT NULL CHECK (business_value BETWEEN 1 AND 10),

  -- 関連情報
  related_feedback_ids UUID[] DEFAULT '{}',
  affected_clinics UUID[] DEFAULT '{}',

  -- ステータス
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'planned', 'in_progress', 'completed', 'cancelled')),
  milestone TEXT,

  -- 実装情報
  assigned_to UUID,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL
);

-- インデックス
CREATE INDEX idx_improvement_backlog_status ON improvement_backlog(status);
CREATE INDEX idx_improvement_backlog_priority ON improvement_backlog(priority);
CREATE INDEX idx_improvement_backlog_category ON improvement_backlog(category);
CREATE INDEX idx_improvement_backlog_assigned_to ON improvement_backlog(assigned_to);

-- RLS有効化
ALTER TABLE improvement_backlog ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 管理者のみ参照・作成・更新可能
CREATE POLICY "Admins can manage backlog"
  ON improvement_backlog
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLSポリシー: 一般ユーザーは閲覧のみ可能
CREATE POLICY "Users can view backlog"
  ON improvement_backlog
  FOR SELECT
  USING (true);

-- ===============================================
-- 4. 重大インシデントテーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS critical_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- インシデント情報
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('p0', 'p1', 'p2', 'p3')),
  category TEXT NOT NULL CHECK (category IN ('security', 'data_loss', 'service_outage', 'performance', 'other')),

  -- 影響範囲
  affected_clinics UUID[] DEFAULT '{}',
  affected_users INTEGER NOT NULL DEFAULT 0,
  impact_description TEXT NOT NULL,

  -- 対応状況
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'investigating', 'mitigating', 'resolved', 'post_mortem')),
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,

  -- 対応チーム
  incident_commander UUID,
  assigned_team UUID[] DEFAULT '{}',

  -- 根本原因と対策
  root_cause TEXT,
  mitigation_steps TEXT[] DEFAULT '{}',
  prevention_measures TEXT[] DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_critical_incidents_severity ON critical_incidents(severity);
CREATE INDEX idx_critical_incidents_status ON critical_incidents(status);
CREATE INDEX idx_critical_incidents_detected_at ON critical_incidents(detected_at);

-- RLS有効化
ALTER TABLE critical_incidents ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 管理者のみ参照・作成・更新可能
CREATE POLICY "Admins can manage incidents"
  ON critical_incidents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLSポリシー: 影響を受けたクリニックは自分のインシデントを参照可能
CREATE POLICY "Affected clinics can view their incidents"
  ON critical_incidents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND clinic_id = ANY(affected_clinics)
    )
  );

-- ===============================================
-- 5. 自動更新トリガー
-- ===============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_beta_usage_metrics_updated_at
  BEFORE UPDATE ON beta_usage_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_beta_feedback_updated_at
  BEFORE UPDATE ON beta_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_improvement_backlog_updated_at
  BEFORE UPDATE ON improvement_backlog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_critical_incidents_updated_at
  BEFORE UPDATE ON critical_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===============================================
-- 6. コメント
-- ===============================================
COMMENT ON TABLE beta_usage_metrics IS 'ベータ運用期間中の利用状況メトリクス';
COMMENT ON TABLE beta_feedback IS 'ベータユーザーからのフィードバック（要望・不具合報告）';
COMMENT ON TABLE improvement_backlog IS '改善バックログ（機能追加・バグ修正など）';
COMMENT ON TABLE critical_incidents IS '重大インシデント管理';
