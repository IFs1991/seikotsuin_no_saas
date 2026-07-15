/**
 * CSP違反レポート処理API
 * Phase 3B: CSPポリシー違反の監視・記録
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CSPConfig, type CSPViolationReport } from '@/lib/security/csp-config';
import { cspRateLimiter } from '@/lib/rate-limiting/csp-rate-limiter';
import { logger } from '@/lib/logger';
import {
  createAdminClient,
  createClient,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import type { Database } from '@/types/supabase';

const MAX_CSP_REPORT_BODY_BYTES = 32 * 1024;
const MAX_URI_LENGTH = 2048;
const MAX_DIRECTIVE_LENGTH = 256;
const MAX_POLICY_LENGTH = 4096;
const MAX_SCRIPT_SAMPLE_LENGTH = 512;
const MAX_USER_AGENT_LENGTH = 512;

type CSPViolationInsert =
  Database['public']['Tables']['csp_violations']['Insert'];
type CSPViolationRow = Database['public']['Tables']['csp_violations']['Row'];
type CSPViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

const boundedString = (max: number) => z.string().trim().max(max);
const optionalBoundedString = (max: number) =>
  z.string().trim().max(max).optional();

const CSPReportSchema = z
  .object({
    'document-uri': boundedString(MAX_URI_LENGTH),
    referrer: optionalBoundedString(MAX_URI_LENGTH),
    'violated-directive': boundedString(MAX_DIRECTIVE_LENGTH),
    'effective-directive': optionalBoundedString(MAX_DIRECTIVE_LENGTH),
    'original-policy': optionalBoundedString(MAX_POLICY_LENGTH),
    disposition: z.enum(['enforce', 'report']).optional(),
    'blocked-uri': optionalBoundedString(MAX_URI_LENGTH),
    'line-number': z.number().int().nonnegative().optional(),
    'column-number': z.number().int().nonnegative().optional(),
    'source-file': optionalBoundedString(MAX_URI_LENGTH),
    'status-code': z.number().int().nonnegative().optional(),
    'script-sample': optionalBoundedString(MAX_SCRIPT_SAMPLE_LENGTH),
  })
  .strip()
  .transform(
    (report): CSPViolationReport => ({
      'document-uri': report['document-uri'],
      referrer: report.referrer,
      'violated-directive': report['violated-directive'],
      'effective-directive':
        report['effective-directive'] ?? report['violated-directive'],
      'original-policy': report['original-policy'] ?? '',
      disposition: report.disposition ?? 'report',
      'blocked-uri': report['blocked-uri'] ?? '',
      'line-number': report['line-number'],
      'column-number': report['column-number'],
      'source-file': report['source-file'],
      'status-code': report['status-code'],
      'script-sample': report['script-sample'],
    })
  );

class BodyTooLargeError extends Error {
  constructor() {
    super('CSP report body is too large');
  }
}

class InvalidJsonError extends Error {
  constructor() {
    super('CSP report body is not valid JSON');
  }
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!isSupportedContentType(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported CSP report content type' },
        { status: 415 }
      );
    }

    // レート制限チェック
    const rateLimitResult = await cspRateLimiter.checkCSPReportLimit(clientIP);

    if (!rateLimitResult.allowed) {
      const isBackendUnavailable =
        rateLimitResult.reason?.includes('unavailable');
      const headers = {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        'Retry-After': rateLimitResult.retryAfter?.toString() || '300',
      };

      // レート制限超過をログに記録（攻撃パターン分析用）
      logger.warn('CSP Report API: Rate limit denied request', {
        clientIP,
        reason: rateLimitResult.reason,
        retryAfter: rateLimitResult.retryAfter,
        userAgent: request.headers.get('user-agent'),
        timestamp: new Date().toISOString(),
      });

      return new NextResponse(null, {
        status: isBackendUnavailable ? 503 : 429,
        statusText: isBackendUnavailable
          ? 'Service Unavailable'
          : 'Too Many Requests',
        headers,
      });
    }

    const violationReport = await parseCSPReportRequest(request);

    // CSP違反を処理。監視ログ側の障害で保存処理は止めない。
    try {
      await CSPConfig.handleCSPViolation(violationReport);
    } catch (error) {
      logger.error('CSP違反ハンドラーエラー:', error);
    }

    const userAgent = truncateStoredHeader(
      request.headers.get('user-agent'),
      MAX_USER_AGENT_LENGTH
    );
    const referer = truncateStoredHeader(
      request.headers.get('referer'),
      MAX_URI_LENGTH
    );

    await saveCSPViolationToDB({
      report: violationReport,
      clientIP,
      userAgent,
      referer,
      receivedAt: new Date().toISOString(),
    });

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
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: 'CSP report body is too large' },
        { status: 413 }
      );
    }

    if (error instanceof InvalidJsonError) {
      return NextResponse.json(
        { error: 'Invalid CSP report JSON' },
        { status: 400 }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid CSP report payload', details: error.errors },
        { status: 400 }
      );
    }

    logger.error('CSP違反レポート処理エラー:', error);
    return NextResponse.json(
      { error: 'CSP report could not be recorded' },
      { status: 500 }
    );
  }
}

async function parseCSPReportRequest(
  request: NextRequest
): Promise<CSPViolationReport> {
  const rawBody = await readRequestBodyWithLimit(
    request,
    MAX_CSP_REPORT_BODY_BYTES
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidJsonError();
  }

  if (parsed !== null && typeof parsed === 'object' && 'csp-report' in parsed) {
    const maybeEnvelope = parsed as { 'csp-report'?: unknown };
    return CSPReportSchema.parse(maybeEnvelope['csp-report']);
  }

  return CSPReportSchema.parse(parsed);
}

async function readRequestBodyWithLimit(
  request: NextRequest,
  maxBytes: number
): Promise<string> {
  if (!request.body) {
    throw new InvalidJsonError();
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new BodyTooLargeError();
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

function isSupportedContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/csp-report') ||
    normalized.includes('application/json')
  );
}

function truncateStoredHeader(value: string | null, maxLength: number): string {
  return (value ?? '').slice(0, maxLength);
}

/**
 * CSP違反をデータベースに保存
 */
async function saveCSPViolationToDB(input: {
  report: CSPViolationReport;
  clientIP: string;
  userAgent: string;
  referer: string;
  receivedAt: string;
}): Promise<void> {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const severity = calculateViolationSeverity(input.report);
  const threatScore = calculateThreatScore(input.report);

  // clinic_id を認証コンテキストから取得（未認証の場合は null）
  let clinicId: string | null = null;
  try {
    const { getCurrentUser, getUserAccessContext } =
      await import('@/lib/supabase');
    const user = await getCurrentUser(supabase);
    if (user) {
      const accessContext = await getUserAccessContext(user.id, supabase, {
        user,
      });
      clinicId =
        accessContext.isActive && accessContext.permissions
          ? (resolveScopedClinicIds(accessContext.permissions)?.[0] ?? null)
          : null;
    }
  } catch {
    // 未認証のCSPレポートは clinic_id = null で記録
  }

  const violationData: CSPViolationInsert = {
    clinic_id: clinicId,
    document_uri: input.report['document-uri'],
    violated_directive: input.report['violated-directive'],
    blocked_uri: input.report['blocked-uri'],
    effective_directive: input.report['effective-directive'],
    original_policy: input.report['original-policy'],
    disposition: input.report.disposition,
    referrer: input.report.referrer ?? input.referer,
    client_ip: input.clientIP,
    user_agent: input.userAgent,
    line_number: input.report['line-number'] ?? null,
    column_number: input.report['column-number'] ?? null,
    source_file: input.report['source-file'] ?? null,
    script_sample: input.report['script-sample'] ?? null,
    severity,
    threat_score: threatScore,
    created_at: input.receivedAt,
  };

  const { data, error } = await adminSupabase
    .from('csp_violations')
    .insert(violationData)
    .select();

  if (error) {
    logger.error('CSP違反DB保存エラー:', error);
    throw error;
  }

  const insertedViolation = data?.[0];
  logger.log('CSP違反がデータベースに保存されました:', insertedViolation?.id);

  // 高脅威レベルの場合は即座に管理者に通知
  if (insertedViolation && (severity === 'critical' || severity === 'high')) {
    await notifyHighSeverityViolation(insertedViolation);
  }
}

/**
 * 違反の重要度計算
 */
function calculateViolationSeverity(
  report: CSPViolationReport
): CSPViolationSeverity {
  const violatedDirective = report['violated-directive'];
  const blockedUri = report['blocked-uri'];
  const scriptSample = report['script-sample'] ?? '';

  // クリティカル: inline javascript実行試行
  if (
    violatedDirective.includes('script-src') &&
    // eslint-disable-next-line no-script-url
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
function calculateThreatScore(report: CSPViolationReport): number {
  let score = 0;
  const violatedDirective = report['violated-directive'];
  const blockedUri = report['blocked-uri'];
  const scriptSample = report['script-sample'] ?? '';

  // ディレクティブ別スコア
  if (violatedDirective.includes('script-src')) score += 40;
  if (violatedDirective.includes('frame-ancestors')) score += 30;
  if (violatedDirective.includes('object-src')) score += 25;
  if (violatedDirective.includes('style-src')) score += 15;

  // URI別スコア
  // eslint-disable-next-line no-script-url
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
async function notifyHighSeverityViolation(
  violation: CSPViolationRow
): Promise<void> {
  try {
    // 通知システムをインポート（動的インポートでエラー回避）
    const { securityNotificationManager } =
      await import('@/lib/notifications/security-alerts');

    const clientIp =
      typeof violation.client_ip === 'string' ? violation.client_ip : 'unknown';
    const severity = normalizeStoredSeverity(violation.severity);

    // 通知頻度制限チェック（スパム防止）
    const shouldNotify = await securityNotificationManager.shouldNotify(
      'csp_violation',
      clientIp,
      5 // 5分間の制限窓
    );

    if (!shouldNotify) {
      logger.log('CSP violation notification skipped due to rate limit', {
        ip: clientIp,
        severity,
      });
      return;
    }

    // 高重要度通知の実行
    const result = await securityNotificationManager.notifyCSPViolation({
      id: violation.id,
      severity,
      violated_directive: violation.violated_directive,
      blocked_uri: violation.blocked_uri,
      document_uri: violation.document_uri,
      threat_score: violation.threat_score,
      client_ip: clientIp,
      user_agent: violation.user_agent,
      created_at: violation.created_at,
    });

    if (result.success) {
      logger.log('CSP violation notification sent successfully', {
        violationId: violation.id,
        channels: result.channels,
        severity,
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
    logger.warn('高重要度CSP違反検出（通知システム障害時）:', {
      id: violation.id,
      severity: normalizeStoredSeverity(violation.severity),
      directive: violation.violated_directive,
      uri: violation.blocked_uri,
      ip: violation.client_ip,
      timestamp: violation.created_at,
    });
  }
}

function normalizeStoredSeverity(value: string): CSPViolationSeverity {
  if (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'critical'
  ) {
    return value;
  }

  return 'low';
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
