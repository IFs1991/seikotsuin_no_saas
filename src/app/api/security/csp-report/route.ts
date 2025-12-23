/**
 * CSP違反レポート処理API
 * Phase 3B: CSPポリシー違反の監視・記録
 */

import { NextRequest, NextResponse } from 'next/server';
import { CSPConfig, CSPViolationReport } from '@/lib/security/csp-config';
import { cspRateLimiter } from '@/lib/rate-limiting/csp-rate-limiter';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    const clientIP = getClientIP(request);
    const rateLimitResult = await cspRateLimiter.checkCSPReportLimit(clientIP);

    if (!rateLimitResult.allowed) {
      const headers = {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        'Retry-After': rateLimitResult.retryAfter?.toString() || '300',
      };

      // レート制限超過をログに記録（攻撃パターン分析用）
      logger.warn('CSP Report API: Rate limit exceeded', {
        clientIP,
        reason: rateLimitResult.reason,
        retryAfter: rateLimitResult.retryAfter,
        userAgent: request.headers.get('user-agent'),
        timestamp: new Date().toISOString(),
      });

      return new NextResponse(null, {
        status: 429,
        statusText: 'Too Many Requests',
        headers,
      });
    }
    // CSP違反レポートを解析
    const contentType = request.headers.get('content-type');
    let violationReport: CSPViolationReport;

    if (contentType?.includes('application/csp-report')) {
      // 標準的なCSPレポート形式
      const body = await request.json();
      violationReport = body['csp-report'] || body;
    } else {
      // JSON形式のレポート
      violationReport = await request.json();
    }

    // リクエスト情報の追加
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer') || '';

    // 拡張されたレポート情報
    const enhancedReport = {
      ...violationReport,
      clientIP,
      userAgent,
      referer,
      receivedAt: new Date().toISOString(),
    };

    // CSP違反を処理
    await CSPConfig.handleCSPViolation(violationReport);

    // データベースに詳細ログを保存
    await saveCSPViolationToDB(enhancedReport);

    // 成功レスポンス（CSPレポートは通常204を期待）
    const successHeaders = {
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': rateLimitResult.remainingRequests.toString(),
      'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
    };

    return new NextResponse(null, {
      status: 204,
      headers: successHeaders,
    });
  } catch (error) {
    logger.error('CSP違反レポート処理エラー:', error);

    // エラーでもCSPレポート送信は成功扱い
    return new NextResponse(null, { status: 204 });
  }
}

/**
 * CSP違反をデータベースに保存
 */
async function saveCSPViolationToDB(
  report: Record<string, unknown>
): Promise<void> {
  try {
    // Supabaseクライアントのインポート
    const { createClient } = await import('@/lib/supabase');
    const supabase = await createClient();

    // 違反の重要度を計算
    const severity = calculateViolationSeverity(report);
    const threatScore = calculateThreatScore(report);

    const violationData = {
      document_uri: report['document-uri'],
      violated_directive: report['violated-directive'],
      blocked_uri: report['blocked-uri'],
      effective_directive: report['effective-directive'],
      original_policy: report['original-policy'],
      disposition: report.disposition || 'report',
      referrer: report.referrer,
      client_ip: report.clientIP,
      user_agent: report.userAgent,
      line_number: report['line-number'] || null,
      column_number: report['column-number'] || null,
      source_file: report['source-file'],
      script_sample: report['script-sample'],
      severity,
      threat_score: threatScore,
      created_at: report.receivedAt,
    };

    // データベースに挿入
    const { data, error } = await supabase
      .from('csp_violations')
      .insert([violationData])
      .select();

    if (error) {
      logger.error('CSP違反DB保存エラー:', error);
    } else {
      logger.log('CSP違反がデータベースに保存されました:', data?.[0]?.id);

      // 高脅威レベルの場合は即座に管理者に通知
      if (severity === 'critical' || severity === 'high') {
        await notifyHighSeverityViolation(data?.[0]);
      }
    }
  } catch (error) {
    logger.error('CSP違反データベース保存エラー:', error);
  }
}

/**
 * 違反の重要度計算
 */
function calculateViolationSeverity(
  report: Record<string, any>
): 'low' | 'medium' | 'high' | 'critical' {
  const violatedDirective = report['violated-directive'] || '';
  const blockedUri = report['blocked-uri'] || '';
  const scriptSample = report['script-sample'] || '';

  // クリティカル: inline javascript実行試行
  if (
    violatedDirective.includes('script-src') &&
    blockedUri.startsWith('javascript:')
  ) {
    return 'critical';
  }

  // クリティカル: 悪意のあるスクリプトパターン
  if (
    scriptSample &&
    (scriptSample.includes('eval(') ||
      scriptSample.includes('document.write') ||
      scriptSample.includes('innerHTML') ||
      scriptSample.includes('location.href') ||
      scriptSample.includes('window.open'))
  ) {
    return 'critical';
  }

  // 高: 外部スクリプト読み込み試行
  if (
    violatedDirective.includes('script-src') &&
    blockedUri.match(/^https?:\/\/(?!.*\.(supabase\.co|upstash\.io))/)
  ) {
    return 'high';
  }

  // 高: フレーミング試行（clickjacking）
  if (violatedDirective.includes('frame-ancestors')) {
    return 'high';
  }

  // 中: style-src違反（CSS injection可能性）
  if (
    violatedDirective.includes('style-src') &&
    blockedUri.startsWith('data:')
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * 脅威スコア計算（0-100）
 */
function calculateThreatScore(report: Record<string, any>): number {
  let score = 0;
  const violatedDirective = report['violated-directive'] || '';
  const blockedUri = report['blocked-uri'] || '';
  const scriptSample = report['script-sample'] || '';

  // ディレクティブ別スコア
  if (violatedDirective.includes('script-src')) score += 40;
  if (violatedDirective.includes('frame-ancestors')) score += 30;
  if (violatedDirective.includes('object-src')) score += 25;
  if (violatedDirective.includes('style-src')) score += 15;

  // URI別スコア
  if (blockedUri.startsWith('javascript:')) score += 35;
  if (blockedUri.startsWith('data:')) score += 20;
  if (blockedUri.match(/^https?:\/\//)) score += 15;

  // スクリプトサンプル分析
  if (scriptSample) {
    if (scriptSample.includes('eval(')) score += 25;
    if (scriptSample.includes('Function(')) score += 25;
    if (scriptSample.includes('document.write')) score += 20;
    if (scriptSample.includes('innerHTML')) score += 15;
    if (scriptSample.includes('location')) score += 10;
  }

  return Math.min(score, 100);
}

/**
 * 高重要度違反の管理者通知
 */
async function notifyHighSeverityViolation(violation: any): Promise<void> {
  try {
    // 通知システムをインポート（動的インポートでエラー回避）
    const { securityNotificationManager } = await import(
      '@/lib/notifications/security-alerts'
    );

    // 通知頻度制限チェック（スパム防止）
    const shouldNotify = await securityNotificationManager.shouldNotify(
      'csp_violation',
      violation.client_ip,
      5 // 5分間の制限窓
    );

    if (!shouldNotify) {
      logger.log('CSP violation notification skipped due to rate limit', {
        ip: violation.client_ip,
        severity: violation.severity,
      });
      return;
    }

    // 高重要度通知の実行
    const result = await securityNotificationManager.notifyCSPViolation({
      id: violation.id,
      severity: violation.severity,
      violated_directive: violation.violated_directive,
      blocked_uri: violation.blocked_uri,
      document_uri: violation.document_uri,
      threat_score: violation.threat_score,
      client_ip: violation.client_ip,
      user_agent: violation.user_agent,
      created_at: violation.created_at,
    });

    if (result.success) {
      logger.log('CSP violation notification sent successfully', {
        violationId: violation.id,
        channels: result.channels,
        severity: violation.severity,
      });
    } else {
      logger.error('CSP violation notification failed', {
        violationId: violation.id,
        errors: result.errors,
      });
    }
  } catch (error) {
    logger.error('高重要度違反通知エラー:', error);

    // フォールバック: 最低限のコンソール警告
    logger.warn('🚨 高重要度CSP違反検出（通知システム障害時）:', {
      id: violation.id,
      severity: violation.severity,
      directive: violation.violated_directive,
      uri: violation.blocked_uri,
      ip: violation.client_ip,
      timestamp: violation.created_at,
    });
  }
}

/**
 * クライアントIPアドレス取得
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  if (cfConnectingIP) return cfConnectingIP;
  if (realIP) return realIP;
  if (forwarded) return forwarded.split(',')[0].trim();

  return 'unknown';
}
