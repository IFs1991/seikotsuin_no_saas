import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { Redis } from '@upstash/redis';
import { assertEnv } from '@/lib/env';
import { sanitizeAuthInput, type AuthErrorResponse } from '@/lib/schemas/auth';
import { getOrCreateRedis } from '@/lib/rate-limiting/redis-client';
import { captureOperationalError } from '@/lib/monitoring/sentry';

export const AUTH_ATTEMPT_LIMITS = {
  windowSeconds: 900,
  account: 10,
  ip: 100,
} as const;

// Inspect and reserve both budgets in one Redis operation. Rejected requests
// do not consume another account's/IP's budget or extend the expiry.
const RESERVE_AUTH_ATTEMPT = `
local retry = 0
for i = 1, 2 do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count >= tonumber(ARGV[i + 1]) then
    local ttl = redis.call('TTL', KEYS[i])
    if ttl < 0 then return redis.error_reply('Invalid authentication budget TTL') end
    retry = math.max(retry, math.max(1, ttl))
  end
end
if retry > 0 then return {0, retry} end
for i = 1, 2 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], ARGV[1]) end
end
return {1, 0}
`;

type RequestHeaders = Pick<Headers, 'get'>;
type AuthAttemptError = AuthErrorResponse & {
  code: 'AUTH_RATE_LIMITED' | 'AUTH_UNAVAILABLE';
  retryAfterSeconds: number;
};

let redis: Redis | null = null;
let nextFailureReportAt = 0;

function normalizeIp(value: string | undefined | null): string | null {
  const ip = value?.trim();
  if (!ip || isIP(ip) === 0) return null;
  // URL canonicalizes equivalent IPv6 spellings to one budget identity.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}

function getTrustedClientIp(headers: RequestHeaders): string | null {
  if (process.env.VERCEL === '1') {
    return normalizeIp(headers.get('x-vercel-forwarded-for')?.split(',')[0]);
  }
  if (process.env.TRUST_CF_HEADERS === 'true') {
    return normalizeIp(headers.get('cf-connecting-ip'));
  }
  const trustedCount = process.env.TRUSTED_PROXY_COUNT;
  if (!trustedCount || !/^[1-9]\d*$/.test(trustedCount)) return null;
  const chain = headers.get('x-forwarded-for')?.split(',');
  return normalizeIp(chain?.[chain.length - Number(trustedCount)]);
}

function budgetKey(kind: 'account' | 'ip', value: string): string {
  // Use the existing server-side HMAC secret convention with domain separation.
  const digest = createHmac('sha256', assertEnv('SUPABASE_SERVICE_ROLE_KEY'))
    .update(`auth-attempt:${kind}:${value}`)
    .digest('hex');
  return `auth-attempt:${kind}:${digest}`;
}

async function unavailable(): Promise<AuthAttemptError> {
  if (Date.now() >= nextFailureReportAt) {
    nextFailureReportAt = Date.now() + 60_000;
    // Never pass the Redis error, input or key to monitoring.
    await captureOperationalError(
      new Error('Authentication attempt guard unavailable'),
      {
        source: 'auth-attempt-guard',
        operation: 'password-authentication',
        reason: 'guard_unavailable',
        status: 503,
      }
    );
  }
  return {
    success: false,
    code: 'AUTH_UNAVAILABLE',
    retryAfterSeconds: 60,
    errors: {
      _form: ['現在ログインを確認できません。60秒後に再試行してください。'],
    },
  };
}

/** Call immediately before every actual signInWithPassword invocation. */
export async function checkAuthAttempt(
  email: string,
  headers: RequestHeaders
): Promise<AuthAttemptError | null> {
  try {
    redis = getOrCreateRedis(redis);
    if (!redis) {
      return process.env.NODE_ENV === 'production' ? unavailable() : null;
    }
    const clientIp = getTrustedClientIp(headers);
    if (!clientIp && process.env.NODE_ENV === 'production')
      return unavailable();
    const result: unknown = await redis.eval(
      RESERVE_AUTH_ATTEMPT,
      [
        budgetKey('account', sanitizeAuthInput(email).toLowerCase()),
        budgetKey('ip', clientIp ?? 'local-development'),
      ],
      [
        AUTH_ATTEMPT_LIMITS.windowSeconds,
        AUTH_ATTEMPT_LIMITS.account,
        AUTH_ATTEMPT_LIMITS.ip,
      ]
    );
    if (!Array.isArray(result) || result.length !== 2) return unavailable();
    const [allowed, retryAfterSeconds] = result;
    if (allowed === 1 && retryAfterSeconds === 0) return null;
    if (
      allowed !== 0 ||
      typeof retryAfterSeconds !== 'number' ||
      !Number.isInteger(retryAfterSeconds) ||
      retryAfterSeconds < 1 ||
      retryAfterSeconds > AUTH_ATTEMPT_LIMITS.windowSeconds
    )
      return unavailable();
    return {
      success: false,
      code: 'AUTH_RATE_LIMITED',
      retryAfterSeconds,
      errors: {
        _form: [
          `ログイン試行が多すぎます。${retryAfterSeconds}秒後に再試行してください。`,
        ],
      },
    };
  } catch {
    return unavailable();
  }
}
