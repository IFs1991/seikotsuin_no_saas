type UserPermissionsRow = {
  role: string;
  clinic_id: string | null;
};

type ClinicScopeRow = {
  id: string;
  parent_id: string | null;
};

type ProfileStatusRow = {
  is_active: boolean | null;
};

type ProfileQueryResult = {
  data: ProfileStatusRow | null;
  error: unknown;
};

const TEST_CLINIC_IDS: Readonly<Record<string, string>> = {
  'parent-1': '11111111-1111-4111-8111-111111111111',
  'child-1': '22222222-2222-4222-8222-222222222221',
  'child-2': '22222222-2222-4222-8222-222222222222',
  'child-real': '22222222-2222-4222-8222-222222222223',
  'child-other': '22222222-2222-4222-8222-222222222224',
  'outside-db-scope': '99999999-9999-4999-8999-999999999999',
};

function testClinicId(value: string): string {
  return TEST_CLINIC_IDS[value] ?? value;
}

function mapClinicScopeClaim(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(item => (typeof item === 'string' ? testClinicId(item) : item))
    : value;
}

function createAccessToken(input: {
  userId: string;
  role: string;
  clinicScopeClaim: unknown;
}): string {
  const payload = {
    sub: input.userId,
    app_metadata: {
      user_role: input.role,
      clinic_id: testClinicId('parent-1'),
      clinic_scope_ids: mapClinicScopeClaim(input.clinicScopeClaim),
    },
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );
  return `test-header.${encodedPayload}.test-signature`;
}

function createUserPermissionsQuery(
  row: UserPermissionsRow | null,
  error: unknown = null
) {
  const mappedRow = row
    ? {
        ...row,
        clinic_id: row.clinic_id ? testClinicId(row.clinic_id) : null,
      }
    : null;

  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: mappedRow, error }),
  };
}

function createClinicsQuery(
  rows: ClinicScopeRow[],
  error: unknown = null,
  primaryError: unknown = null
) {
  const mappedRows = rows.map(row => ({
    id: testClinicId(row.id),
    parent_id: row.parent_id ? testClinicId(row.parent_id) : null,
  }));
  let selectedClinicId: string | null = null;
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((column: string, value: string) => {
      if (column === 'id') {
        selectedClinicId = value;
      }
      return query;
    }),
    maybeSingle: jest.fn(async () => ({
      data: mappedRows.find(row => row.id === selectedClinicId) ?? null,
      error: primaryError,
    })),
    or: jest.fn().mockReturnThis(),
    returns: jest.fn().mockResolvedValue({ data: mappedRows, error }),
  };

  return query;
}

function createProfileQuery(results: readonly ProfileQueryResult[]) {
  const fallbackResult = results.at(-1) ?? { data: null, error: null };
  const maybeSingle = jest.fn();

  for (const result of results) {
    maybeSingle.mockResolvedValueOnce(result);
  }
  maybeSingle.mockResolvedValue(fallbackResult);

  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle,
  };
}

function createSessionClient(
  userId: string,
  clinicScopeClaim: unknown,
  role = 'admin',
  profileQuery = createProfileQuery([
    { data: { is_active: true }, error: null },
  ]),
  cookieClinicScopeClaim: unknown = clinicScopeClaim
) {
  const verifiedAppMetadata = {
    user_role: role,
    clinic_id: testClinicId('parent-1'),
    clinic_scope_ids: mapClinicScopeClaim(clinicScopeClaim),
  };
  const cookieAppMetadata = {
    ...verifiedAppMetadata,
    clinic_scope_ids: mapClinicScopeClaim(cookieClinicScopeClaim),
  };

  return {
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return profileQuery;
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: userId,
            app_metadata: verifiedAppMetadata,
          },
        },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: userId,
              app_metadata: cookieAppMetadata,
            },
            access_token: createAccessToken({
              userId,
              role,
              clinicScopeClaim,
            }),
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
    ...jest.requireActual<typeof import('@/lib/error-handler')>(
      '@/lib/error-handler'
    ),
    logError: logErrorMock,
  }));

  const server = await import('@/lib/supabase/server');
  server.resetSupabaseClientFactory();
  return {
    getUserPermissions: server.getUserPermissions,
    getUserAccessContext: server.getUserAccessContext,
    resolveScopedClinicIds: server.resolveScopedClinicIds,
    resetSupabaseClientFactory: server.resetSupabaseClientFactory,
    createServerClientMock,
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

  it('intersects a JWT scope superset with DB-approved hierarchy scope', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
      { id: 'child-2', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-1', [
      'child-1',
      'outside-db-scope',
    ]);

    const { getUserPermissions, resetSupabaseClientFactory, logErrorMock } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('user-1');

    expect(permissions?.clinic_scope_ids).toEqual([testClinicId('child-1')]);
    expect(adminClient.from).toHaveBeenCalledWith('clinics');
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'applyJwtClinicScopeIntersection',
        eventType: 'jwt_scope_exceeds_db_authority',
        userId: 'user-1',
      })
    );
    resetSupabaseClientFactory();
  });

  it('allows a valid JWT subset to narrow DB-approved hierarchy scope', async () => {
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
    const sessionClient = createSessionClient('subset-user', ['child-2']);

    const { getUserPermissions, resetSupabaseClientFactory, logErrorMock } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('subset-user');

    expect(permissions?.clinic_scope_ids).toEqual([testClinicId('child-2')]);
    expect(clinicsQuery.or).toHaveBeenCalledWith(
      `id.in.(${testClinicId('parent-1')}),parent_id.in.(${testClinicId(
        'parent-1'
      )})`
    );
    expect(logErrorMock).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        eventType: 'jwt_scope_exceeds_db_authority',
      })
    );
    resetSupabaseClientFactory();
  });

  it('ignores forged cookie user metadata and trusts only the verified token payload', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
      { id: 'child-2', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'forged-cookie-user',
      ['child-1'],
      'admin',
      undefined,
      ['child-1', 'child-2']
    );

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('forged-cookie-user');

    expect(permissions?.clinic_scope_ids).toEqual([testClinicId('child-1')]);
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
    const sessionClient = createSessionClient('user-cache', undefined);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const firstPermissions = await getUserPermissions('user-cache');
    const secondPermissions = await getUserPermissions('user-cache');

    expect(firstPermissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
    ]);
    expect(secondPermissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
    ]);
    expect(adminClient.from).toHaveBeenCalledTimes(3);
    expect(clinicsQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(clinicsQuery.returns).toHaveBeenCalledTimes(1);
    resetSupabaseClientFactory();
  });

  it('re-applies a narrower session claim on every call while caching only DB authority', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
      { id: 'child-2', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('cache-narrowing', undefined);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const firstPermissions = await getUserPermissions('cache-narrowing');

    sessionClient.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'cache-narrowing',
            app_metadata: {
              clinic_scope_ids: [testClinicId('child-2')],
            },
          },
          access_token: createAccessToken({
            userId: 'cache-narrowing',
            role: 'admin',
            clinicScopeClaim: ['child-2'],
          }),
        },
      },
      error: null,
    });
    const secondPermissions = await getUserPermissions('cache-narrowing');

    expect(firstPermissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
      testClinicId('child-2'),
    ]);
    expect(secondPermissions?.clinic_scope_ids).toEqual([
      testClinicId('child-2'),
    ]);
    expect(userPermissionsQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(clinicsQuery.maybeSingle).toHaveBeenCalledTimes(1);
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
    const sessionClient = createSessionClient('clinic-admin-1', undefined);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('clinic-admin-1');

    expect(permissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
      testClinicId('child-2'),
    ]);
    expect(clinicsQuery.or).toHaveBeenCalledWith(
      `id.in.(${testClinicId('parent-1')}),parent_id.in.(${testClinicId(
        'parent-1'
      )})`
    );
    resetSupabaseClientFactory();
  });

  it('resolves a child primary clinic to its root and direct siblings', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'clinic_admin',
      clinic_id: 'child-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
      { id: 'child-2', parent_id: 'parent-1' },
      {
        id: '99999999-9999-4999-8999-999999999998',
        parent_id: null,
      },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('child-primary', undefined);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('child-primary');

    expect(permissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
      testClinicId('child-2'),
    ]);
    expect(clinicsQuery.eq).toHaveBeenCalledWith('id', testClinicId('child-1'));
    expect(clinicsQuery.or).toHaveBeenCalledWith(
      `id.in.(${testClinicId('parent-1')}),parent_id.in.(${testClinicId(
        'parent-1'
      )})`
    );
    resetSupabaseClientFactory();
  });

  it('logs and returns 503 when DB hierarchy authority lookup fails', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery(
      [{ id: 'parent-1', parent_id: null }],
      new Error('clinics unavailable')
    );
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-log', ['parent-1']);

    const { getUserPermissions, resetSupabaseClientFactory, logErrorMock } =
      await importServerWithClients(sessionClient, adminClient);
    await expect(getUserPermissions('user-log')).rejects.toEqual(
      expect.objectContaining({
        code: 'DATABASE_CONNECTION_ERROR',
        statusCode: 503,
      })
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'resolveHierarchicalClinicScopeIds',
        userId: 'user-log',
      })
    );
    resetSupabaseClientFactory();
  });

  it('validates the live subject while using a matching options session only for JWT scope', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-1', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-options', [
      'parent-1',
      'child-1',
    ]);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('user-options', undefined, {
      user: {
        id: 'user-options',
        aud: 'authenticated',
        created_at: '2026-06-16T00:00:00.000Z',
        app_metadata: {
          user_role: 'admin',
          clinic_id: testClinicId('parent-1'),
          clinic_scope_ids: [testClinicId('parent-1'), testClinicId('child-1')],
        },
        user_metadata: {},
      },
      session: {
        user: {
          id: 'user-options',
          aud: 'authenticated',
          created_at: '2026-06-16T00:00:00.000Z',
          app_metadata: {
            clinic_scope_ids: [
              testClinicId('parent-1'),
              testClinicId('child-1'),
            ],
          },
          user_metadata: {},
        },
        access_token: createAccessToken({
          userId: 'user-options',
          role: 'admin',
          clinicScopeClaim: ['parent-1', 'child-1'],
        }),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: '',
      },
    });

    expect(permissions?.clinic_scope_ids).toEqual([
      testClinicId('parent-1'),
      testClinicId('child-1'),
    ]);
    expect(sessionClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(sessionClient.auth.getSession).not.toHaveBeenCalled();
    resetSupabaseClientFactory();
  });

  it('validates a mismatched options user and fails closed on its mismatched session', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([
      { id: 'parent-1', parent_id: null },
      { id: 'child-real', parent_id: 'parent-1' },
    ]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-real', [
      'parent-1',
      'child-real',
    ]);

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('user-real', undefined, {
      user: {
        id: 'other-user',
        aud: 'authenticated',
        created_at: '2026-06-16T00:00:00.000Z',
        app_metadata: {
          user_role: 'admin',
          clinic_id: 'parent-1',
          clinic_scope_ids: ['child-other'],
        },
        user_metadata: {},
      },
      session: {
        user: {
          id: 'other-user',
          aud: 'authenticated',
          created_at: '2026-06-16T00:00:00.000Z',
          app_metadata: {
            clinic_scope_ids: ['child-other'],
          },
          user_metadata: {},
        },
        access_token: '',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: '',
      },
    });

    expect(permissions?.clinic_scope_ids).toEqual([]);
    expect(sessionClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(sessionClient.auth.getSession).not.toHaveBeenCalled();
    resetSupabaseClientFactory();
  });

  it('uses only the primary DB clinic for staff and shrinks a stale JWT superset', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'staff-1',
      ['parent-1', 'outside-db-scope'],
      'admin'
    );

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('staff-1');

    expect(permissions).toEqual({
      role: 'staff',
      clinic_id: testClinicId('parent-1'),
      clinic_scope_ids: [testClinicId('parent-1')],
    });
    expect(adminClient.from).not.toHaveBeenCalledWith('clinics');
    resetSupabaseClientFactory();
  });

  it('uses DB-approved scope when the JWT scope claim is absent', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('staff-2', undefined, 'staff');

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('staff-2')).resolves.toEqual({
      role: 'staff',
      clinic_id: testClinicId('parent-1'),
      clinic_scope_ids: [testClinicId('parent-1')],
    });
    resetSupabaseClientFactory();
  });

  it('treats a malformed JWT scope claim as an explicit empty scope', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'staff-malformed',
      ['parent-1', 42],
      'staff'
    );

    const {
      getUserPermissions,
      resolveScopedClinicIds,
      resetSupabaseClientFactory,
    } = await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('staff-malformed');

    expect(permissions?.clinic_scope_ids).toEqual([]);
    expect(permissions && resolveScopedClinicIds(permissions)).toEqual([]);
    resetSupabaseClientFactory();
  });

  it('rejects a mixed UUID and non-UUID JWT scope as wholly malformed', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'staff-invalid-uuid',
      ['parent-1', 'not-a-uuid'],
      'staff'
    );

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('staff-invalid-uuid')).resolves.toEqual({
      role: 'staff',
      clinic_id: testClinicId('parent-1'),
      clinic_scope_ids: [],
    });
    resetSupabaseClientFactory();
  });

  it('returns an empty authority scope for an unknown DB role', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'unknown-role',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'unknown-role-user',
      undefined,
      'unknown-role'
    );

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('unknown-role-user')).resolves.toEqual({
      role: 'unknown-role',
      clinic_id: testClinicId('parent-1'),
      clinic_scope_ids: [],
    });
    expect(adminClient.from).not.toHaveBeenCalledWith('clinics');
    resetSupabaseClientFactory();
  });

  it('returns 503 when the authority session lookup fails', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('session-error', undefined);
    sessionClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'session unavailable', code: 'AUTH500' },
    });

    const { getUserPermissions, logErrorMock, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('session-error')).rejects.toEqual(
      expect.objectContaining({
        code: 'DATABASE_CONNECTION_ERROR',
        statusCode: 503,
      })
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'session unavailable' }),
      expect.objectContaining({
        operation: 'getAuthoritySession',
        authorityErrorCode: 'AUTH500',
      })
    );
    resetSupabaseClientFactory();
  });

  it('preserves an explicit empty JWT scope instead of restoring clinic_id', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('staff-empty', [], 'staff');

    const {
      getUserPermissions,
      resolveScopedClinicIds,
      resetSupabaseClientFactory,
    } = await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('staff-empty');

    expect(permissions?.clinic_scope_ids).toEqual([]);
    expect(permissions && resolveScopedClinicIds(permissions)).toEqual([]);
    resetSupabaseClientFactory();
  });

  it('returns 503 and logs when the permission authority query fails', async () => {
    const userPermissionsQuery = createUserPermissionsQuery(null, {
      message: 'permissions unavailable',
      code: 'PGRST500',
      details: 'permission relation lookup failed',
      hint: 'retry later',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('user-error', ['parent-1']);

    const { getUserPermissions, logErrorMock, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('user-error')).rejects.toEqual(
      expect.objectContaining({
        code: 'DATABASE_CONNECTION_ERROR',
        statusCode: 503,
      })
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'fetchUserPermissionsRecord',
        userId: 'user-error',
        authorityErrorCode: 'PGRST500',
        authorityErrorDetails: 'permission relation lookup failed',
      })
    );
    resetSupabaseClientFactory();
  });

  it('denies missing DB permission without restoring stale JWT authority', async () => {
    const userPermissionsQuery = createUserPermissionsQuery(null);
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'missing-permission',
      ['parent-1'],
      'admin'
    );

    const { getUserPermissions, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserPermissions('missing-permission')).resolves.toBeNull();
    expect(adminClient.from).not.toHaveBeenCalledWith('clinics');
    resetSupabaseClientFactory();
  });

  it('denies a mismatched authenticated subject before reading with service role', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('other-user', ['parent-1']);

    const {
      getUserPermissions,
      resetSupabaseClientFactory,
      createServerClientMock,
    } = await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('target-user', undefined, {
      user: {
        id: 'target-user',
        aud: 'authenticated',
        created_at: '2026-07-15T00:00:00.000Z',
        app_metadata: {},
        user_metadata: {},
      },
      session: {
        user: {
          id: 'target-user',
          aud: 'authenticated',
          created_at: '2026-07-15T00:00:00.000Z',
          app_metadata: {},
          user_metadata: {},
        },
        access_token: '',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: '',
      },
    });

    expect(permissions).toBeNull();
    expect(sessionClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'mock-anon-key',
      expect.any(Object)
    );
    expect(adminClient.from).not.toHaveBeenCalled();
    resetSupabaseClientFactory();
  });

  it('denies an unauthenticated subject before creating a service-role client', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'admin',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient('target-user', ['parent-1']);
    sessionClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing!', code: 'session_not_found' },
    });

    const {
      getUserPermissions,
      resetSupabaseClientFactory,
      createServerClientMock,
    } = await importServerWithClients(sessionClient, adminClient);
    const permissions = await getUserPermissions('target-user', undefined, {
      user: {
        id: 'target-user',
        aud: 'authenticated',
        created_at: '2026-07-15T00:00:00.000Z',
        app_metadata: {},
        user_metadata: {},
      },
    });

    expect(permissions).toBeNull();
    expect(sessionClient.auth.getUser).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(adminClient.from).not.toHaveBeenCalled();
    expect(userPermissionsQuery.maybeSingle).not.toHaveBeenCalled();
    resetSupabaseClientFactory();
  });

  it('builds an active context only from an explicitly active profile row', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const sessionClient = createSessionClient(
      'active-user',
      undefined,
      'staff'
    );

    const { getUserAccessContext, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(
      getUserAccessContext('active-user', undefined, {
        user: {
          id: 'active-user',
          aud: 'authenticated',
          created_at: '2026-07-15T00:00:00.000Z',
          app_metadata: {},
          user_metadata: {},
        },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        permissions: expect.objectContaining({ role: 'staff' }),
        isActive: true,
      })
    );
    resetSupabaseClientFactory();
  });

  it('treats a cleanly missing profile row as inactive', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const profileQuery = createProfileQuery([
      { data: null, error: null },
      { data: { is_active: true }, error: null },
    ]);
    const sessionClient = createSessionClient(
      'missing-profile',
      undefined,
      'staff',
      profileQuery
    );

    const { getUserAccessContext, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserAccessContext('missing-profile')).resolves.toEqual(
      expect.objectContaining({
        permissions: null,
        role: null,
        clinicId: null,
        isActive: false,
        isAdmin: false,
      })
    );
    expect(profileQuery.eq).toHaveBeenCalledTimes(1);
    expect(profileQuery.eq).toHaveBeenCalledWith('user_id', 'missing-profile');
    expect(profileQuery.maybeSingle).toHaveBeenCalledTimes(1);
    resetSupabaseClientFactory();
  });

  it('returns 503 on profile query error without masking it as a legacy-id miss', async () => {
    const userPermissionsQuery = createUserPermissionsQuery({
      role: 'staff',
      clinic_id: 'parent-1',
    });
    const clinicsQuery = createClinicsQuery([]);
    const adminClient = createAdminClient(userPermissionsQuery, clinicsQuery);
    const profileQuery = createProfileQuery([
      { data: null, error: new Error('profiles unavailable') },
    ]);
    const sessionClient = createSessionClient(
      'profile-error',
      undefined,
      'staff',
      profileQuery
    );

    const { getUserAccessContext, logErrorMock, resetSupabaseClientFactory } =
      await importServerWithClients(sessionClient, adminClient);

    await expect(getUserAccessContext('profile-error')).rejects.toEqual(
      expect.objectContaining({
        code: 'DATABASE_CONNECTION_ERROR',
        statusCode: 503,
      })
    );
    expect(profileQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'fetchProfileStatus',
        userId: 'profile-error',
      })
    );
    resetSupabaseClientFactory();
  });
});
