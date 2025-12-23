/**
 * 高性能レート制限システム
 * Phase 3B: Redis/Upstash Redis統合による段階的ブロック機能
 */

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// レート制限設定
export const RATE_LIMIT_CONFIG = {
  // ログイン試行制限
  LOGIN_ATTEMPTS: {
    WINDOW: 900, // 15分（秒）
    MAX_ATTEMPTS: 5,
    BLOCK_DURATION: [60, 300, 3600, 86400], // 1分→5分→1時間→24時間
  },

  // API呼び出し制限
  API_CALLS: {
    WINDOW: 60, // 1分
    MAX_CALLS: 100,
    BURST_LIMIT: 10, // バースト制限
  },

  // セッション作成制限
  SESSION_CREATION: {
    WINDOW: 300, // 5分
    MAX_SESSIONS: 3,
    BLOCK_DURATION: 1800, // 30分
  },

  // MFA試行制限
  MFA_ATTEMPTS: {
    WINDOW: 300, // 5分
    MAX_ATTEMPTS: 10,
    BLOCK_DURATION: 900, // 15分
  },
} as const;

// レート制限タイプ
export type RateLimitType =
  | 'login_attempts'
  | 'api_calls'
  | 'session_creation'
  | 'mfa_attempts';

// レート制限結果
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  blockLevel?: number;
  escalated?: boolean;
}

// レート制限ルール
const RateLimitRuleSchema = z.object({
  type: z.enum([
    'login_attempts',
    'api_calls',
    'session_creation',
    'mfa_attempts',
  ]),
  identifier: z.string().min(1, '識別子が必要です'),
  window: z.number().positive('ウィンドウは正の数である必要があります'),
  limit: z.number().positive('制限値は正の数である必要があります'),
  blockDuration: z.number().positive().optional(),
});

export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

/**
 * Redis対応高性能レート制限クラス
 * 分散環境での一貫性とパフォーマンスを両立
 */
export class RateLimiter {
  private redis: Redis;

  constructor() {
    // Upstash Redis接続（環境変数から設定取得）
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
  }

  /**
   * レート制限チェック・適用
   * 段階的ブロック機能付き
   */
  async checkRateLimit(
    type: RateLimitType,
    identifier: string,
    customConfig?: Partial<{
      window: number;
      limit: number;
      blockDuration: number;
    }>
  ): Promise<RateLimitResult> {
    try {
      const config = this.getConfig(type);
      const window = customConfig?.window || config.WINDOW;
      const limit =
        customConfig?.limit ||
        (('MAX_ATTEMPTS' in config && config.MAX_ATTEMPTS) ||
          ('MAX_CALLS' in config && config.MAX_CALLS) ||
          ('MAX_SESSIONS' in config && config.MAX_SESSIONS) ||
          0);

      const key = this.generateKey(type, identifier);
      const blockKey = `${key}:block`;
      const escalationKey = `${key}:escalation`;

      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - window;

      // ブロック状態チェック
      const blockInfo = await this.redis.get(blockKey);
      if (blockInfo) {
        const blockData = JSON.parse(blockInfo as string);
        const unblockTime = blockData.unblockTime;

        if (now < unblockTime) {
          return {
            allowed: false,
            limit,
            remaining: 0,
            resetTime: unblockTime,
            retryAfter: unblockTime - now,
            blockLevel: blockData.level,
          };
        } else {
          // ブロック期間終了
          await this.redis.del(blockKey);
        }
      }

      // スライディングウィンドウでのカウント取得
      const pipeline = this.redis.pipeline();

      // 古いエントリを削除
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 現在の時刻をスコアとして追加
      pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });

      // 現在のカウントを取得
      pipeline.zcard(key);

      // TTL設定
      pipeline.expire(key, window + 60);

      const results = await pipeline.exec();
      const currentCount = (results?.[2]?.[1] as number) || 0;

      const resetTime = now + window;
      const remaining = Math.max(0, limit - currentCount);

      if (currentCount > limit) {
        // レート制限に達した場合の段階的ブロック処理
        const escalationResult = await this.handleEscalation(
          type,
          identifier,
          escalationKey,
          blockKey,
          now
        );

        return {
          allowed: false,
          limit,
          remaining: 0,
          resetTime,
          retryAfter: escalationResult.blockDuration,
          blockLevel: escalationResult.level,
          escalated: true,
        };
      }

      return {
        allowed: true,
        limit,
        remaining,
        resetTime,
      };
    } catch (error) {
      logger.error('レート制限チェックエラー:', error);

      // Redisエラー時は制限しない（フェイルオープン）
      return {
        allowed: true,
        limit: 0,
        remaining: 0,
        resetTime: 0,
      };
    }
  }

  /**
   * 段階的ブロック・エスカレーション処理
   */
  private async handleEscalation(
    type: RateLimitType,
    identifier: string,
    escalationKey: string,
    blockKey: string,
    now: number
  ): Promise<{ level: number; blockDuration: number }> {
    // 現在のエスカレーションレベル取得
    const escalationData = await this.redis.get(escalationKey);
    let level = 0;

    if (escalationData) {
      const data = JSON.parse(escalationData as string);
      level = data.level + 1;
    }

    // ブロック期間の決定
    const config = this.getConfig(type);
    let blockDuration: number;

    if (type === 'login_attempts') {
      // ログイン試行の段階的ブロック
      const loginConfig = RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS;
      const durations = loginConfig.BLOCK_DURATION;
      blockDuration = durations[Math.min(level, durations.length - 1)];
    } else if (type === 'session_creation') {
      blockDuration = RATE_LIMIT_CONFIG.SESSION_CREATION.BLOCK_DURATION;
    } else if (type === 'mfa_attempts') {
      blockDuration = RATE_LIMIT_CONFIG.MFA_ATTEMPTS.BLOCK_DURATION;
    } else {
      // その他のタイプ - デフォルト5分
      blockDuration = 300;
    }

    const unblockTime = now + blockDuration;

    // ブロック情報を保存
    await this.redis.setex(
      blockKey,
      blockDuration + 60, // 少し余裕を持たせる
      JSON.stringify({
        level,
        blockTime: now,
        unblockTime,
        identifier,
        type,
      })
    );

    // エスカレーション情報を更新
    await this.redis.setex(
      escalationKey,
      86400, // 24時間保持
      JSON.stringify({
        level,
        lastEscalation: now,
      })
    );

    // セキュリティログ記録
    await this.logRateLimitEvent({
      type: 'rate_limit_exceeded',
      rateLimitType: type,
      identifier,
      level,
      blockDuration,
      timestamp: now,
    });

    return { level, blockDuration };
  }

  /**
   * レート制限リセット（管理者用）
   */
  async resetRateLimit(
    type: RateLimitType,
    identifier: string
  ): Promise<boolean> {
    try {
      const key = this.generateKey(type, identifier);
      const blockKey = `${key}:block`;
      const escalationKey = `${key}:escalation`;

      const pipeline = this.redis.pipeline();
      pipeline.del(key);
      pipeline.del(blockKey);
      pipeline.del(escalationKey);

      await pipeline.exec();

      // セキュリティログ記録
      await this.logRateLimitEvent({
        type: 'rate_limit_reset',
        rateLimitType: type,
        identifier,
        timestamp: Math.floor(Date.now() / 1000),
      });

      return true;
    } catch (error) {
      console.error('レート制限リセットエラー:', error);
      return false;
    }
  }

  /**
   * ホワイトリスト管理
   */
  async addToWhitelist(
    type: RateLimitType,
    identifier: string,
    ttl?: number
  ): Promise<boolean> {
    try {
      const whitelistKey = `whitelist:${type}:${identifier}`;

      if (ttl) {
        await this.redis.setex(whitelistKey, ttl, '1');
      } else {
        await this.redis.set(whitelistKey, '1');
      }

      return true;
    } catch (error) {
      console.error('ホワイトリスト追加エラー:', error);
      return false;
    }
  }

  /**
   * ホワイトリストチェック
   */
  async isWhitelisted(
    type: RateLimitType,
    identifier: string
  ): Promise<boolean> {
    try {
      const whitelistKey = `whitelist:${type}:${identifier}`;
      const result = await this.redis.exists(whitelistKey);
      return result === 1;
    } catch (error) {
      console.error('ホワイトリストチェックエラー:', error);
      return false;
    }
  }

  /**
   * レート制限統計取得
   */
  async getRateLimitStats(
    type: RateLimitType,
    identifier: string
  ): Promise<{
    currentCount: number;
    isBlocked: boolean;
    blockLevel?: number;
    nextResetTime: number;
  }> {
    try {
      const key = this.generateKey(type, identifier);
      const blockKey = `${key}:block`;

      const config = this.getConfig(type);
      const window = config.WINDOW;
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - window;

      // 現在のカウント取得
      const currentCount = await this.redis.zcount(key, windowStart, now);

      // ブロック状態チェック
      const blockInfo = await this.redis.get(blockKey);
      let isBlocked = false;
      let blockLevel: number | undefined;

      if (blockInfo) {
        const blockData = JSON.parse(blockInfo as string);
        isBlocked = now < blockData.unblockTime;
        blockLevel = blockData.level;
      }

      return {
        currentCount: currentCount || 0,
        isBlocked,
        blockLevel,
        nextResetTime: now + window,
      };
    } catch (error) {
      console.error('レート制限統計取得エラー:', error);
      return {
        currentCount: 0,
        isBlocked: false,
        nextResetTime: 0,
      };
    }
  }

  /**
   * 地域別制限チェック（将来拡張用）
   */
  async checkGeographicRestriction(
    ipAddress: string,
    allowedCountries?: string[]
  ): Promise<{ allowed: boolean; country?: string }> {
    // TODO: IP Geolocation APIとの統合
    // 現在は全て許可
    return { allowed: true };
  }

  /**
   * 設定取得
   */
  private getConfig(type: RateLimitType) {
    switch (type) {
      case 'login_attempts':
        return RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS;
      case 'api_calls':
        return RATE_LIMIT_CONFIG.API_CALLS;
      case 'session_creation':
        return RATE_LIMIT_CONFIG.SESSION_CREATION;
      case 'mfa_attempts':
        return RATE_LIMIT_CONFIG.MFA_ATTEMPTS;
      default:
        return RATE_LIMIT_CONFIG.API_CALLS;
    }
  }

  /**
   * Redisキー生成
   */
  private generateKey(type: RateLimitType, identifier: string): string {
    return `rate_limit:${type}:${identifier}`;
  }

  /**
   * レート制限イベントログ記録
   */
  private async logRateLimitEvent(event: {
    type: string;
    rateLimitType: RateLimitType;
    identifier: string;
    level?: number;
    blockDuration?: number;
    timestamp: number;
  }): Promise<void> {
    try {
      // セキュリティイベントテーブルへの記録
      // 実装では実際のデータベース挿入処理
      console.log('Rate Limit Event:', event);
    } catch (error) {
      // ログ記録エラーは主機能を妨げない
      console.error('レート制限イベントログ記録エラー:', error);
    }
  }
}

// シングルトンインスタンス
export const rateLimiter = new RateLimiter();
