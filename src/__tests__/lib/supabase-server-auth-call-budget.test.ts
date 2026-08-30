function createAccessToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, app_metadata: {} })
  ).toString('base64url');
  return `test-header.${payload}.test-signature`;
}

describe('server auth call budget', () => {
  afterEach(() => {
    jest.dontMock('@supabase/ssr');
    jest.dontMock('next/headers');
    jest.dontMock('next/navigation');
    jest.dontMock('next/server');
    jest.dontMock('@/lib/env');
    jest.dontMock('@/lib/audit-logger');
    jest.dontMock('@/app/(app)/app-shell');
  });

  it('App Layout and the API clinic guard each resolve the subject once', async () => {
    jest.resetModules();
    jest.dontMock('@/lib/audit-logger');
    const afterCallbacks: Array<() => void> = [];

    const user = {
      id: 'user-1',
      email: 'staff@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-31T00:00:00.000Z',
    };
    const getUser = jest.fn().mockResolvedValue({
      data: { user },
      error: null,
    });
    const getSession = jest.fn().mockResolvedValue({
      data: {
        session: {
          user,
          access_token: createAccessToken(user.id),
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      },
      error: null,
    });
    const profileMaybeSingle = jest.fn().mockResolvedValue({
      data: { is_active: true },
      error: null,
    });
    const profileQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: profileMaybeSingle,
    };
    const sessionClient = {
      auth: { getUser, getSession },
      from: jest.fn((table: string) => {
        if (table === 'profiles') {
          return profileQuery;
        }
        throw new Error(`Unexpected session table: ${table}`);
      }),
    };

    const permissionsMaybeSingle = jest.fn().mockResolvedValue({
      data: { role: 'staff', clinic_id: 'clinic-1' },
      error: null,
    });
    const permissionsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: permissionsMaybeSingle,
    };
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionsQuery;
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    jest.doMock('@supabase/ssr', () => ({
      createServerClient: jest.fn((_url: string, key: string) =>
        key === 'mock-service-role-key' ? adminClient : sessionClient
      ),
    }));
    jest.doMock('next/headers', () => ({
      cookies: jest.fn(async () => ({
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
      })),
    }));
    jest.doMock('next/navigation', () => ({
      redirect: jest.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
      }),
    }));
    jest.doMock('next/server', () => ({
      ...jest.requireActual<typeof import('next/server')>('next/server'),
      after: jest.fn((callback: () => void) => {
        afterCallbacks.push(callback);
      }),
    }));
    jest.doMock('@/lib/env', () => ({
      assertEnv: jest.fn((name: string) => {
        const values: Record<string, string> = {
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
        };
        return values[name] ?? '';
      }),
    }));
    jest.doMock('@/app/(app)/app-shell', () => ({
      AppShell: ({ children }: { children: unknown }) => children,
    }));

    const server = await import('@/lib/supabase/server');
    server.setSupabaseClientFactory(async () => sessionClient);
    const AppLayout = (await import('@/app/(app)/layout')).default;

    try {
      await AppLayout({ children: null });

      expect(getUser).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(permissionsMaybeSingle).toHaveBeenCalledTimes(1);
      expect(profileMaybeSingle).toHaveBeenCalledTimes(1);

      getUser.mockClear();
      getSession.mockClear();
      permissionsMaybeSingle.mockClear();
      profileMaybeSingle.mockClear();

      const { processApiRequest } = await import('@/lib/api-helpers');
      const {
        AuditLogger,
        resetAuditLoggerDependencies,
        setAuditLoggerDependencies,
      } = await import('@/lib/audit-logger');
      const { NextRequest } = await import('next/server');
      setAuditLoggerDependencies({
        persistAuditLog: jest.fn().mockResolvedValue(undefined),
      });
      const processResult = await processApiRequest(
        new NextRequest('http://localhost/api/call-budget'),
        { clinicId: 'clinic-1' }
      );

      expect(processResult.success).toBe(true);
      expect(getUser).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(permissionsMaybeSingle).toHaveBeenCalledTimes(1);
      expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
      expect(afterCallbacks).toHaveLength(1);

      await AuditLogger.logDataAccess(
        user.id,
        user.email,
        'patients',
        'patient-sensitive-id',
        'clinic-1'
      );

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      afterCallbacks[0]();

      expect(logSpy).toHaveBeenCalledWith(
        '[perf]',
        'api_request',
        expect.objectContaining({
          auth_user: expect.any(Number),
          auth_session: expect.any(Number),
          permissions: expect.any(Number),
          profile: expect.any(Number),
          clinic_scope: expect.any(Number),
          business: expect.any(Number),
          audit: expect.any(Number),
          total: expect.any(Number),
        })
      );
      const serializedTiming = JSON.stringify(logSpy.mock.calls);
      expect(serializedTiming).not.toContain(user.id);
      expect(serializedTiming).not.toContain('clinic-1');
      expect(serializedTiming).not.toContain('patient-sensitive-id');
      expect(serializedTiming).not.toContain('test-refresh-token');
      logSpy.mockRestore();
      resetAuditLoggerDependencies();
    } finally {
      server.resetSupabaseClientFactory();
    }
  });
});
