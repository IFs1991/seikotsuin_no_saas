/**
 * レート制限ミドルウェア
 * Phase 3B: 自動レート制限適用・Next.js統合
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  rateLimiter,
  RateLimitType,
  type RateLimitResult,
} from './rate-limiter';
import { logger } from '@/lib/logger';

// レート制限設定
interface RateLimitConfig {
  type: RateLimitType;
  keyGenerator: (request: NextRequest) => string;
  skipIf?: (request: NextRequest) => boolean;
  onLimitExceeded?: (
    request: NextRequest,
    result: RateLimitResult
  ) => NextResponse;
}

function hasRateLimitBackend(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function createUnavailableResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: 'Rate limit backend unavailable',
      message:
        'リクエスト制限の確認に失敗しました。時間をおいて再試行してください。',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    }
  );
}

/**
 * レート制限ミドルウェア生成関数
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    try {
      if (!hasRateLimitBackend()) {
        if (process.env.NODE_ENV === 'production') {
          logger.error('Rate limiter backend is missing in production');
          return createUnavailableResponse();
        }
        return null;
      }

      // スキップ条件チェック
      if (config.skipIf && config.skipIf(request)) {
        return null; // スキップ
      }

      const identifier = config.keyGenerator(request);

      // ホワイトリストチェック
      const isWhitelisted = await rateLimiter.isWhitelisted(
        config.type,
        identifier
      );
      if (isWhitelisted) {
        return null; // ホワイトリストは制限しない
      }

      // レート制限チェック
      const result = await rateLimiter.checkRateLimit(config.type, identifier);

      if (!result.allowed) {
        // カスタムハンドラーがある場合は使用
        if (config.onLimitExceeded) {
          return config.onLimitExceeded(request, result);
        }

        // デフォルトのレート制限レスポンス
        return new NextResponse(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: getRateLimitMessage(config.type),
            retryAfter: result.retryAfter,
            blockLevel: result.blockLevel,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetTime.toString(),
              'Retry-After': (result.retryAfter || 60).toString(),
            },
          }
        );
      }

      // レスポンスにレート制限ヘッダーを追加
      return NextResponse.next({
        headers: {
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toString(),
        },
      });
    } catch (error) {
      logger.error('レート制限ミドルウェアエラー:', error);
      if (process.env.NODE_ENV === 'production') {
        return createUnavailableResponse();
      }
      return null;
    }
  };
}

/**
 * 定義済みレート制限ミドルウェア
 */
export const loginRateLimit = createRateLimitMiddleware({
  type: 'login_attempts',
  keyGenerator: request => {
    const ip = getClientIP(request);
    return `login:${ip}`;
  },
  onLimitExceeded: (_request, result) => {
    const message =
      result.blockLevel && result.blockLevel > 0
        ? `ログイン試行が多すぎます。${Math.floor((result.retryAfter || 0) / 60)}分後に再試行してください。`
        : 'ログイン試行が多すぎます。しばらく時間をおいて再試行してください。';

    return new NextResponse(
      JSON.stringify({
        error: 'Login rate limit exceeded',
        message,
        retryAfter: result.retryAfter,
        blockLevel: result.blockLevel,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': (result.retryAfter || 60).toString(),
        },
      }
    );
  },
});

export const apiRateLimit = createRateLimitMiddleware({
  type: 'api_calls',
  keyGenerator: request => {
    const ip = getClientIP(request);
    // ユーザー認証がある場合はユーザーIDも含める
    return `api:${ip}`;
  },
  skipIf: request => {
    // 静的アセット、health check等はスキップ
    const pathname = request.nextUrl.pathname;
    return (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon.ico') ||
      pathname === '/api/health'
    );
  },
});

export const sessionCreationRateLimit = createRateLimitMiddleware({
  type: 'session_creation',
  keyGenerator: request => {
    const ip = getClientIP(request);
    return `session:${ip}`;
  },
  onLimitExceeded: (_request, result) => {
    return new NextResponse(
      JSON.stringify({
        error: 'Session creation rate limit exceeded',
        message:
          'セッション作成が多すぎます。しばらく時間をおいて再試行してください。',
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': (result.retryAfter || 300).toString(),
        },
      }
    );
  },
});

export const mfaRateLimit = createRateLimitMiddleware({
  type: 'mfa_attempts',
  keyGenerator: request => {
    const ip = getClientIP(request);
    return `mfa:${ip}`;
  },
  onLimitExceeded: (_request, result) => {
    return new NextResponse(
      JSON.stringify({
        error: 'MFA verification rate limit exceeded',
        message: 'MFA認証試行が多すぎます。15分後に再試行してください。',
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': (result.retryAfter || 900).toString(),
        },
      }
    );
  },
});

/**
 * 複数ミドルウェアの組み合わせ
 */
export async function applyRateLimits(
  request: NextRequest,
  middlewares: Array<(request: NextRequest) => Promise<NextResponse | null>>
): Promise<NextResponse | null> {
  for (const middleware of middlewares) {
    const result = await middleware(request);
    if (result) {
      return result; // 制限に引っかかった場合は即座に返す
    }
  }
  return null; // すべて通過
}

/**
 * パス別レート制限設定
 */
export function getPathRateLimit(
  pathname: string
): Array<(request: NextRequest) => Promise<NextResponse | null>> {
  const middlewares: Array<
    (request: NextRequest) => Promise<NextResponse | null>
  > = [];

  // 公開APIのみ共通制限を適用
  if (isPublicApiPath(pathname)) {
    middlewares.push(apiRateLimit);
  }

  // 認証フローの入口
  if (isAuthEntryPoint(pathname)) {
    middlewares.push(loginRateLimit);
  }

  // セッション管理
  if (isSessionManagementPath(pathname)) {
    middlewares.push(sessionCreationRateLimit);
  }

  // MFA操作
  if (isMfaPath(pathname)) {
    middlewares.push(mfaRateLimit);
  }

  return middlewares;
}

/**
 * ユーティリティ関数
 */
function getClientIP(request: NextRequest): string {
  // 様々なヘッダーからIPアドレスを取得
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  if (xRealIP) {
    return xRealIP;
  }

  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  // フォールバック (NextRequest does not have .ip property)
  return '127.0.0.1';
}

function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/public/');
}

function isAuthEntryPoint(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/admin/login' ||
    pathname === '/register' ||
    pathname === '/invite' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password')
  );
}

function isSessionManagementPath(pathname: string): boolean {
  return (
    pathname === '/api/admin/security/sessions' ||
    pathname === '/api/admin/security/sessions/terminate'
  );
}

function isMfaPath(pathname: string): boolean {
  return pathname.startsWith('/api/mfa/');
}

function getRateLimitMessage(type: RateLimitType): string {
  switch (type) {
    case 'login_attempts':
      return 'ログイン試行回数が制限に達しました。時間をおいて再試行してください。';
    case 'api_calls':
      return 'API呼び出し回数が制限に達しました。しばらく時間をおいてください。';
    case 'session_creation':
      return 'セッション作成回数が制限に達しました。時間をおいて再試行してください。';
    case 'mfa_attempts':
      return 'MFA認証試行回数が制限に達しました。時間をおいて再試行してください。';
    default:
      return 'リクエスト回数が制限に達しました。時間をおいて再試行してください。';
  }
}
