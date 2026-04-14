import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';

jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: {
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    getGradualRolloutCSP: jest.fn().mockReturnValue({
      csp: 'default-src self',
      cspReportOnly: null,
    }),
  },
}));

jest.mock('@/lib/rate-limiting/middleware', () => ({
  applyRateLimits: jest.fn().mockResolvedValue(null),
  getPathRateLimit: jest.fn().mockReturnValue([]),
}));

function createMockRequest(pathname: string, cookieHeader?: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    method: 'GET',
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('Middleware Boundary: public/app route separation', () => {
  it('unauthenticated + /dashboard -> redirect to /login?redirectTo=/dashboard', async () => {
    const res = await middleware(createMockRequest('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('redirectTo=%2Fdashboard');
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
