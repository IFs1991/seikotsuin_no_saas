import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

// Supabase SSRのモック
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

// CSPモック
jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: {
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    getGradualRolloutCSP: jest.fn().mockReturnValue({
      csp: 'default-src self',
      cspReportOnly: null,
    }),
  },
}));

// レート制限モック
jest.mock('@/lib/rate-limiting/middleware', () => ({
  applyRateLimits: jest.fn().mockResolvedValue(null),
  getPathRateLimit: jest.fn().mockReturnValue([]),
}));

describe('Middleware', () => {
  function createMockRequest(pathname: string): NextRequest {
    const url = new URL(`http://localhost:3000${pathname}`);
    const request = new NextRequest(url, {
      method: 'GET',
    });
    return request;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle Supabase client creation correctly', async () => {
    const request = createMockRequest('/admin');
    const result = await middleware(request);

    // middleware が正常に実行されることを確認
    expect(result).toBeDefined();
  });

  it('should redirect unauthenticated users from admin routes', async () => {
    const request = createMockRequest('/admin/dashboard');
    const result = await middleware(request);

    // リダイレクトが発生することを確認
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('/admin/login');
  });

  it('should allow public routes without authentication', async () => {
    const request = createMockRequest('/admin/login');
    const result = await middleware(request);

    // 公開ルートはリダイレクトなし
    expect(result.status).not.toBe(307);
  });
});
