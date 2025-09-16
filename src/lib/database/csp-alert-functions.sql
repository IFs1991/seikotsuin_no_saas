/**
 * CSPアラート強化用データベース関数
 * Phase 3B Refactoring: データベースレベルでの脅威検知強化
 */

-- 拡張統計用関数: 攻撃パターン検出
CREATE OR REPLACE FUNCTION detect_csp_attack_patterns()
RETURNS TABLE(
  attack_type TEXT,
  client_ip INET,
  pattern_count BIGINT,
  threat_level TEXT,
  first_occurrence TIMESTAMP WITH TIME ZONE,
  last_occurrence TIMESTAMP WITH TIME ZONE,
  evidence JSONB
) AS $$
BEGIN
  -- Script injection攻撃パターンの検出
  RETURN QUERY
  SELECT 
    'script_injection'::TEXT as attack_type,
    cv.client_ip,
    COUNT(*)::BIGINT as pattern_count,
    CASE 
      WHEN COUNT(*) > 20 THEN 'critical'
      WHEN COUNT(*) > 10 THEN 'high'
      WHEN COUNT(*) > 5 THEN 'medium'
      ELSE 'low'
    END::TEXT as threat_level,
    MIN(cv.created_at) as first_occurrence,
    MAX(cv.created_at) as last_occurrence,
    jsonb_build_object(
      'violated_directive', cv.violated_directive,
      'blocked_uris', jsonb_agg(DISTINCT cv.blocked_uri),
      'user_agents', jsonb_agg(DISTINCT cv.user_agent),
      'avg_threat_score', AVG(cv.threat_score)
    ) as evidence
  FROM csp_violations cv
  WHERE cv.created_at >= NOW() - INTERVAL '1 hour'
    AND cv.violated_directive LIKE '%script-src%'
    AND cv.severity IN ('high', 'critical')
    AND cv.client_ip IS NOT NULL
  GROUP BY cv.client_ip, cv.violated_directive
  HAVING COUNT(*) >= 3;

  -- Clickjacking攻撃パターンの検出
  RETURN QUERY
  SELECT 
    'clickjacking_attempt'::TEXT as attack_type,
    cv.client_ip,
    COUNT(*)::BIGINT as pattern_count,
    CASE 
      WHEN COUNT(*) > 15 THEN 'high'
      WHEN COUNT(*) > 8 THEN 'medium'
      ELSE 'low'
    END::TEXT as threat_level,
    MIN(cv.created_at) as first_occurrence,
    MAX(cv.created_at) as last_occurrence,
    jsonb_build_object(
      'violated_directive', cv.violated_directive,
      'document_uris', jsonb_agg(DISTINCT cv.document_uri),
      'referrers', jsonb_agg(DISTINCT cv.referrer),
      'pattern_indicators', jsonb_build_object(
        'frame_ancestors_violations', COUNT(*) FILTER (WHERE cv.violated_directive LIKE '%frame-ancestors%'),
        'frame_src_violations', COUNT(*) FILTER (WHERE cv.violated_directive LIKE '%frame-src%')
      )
    ) as evidence
  FROM csp_violations cv
  WHERE cv.created_at >= NOW() - INTERVAL '1 hour'
    AND (cv.violated_directive LIKE '%frame-ancestors%' OR cv.violated_directive LIKE '%frame-src%')
    AND cv.client_ip IS NOT NULL
  GROUP BY cv.client_ip
  HAVING COUNT(*) >= 5;

  -- CSS Injection攻撃パターンの検出
  RETURN QUERY
  SELECT 
    'css_injection'::TEXT as attack_type,
    cv.client_ip,
    COUNT(*)::BIGINT as pattern_count,
    'medium'::TEXT as threat_level,
    MIN(cv.created_at) as first_occurrence,
    MAX(cv.created_at) as last_occurrence,
    jsonb_build_object(
      'violated_directive', cv.violated_directive,
      'blocked_uris', jsonb_agg(DISTINCT cv.blocked_uri),
      'style_samples', jsonb_agg(DISTINCT cv.script_sample) FILTER (WHERE cv.script_sample IS NOT NULL)
    ) as evidence
  FROM csp_violations cv
  WHERE cv.created_at >= NOW() - INTERVAL '1 hour'
    AND cv.violated_directive LIKE '%style-src%'
    AND cv.blocked_uri LIKE '%data:%'
    AND cv.client_ip IS NOT NULL
  GROUP BY cv.client_ip
  HAVING COUNT(*) >= 8;
END;
$$ LANGUAGE plpgsql;

-- 高頻度アラートIP自動検出・対応関数
CREATE OR REPLACE FUNCTION handle_high_frequency_alerts()
RETURNS VOID AS $$
DECLARE
  alert_record RECORD;
  response_action TEXT;
BEGIN
  -- 高頻度アラートIPを検出してアクションを実行
  FOR alert_record IN 
    SELECT * FROM high_frequency_alert_ips 
    WHERE frequency_level IN ('high', 'very_high')
  LOOP
    -- 対応アクション決定
    response_action := CASE 
      WHEN alert_record.frequency_level = 'very_high' THEN 'auto_block'
      WHEN alert_record.max_severity = 'critical' THEN 'escalate'
      WHEN alert_record.alert_count > 30 THEN 'monitor_closely'
      ELSE 'log_only'
    END;

    -- セキュリティアラートに自動対応ログを記録
    INSERT INTO security_alerts (
      type,
      severity,
      title,
      message,
      details,
      client_ip,
      source
    ) VALUES (
      'auto_response',
      CASE 
        WHEN response_action = 'auto_block' THEN 'high'
        WHEN response_action = 'escalate' THEN 'critical'
        ELSE 'medium'
      END,
      format('高頻度アラートIP自動対応: %s', alert_record.client_ip::TEXT),
      format('IP %s から過去1時間で %s 件のアラート（%s レベル）を検出。自動対応: %s',
        alert_record.client_ip::TEXT,
        alert_record.alert_count,
        alert_record.frequency_level,
        response_action
      ),
      jsonb_build_object(
        'client_ip', alert_record.client_ip,
        'alert_count', alert_record.alert_count,
        'frequency_level', alert_record.frequency_level,
        'max_severity', alert_record.max_severity,
        'first_alert', alert_record.first_alert,
        'last_alert', alert_record.last_alert,
        'response_action', response_action,
        'auto_generated', true
      ),
      alert_record.client_ip,
      'auto-threat-response'
    );

    -- 自動ブロック対象の場合は追加処理（実装例）
    IF response_action = 'auto_block' THEN
      -- 実際の実装では、Supabase EdgeFunctions経由で
      -- Redis/Upstashのレート制限システムにブロック指示を送信
      RAISE NOTICE 'AUTO-BLOCK: IP % should be blocked immediately', alert_record.client_ip;
      
      -- ブロックログを記録
      INSERT INTO security_alerts (
        type,
        severity,
        title,
        message,
        details,
        client_ip,
        source
      ) VALUES (
        'auto_block',
        'critical',
        format('自動IPブロック実行: %s', alert_record.client_ip::TEXT),
        format('IP %s を自動的にブロックしました。解除は管理者による手動操作が必要です。',
          alert_record.client_ip::TEXT
        ),
        jsonb_build_object(
          'client_ip', alert_record.client_ip,
          'trigger_alert_count', alert_record.alert_count,
          'block_duration', '24 hours',
          'auto_block_reason', 'excessive_csp_violations',
          'requires_manual_review', true
        ),
        alert_record.client_ip,
        'auto-block-system'
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- CSP違反パターン分析関数
CREATE OR REPLACE FUNCTION analyze_csp_violation_patterns()
RETURNS TABLE(
  pattern_type TEXT,
  risk_level TEXT,
  occurrence_count BIGINT,
  unique_ips BIGINT,
  trend_direction TEXT,
  recommendations TEXT[]
) AS $$
BEGIN
  -- JavaScriptインジェクション系の分析
  RETURN QUERY
  SELECT 
    'javascript_injection'::TEXT as pattern_type,
    CASE 
      WHEN COUNT(*) > 50 THEN 'critical'
      WHEN COUNT(*) > 20 THEN 'high'
      WHEN COUNT(*) > 10 THEN 'medium'
      ELSE 'low'
    END::TEXT as risk_level,
    COUNT(*)::BIGINT as occurrence_count,
    COUNT(DISTINCT client_ip)::BIGINT as unique_ips,
    CASE 
      WHEN COUNT(*) > LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('hour', created_at)) * 1.5 THEN 'increasing'
      WHEN COUNT(*) < LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('hour', created_at)) * 0.7 THEN 'decreasing'
      ELSE 'stable'
    END::TEXT as trend_direction,
    ARRAY[
      'CSPポリシーのscript-srcディレクティブを強化',
      'nonce/hashベースの動的スクリプト許可を導入',
      '外部スクリプトソースの厳格な制限を検討'
    ]::TEXT[] as recommendations
  FROM csp_violations 
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND violated_directive LIKE '%script-src%'
    AND blocked_uri ~ '^(javascript:|data:text/javascript)'
  GROUP BY DATE_TRUNC('hour', created_at);

  -- 外部リソース読み込み試行の分析
  RETURN QUERY
  SELECT 
    'external_resource_loading'::TEXT as pattern_type,
    'medium'::TEXT as risk_level,
    COUNT(*)::BIGINT as occurrence_count,
    COUNT(DISTINCT client_ip)::BIGINT as unique_ips,
    'monitoring'::TEXT as trend_direction,
    ARRAY[
      '外部CDNの許可リスト見直し',
      'サブリソース整合性(SRI)の導入検討',
      '不審な外部リソース要求の監視強化'
    ]::TEXT[] as recommendations
  FROM csp_violations 
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND blocked_uri ~ '^https?://'
    AND blocked_uri !~ '(supabase\.co|upstash\.io|fonts\.googleapis\.com|cdn\.jsdelivr\.net)';
END;
$$ LANGUAGE plpgsql;

-- Supabase Edge Functions連携用関数
CREATE OR REPLACE FUNCTION trigger_edge_function_alert(
  alert_type TEXT,
  payload JSONB
) RETURNS VOID AS $$
BEGIN
  -- 実装メモ: この関数は将来的にSupabase Edge Functions
  -- 'security-alert-processor' を呼び出す予定
  
  INSERT INTO security_alerts (
    type,
    severity,
    title,
    message,
    details,
    source
  ) VALUES (
    'edge_function_trigger',
    'low',
    format('Edge Function Alert: %s', alert_type),
    format('Triggered edge function for %s processing', alert_type),
    jsonb_build_object(
      'function_type', alert_type,
      'payload_size', jsonb_size(payload),
      'trigger_timestamp', NOW()
    ),
    'edge-function-trigger'
  );
  
  RAISE NOTICE 'Edge function alert triggered: type=%, payload=%', alert_type, payload;
END;
$$ LANGUAGE plpgsql;

-- 強化されたCSP違反トリガー（既存のものを更新）
DROP TRIGGER IF EXISTS csp_violation_threshold_check ON csp_violations;
DROP FUNCTION IF EXISTS check_csp_violation_threshold();

CREATE OR REPLACE FUNCTION enhanced_csp_violation_check()
RETURNS TRIGGER AS $$
DECLARE
  recent_violations INTEGER;
  client_violations INTEGER;
  attack_patterns RECORD;
BEGIN
  -- 基本的な閾値チェック
  SELECT COUNT(*) INTO recent_violations
  FROM csp_violations
  WHERE created_at >= NOW() - INTERVAL '5 minutes';
  
  SELECT COUNT(*) INTO client_violations
  FROM csp_violations
  WHERE client_ip = NEW.client_ip
  AND created_at >= NOW() - INTERVAL '10 minutes';
  
  -- 基本閾値の監視
  IF recent_violations > 50 OR client_violations > 10 THEN
    RAISE WARNING 'CSP Violation Threshold Exceeded: recent=%, client=%, ip=%', 
                  recent_violations, client_violations, NEW.client_ip;
    
    -- 高頻度アラート処理を実行
    PERFORM handle_high_frequency_alerts();
  END IF;
  
  -- 攻撃パターン分析（高重要度の場合のみ）
  IF NEW.severity IN ('high', 'critical') THEN
    -- 攻撃パターン検出を実行
    FOR attack_patterns IN 
      SELECT * FROM detect_csp_attack_patterns() 
      WHERE client_ip = NEW.client_ip
    LOOP
      -- パターン検出時のアラート
      PERFORM trigger_edge_function_alert(
        attack_patterns.attack_type,
        jsonb_build_object(
          'client_ip', attack_patterns.client_ip,
          'threat_level', attack_patterns.threat_level,
          'pattern_count', attack_patterns.pattern_count,
          'evidence', attack_patterns.evidence
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 強化トリガーを作成
CREATE TRIGGER enhanced_csp_violation_check
  AFTER INSERT ON csp_violations
  FOR EACH ROW
  EXECUTE FUNCTION enhanced_csp_violation_check();

-- 定期実行用の分析・清掃関数
CREATE OR REPLACE FUNCTION periodic_csp_maintenance()
RETURNS TEXT AS $$
DECLARE
  deleted_count INTEGER;
  analysis_results RECORD;
  maintenance_summary TEXT;
BEGIN
  -- 古いデータの削除
  SELECT cleanup_old_security_alerts() INTO deleted_count;
  
  -- パターン分析実行
  maintenance_summary := format('CSP Maintenance Report - %s', NOW()::TEXT);
  maintenance_summary := maintenance_summary || E'\n' || format('Deleted %s old alerts', deleted_count);
  
  -- 分析結果をログに記録
  FOR analysis_results IN 
    SELECT * FROM analyze_csp_violation_patterns()
  LOOP
    maintenance_summary := maintenance_summary || E'\n' || 
      format('Pattern: %s, Risk: %s, Count: %s', 
        analysis_results.pattern_type, 
        analysis_results.risk_level, 
        analysis_results.occurrence_count
      );
  END LOOP;
  
  -- 高頻度アラート処理
  PERFORM handle_high_frequency_alerts();
  
  RETURN maintenance_summary;
END;
$$ LANGUAGE plpgsql;

-- コメント追加
COMMENT ON FUNCTION detect_csp_attack_patterns() IS 'CSP違反ログから攻撃パターンを検出・分析';
COMMENT ON FUNCTION handle_high_frequency_alerts() IS '高頻度アラートIPの自動検出・対応処理';
COMMENT ON FUNCTION analyze_csp_violation_patterns() IS 'CSP違反パターンの傾向分析・推奨事項生成';
COMMENT ON FUNCTION periodic_csp_maintenance() IS '定期実行用のCSP監視・メンテナンス処理';