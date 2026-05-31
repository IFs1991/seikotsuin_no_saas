import { NextRequest } from 'next/server';
import { processApiRequest, logError } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const createAdminClientMock = jest.mocked(createAdminClient);
const logErrorMock = jest.mocked(logError);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

type TableName = 'profiles' | 'user_permissions' | 'staff' | 'resources';
type TableQuery = {
  upsert: jest.Mock;
  select: jest.Mock;
  single: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
};
type DeleteUserMock = jest.Mock;
type CreateUserMock = jest.Mock;
type AdminClientMock = {
  auth: {
    admin: {
      createUser: CreateUserMock;
      deleteUser: DeleteUserMock;
    };
  };
  from: jest.Mock<TableQuery, [TableName]>;
};

const createRequest = (body: unknown = {}) =>
  new NextRequest('http://localhost/api/admin/users/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const createAdminProcessResult = (body: unknown) => ({
  success: true as const,
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
  body,
});

const createClinicAdminProcessResult = (body: unknown) => ({
  success: true as const,
  auth: {
    id: 'clinic-admin-1',
    email: 'clinic-admin@example.com',
    role: 'clinic_admin',
  },
  permissions: {
    role: 'clinic_admin',
    clinic_id: '33333333-3333-4333-8333-333333333333',
    clinic_scope_ids: ['33333333-3333-4333-8333-333333333333'],
  },
  supabase: {},
  body,
});

const createManagerProcessResult = (body: unknown) => ({
  success: true as const,
  auth: {
    id: 'manager-1',
    email: 'manager@example.com',
    role: 'manager',
  },
  permissions: {
    role: 'manager',
    clinic_id: '33333333-3333-4333-8333-333333333333',
    clinic_scope_ids: ['33333333-3333-4333-8333-333333333333'],
  },
  supabase: {},
  body,
});

const createAdminClientMockValue = ({
  createdUserId = '22222222-2222-4222-8222-222222222222',
  createUserError = null,
  profileError = null,
  permissionId = '11111111-1111-4111-8111-111111111111',
}: {
  createdUserId?: string;
  createUserError?: { message: string } | null;
  profileError?: { message: string } | null;
  permissionId?: string;
} = {}): {
  adminClient: AdminClientMock;
  profileQuery: TableQuery;
  sideEffectQueries: Map<TableName, TableQuery>;
} => {
  const createTableQuery = (
    upsertError: { message: string } | null = null,
    singleData: { id: string } | null = null
  ): TableQuery => {
    const query: TableQuery = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: singleData,
        error: upsertError,
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    query.upsert.mockResolvedValue({ error: upsertError });
    return query;
  };
  const profileQuery = createTableQuery(profileError);
  const userPermissionsQuery = createTableQuery(null, { id: permissionId });
  const staffQuery = createTableQuery();
  const resourcesQuery = createTableQuery();

  profileQuery.upsert = jest.fn().mockResolvedValue({ error: profileError });
  userPermissionsQuery.upsert = jest.fn().mockReturnValue(userPermissionsQuery);
  staffQuery.upsert = jest.fn().mockResolvedValue({ error: null });
  resourcesQuery.upsert = jest.fn().mockResolvedValue({ error: null });

  const queries = new Map<TableName, TableQuery>([
    ['profiles', profileQuery],
    ['user_permissions', userPermissionsQuery],
    ['staff', staffQuery],
    ['resources', resourcesQuery],
  ]);

  const createUser = jest.fn().mockResolvedValue({
    data: createUserError
      ? { user: null }
      : {
          user: {
            id: createdUserId,
          },
        },
    error: createUserError,
  });
  const deleteUser = jest.fn().mockResolvedValue({ error: null });

  const adminClient: AdminClientMock = {
    auth: {
      admin: {
        createUser,
        deleteUser,
      },
    },
    from: jest.fn((table: TableName) => {
      const query = queries.get(table);
      if (!query) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return query;
    }),
  };

  return {
    adminClient,
    profileQuery,
    sideEffectQueries: queries,
  };
};

describe('POST /api/admin/users/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('allows admin to create an account-only user with profiles only', async () => {
    const payload = {
      full_name: '山田 太郎',
      email: 'YAMADA@example.com',
      password: 'SafePass123!',
    };
    const createdUserId = '22222222-2222-4222-8222-222222222222';
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(payload));
    const { adminClient, profileQuery, sideEffectQueries } =
      createAdminClientMockValue({ createdUserId });
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        requireBody: true,
        requireClinicMatch: false,
        sanitizeInputValues: false,
      })
    );
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'yamada@example.com',
      password: 'SafePass123!',
      email_confirm: true,
      user_metadata: {
        full_name: '山田 太郎',
      },
    });
    expect(profileQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: createdUserId,
        email: 'yamada@example.com',
        full_name: '山田 太郎',
        clinic_id: null,
        role: 'staff',
        is_active: true,
      }),
      { onConflict: 'user_id' }
    );
    expect(sideEffectQueries.get('user_permissions')?.upsert).not.toHaveBeenCalled();
    expect(sideEffectQueries.get('staff')?.upsert).not.toHaveBeenCalled();
    expect(sideEffectQueries.get('resources')?.upsert).not.toHaveBeenCalled();
    expect(body.data).toEqual({
      id: createdUserId,
      email: 'yamada@example.com',
      full_name: '山田 太郎',
      permission_status: 'unassigned',
      permission_id: null,
      role: null,
      clinic_id: null,
    });
    expect(JSON.stringify(body)).not.toContain('SafePass123!');
  });

  it('rejects clinic_admin with 403', async () => {
    const payload = {
      full_name: '山田 太郎',
      email: 'yamada@example.com',
      password: 'SafePass123!',
    };
    processApiRequestMock.mockResolvedValue(
      createClinicAdminProcessResult(payload)
    );

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('管理者権限が必要です');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects manager with 403 while allowing the route-level guard to decide', async () => {
    const payload = {
      full_name: '山田 太郎',
      email: 'yamada@example.com',
      password: 'SafePass123!',
    };
    processApiRequestMock.mockResolvedValue(createManagerProcessResult(payload));

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('管理者権限が必要です');
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        allowedRoles: ['admin', 'clinic_admin', 'manager'],
      })
    );
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('maps duplicate email to a safe 400 error', async () => {
    const payload = {
      full_name: '山田 太郎',
      email: 'duplicate@example.com',
      password: 'SafePass123!',
    };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(payload));
    const { adminClient } = createAdminClientMockValue({
      createUserError: { message: 'User already registered' },
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('ログインメールアドレスは既に使用されています');
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it('rolls back the auth user when profile upsert fails', async () => {
    const payload = {
      full_name: '山田 太郎',
      email: 'rollback@example.com',
      password: 'SafePass123!',
    };
    const createdUserId = '22222222-2222-4222-8222-222222222222';
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(payload));
    const { adminClient } = createAdminClientMockValue({
      createdUserId,
      profileError: { message: 'profile write failed' },
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('プロフィールの作成に失敗しました');
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith(
      createdUserId
    );
  });

  it('does not escape password before createUser and does not log or audit it', async () => {
    const password = 'Safe&<Pass>"\'123!';
    const payload = {
      full_name: '山田 太郎',
      email: 'escape@example.com',
      password,
    };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(payload));
    const { adminClient } = createAdminClientMockValue();
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        password,
      })
    );
    expect(JSON.stringify(body)).not.toContain(password);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(password);
    expect(JSON.stringify(logAdminActionMock.mock.calls)).not.toContain(
      password
    );
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-1',
      'admin@example.com',
      'account_only_create',
      '22222222-2222-4222-8222-222222222222',
      {
        user_id: '22222222-2222-4222-8222-222222222222',
        email: 'escape@example.com',
        permission_status: 'unassigned',
        role: null,
        clinic_id: null,
      }
    );
  });

  it('optionally grants a role during account-only creation without requiring clinic', async () => {
    const payload = {
      full_name: '未所属 管理者',
      email: 'role-only@example.com',
      password: 'SafePass123!',
      role: 'manager',
      clinic_id: null,
    };
    const createdUserId = '22222222-2222-4222-8222-222222222222';
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(payload));
    const { adminClient, profileQuery, sideEffectQueries } =
      createAdminClientMockValue({ createdUserId });
    createAdminClientMock.mockReturnValue(adminClient);

    const { POST } = await import('@/app/api/admin/users/accounts/route');
    const response = await POST(createRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(profileQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: createdUserId,
        clinic_id: null,
        role: 'manager',
      }),
      { onConflict: 'user_id' }
    );
    expect(sideEffectQueries.get('staff')?.upsert).not.toHaveBeenCalled();
    expect(sideEffectQueries.get('resources')?.upsert).not.toHaveBeenCalled();
    expect(sideEffectQueries.get('user_permissions')?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: createdUserId,
        role: 'manager',
        clinic_id: null,
        username: 'role-only@example.com',
      }),
      { onConflict: 'staff_id' }
    );
    expect(body.data).toEqual(
      expect.objectContaining({
        id: createdUserId,
        permission_status: 'assigned',
        permission_id: '11111111-1111-4111-8111-111111111111',
        role: 'manager',
        clinic_id: null,
      })
    );
  });
});
