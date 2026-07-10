import { createAdminClient } from '@/lib/supabase';

const redisPingMock = jest.fn();

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    ping: () => redisPingMock(),
  })),
}));

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
  };
});

const createAdminClientMock = createAdminClient as jest.Mock;

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createHealthQuery(result: Promise<QueryResult> | QueryResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };

  query.limit.mockImplementation(() => Promise.resolve(result));

  return query;
}

describe('GET /api/health', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env = { ...originalEnv };
    redisPingMock.mockResolvedValue('PONG');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 200 with connected database when Supabase is healthy', async () => {
    const query = createHealthQuery({
      data: [{ id: 'clinic-1' }],
      error: null,
    });

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
    expect(body.checks).toEqual({
      configuration: 'valid',
      database: 'connected',
      rateLimiter: 'not_required',
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns 503 with disconnected database when Supabase returns an error', async () => {
    const query = createHealthQuery({
      data: null,
      error: { message: 'connection failed' },
    });

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('not_ready');
    expect(body.database).toBe('disconnected');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns 503 with disconnected database when the query exceeds 5 seconds', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: TimerHandler
    ) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const delayedResult = new Promise<QueryResult>(() => {});

    const query = createHealthQuery(delayedResult);

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('not_ready');
    expect(body.database).toBe('disconnected');
    expect(body.timestamp).toEqual(expect.any(String));

    setTimeoutSpy.mockRestore();
  });

  it('checks the Redis rate-limit backend for production readiness', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
      UPSTASH_REDIS_REST_TOKEN: 'redis-token',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-key',
      TURNSTILE_SECRET_KEY: 'turnstile-secret-key',
      TURNSTILE_BYPASS_NON_PRODUCTION: 'false',
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM_DEFAULT: 'App <no-reply@example.com>',
      RESEND_WEBHOOK_SECRET: 'resend-webhook-secret',
      CRON_SECRET: 'cron-secret',
      ENABLE_BILLING: 'false',
      NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'false',
    };
    const query = createHealthQuery({
      data: [{ id: 'clinic-1' }],
      error: null,
    });
    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(redisPingMock).toHaveBeenCalledTimes(1);
    expect(body.checks.rateLimiter).toBe('connected');
  });

  it('returns 503 when the production Redis readiness check fails', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
      UPSTASH_REDIS_REST_TOKEN: 'redis-token',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-key',
      TURNSTILE_SECRET_KEY: 'turnstile-secret-key',
      TURNSTILE_BYPASS_NON_PRODUCTION: 'false',
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM_DEFAULT: 'App <no-reply@example.com>',
      RESEND_WEBHOOK_SECRET: 'resend-webhook-secret',
      CRON_SECRET: 'cron-secret',
      ENABLE_BILLING: 'false',
      NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'false',
    };
    const query = createHealthQuery({
      data: [{ id: 'clinic-1' }],
      error: null,
    });
    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });
    redisPingMock.mockRejectedValue(new Error('redis unavailable'));

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.rateLimiter).toBe('disconnected');
  });

  it('reports dependencies as not checked when production configuration is invalid', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
      UPSTASH_REDIS_REST_TOKEN: '',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-key',
      TURNSTILE_SECRET_KEY: 'turnstile-secret-key',
      TURNSTILE_BYPASS_NON_PRODUCTION: 'false',
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM_DEFAULT: 'App <no-reply@example.com>',
      RESEND_WEBHOOK_SECRET: 'resend-webhook-secret',
      CRON_SECRET: 'cron-secret',
      ENABLE_BILLING: 'false',
      NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'false',
    };

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(redisPingMock).not.toHaveBeenCalled();
    expect(body.database).toBe('not_checked');
    expect(body.checks).toEqual({
      configuration: 'invalid',
      database: 'not_checked',
      rateLimiter: 'not_checked',
    });
  });
});
