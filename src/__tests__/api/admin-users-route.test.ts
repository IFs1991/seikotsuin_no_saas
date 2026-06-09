import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase';

const mockResolveEffectiveClinicScope = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => {
  const actual = jest.requireActual('@/lib/auth/manager-scope');
  return {
    ...actual,
    resolveEffectiveClinicScope: (...args: unknown[]) =>
      mockResolveEffectiveClinicScope(...args),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
  resolveScopedClinicIds: jest.fn(permissions => {
    if (permissions?.clinic_scope_ids?.length) {
      return permissions.clinic_scope_ids;
    }
    return permissions?.clinic_id ? [permissions.clinic_id] : null;
  }),
  canAccessClinicScope: jest.fn((permissions, clinicId) => {
    const scoped =
      permissions?.clinic_scope_ids?.length > 0
        ? permissions.clinic_scope_ids
        : permissions?.clinic_id
          ? [permissions.clinic_id]
          : [];
    return scoped.includes(clinicId);
  }),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const logAdminActionMock = AuditLogger.logAdminAction as jest.Mock;

type ManagerScopeMockInput = {
  permissions: {
    clinic_scope_ids?: string[];
  };
};

type QueryRow = Record<string, unknown>;

function createListQuery<T extends QueryRow>(rows: T[]) {
  const result = { data: rows, error: null };
  const query = {
    select: jest.fn(),
    order: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    then: jest.fn(
      (
        resolve: (value: typeof result) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject)
    ),
  };

  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);

  return query;
}

type MutationQuery = {
  select?: jest.Mock;
  eq?: jest.Mock;
  maybeSingle?: jest.Mock;
  upsert?: jest.Mock;
  insert?: jest.Mock;
  delete?: jest.Mock;
  single?: jest.Mock;
};

function createMaybeSingleQuery<T extends QueryRow>(
  data: T | null,
  error: unknown = null
): MutationQuery {
  const query: MutationQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
  };

  query.select?.mockReturnValue(query);
  query.eq?.mockReturnValue(query);

  return query;
}

function createActiveAssignmentQuery(data: { id: string } | null) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data,
      error: null,
    }),
  };

  return query;
}

function createUpsertQuery(error: unknown = null): MutationQuery {
  return {
    upsert: jest.fn().mockResolvedValue({ error }),
  };
}

function createDeleteQuery(): MutationQuery {
  const query: MutationQuery = {
    delete: jest.fn(),
    eq: jest.fn().mockResolvedValue({ error: null }),
  };

  query.delete?.mockReturnValue(query);

  return query;
}

function createPermissionWriteQuery({
  permissionId,
  userId,
  role,
  clinicId,
}: {
  permissionId: string;
  userId: string;
  role: string;
  clinicId: string | null;
}): MutationQuery {
  const query: MutationQuery = {
    insert: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockResolvedValue({
      data: {
        id: permissionId,
        staff_id: userId,
        role,
        clinic_id: clinicId,
        username: 'profile-only@example.com',
        clinics: clinicId ? { name: '新宿院' } : null,
        created_at: '2026-05-31T00:00:00.000Z',
      },
      error: null,
    }),
  };

  query.insert?.mockReturnValue(query);
  query.select?.mockReturnValue(query);

  return query;
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
    mockResolveEffectiveClinicScope.mockImplementation(
      ({ permissions }: ManagerScopeMockInput) => ({
        source: 'manager_assignments',
        clinicIds: permissions.clinic_scope_ids ?? [],
      })
    );
  });

  it('limits clinic_admin permission list to scoped clinics', async () => {
    const clinicA = '33333333-3333-4333-8333-333333333333';
    const clinicB = '44444444-4444-4444-8444-444444444444';
    const userId = '22222222-2222-4222-8222-222222222222';
    const scopedClinicIds = [clinicA, clinicB];

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicA,
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });

    const permissionQuery = createListQuery([
      {
        id: '11111111-1111-4111-8111-111111111111',
        staff_id: userId,
        role: 'staff',
        clinic_id: clinicB,
        username: 'sato@example.com',
        clinics: { name: '渋谷院' },
        created_at: '2026-04-24T00:00:00.000Z',
      },
    ]);
    const profileQuery = createListQuery([
      {
        user_id: userId,
        email: 'sato@example.com',
        full_name: '佐藤 花子',
      },
    ]);

    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionQuery;
        }
        if (table === 'profiles') {
          return profileQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(permissionQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(profileQuery.in).toHaveBeenCalledWith('user_id', [userId]);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: userId,
        role: 'staff',
        clinic_id: clinicB,
        clinic_name: '渋谷院',
      }),
    ]);
  });

  it('limits manager permission list to scoped manageable roles', async () => {
    const clinicA = '33333333-3333-4333-8333-333333333333';
    const clinicB = '44444444-4444-4444-8444-444444444444';
    const userId = '22222222-2222-4222-8222-222222222222';
    const scopedClinicIds = [clinicA, clinicB];

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: clinicA,
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });

    const permissionQuery = createListQuery([
      {
        id: '11111111-1111-4111-8111-111111111111',
        staff_id: userId,
        role: 'clinic_admin',
        clinic_id: clinicB,
        username: 'clinic-admin@example.com',
        clinics: { name: '渋谷院' },
        created_at: '2026-04-24T00:00:00.000Z',
      },
    ]);
    const profileQuery = createListQuery([
      {
        user_id: userId,
        email: 'clinic-admin@example.com',
        full_name: '店舗 管理者',
      },
    ]);

    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionQuery;
        }
        if (table === 'profiles') {
          return profileQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/users/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(permissionQuery.in).toHaveBeenCalledWith(
      'clinic_id',
      scopedClinicIds
    );
    expect(permissionQuery.in).toHaveBeenCalledWith('role', [
      'clinic_admin',
      'therapist',
      'staff',
    ]);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: userId,
        role: 'clinic_admin',
        clinic_id: clinicB,
      }),
    ]);
  });

  it('rejects manager permission list without clinic scope', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: {},
    });

    const { GET } = await import('@/app/api/admin/users/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('クリニックスコープが設定されていません');
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
  });

  it('rejects manager permission list for outside-scope clinic', async () => {
    const scopedClinicId = '33333333-3333-4333-8333-333333333333';
    const outsideClinicId = '44444444-4444-4444-8444-444444444444';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: scopedClinicId,
        clinic_scope_ids: [scopedClinicId],
      },
      supabase: {},
    });

    const { GET } = await import('@/app/api/admin/users/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/users?clinic_id=${outsideClinicId}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
  });

  it('rejects clinic_admin role assignment to another clinic_admin', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        user_id: '22222222-2222-4222-8222-222222222222',
        clinic_id: clinicId,
        role: 'clinic_admin',
      },
    });

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          clinic_id: clinicId,
          role: 'clinic_admin',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('このロールは店舗管理者では付与できません');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects clinic_admin role assignment to manager', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        user_id: '22222222-2222-4222-8222-222222222222',
        clinic_id: clinicId,
        role: 'manager',
      },
    });

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          clinic_id: clinicId,
          role: 'manager',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('このロールは店舗管理者では付与できません');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it.each(['clinic_admin', 'therapist', 'staff'] as const)(
    'allows manager to assign %s inside scope',
    async role => {
      const clinicId = '33333333-3333-4333-8333-333333333333';
      const userId = '22222222-2222-4222-8222-222222222222';
      const permissionId = '11111111-1111-4111-8111-111111111111';

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: {
          id: 'manager-1',
          email: 'manager@example.com',
          role: 'manager',
        },
        permissions: {
          role: 'manager',
          clinic_id: clinicId,
          clinic_scope_ids: [clinicId],
        },
        supabase: {},
        body: {
          user_id: userId,
          clinic_id: clinicId,
          role,
        },
      });

      const profileQuery = createMaybeSingleQuery({
        email: 'scoped-user@example.com',
        full_name: '担当 太郎',
      });
      const existingPermissionQuery = createMaybeSingleQuery(null);
      const staffLookupQuery = createMaybeSingleQuery({
        id: userId,
        clinic_id: clinicId,
      });
      const resourceUpsertQuery = createUpsertQuery();
      const permissionWriteQuery = createPermissionWriteQuery({
        permissionId,
        userId,
        role,
        clinicId,
      });

      const tableQueries = {
        profiles: [profileQuery],
        user_permissions: [existingPermissionQuery, permissionWriteQuery],
        staff: [staffLookupQuery],
        resources: [resourceUpsertQuery],
      };
      const adminClient = {
        from: jest.fn((table: keyof typeof tableQueries) => {
          const query = tableQueries[table]?.shift();
          if (!query) {
            throw new Error(`Unexpected table query: ${table}`);
          }
          return query;
        }),
      };

      createAdminClientMock.mockReturnValue(adminClient);

      const { POST } = await import('@/app/api/admin/users/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            clinic_id: clinicId,
            role,
          }),
        })
      );

      expect(response.status).toBe(201);
      expect(staffLookupQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
      expect(permissionWriteQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          staff_id: userId,
          role,
          clinic_id: clinicId,
        })
      );
      expect(resourceUpsertQuery.upsert).toHaveBeenCalled();
    }
  );

  it.each(['admin', 'manager'] as const)(
    'rejects manager assignment to %s',
    async role => {
      const clinicId = '33333333-3333-4333-8333-333333333333';

      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: {
          id: 'manager-1',
          email: 'manager@example.com',
          role: 'manager',
        },
        permissions: {
          role: 'manager',
          clinic_id: clinicId,
          clinic_scope_ids: [clinicId],
        },
        supabase: {},
        body: {
          user_id: '22222222-2222-4222-8222-222222222222',
          clinic_id: clinicId,
          role,
        },
      });

      const { POST } = await import('@/app/api/admin/users/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            user_id: '22222222-2222-4222-8222-222222222222',
            clinic_id: clinicId,
            role,
          }),
        })
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe(
        'このロールはエリアマネージャーでは付与できません'
      );
      expect(createAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it('rejects manager assignment without clinic_id', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        user_id: '22222222-2222-4222-8222-222222222222',
        clinic_id: null,
        role: 'staff',
      },
    });

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          clinic_id: null,
          role: 'staff',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('creates a manager account without clinic-scoped staff records', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const createdUserId = '22222222-2222-4222-8222-222222222222';
    const permissionId = '11111111-1111-4111-8111-111111111111';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        create_account: true,
        full_name: '山田 太郎',
        email: 'yamada@example.com',
        password: 'SafePass123!',
        role: 'manager',
        clinic_id: clinicId,
      },
    });

    const baseUpsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const permissionWriteQuery = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: createdUserId,
          role: 'manager',
          clinic_id: null,
          username: 'yamada@example.com',
          clinics: null,
          created_at: '2026-04-30T00:00:00.000Z',
        },
        error: null,
      }),
    };

    const adminClient = {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: {
              user: {
                id: createdUserId,
              },
            },
            error: null,
          }),
          deleteUser: jest.fn(),
        },
      },
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionWriteQuery;
        }
        if (['profiles', 'staff', 'resources'].includes(table)) {
          return baseUpsertQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          create_account: true,
          full_name: '山田 太郎',
          email: 'yamada@example.com',
          password: 'SafePass123!',
          role: 'manager',
          clinic_id: clinicId,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'yamada@example.com',
      password: 'SafePass123!',
      email_confirm: true,
      user_metadata: {
        full_name: '山田 太郎',
      },
    });
    expect(adminClient.from).toHaveBeenCalledWith('profiles');
    expect(adminClient.from).not.toHaveBeenCalledWith('staff');
    expect(adminClient.from).not.toHaveBeenCalledWith('resources');
    expect(baseUpsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: createdUserId,
        clinic_id: null,
        full_name: '山田 太郎',
        role: 'manager',
      }),
      { onConflict: 'user_id' }
    );
    expect(permissionWriteQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: createdUserId,
        clinic_id: null,
        role: 'manager',
        username: 'yamada@example.com',
      }),
      { onConflict: 'staff_id' }
    );
    expect(body.data).toEqual(
      expect.objectContaining({
        id: permissionId,
        user_id: createdUserId,
        role: 'manager',
        clinic_id: null,
        profile_email: 'yamada@example.com',
        profile_name: '山田 太郎',
      })
    );
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-1',
      'admin@example.com',
      'account_create',
      permissionId,
      {
        user_id: createdUserId,
        role: 'manager',
        clinic_id: null,
      }
    );
  });

  it('promotes a profile-only account to a clinic-scoped role consistently', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const userId = '22222222-2222-4222-8222-222222222222';
    const permissionId = '11111111-1111-4111-8111-111111111111';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        clinic_id: clinicId,
        role: 'therapist',
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'profile-only@example.com',
      full_name: '未付与 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);
    const staffUpsertQuery = createUpsertQuery();
    const resourceUpsertQuery = createUpsertQuery();
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId,
      userId,
      role: 'therapist',
      clinicId,
    });

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery, staffUpsertQuery],
      resources: [resourceUpsertQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          clinic_id: clinicId,
          role: 'therapist',
          candidate_source: 'profile',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(staffUpsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId,
        clinic_id: clinicId,
        name: '未付与 太郎',
        role: 'therapist',
        email: 'profile-only@example.com',
        is_therapist: true,
      }),
      { onConflict: 'id' }
    );
    expect(resourceUpsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId,
        clinic_id: clinicId,
        name: '未付与 太郎',
        email: 'profile-only@example.com',
        type: 'staff',
        is_bookable: true,
      }),
      { onConflict: 'id' }
    );
    expect(permissionWriteQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: userId,
        role: 'therapist',
        clinic_id: clinicId,
        username: 'profile-only@example.com',
      })
    );
    expect(body.data).toEqual(
      expect.objectContaining({
        id: permissionId,
        user_id: userId,
        role: 'therapist',
        clinic_id: clinicId,
        profile_email: 'profile-only@example.com',
        profile_name: '未付与 太郎',
      })
    );
  });

  it('assigns admin role to a profile-only account without staff or resources', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const permissionId = '11111111-1111-4111-8111-111111111111';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        role: 'admin',
        clinic_id: null,
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'profile-only@example.com',
      full_name: '未付与 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId,
      userId,
      role: 'admin',
      clinicId: null,
    });

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery],
      resources: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          role: 'admin',
          clinic_id: null,
          candidate_source: 'profile',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(permissionWriteQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: userId,
        role: 'admin',
        clinic_id: null,
      })
    );
  });

  it('allows hq admin to assign a non-admin role without clinic', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const permissionId = '11111111-1111-4111-8111-111111111111';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        role: 'manager',
        clinic_id: null,
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'profile-only@example.com',
      full_name: '未所属 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId,
      userId,
      role: 'manager',
      clinicId: null,
    });

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery],
      resources: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          role: 'manager',
          clinic_id: null,
          candidate_source: 'profile',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(permissionWriteQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: userId,
        role: 'manager',
        clinic_id: null,
      })
    );
  });

  it('normalizes manager permission assignment clinic_id to null', async () => {
    const submittedClinicId = '33333333-3333-4333-8333-333333333333';
    const userId = '22222222-2222-4222-8222-222222222222';
    const permissionId = '11111111-1111-4111-8111-111111111111';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        role: 'manager',
        clinic_id: submittedClinicId,
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'manager@example.com',
      full_name: '未所属 マネージャー',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId,
      userId,
      role: 'manager',
      clinicId: null,
    });

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery],
      resources: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          role: 'manager',
          clinic_id: submittedClinicId,
          candidate_source: 'profile',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(permissionWriteQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: userId,
        role: 'manager',
        clinic_id: null,
      })
    );
    expect(adminClient.from).not.toHaveBeenCalledWith('resources');
  });

  it('active assignmentが残る既存manager権限のdowngradeを409で拒否する', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const userId = '22222222-2222-4222-8222-222222222222';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        clinic_id: clinicId,
        role: 'therapist',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'manager@example.com',
      full_name: '担当 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery({
      id: '11111111-1111-4111-8111-111111111111',
      username: 'manager@example.com',
      role: 'manager',
      clinic_id: clinicId,
    });
    const staffLookupQuery = createMaybeSingleQuery({
      id: userId,
      clinic_id: clinicId,
    });
    const assignmentQuery = createActiveAssignmentQuery({
      id: '44444444-4444-4444-8444-444444444444',
    });
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId: '55555555-5555-4555-8555-555555555555',
      userId,
      role: 'therapist',
      clinicId,
    });

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery],
      resources: [],
      manager_clinic_assignments: [assignmentQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          clinic_id: clinicId,
          role: 'therapist',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('担当店舗が残っているためロールを変更できません');
    expect(assignmentQuery.select).toHaveBeenCalledWith('id');
    expect(assignmentQuery.eq).toHaveBeenCalledWith('manager_user_id', userId);
    expect(assignmentQuery.is).toHaveBeenCalledWith('revoked_at', null);
    expect(assignmentQuery.limit).toHaveBeenCalledWith(1);
    expect(permissionWriteQuery.insert).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('rejects clinic_admin assignment without clinic scope target', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        user_id: '22222222-2222-4222-8222-222222222222',
        clinic_id: null,
        role: 'staff',
      },
    });

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: '22222222-2222-4222-8222-222222222222',
          clinic_id: null,
          role: 'staff',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('does not leave user_permissions when profile-only resource sync fails', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const userId = '22222222-2222-4222-8222-222222222222';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
      body: {
        user_id: userId,
        clinic_id: clinicId,
        role: 'therapist',
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'profile-only@example.com',
      full_name: '未付与 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);
    const staffUpsertQuery = createUpsertQuery();
    const resourceUpsertQuery = createUpsertQuery({
      message: 'resource write failed',
    });
    const permissionWriteQuery = createPermissionWriteQuery({
      permissionId: '11111111-1111-4111-8111-111111111111',
      userId,
      role: 'therapist',
      clinicId,
    });
    const resourceDeleteQuery = createDeleteQuery();
    const staffDeleteQuery = createDeleteQuery();

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery, permissionWriteQuery],
      staff: [staffLookupQuery, staffUpsertQuery, staffDeleteQuery],
      resources: [resourceUpsertQuery, resourceDeleteQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          clinic_id: clinicId,
          role: 'therapist',
          candidate_source: 'profile',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('スタッフリソースの同期に失敗しました');
    expect(permissionWriteQuery.insert).not.toHaveBeenCalled();
    expect(resourceDeleteQuery.delete).toHaveBeenCalled();
    expect(staffDeleteQuery.delete).toHaveBeenCalled();
  });

  it('rejects clinic_admin assignment to a profile-only account', async () => {
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const userId = '22222222-2222-4222-8222-222222222222';

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        user_id: userId,
        clinic_id: clinicId,
        role: 'staff',
        candidate_source: 'profile',
      },
    });

    const profileQuery = createMaybeSingleQuery({
      email: 'profile-only@example.com',
      full_name: '未付与 太郎',
    });
    const existingPermissionQuery = createMaybeSingleQuery(null);
    const staffLookupQuery = createMaybeSingleQuery(null);

    const tableQueries = {
      profiles: [profileQuery],
      user_permissions: [existingPermissionQuery],
      staff: [staffLookupQuery],
      resources: [],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          clinic_id: clinicId,
          role: 'staff',
          candidate_source: 'profile',
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      '対象ユーザーは選択クリニックのスタッフではありません'
    );
  });
});
