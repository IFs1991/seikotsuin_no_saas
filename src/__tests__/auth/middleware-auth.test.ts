/**
 * @file middleware-auth.test.ts
 * @description 薄い認証 middleware の回帰テスト
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const mockSupabaseGetUser = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser,
    },
  })),
}));

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

import { middleware } from '../../../middleware';

const createServerClientMock = createServerClient as jest.Mock;

describe('認証と権限制御 Middleware', () => {
  const originalEnv = process.env;

  function createMockRequest(
    pathname: string,
    cookieHeader?: string
  ): NextRequest {
    return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
      method: 'GET',
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: mockSupabaseGetUser,
      },
    });
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_PILOT_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('未認証ユーザーのアクセス制御', () => {
    const protectedRoutes = [
      '/dashboard',
      '/manager',
      '/reservations',
      '/daily-reports',
      '/chat',
      '/ai-insights',
      '/multi-store',
      '/master-data',
      '/staff',
      '/patients',
      '/revenue',
    ];

    test.each(protectedRoutes)(
      '未認証で %s にアクセスすると /login にリダイレクト',
      async route => {
        const response = await middleware(createMockRequest(route));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/login');
        expect(response.headers.get('location')).toContain(
          `redirectTo=${encodeURIComponent(route)}`
        );
      }
    );

    test.each(['/admin', '/admin/settings', '/admin/security-dashboard'])(
      '未認証で %s にアクセスすると /admin/login にリダイレクト',
      async route => {
        const response = await middleware(createMockRequest(route));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/admin/login');
        expect(response.headers.get('location')).toContain(
          `redirectTo=${encodeURIComponent(route)}`
        );
      }
    );

    test.each(['/admin/login', '/admin/callback', '/login', '/invite'])(
      '未認証でも %s は通過する',
      async route => {
        const response = await middleware(createMockRequest(route));

        expect(response.status).not.toBe(307);
      }
    );
  });

  describe('認証 cookie がある場合の挙動', () => {
    test.each(['/dashboard', '/admin/settings', '/multi-store'])(
      '認証 cookie と検証済みセッションがあると %s は middleware で通過する',
      async route => {
        const response = await middleware(
          createMockRequest(route, 'sb-test-auth-token=session')
        );

        expect(response.status).not.toBe(307);
      }
    );

    test('認証 cookie があっても Supabase 検証に失敗すると /login にリダイレクト', async () => {
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const response = await middleware(
        createMockRequest('/dashboard', 'sb-test-auth-token=invalid')
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
    });

    test('chunked な Supabase auth cookie でも通過する', async () => {
      const response = await middleware(
        createMockRequest('/dashboard', 'sb-test-auth-token.0=session-fragment')
      );

      expect(response.status).not.toBe(307);
    });

    test.each(['/', '/login', '/admin/login', '/register', '/invite'])(
      '認証 cookie があっても %s では public redirect をしない',
      async route => {
        const response = await middleware(
          createMockRequest(route, 'sb-test-auth-token=session')
        );

        expect(response.status).not.toBe(307);
      }
    );
  });

  describe('パイロット対象外ルートの保護', () => {
    const pilotBlockedRoutes = [
      '/chat',
      '/ai-insights',
      '/admin/security-dashboard',
      '/admin/security-monitor',
      '/admin/beta-monitoring',
      '/admin/session-management',
      '/admin/master',
      '/admin/chat',
      '/blocks',
      '/master-data',
    ];

    test.each(pilotBlockedRoutes)(
      'NEXT_PUBLIC_PILOT_MODE=true のとき %s は /dashboard にリダイレクト',
      async route => {
        process.env.NEXT_PUBLIC_PILOT_MODE = 'true';

        const response = await middleware(
          createMockRequest(route, 'sb-test-auth-token=session')
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
          'http://localhost:3000/dashboard'
        );
      }
    );

    test('NEXT_PUBLIC_PILOT_MODE=false のとき protected route は通常どおり通過する', async () => {
      process.env.NEXT_PUBLIC_PILOT_MODE = 'false';

      const response = await middleware(
        createMockRequest('/admin/settings', 'sb-test-auth-token=session')
      );

      expect(response.status).not.toBe(307);
    });
  });
});
