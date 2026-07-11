import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

import { validateProductionEnvironment } from '@/lib/env';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const REDIS_HEALTH_CHECK_TIMEOUT_MS = 2_000;

type DatabaseReadiness = 'connected' | 'disconnected' | 'not_checked';
type RedisReadiness =
  | 'connected'
  | 'disconnected'
  | 'not_required'
  | 'not_checked';
type ConfigurationReadiness = 'valid' | 'invalid';

function createHealthResponse(
  ok: boolean,
  checks: {
    configuration: ConfigurationReadiness;
    database: DatabaseReadiness;
    rateLimiter: RedisReadiness;
  },
  status: number
) {
  return NextResponse.json(
    {
      ok,
      status: ok ? 'ready' : 'not_ready',
      database: checks.database,
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

async function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    });

    return await Promise.race([Promise.resolve(operation), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function checkDatabase(): Promise<DatabaseReadiness> {
  try {
    const supabase = createAdminClient();
    const result = await withTimeout(
      supabase.from('clinics').select('id').limit(1),
      HEALTH_CHECK_TIMEOUT_MS,
      'Database readiness check timed out'
    );
    if (result.error) {
      await captureOperationalError(result.error, {
        source: 'readiness',
        operation: 'database',
        endpoint: '/api/health',
        reason: 'query_error',
      });
      return 'disconnected';
    }

    return 'connected';
  } catch (error) {
    await captureOperationalError(error, {
      source: 'readiness',
      operation: 'database',
      endpoint: '/api/health',
      reason: 'exception',
    });
    return 'disconnected';
  }
}

async function checkRateLimiter(): Promise<RedisReadiness> {
  if (process.env.NODE_ENV !== 'production') {
    return 'not_required';
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return 'disconnected';
  }

  try {
    const redis = new Redis({ url, token });
    const result = await withTimeout(
      redis.ping(),
      REDIS_HEALTH_CHECK_TIMEOUT_MS,
      'Redis readiness check timed out'
    );
    return result === 'PONG' ? 'connected' : 'disconnected';
  } catch (error) {
    await captureOperationalError(error, {
      source: 'readiness',
      operation: 'redis',
      endpoint: '/api/health',
      reason: 'exception',
    });
    return 'disconnected';
  }
}

export async function GET() {
  const environment = validateProductionEnvironment();
  if (!environment.ok) {
    return createHealthResponse(
      false,
      {
        configuration: 'invalid',
        database: 'not_checked',
        rateLimiter: 'not_checked',
      },
      503
    );
  }

  const [database, rateLimiter] = await Promise.all([
    checkDatabase(),
    checkRateLimiter(),
  ]);
  const ok = database === 'connected' && rateLimiter !== 'disconnected';

  return createHealthResponse(
    ok,
    { configuration: 'valid', database, rateLimiter },
    ok ? 200 : 503
  );
}
