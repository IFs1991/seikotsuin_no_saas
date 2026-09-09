import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  applyRateLimits,
  createRateLimitMiddleware,
} from '@/lib/rate-limiting/middleware';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';
import * as rateLimitMiddleware from '@/lib/rate-limiting/middleware';
import { middleware } from '../../../../middleware';

jest.mock('@/lib/rate-limiting/middleware', () => {
  const actual: typeof import('@/lib/rate-limiting/middleware') =
    jest.requireActual('@/lib/rate-limiting/middleware');
  return { ...actual, getPathRateLimit: jest.fn(actual.getPathRateLimit) };
});

jest.mock('@/lib/monitoring/sentry', () => ({
  captureOperationalError: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  logger: { error: jest.fn(), warn: jest.fn() },
}));

describe('AUDIT-V2:F04 limiter composition and root middleware', () => {
  const originalEnv = process.env;
  const allowed = {
    allowed: true,
    backendAvailable: true,
    limit: 100,
    remaining: 99,
    resetTime: 1_800_000_060,
  };
  const request = new NextRequest('https://app.example.test/api/public/menus');

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'test',
      CSP_ROLLOUT_PHASE: 'full-enforce',
    };
    jest.spyOn(rateLimiter, 'isWhitelisted').mockResolvedValue(false);
    jest.spyOn(rateLimiter, 'checkRateLimit').mockResolvedValue(allowed);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('runs the second limiter after the first allows and returns its rejection', async () => {
    const denied = new NextResponse('second limiter', { status: 429 });
    const first = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'first',
    });
    const second = createRateLimitMiddleware({
      type: 'mfa_attempts',
      keyGenerator: () => 'second',
      onLimitExceeded: () => denied,
    });
    jest
      .mocked(rateLimiter.checkRateLimit)
      .mockResolvedValueOnce(allowed)
      .mockResolvedValueOnce({ ...allowed, allowed: false, remaining: 0 });
    const result = await applyRateLimits(request, [first, second]);
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ allowed: false, response: denied });
  });

  it('returns only handoff headers on all-allowed and empty chains', async () => {
    const first = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'first',
    });
    const second = createRateLimitMiddleware({
      type: 'mfa_attempts',
      keyGenerator: () => 'second',
    });
    const result = await applyRateLimits(request, [first, second]);
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ allowed: true });
    if (!result || !result.allowed) throw new Error('Expected allowance');
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(result.headers.has('x-middleware-next')).toBe(false);
    expect(await applyRateLimits(request, [])).toMatchObject({ allowed: true });
  });

  it('continues past skip and whitelist without consuming those budgets', async () => {
    const skip = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'skip',
      skipIf: () => true,
    });
    const whitelist = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'whitelisted',
    });
    const checked = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'checked',
    });
    jest
      .mocked(rateLimiter.isWhitelisted)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect(
      await applyRateLimits(request, [skip, whitelist, checked])
    ).toMatchObject({ allowed: true });
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith(
      'api_calls',
      'checked'
    );
  });

  it.each(['missing', 'unavailable', 'throws'])(
    'fails closed with %s backend',
    async mode => {
      if (mode === 'missing') delete process.env.UPSTASH_REDIS_REST_TOKEN;
      if (mode === 'unavailable')
        jest
          .mocked(rateLimiter.checkRateLimit)
          .mockResolvedValue({ ...allowed, backendAvailable: false });
      if (mode === 'throws')
        jest
          .mocked(rateLimiter.checkRateLimit)
          .mockRejectedValue(new Error('unavailable'));
      const first = createRateLimitMiddleware({
        type: 'api_calls',
        keyGenerator: () => 'first',
      });
      const second = jest.fn(first);
      const result = await applyRateLimits(request, [first, second]);
      expect(result).toMatchObject({ allowed: false });
      if (result.allowed !== false) throw new Error('Expected rejection');
      expect(result.response.status).toBe(503);
      expect(second).not.toHaveBeenCalled();
    }
  );

  it('preserves rate headers and CSP after allowance through the root entry', async () => {
    const response = await middleware(request);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'script-src'
    );
    expect(response.headers.get('x-nonce')).toBeTruthy();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    '/register',
    '/forgot-password',
    '/api/reservations',
    '/api/admin/users',
  ])('continues with CSP and rate headers on allowed POST %s', async path => {
    const response = await middleware(
      new NextRequest(`https://app.example.test${path}`, { method: 'POST' })
    );
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'script-src'
    );
  });

  it('preserves 429 and Retry-After on the public API root path', async () => {
    jest.mocked(rateLimiter.checkRateLimit).mockResolvedValue({
      ...allowed,
      allowed: false,
      remaining: 0,
      retryAfter: 42,
    });
    const response = await middleware(request);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
  });

  it('does not replace refreshed authentication cookies on protected routes', async () => {
    // Exercise the root handoff with a protected route as well as actual path routing above.
    const limiter = createRateLimitMiddleware({
      type: 'api_calls',
      keyGenerator: () => 'actor',
    });
    jest
      .mocked(rateLimitMiddleware.getPathRateLimit)
      .mockReturnValueOnce([limiter]);
    const getUser = jest.fn(async () => ({
      data: { user: { id: 'actor' } },
      error: null,
    }));
    jest
      .mocked(createServerClient)
      .mockImplementation((_url, _key, options) => {
        if (options.cookies && 'setAll' in options.cookies) {
          options.cookies.setAll?.([
            {
              name: 'sb-test-auth-token',
              value: 'refreshed',
              options: { httpOnly: true },
            },
          ]);
        }
        return { auth: { getUser } };
      });
    const response = await middleware(
      new NextRequest('https://app.example.test/dashboard', {
        headers: { cookie: 'sb-test-auth-token=old' },
      })
    );
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(rateLimiter.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'script-src'
    );
  });
});
