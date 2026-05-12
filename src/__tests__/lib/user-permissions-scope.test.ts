type UserPermissionsRow = {
  role: string;
  clinic_id: string | null;
};

type ClinicScopeRow = {
  id: string;
  parent_id: string | null;
};

function createUserPermissionsQuery(row: UserPermissionsRow) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  };
}

function createClinicsQuery(
  rows: ClinicScopeRow[],
  error: Error | null = null
) {
  return {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    returns: jest.fn().mockResolvedValue({ data: rows, error }),
  };
}

function createSessionClient(
  userId: string,
  clinicScopeIds: readonly string[],
  role = 'admin'
) {
  const appMetadata = {
    user_role: role,
    clinic_id: 'parent-1',
    clinic_scope_ids: [...clinicScopeIds],
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: userId,
            app_metadata: appMetadata,
          },
        },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              app_metadata: appMetadata,
            },
            access_token: null,
          },
        },
      }),
    },
  };
}

function createAdminClient(
  userPermissionsQuery: ReturnType<typeof createUserPermissionsQuery>,
  clinicsQuery: ReturnType<typeof createClinicsQuery>
) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'user_permissions') {
        return userPermissionsQuery;
      }

      if (table === 'clinics') {
        return clinicsQuery;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function importServerWithClients(
  sessionClient: ReturnType<typeof createSessionClient>,
  adminClient: ReturnType<typeof createAdminClient>
) {
  jest.resetModules();

  const createServerClientMock = jest.fn((_url: string, key: string) =>
    key === 'mock-service-role-key' ? adminClient : sessionClient
  );
  const logErrorMock = jest.fn();
  const envValues: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    ENCRYPTION_KEY: '',
  };

  jest.doMock('@supabase/ssr', () => ({
    createServerClient: createServerClientMock,
  }));
  jest.doMock('next/headers', () => ({
    cookies: jest.fn(async () => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    })),
  }));
  jest.doMock('@/lib/env', () => ({
    env: envValues,
    assertEnv: jest.fn((name: string) => envValues[name] ?? ''),
  }));
  jest.doMock('@/lib/error-handler', () => ({
    logError: logErrorMock,
  }));

  const server = await import('@/lib/supabase/server');
  server.resetSupabaseClientFactory();
  return {
    getUserPermissions: server.getUserPermissions,
    resetSupabaseClientFactory: server.resetSupabaseClientFactory,
    logErrorMock,
  };
}

describe('getUserPermissions clinic scope expansion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.dontMock('@supabase/ssr');
    jest.dontMock('next/headers');
    jest.dontMock('@/lib/env');
    jest.dontMock('@/lib/error-handler');
  });

  it('skips clinics hierarchy query when JWT already carries multiple scope ids', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-1', ['child-1', 'child-2']);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('user-1');

    expect(permissions?.clinic_scope_ids).toEqual(['child-1', 'child-2']);
    expect(adminClient.from).toHaveBeenCalledTimes(1);
    expect(adminClient.from).not.toHaveBeenCalledWith('clinics');
    resetSupabaseClientFactory();
  });

  it('caches permissions by request client to avoid duplicate expansion queries', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-cache', ['parent-1']);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const firstPermissions = await getUserPermissions('user-cache');
    const secondPermissions = await getUserPermissions('user-cache');

    expect(firstPermissions?.clinic_scope_ids).toEqual(['parent-1', 'child-1']);
    expect(secondPermissions?.clinic_scope_ids).toEqual([
      'parent-1',
      'child-1',
    ]);
    expect(adminClient.from).toHaveBeenCalledTimes(2);
    expect(clinicsQuery.returns).toHaveBeenCalledTimes(1);
    resetSupabaseClientFactory();
  });

  it('expands clinic_admin parent scope to direct child clinic ids', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'clinic_admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
      { id: 'child-2', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('clinic-admin-1', ['parent-1']);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('clinic-admin-1');

    expect(permissions?.clinic_scope_ids).toEqual([
      'parent-1',
      'child-1',
      'child-2',
    ]);
    expect(clinicsQuery.or).toHaveBeenCalledWith(
      'id.in.(parent-1),parent_id.in.(parent-1)'
    );
    resetSupabaseClientFactory();
  });

  it('logs and falls back to JWT scope when hierarchy expansion fails', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery(
      [],
      new Error('clinics unavailable')
    );
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-log', ['parent-1']);

    const { getUserPermissions, resetSupabaseClientFactory, logErrorMock } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('user-log');

    expect(permissions?.clinic_scope_ids).toEqual(['parent-1']);
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'resolveHierarchicalClinicScopeIds',
        userId: 'user-log',
        scopedClinicIds: ['parent-1'],
      })
    );
    resetSupabaseClientFactory();
  });
});
