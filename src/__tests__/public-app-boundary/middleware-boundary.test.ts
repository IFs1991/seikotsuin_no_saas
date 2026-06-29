import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';
import { CSPConfig } from '@/lib/security/csp-config';

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  }),
}));

jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: {
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    getGradualRolloutCSP: jest.fn().mockReturnValue({
      csp: 'default-src self',
      cspReportOnly: null,
    }),
    getMobileUiuxCSP: jest.fn().mockReturnValue({
      csp: "default-src 'self'; script-src 'self' 'unsafe-eval' https://unpkg.com",
      cspReportOnly: null,
    }),
  },
}));

jest.mock('@/lib/rate-limiting/middleware', () => ({
  applyRateLimits: jest.fn().mockResolvedValue(null),
  getPathRateLimit: jest.fn().mockReturnValue([]),
}));

function createMockRequest(
  pathname: string,
  cookieHeader?: string
): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    method: 'GET',
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('Middleware Boundary: public/app route separation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('unauthenticated + /dashboard -> redirect to /login?redirectTo=/dashboard', async () => {
    const res = await middleware(createMockRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('redirectTo=%2Fdashboard');
  });

  it('unauthenticated + /mobile-uiux -> redirect to /login?redirectTo=/mobile-uiux', async () => {
    const res = await middleware(createMockRequest('/mobile-uiux'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('redirectTo=%2Fmobile-uiux');
  });

  it('/mobile-uiux receives the route-scoped mobile CSP', async () => {
    await middleware(
      createMockRequest('/mobile-uiux', 'sb-test-auth-token=session')
    );

    expect(CSPConfig.getMobileUiuxCSP).toHaveBeenCalled();
    expect(CSPConfig.getGradualRolloutCSP).not.toHaveBeenCalled();
  });

  it('/dashboard does not receive mobile CSP exceptions', async () => {
    await middleware(
      createMockRequest('/dashboard', 'sb-test-auth-token=session')
    );

    expect(CSPConfig.getGradualRolloutCSP).toHaveBeenCalled();
    expect(CSPConfig.getMobileUiuxCSP).not.toHaveBeenCalled();
  });

  it('unauthenticated + /admin -> redirect to /admin/login?redirectTo=/admin', async () => {
    const res = await middleware(createMockRequest('/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
    expect(res.headers.get('location')).toContain('redirectTo=%2Fadmin');
  });

  it('unauthenticated + /login -> no redirect (pass through)', async () => {
    const res = await middleware(createMockRequest('/login'));
    expect(res.status).not.toBe(307);
  });

  it('unauthenticated + / -> no redirect (pass through)', async () => {
    const res = await middleware(createMockRequest('/'));
    expect(res.status).not.toBe(307);
  });

  it('authenticated + / -> no redirect', async () => {
    const res = await middleware(
      createMockRequest('/', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /login -> no redirect', async () => {
    const res = await middleware(
      createMockRequest('/login', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /admin/login -> no redirect', async () => {
    const res = await middleware(
      createMockRequest('/admin/login', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /invite -> no redirect (stay)', async () => {
    const res = await middleware(
      createMockRequest('/invite', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /terms -> no redirect (stay)', async () => {
    const res = await middleware(
      createMockRequest('/terms', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /privacy -> no redirect (stay)', async () => {
    const res = await middleware(
      createMockRequest('/privacy', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });

  it('authenticated + /unauthorized -> no redirect (stay)', async () => {
    const res = await middleware(
      createMockRequest('/unauthorized', 'sb-test-auth-token=session')
    );
    expect(res.status).not.toBe(307);
  });
});
