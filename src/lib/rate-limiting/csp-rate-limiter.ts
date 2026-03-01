import 'server-only';

/**
 * CSPレポートAPI専用レート制限
 * Phase 3B Refactoring: DDoS攻撃・ログ汚染攻撃対策
 */

import { Redis } from '@upstash/redis';
import { createLogger } from '@/lib/logger';
import { getOrCreateRedis } from '@/lib/rate-limiting/redis-client';

const log = createLogger('CSPRateLimiter');

// CSPレポート専用の制限設定
interface CSPRateLimitConfig {
  windowMs: number; // 時間窓（ミリ秒）
  maxRequests: number; // 最大リクエスト数
  blockDurationMs: number; // ブロック期間（ミリ秒）
}

// レート制限レベル別設定
const CSP_RATE_LIMITS: Record<string, CSPRateLimitConfig> = {
  // 通常のレート制限（1分間に100リクエスト）
  normal: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 100,
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  },

  // 厳格なレート制限（攻撃検知時：1分間に10リクエスト）
  strict: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 10,
    blockDurationMs: 30 * 60 * 1000, // 30分ブロック
  },

  // 開発環境用（緩い制限）
  development: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 1000,
    blockDurationMs: 1 * 60 * 1000, // 1分ブロック
  },
};

export interface CSPRateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
  retryAfter?: number;
  reason?: string;
}

export class CSPRateLimiter {
  private redis: Redis | null = null;
  private config: CSPRateLimitConfig;

  constructor() {
    // 環境に応じた設定選択
    const env = process.env.NODE_ENV || 'development';
    this.config =
      env === 'development'
        ? CSP_RATE_LIMITS.development
        : CSP_RATE_LIMITS.normal;
  }

  /**
   * Redis接続の遅延初期化
   * 最初の使用時にのみ接続を確立
   */
  private getRedis(): Redis | null {
    this.redis = getOrCreateRedis(this.redis);
    return this.redis;
  }

  /**
   * CSPレポートAPIのレート制限チェック
   */
  async checkCSPReportLimit(clientIP: string): Promise<CSPRateLimitResult> {
    const key = `csp_rate_limit:${clientIP}`;
    const blockKey = `csp_blocked:${clientIP}`;
    const now = Date.now();
    const redis = this.getRedis();

    if (!redis) {
      return {
        allowed: true,
        remainingRequests: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        reason: 'Rate limiter unavailable - allowing request',
      };
    }

    try {
      // ブロック状態のチェック
      const blockInfo = await redis.get(blockKey);
      if (blockInfo) {
        const blockData = JSON.parse(blockInfo as string);
        if (blockData.blockedUntil > now) {
          return {
            allowed: false,
            remainingRequests: 0,
            resetTime: blockData.blockedUntil,
            retryAfter: Math.ceil((blockData.blockedUntil - now) / 1000),
            reason: 'IP temporarily blocked due to rate limit violation',
          };
        }

        // ブロック期間終了時のクリーンアップ
        await redis.del(blockKey);
      }

      // スライディングウィンドウでのリクエスト数カウント
      const windowStart = now - this.config.windowMs;
      const pipeline = redis.pipeline();

      // 古いエントリを削除
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 現在のリクエストを追加
      pipeline.zadd(key, {
        score: now,
        member: `${now}-${crypto.randomUUID()}`,
      });

      // 現在のリクエスト数を取得
      pipeline.zcard(key);

      // TTLを設定（メモリリーク防止）
      pipeline.expire(key, Math.ceil(this.config.windowMs / 1000) + 60);

      const results = await pipeline.exec();
      const currentRequests = results[2][1] as number;

      // レート制限チェック
      if (currentRequests > this.config.maxRequests) {
        // ブロック状態に移行
        await this.blockIP(clientIP, now, redis);

        return {
          allowed: false,
          remainingRequests: 0,
          resetTime: now + this.config.blockDurationMs,
          retryAfter: Math.ceil(this.config.blockDurationMs / 1000),
          reason: `Rate limit exceeded: ${currentRequests}/${this.config.maxRequests} requests in window`,
        };
      }

      // 正常なレスポンス
      const remainingRequests = Math.max(
        0,
        this.config.maxRequests - currentRequests
      );
      const resetTime = now + this.config.windowMs;

      return {
        allowed: true,
        remainingRequests,
        resetTime,
      };
    } catch (error) {
      log.error('CSP Rate Limiter Error:', error);

      // Redis接続エラー時はリクエストを通す（可用性優先）
      return {
        allowed: true,
        remainingRequests: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        reason: 'Rate limiter unavailable - allowing request',
      };
    }
  }

  /**
   * IPアドレスをブロック状態に設定
   */
  private async blockIP(
    clientIP: string,
    timestamp: number,
    redis: Redis
  ): Promise<void> {
    const blockKey = `csp_blocked:${clientIP}`;
    const blockInfo = {
      blockedAt: timestamp,
      blockedUntil: timestamp + this.config.blockDurationMs,
      reason: 'CSP report rate limit exceeded',
    };

    await redis.setex(
      blockKey,
      Math.ceil(this.config.blockDurationMs / 1000),
      JSON.stringify(blockInfo)
    );

    // セキュリティログに記録
    log.warn('CSP Rate Limit: IP blocked', {
      ip: clientIP,
      blockedUntil: new Date(blockInfo.blockedUntil).toISOString(),
      config: this.config,
    });
  }

  /**
   * 攻撃パターン検知時の厳格モード切り替え
   */
  async enableStrictMode(duration: number = 3600000): Promise<void> {
    this.config = CSP_RATE_LIMITS.strict;

    // 厳格モードの期限を設定
    const strictModeKey = 'csp_strict_mode';
    const redis = this.getRedis();
    if (!redis) {
      log.warn('CSP Rate Limiter: Redis unavailable; strict mode not saved');
      return;
    }

    await redis.setex(
      strictModeKey,
      Math.ceil(duration / 1000),
      JSON.stringify({
        enabledAt: Date.now(),
        duration,
        config: this.config,
      })
    );

    log.warn('CSP Rate Limiter: Strict mode enabled', {
      duration,
      config: this.config,
    });
  }

  /**
   * レート制限統計の取得
   */
  async getStatistics(hours: number = 1): Promise<{
    totalRequests: number;
    blockedIPs: string[];
    topRequesters: Array<{ ip: string; requests: number }>;
  }> {
    const now = Date.now();
    const windowStart = now - hours * 60 * 60 * 1000;
    const redis = this.getRedis();

    if (!redis) {
      return {
        totalRequests: 0,
        blockedIPs: [],
        topRequesters: [],
      };
    }

    try {
      // ブロックされたIPの一覧を取得
      const blockedIPKeys = await redis.keys('csp_blocked:*');
      const blockedIPs = blockedIPKeys.map(key =>
        key.replace('csp_blocked:', '')
      );

      // 統計情報の取得（簡易版）
      const rateLimitKeys = await redis.keys('csp_rate_limit:*');
      let totalRequests = 0;
      const ipRequestCounts: Record<string, number> = {};

      // 各IPのリクエスト数を集計
      for (const key of rateLimitKeys.slice(0, 100)) {
        // 最大100IP分
        const ip = key.replace('csp_rate_limit:', '');
        const requestCount = await redis.zcount(key, windowStart, now);

        totalRequests += requestCount;
        ipRequestCounts[ip] = requestCount;
      }

      // 上位リクエストIPのソート
      const topRequesters = Object.entries(ipRequestCounts)
        .map(([ip, requests]) => ({ ip, requests }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10);

      return {
        totalRequests,
        blockedIPs,
        topRequesters,
      };
    } catch (error) {
      log.error('Failed to get CSP rate limit statistics:', error);
      return {
        totalRequests: 0,
        blockedIPs: [],
        topRequesters: [],
      };
    }
  }

  /**
   * 特定IPの制限解除（管理者機能）
   */
  async unblockIP(clientIP: string): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) {
      return false;
    }

    try {
      const blockKey = `csp_blocked:${clientIP}`;
      const rateLimitKey = `csp_rate_limit:${clientIP}`;

      await Promise.all([redis.del(blockKey), redis.del(rateLimitKey)]);

      log.info('CSP Rate Limit: IP manually unblocked', { ip: clientIP });
      return true;
    } catch (error) {
      log.error('Failed to unblock IP:', error);
      return false;
    }
  }
}

// シングルトンインスタンス
export const cspRateLimiter: CSPRateLimiter = new CSPRateLimiter();
