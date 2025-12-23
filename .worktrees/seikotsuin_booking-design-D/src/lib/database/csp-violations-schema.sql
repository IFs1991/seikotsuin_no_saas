/**
 * CSP違反ログ用データベーススキーマ
 * Phase 3B: CSP違反の監視・記録・分析
 */

-- CSP違反ログテーブル
CREATE TABLE IF NOT EXISTS csp_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 基本CSP情報
  document_uri TEXT NOT NULL,
  violated_directive TEXT NOT NULL,
  blocked_uri TEXT,
  effective_directive TEXT,
  original_policy TEXT,
  disposition TEXT CHECK (disposition IN ('enforce', 'report')) DEFAULT 'report',
  
  -- ソースコード情報
  line_number INTEGER,
  column_number INTEGER,
  source_file TEXT,
  script_sample TEXT,
  
  -- リクエスト情報
  client_ip INET,
  user_agent TEXT,
  referrer TEXT,
  
  -- 分析情報
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  threat_score INTEGER DEFAULT 0,
  is_false_positive BOOLEAN DEFAULT FALSE,
  
  -- タイムスタンプ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 管理情報
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_csp_violations_created_at ON csp_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violations_severity ON csp_violations(severity);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive ON csp_violations(violated_directive);
CREATE INDEX IF NOT EXISTS idx_csp_violations_client_ip ON csp_violations(client_ip);
CREATE INDEX IF NOT EXISTS idx_csp_violations_disposition ON csp_violations(disposition);

-- CSP違反統計ビュー
CREATE OR REPLACE VIEW csp_violation_stats AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  violated_directive,
  severity,
  disposition,
  COUNT(*) as violation_count,
  COUNT(DISTINCT client_ip) as unique_clients,
  ARRAY_AGG(DISTINCT blocked_uri) as blocked_uris
FROM csp_violations
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 
  DATE_TRUNC('hour', created_at),
  violated_directive,
  severity,
  disposition
ORDER BY hour DESC;

-- CSP脅威検知ビュー（suspicious patterns）
CREATE OR REPLACE VIEW csp_threat_analysis AS
SELECT 
  client_ip,
  COUNT(*) as total_violations,
  COUNT(DISTINCT violated_directive) as unique_directives,
  MAX(severity) as max_severity,
  ARRAY_AGG(DISTINCT blocked_uri) as all_blocked_uris,
  MIN(created_at) as first_violation,
  MAX(created_at) as last_violation,
  CASE 
    WHEN COUNT(*) > 10 AND COUNT(DISTINCT violated_directive) > 3 THEN 'high'
    WHEN COUNT(*) > 5 AND severity = 'critical' THEN 'high' 
    WHEN COUNT(*) > 20 THEN 'medium'
    ELSE 'low'
  END as threat_level
FROM csp_violations
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY client_ip
HAVING COUNT(*) > 3
ORDER BY total_violations DESC, max_severity DESC;

-- RLS (Row Level Security) 設定
ALTER TABLE csp_violations ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能
CREATE POLICY "CSP violations accessible by clinic admins" ON csp_violations
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM clinic_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'owner')
    )
  );

-- 更新日時の自動更新
CREATE OR REPLACE FUNCTION update_csp_violations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_csp_violations_updated_at
  BEFORE UPDATE ON csp_violations
  FOR EACH ROW
  EXECUTE FUNCTION update_csp_violations_updated_at();

-- CSP違反アラート用関数
CREATE OR REPLACE FUNCTION check_csp_violation_threshold()
RETURNS TRIGGER AS $$
DECLARE
  recent_violations INTEGER;
  client_violations INTEGER;
BEGIN
  -- 過去5分間の違反数をチェック
  SELECT COUNT(*) INTO recent_violations
  FROM csp_violations
  WHERE created_at >= NOW() - INTERVAL '5 minutes';
  
  -- 同一IPからの違反数をチェック
  SELECT COUNT(*) INTO client_violations
  FROM csp_violations
  WHERE client_ip = NEW.client_ip
  AND created_at >= NOW() - INTERVAL '10 minutes';
  
  -- 閾値を超えた場合の処理（ログ出力）
  IF recent_violations > 50 OR client_violations > 10 THEN
    RAISE WARNING 'CSP Violation Threshold Exceeded: recent=%, client=%, ip=%', 
                  recent_violations, client_violations, NEW.client_ip;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER csp_violation_threshold_check
  AFTER INSERT ON csp_violations
  FOR EACH ROW
  EXECUTE FUNCTION check_csp_violation_threshold();

-- コメント追加
COMMENT ON TABLE csp_violations IS 'CSP (Content Security Policy) 違反ログ - XSS攻撃検知・防御';
COMMENT ON COLUMN csp_violations.threat_score IS '脅威スコア (0-100, 高いほど危険)';
COMMENT ON COLUMN csp_violations.is_false_positive IS '誤検知フラグ (機械学習で自動判定可能)';
COMMENT ON VIEW csp_violation_stats IS 'CSP違反統計 - 時間別・ディレクティブ別集計';
COMMENT ON VIEW csp_threat_analysis IS 'CSP脅威分析 - suspicious IPの検出';