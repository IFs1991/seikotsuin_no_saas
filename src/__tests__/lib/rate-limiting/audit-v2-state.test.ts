import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';
import { RateLimiter, rateLimiter } from '@/lib/rate-limiting/rate-limiter';
import { getOrCreateRedis } from '@/lib/rate-limiting/redis-client';
import { createRateLimitMiddleware } from '@/lib/rate-limiting/middleware';

jest.mock('@/lib/rate-limiting/redis-client', () => ({
  getOrCreateRedis: jest.fn(),
}));
jest.mock('@/lib/monitoring/sentry', () => ({
  captureOperationalError: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const now = 1_800_000_000;
const block = { level: 0, blockTime: now, unblockTime: now + 300 };

describe('AUDIT-V2:F03 stored Redis state', () => {
  const originalEnv = process.env;
  const redis = new Redis({
    url: 'https://redis.example.test',
    token: 'test',
    enableAutoPipelining: false,
  });
  let values: Map<string, unknown>;
  let count: number;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'test',
    };
    jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
    values = new Map();
    count = 1;
    jest.mocked(getOrCreateRedis).mockReturnValue(redis);
    jest
      .spyOn(redis, 'get')
      .mockImplementation(async key => values.get(key) ?? null);
    jest.spyOn(redis, 'setex').mockImplementation(async (key, _ttl, value) => {
      // Upstash's default JSON deserializer returns the stored object on GET.
      const restored: unknown =
        typeof value === 'string' ? JSON.parse(value) : value;
      values.set(key, restored);
      return 'OK';
    });
    jest.spyOn(redis, 'del').mockImplementation(async (...keys) => {
      for (const key of keys) values.delete(key);
      return keys.length;
    });
    jest
      .spyOn(redis, 'exists')
      .mockImplementation(async key => (values.has(key) ? 1 : 0));
    jest.spyOn(redis, 'zcount').mockResolvedValue(2);
    // Execute the SDK's real pipeline decoder against a local transport stub.
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify([0, 1, count, 1].map(result => ({ result })))
          )
      );
    jest.spyOn(redis, 'pipeline');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it.each([block, JSON.stringify(block)])(
    'restores active object/legacy block %#',
    async value => {
      values.set('rate_limit:login_attempts:actor:block', value);
      const result = await new RateLimiter().checkRateLimit(
        'login_attempts',
        'actor'
      );
      expect(result).toMatchObject({
        allowed: false,
        backendAvailable: true,
        retryAfter: 300,
        blockLevel: 0,
      });
      expect(redis.pipeline).not.toHaveBeenCalled();
    }
  );

  it.each([
    { level: 1, lastEscalation: now - 900 },
    JSON.stringify({ level: 1, lastEscalation: now - 900 }),
  ])('restores escalation object/legacy state %#', async value => {
    count = 4;
    values.set('rate_limit:login_attempts:actor:escalation', value);
    expect(
      await new RateLimiter().checkRateLimit('login_attempts', 'actor')
    ).toMatchObject({
      allowed: false,
      backendAvailable: true,
      retryAfter: 3600,
      blockLevel: 2,
    });
  });

  it('creates a block, rejects the next request with 429, and recovers after expiry', async () => {
    const middleware = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'actor',
    });
    const request = new NextRequest(
      'https://app.example.test/api/public/menus'
    );
    count = 101;
    const exceeded = await middleware(request);
    expect(exceeded).toMatchObject({ allowed: false });
    if (exceeded.allowed !== false) throw new Error('Expected rejection');
    expect(exceeded.response.status).toBe(429);
    const next = await middleware(request);
    expect(next).toMatchObject({ allowed: false });
    if (next.allowed !== false) throw new Error('Expected rejection');
    expect(next.response.status).toBe(429);
    expect(next.response.headers.get('Retry-After')).toBe('300');
    jest.mocked(Date.now).mockReturnValue((now + 301) * 1000);
    count = 1;
    expect(await middleware(request)).toMatchObject({ allowed: true });
    expect(values.has('rate_limit:api_calls:actor:block')).toBe(false);
  });

  it('keeps the largest accepted escalation level readable after repeated blocks', async () => {
    const level = Number.MAX_SAFE_INTEGER - 1;
    values.set('rate_limit:login_attempts:actor:escalation', {
      level,
      lastEscalation: now,
    });
    count = 4;
    const limiter = new RateLimiter();
    expect(
      await limiter.checkRateLimit('login_attempts', 'actor')
    ).toMatchObject({
      allowed: false,
      backendAvailable: true,
      blockLevel: level,
    });
    expect(
      await limiter.checkRateLimit('login_attempts', 'actor')
    ).toMatchObject({
      allowed: false,
      backendAvailable: true,
      blockLevel: level,
    });
    jest.mocked(Date.now).mockReturnValue((now + 86401) * 1000);
    expect(
      await limiter.checkRateLimit('login_attempts', 'actor')
    ).toMatchObject({
      allowed: false,
      backendAvailable: true,
      blockLevel: level,
    });
  });

  it.each([
    false,
    0,
    '',
    [],
    {},
    '{broken',
    'null',
    { ...block, level: -1 },
    { ...block, level: 0.5 },
    { ...block, unblockTime: 'tomorrow' },
    { ...block, unblockTime: Infinity },
    { ...block, unblockTime: now - 1 },
  ])('rejects corrupt block state as backend unavailable %#', async value => {
    values.set('rate_limit:api_calls:actor:block', value);
    const result = await new RateLimiter().checkRateLimit('api_calls', 'actor');
    expect(result.backendAvailable).toBe(false);
    expect(redis.pipeline).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it.each([
    false,
    0,
    '',
    {},
    [],
    '{broken',
    { level: -1, lastEscalation: now },
    { level: Number.MAX_SAFE_INTEGER, lastEscalation: now },
    { level: 1, lastEscalation: 'yesterday' },
  ])('rejects corrupt escalation state %#', async value => {
    count = 101;
    values.set('rate_limit:api_calls:actor:escalation', value);
    expect(
      (await new RateLimiter().checkRateLimit('api_calls', 'actor'))
        .backendAvailable
    ).toBe(false);
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('returns production 503 for corrupt state and for a Redis outage', async () => {
    values.set('rate_limit:api_calls:actor:block', '{}');
    const middleware = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'actor',
    });
    const request = new NextRequest(
      'https://app.example.test/api/public/menus'
    );
    for (const outage of [false, true]) {
      if (outage)
        jest
          .mocked(redis.get)
          .mockRejectedValue(new Error('Redis unavailable'));
      const result = await middleware(request);
      expect(result).toMatchObject({ allowed: false });
      if (result.allowed !== false) throw new Error('Expected rejection');
      expect(result.response.status).toBe(503);
    }
  });

  it('restores block state for admin statistics', async () => {
    values.set('rate_limit:api_calls:actor:block', block);
    expect(
      await rateLimiter.getRateLimitStats('api_calls', 'actor')
    ).toMatchObject({
      currentCount: 2,
      isBlocked: true,
      blockLevel: 0,
    });
  });

  it.each(['block', 'escalation'])(
    'rejects a stored JSON null decoded by the real SDK (%s)',
    async suffix => {
      const key = `rate_limit:api_calls:actor:${suffix}`;
      values.set(key, null);
      jest.mocked(redis.get).mockRestore();
      const storedNull = () =>
        new Response(
          JSON.stringify({ result: Buffer.from('null').toString('base64') })
        );
      if (suffix === 'block') {
        jest
          .mocked(global.fetch)
          .mockResolvedValueOnce(storedNull())
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([0, 1, 1, 1].map(result => ({ result })))
            )
          );
      } else {
        jest
          .mocked(global.fetch)
          .mockResolvedValueOnce(new Response(JSON.stringify({ result: null })))
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([0, 1, 101, 1].map(result => ({ result })))
            )
          )
          .mockResolvedValueOnce(storedNull());
      }
      expect(
        (await new RateLimiter().checkRateLimit('api_calls', 'actor'))
          .backendAvailable
      ).toBe(false);
      if (suffix === 'block') expect(redis.pipeline).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled();
    }
  );
});
