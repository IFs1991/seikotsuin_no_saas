import {
  adminApiWriteRateLimit,
  adminSecurityReadRateLimit,
  adminSecurityWriteRateLimit,
  apiRateLimit,
  authenticatedApiWriteRateLimit,
  getPathRateLimit,
  loginRateLimit,
  mobileUiuxReadRateLimit,
  mobileUiuxWriteRateLimit,
  mfaRateLimit,
  sessionCreationRateLimit,
} from '@/lib/rate-limiting/middleware';
import {
  rateLimiter,
  RATE_LIMIT_CONFIG,
} from '@/lib/rate-limiting/rate-limiter';
import { NextRequest } from 'next/server';

describe('getPathRateLimit', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalUpstashUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    }
    if (originalUpstashToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    }
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
    if (originalSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    }
  });

  it('applies public API rate limits only to public endpoints', () => {
    expect(getPathRateLimit('/api/public/reservations')).toEqual([
      apiRateLimit,
    ]);
    expect(getPathRateLimit('/api/public/menus')).toEqual([apiRateLimit]);
    expect(getPathRateLimit('/api/admin/dashboard')).toEqual([]);
    expect(getPathRateLimit('/api/health')).toEqual([]);
  });

  it('applies mobile UIUX read and write rate limits by method', () => {
    expect(getPathRateLimit('/api/mobile-uiux/home', 'GET')).toEqual([
      mobileUiuxReadRateLimit,
    ]);
    expect(getPathRateLimit('/api/mobile-uiux/reservations', 'POST')).toEqual([
      mobileUiuxWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/mobile-uiux/settings', 'PUT')).toEqual([
      mobileUiuxWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/mobile-uiux/reservations', 'PATCH')).toEqual([
      mobileUiuxWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/mobile-uiux', 'GET')).toEqual([]);
    expect(getPathRateLimit('/api/health', 'GET')).toEqual([]);
  });

  it('applies auth entry point rate limits to login and signup surfaces only', () => {
    expect(getPathRateLimit('/login')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/admin/login')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/register')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/invite')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/forgot-password')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/reset-password/admin')).toEqual([loginRateLimit]);
    expect(getPathRateLimit('/reset-password/clinic')).toEqual([
      loginRateLimit,
    ]);
    expect(getPathRateLimit('/api/auth/profile')).toEqual([]);
  });

  it('applies session and MFA rate limits to dedicated security endpoints only', () => {
    expect(getPathRateLimit('/api/admin/security/sessions')).toEqual([
      sessionCreationRateLimit,
    ]);
    expect(getPathRateLimit('/api/admin/security/sessions/terminate')).toEqual([
      sessionCreationRateLimit,
    ]);
    expect(getPathRateLimit('/api/mfa/verify')).toEqual([mfaRateLimit]);
    expect(getPathRateLimit('/api/mfa/setup/initiate')).toEqual([mfaRateLimit]);
  });

  it('applies admin security read and write rate limits without replacing session limits', () => {
    expect(getPathRateLimit('/api/admin/security/events', 'GET')).toEqual([
      adminSecurityReadRateLimit,
    ]);
    expect(getPathRateLimit('/api/admin/security/csp-stats', 'GET')).toEqual([
      adminSecurityReadRateLimit,
    ]);
    expect(
      getPathRateLimit('/api/admin/security/csp-violations', 'PATCH')
    ).toEqual([adminSecurityWriteRateLimit]);
    expect(getPathRateLimit('/api/admin/security/sessions', 'GET')).toEqual([
      sessionCreationRateLimit,
    ]);
    expect(
      getPathRateLimit('/api/internal/process-email-outbox', 'POST')
    ).toEqual([]);
    expect(getPathRateLimit('/api/health', 'GET')).toEqual([]);
  });

  it('rate limits authenticated and admin API mutations while excluding machine endpoints', () => {
    expect(getPathRateLimit('/api/reservations', 'POST')).toEqual([
      authenticatedApiWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/patients/patient-1', 'DELETE')).toEqual([
      authenticatedApiWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/admin/users', 'POST')).toEqual([
      adminApiWriteRateLimit,
    ]);
    expect(getPathRateLimit('/api/public/reservations', 'POST')).toEqual([
      apiRateLimit,
    ]);
    expect(
      getPathRateLimit('/api/internal/process-line-outbox', 'POST')
    ).toEqual([]);
    expect(getPathRateLimit('/api/webhooks/resend', 'POST')).toEqual([]);
    expect(getPathRateLimit('/api/stripe/webhook', 'POST')).toEqual([]);
  });

  it('login attempts are limited to 3 with at least a 5 minute initial block', () => {
    expect(RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS.MAX_ATTEMPTS).toBe(3);
    expect(
      RATE_LIMIT_CONFIG.LOGIN_ATTEMPTS.BLOCK_DURATION[0]
    ).toBeGreaterThanOrEqual(300);
  });

  it('keeps mobile UIUX write limit stricter than read limit', () => {
    expect(RATE_LIMIT_CONFIG.MOBILE_UIUX_READ.WINDOW).toBe(60);
    expect(RATE_LIMIT_CONFIG.MOBILE_UIUX_READ.MAX_CALLS).toBe(60);
    expect(RATE_LIMIT_CONFIG.MOBILE_UIUX_WRITE.WINDOW).toBe(60);
    expect(RATE_LIMIT_CONFIG.MOBILE_UIUX_WRITE.MAX_CALLS).toBe(10);
    expect(RATE_LIMIT_CONFIG.MOBILE_UIUX_WRITE.MAX_CALLS).toBeLessThan(
      RATE_LIMIT_CONFIG.MOBILE_UIUX_READ.MAX_CALLS
    );
  });

  it('returns 429 with Retry-After when mobile UIUX read limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    jest.spyOn(rateLimiter, 'isWhitelisted').mockResolvedValue(false);
    const checkRateLimit = jest
      .spyOn(rateLimiter, 'checkRateLimit')
      .mockResolvedValue({
        allowed: false,
        backendAvailable: true,
        limit: RATE_LIMIT_CONFIG.MOBILE_UIUX_READ.MAX_CALLS,
        remaining: 0,
        resetTime: 1_756_800_000,
        retryAfter: 42,
      });

    const response = await mobileUiuxReadRateLimit(
      new NextRequest('http://localhost/api/mobile-uiux/home', {
        method: 'GET',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      })
    );

    expect(checkRateLimit).toHaveBeenCalledWith(
      'mobile_uiux_read',
      'ip:203.0.113.10'
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('42');
  });

  it('returns 429 with Retry-After when mobile UIUX write limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    jest.spyOn(rateLimiter, 'isWhitelisted').mockResolvedValue(false);
    const checkRateLimit = jest
      .spyOn(rateLimiter, 'checkRateLimit')
      .mockResolvedValue({
        allowed: false,
        backendAvailable: true,
        limit: RATE_LIMIT_CONFIG.MOBILE_UIUX_WRITE.MAX_CALLS,
        remaining: 0,
        resetTime: 1_756_800_000,
        retryAfter: 30,
      });

    const response = await mobileUiuxWriteRateLimit(
      new NextRequest('http://localhost/api/mobile-uiux/reservations', {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': '203.0.113.20' },
      })
    );

    expect(checkRateLimit).toHaveBeenCalledWith(
      'mobile_uiux_write',
      'ip:203.0.113.20'
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('30');
  });

  it('uses user and clinic identifiers for admin security rate-limit keys when available', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    jest.spyOn(rateLimiter, 'isWhitelisted').mockResolvedValue(false);
    const checkRateLimit = jest
      .spyOn(rateLimiter, 'checkRateLimit')
      .mockResolvedValue({
        allowed: true,
        backendAvailable: true,
        limit: 30,
        remaining: 29,
        resetTime: 1_756_800_000,
      });

    const response = await adminSecurityReadRateLimit(
      new NextRequest(
        'http://localhost/api/admin/security/events?clinic_id=clinic-1',
        {
          method: 'GET',
          headers: { cookie: 'sb-access-token=test-token' },
        }
      )
    );

    expect(checkRateLimit).toHaveBeenCalledWith(
      'api_calls',
      expect.stringMatching(/^(user:[^:]+|ip:127\.0\.0\.1):clinic:clinic-1$/),
      {
        window: 60,
        limit: 30,
      }
    );
    expect(response?.headers.get('X-RateLimit-Remaining')).toBe('29');
  });

  it('fails closed in production when the rate limit backend is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const response = await mfaRateLimit(
      new NextRequest('http://localhost/api/mfa/verify', {
        method: 'POST',
      })
    );

    expect(response?.status).toBe(503);
  });

  it('fails closed in production when Redis is configured but unavailable', async () => {
    process.env.NODE_ENV = 'production';
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    jest.spyOn(rateLimiter, 'isWhitelisted').mockResolvedValue(false);
    jest.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue({
      allowed: true,
      backendAvailable: false,
      limit: 30,
      remaining: 30,
      resetTime: 1_756_800_000,
    });

    const response = await authenticatedApiWriteRateLimit(
      new NextRequest('http://localhost/api/reservations', {
        method: 'POST',
      })
    );

    expect(response?.status).toBe(503);
  });
});
