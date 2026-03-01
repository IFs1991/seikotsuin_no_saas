import 'server-only';

/**
 * Redis接続の共通初期化モジュール
 * rate-limiter.ts と csp-rate-limiter.ts で共有
 */

import { Redis } from '@upstash/redis';
import { createLogger } from '@/lib/logger';

const log = createLogger('RedisClient');
let warned = false;

/**
 * Redis接続の遅延初期化（既存インスタンスがあればそのまま返す）
 */
export function getOrCreateRedis(existing: Redis | null): Redis | null {
  if (existing) return existing;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warned) {
      warned = true;
      log.warn(
        'Rate limiter disabled: missing Upstash env (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN)'
      );
    }
    return null;
  }

  return new Redis({ url, token });
}
