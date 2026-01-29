/**
 * @file middleware-auth.test.ts
 * @description 認証と権限制御のmiddlewareテスト
 * @spec docs/認証と権限制御_MVP仕様書.md
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Supabase SSRのモック
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

// CSPモックを設定
jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: {
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    getGradualRolloutCSP: jest.fn().mockReturnValue({
      csp: 'default-src self',
      cspReportOnly: null,
    }),
  },
}));

// レート制限モックを設定
jest.mock('@/lib/rate-limiting/middleware', () => ({
  applyRateLimits: jest.fn().mockResolvedValue(null),
  getPathRateLimit: jest.fn().mockReturnValue([]),
}));

// middlewareをインポート（モック後）
import { middleware } from '../../../middleware';

describe('認証と権限制御 Middleware', () => {
  const mockCreateServerClient = createServerClient as jest.MockedFunction<
    typeof createServerClient
  >;

  function createMockRequest(pathname: string): NextRequest {
    const url = new URL(`http://localhost:3000${pathname}`);
    const request = new NextRequest(url, {
      method: 'GET',
    });
    return request;
  }

  /**
   * Create mock Supabase client that handles both user_permissions and profiles queries
   * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md - user_permissions is single source of truth
   */
  function createMockSupabase(
    user: any,
    profile: any,
    userPermissions: any = null
  ) {
    // If userPermissions is not provided, derive from profile for backward compatibility
    const permissions =
      userPermissions ??
      (profile ? { role: profile.role, clinic_id: profile.clinic_id } : null);

    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_permissions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: permissions,
                  error: permissions ? null : { code: 'PGRST116' },
                }),
              }),
            }),
          };
        }
        // profiles table
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: profile,
                error: profile ? null : { code: 'PGRST116' },
              }),
            }),
          }),
        };
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('未認証ユーザーのアクセス制御', () => {
    beforeEach(() => {
      // 未認証状態をモック
      mockCreateServerClient.mockReturnValue(
        createMockSupabase(null, null) as any
      );
    });

    describe('保護対象ルートへのアクセス', () => {
      const protectedRoutes = [
        '/dashboard',
        '/reservations',
        '/daily-reports',
        '/chat',
        '/ai-insights',
        '/master-data',
        '/staff',
        '/patients',
        '/revenue',
      ];

      test.each(protectedRoutes)(
        '未認証で %s にアクセスすると /login にリダイレクト',
        async route => {
          const request = createMockRequest(route);
          const response = await middleware(request);

          expect(response.status).toBe(307);
          const location = response.headers.get('location');
          expect(location).toContain('/login');
          expect(location).toContain(`redirectTo=${encodeURIComponent(route)}`);
        }
      );
    });

    describe('Admin保護ルートへのアクセス', () => {
      const adminRoutes = [
        '/admin',
        '/admin/settings',
        '/admin/security-dashboard',
      ];

      test.each(adminRoutes)(
        '未認証で %s にアクセスすると /admin/login にリダイレクト',
        async route => {
          const request = createMockRequest(route);
          const response = await middleware(request);

          expect(response.status).toBe(307);
          const location = response.headers.get('location');
          expect(location).toContain('/admin/login');
        }
      );
    });

    describe('公開ルートへのアクセス', () => {
      const publicRoutes = [
        '/admin/login',
        '/admin/callback',
        '/login',
        '/invite',
      ];

      test.each(publicRoutes)('未認証でも %s にアクセス可能', async route => {
        const request = createMockRequest(route);
        const response = await middleware(request);

        // リダイレクトではなく通過
        expect(response.status).not.toBe(307);
      });
    });
  });

  describe('院ユーザーのアクセス制御', () => {
    const clinicUser = { id: 'user-123', email: 'staff@clinic.com' };
    const clinicProfile = {
      role: 'staff',
      clinic_id: 'clinic-123',
      is_active: true,
    };

    beforeEach(() => {
      mockCreateServerClient.mockReturnValue(
        createMockSupabase(clinicUser, clinicProfile) as any
      );
    });

    test('院ユーザーは /admin/** にアクセスできない', async () => {
      const request = createMockRequest('/admin/settings');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/unauthorized');
    });

    test('院ユーザーは保護対象ルートにアクセス可能', async () => {
      const routes = ['/dashboard', '/reservations', '/daily-reports'];

      for (const route of routes) {
        mockCreateServerClient.mockReturnValue(
          createMockSupabase(clinicUser, clinicProfile) as any
        );
        const request = createMockRequest(route);
        const response = await middleware(request);

        // リダイレクトではなく通過
        expect(response.status).not.toBe(307);
      }
    });
  });

  describe('Admin UIアクセス制御', () => {
    /**
     * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
     * ADMIN_UI_ROLES = ['admin', 'clinic_admin'] can access /admin/**
     */
    const adminUIRoles = ['admin', 'clinic_admin'];

    test.each(adminUIRoles)(
      'ADMIN_UI_ROLES (%s) は /admin/** にアクセス可能',
      async role => {
        const adminUser = { id: 'admin-user-123', email: 'admin@example.com' };
        const adminProfile = {
          role,
          clinic_id: role === 'admin' ? null : 'clinic-123',
          is_active: true,
        };

        mockCreateServerClient.mockReturnValue(
          createMockSupabase(adminUser, adminProfile) as any
        );

        const request = createMockRequest('/admin/settings');
        const response = await middleware(request);

        // リダイレクトではなく通過
        expect(response.status).not.toBe(307);
      }
    );

    /**
     * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
     * manager role should NOT be able to access /admin/** (only ADMIN_UI_ROLES)
     */
    test('manager ロールは /admin/** にアクセスできない', async () => {
      const managerUser = {
        id: 'manager-user-123',
        email: 'manager@example.com',
      };
      const managerProfile = {
        role: 'manager',
        clinic_id: 'clinic-123',
        is_active: true,
      };

      mockCreateServerClient.mockReturnValue(
        createMockSupabase(managerUser, managerProfile) as any
      );

      const request = createMockRequest('/admin/settings');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/unauthorized');
    });

    /**
     * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
     * clinic_manager is deprecated but temporarily mapped to clinic_admin via canAccessAdminUIWithCompat
     * This allows clinic_manager to access /admin/** until Phase 3 migration is complete.
     */
    test('非推奨の clinic_manager ロールは互換モードにより /admin/** にアクセス可能（Option B-1）', async () => {
      const deprecatedUser = {
        id: 'deprecated-user-123',
        email: 'deprecated@example.com',
      };
      const deprecatedProfile = {
        role: 'clinic_manager',
        clinic_id: 'clinic-123',
        is_active: true,
      };

      mockCreateServerClient.mockReturnValue(
        createMockSupabase(deprecatedUser, deprecatedProfile) as any
      );

      const request = createMockRequest('/admin/settings');
      const response = await middleware(request);

      // Option B-1: clinic_manager は clinic_admin にマッピングされるため、アクセス可能
      expect(response.status).not.toBe(307);
    });
  });

  describe('無効化アカウントのアクセス制御', () => {
    test('is_active=false のユーザーは拒否される', async () => {
      const user = { id: 'inactive-user', email: 'inactive@example.com' };
      const inactiveProfile = {
        role: 'admin',
        clinic_id: null,
        is_active: false,
      };

      mockCreateServerClient.mockReturnValue(
        createMockSupabase(user, inactiveProfile) as any
      );

      const request = createMockRequest('/admin/settings');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/unauthorized');
    });
  });
});
