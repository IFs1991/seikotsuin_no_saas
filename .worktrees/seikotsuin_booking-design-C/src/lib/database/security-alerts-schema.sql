/**
 * セキュリティアラートログ用データベーススキーマ
 * Phase 3B Refactoring: 通知システム用テーブル
 */

-- セキュリティアラートテーブル
CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- アラート基本情報
  type TEXT NOT NULL CHECK (type IN ('csp_violation', 'rate_limit', 'authentication', 'data_breach')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- 詳細データ（JSON）
  details JSONB,
  
  -- リクエスト情報
  client_ip INET,
  user_agent TEXT,
  
  -- システム情報
  source TEXT NOT NULL, -- 'csp-monitor', 'rate-limiter', etc.
  
  -- 対応状況
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'false_positive')),
  assigned_to UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  
  -- タイムスタンプ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type_severity ON security_alerts(type, severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_client_ip ON security_alerts(client_ip);
CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status);
CREATE INDEX IF NOT EXISTS idx_security_alerts_source ON security_alerts(source);

-- 複合インデックス（よく使われるクエリ用）
CREATE INDEX IF NOT EXISTS idx_security_alerts_type_ip_time ON security_alerts(type, client_ip, created_at DESC);

-- セキュリティアラート統計ビュー
CREATE OR REPLACE VIEW security_alert_summary AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  type,
  severity,
  status,
  COUNT(*) as alert_count,
  COUNT(DISTINCT client_ip) as unique_ips,
  AVG(CASE 
    WHEN details->>'threat_score' IS NOT NULL 
    THEN (details->>'threat_score')::numeric 
    ELSE NULL 
  END) as avg_threat_score
FROM security_alerts
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 
  DATE_TRUNC('hour', created_at),
  type,
  severity,
  status
ORDER BY hour DESC, alert_count DESC;

-- 高頻度アラートIP検出ビュー
CREATE OR REPLACE VIEW high_frequency_alert_ips AS
SELECT 
  client_ip,
  type,
  COUNT(*) as alert_count,
  COUNT(DISTINCT severity) as severity_levels,
  MAX(severity) as max_severity,
  MIN(created_at) as first_alert,
  MAX(created_at) as last_alert,
  CASE 
    WHEN COUNT(*) > 50 THEN 'very_high'
    WHEN COUNT(*) > 20 THEN 'high'
    WHEN COUNT(*) > 10 THEN 'medium'
    ELSE 'low'
  END as frequency_level
FROM security_alerts
WHERE created_at >= NOW() - INTERVAL '1 hour'
AND client_ip IS NOT NULL
GROUP BY client_ip, type
HAVING COUNT(*) > 5
ORDER BY alert_count DESC;

-- RLS (Row Level Security) 設定
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能
CREATE POLICY "Security alerts accessible by clinic admins" ON security_alerts
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM clinic_users cu
      WHERE cu.user_id = auth.uid()
      AND cu.role IN ('admin', 'owner')
    )
  );

-- 更新日時の自動更新
CREATE OR REPLACE FUNCTION update_security_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- ステータスがresolvedに変更された場合
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_security_alerts_updated_at
  BEFORE UPDATE ON security_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_security_alerts_updated_at();

-- アラート急増検知関数
CREATE OR REPLACE FUNCTION check_alert_surge()
RETURNS TRIGGER AS $$
DECLARE
  recent_alerts INTEGER;
  surge_threshold INTEGER := 20; -- 5分間で20件以上で急増判定
BEGIN
  -- 過去5分間のアラート数をチェック
  SELECT COUNT(*) INTO recent_alerts
  FROM security_alerts
  WHERE created_at >= NOW() - INTERVAL '5 minutes'
  AND type = NEW.type;
  
  -- 急増閾値を超えた場合の処理
  IF recent_alerts > surge_threshold THEN
    -- 緊急通知ログ（実際の実装ではSupabase Functionsを呼び出し）
    RAISE WARNING 'Security Alert Surge Detected: type=%, count=% in 5min', 
                  NEW.type, recent_alerts;
    
    -- アラート急増フラグをセット（管理者ダッシュボード用）
    INSERT INTO security_alerts (
      type, 
      severity, 
      title, 
      message, 
      source, 
      details
    ) VALUES (
      'system',
      'high',
      'セキュリティアラート急増検出',
      format('過去5分間で %s タイプのアラートが %s 件発生しました。', NEW.type, recent_alerts),
      'alert-monitor',
      jsonb_build_object(
        'surge_type', NEW.type,
        'alert_count', recent_alerts,
        'time_window', '5 minutes',
        'threshold', surge_threshold
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- アラート急増検知トリガー
CREATE TRIGGER security_alert_surge_check
  AFTER INSERT ON security_alerts
  FOR EACH ROW
  EXECUTE FUNCTION check_alert_surge();

-- データ保持ポリシー用関数（90日経過データの自動削除）
CREATE OR REPLACE FUNCTION cleanup_old_security_alerts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 90日経過した低重要度アラートを削除
  DELETE FROM security_alerts 
  WHERE created_at < NOW() - INTERVAL '90 days'
  AND severity IN ('low', 'medium')
  AND status IN ('resolved', 'false_positive');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- クリーンアップログ
  IF deleted_count > 0 THEN
    INSERT INTO security_alerts (
      type,
      severity,
      title,
      message,
      source,
      details
    ) VALUES (
      'system',
      'low',
      'セキュリティアラート自動削除',
      format('%s 件の古いアラートを自動削除しました。', deleted_count),
      'cleanup-job',
      jsonb_build_object('deleted_count', deleted_count)
    );
  END IF;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- テーブルコメント
COMMENT ON TABLE security_alerts IS 'セキュリティアラート・インシデントログ';
COMMENT ON COLUMN security_alerts.details IS 'アラート詳細データ（JSON形式）';
COMMENT ON COLUMN security_alerts.status IS 'アラート対応状況（new/reviewing/resolved/false_positive）';
COMMENT ON VIEW security_alert_summary IS 'セキュリティアラート統計サマリー';
COMMENT ON VIEW high_frequency_alert_ips IS '高頻度アラートIP検出ビュー';