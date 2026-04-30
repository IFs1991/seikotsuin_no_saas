import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
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

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
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

    createAdminClientMock.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

    const { GET } = await import('@/app/api/admin/users/route');
    const response = await GET(new NextRequest('http://localhost/api/admin/users'));
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

  it('creates a store account without an invite', async () => {
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

    const baseUpsertQuery = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    const permissionWriteQuery = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: createdUserId,
          role: 'manager',
          clinic_id: clinicId,
          username: 'yamada@example.com',
          clinics: { name: '渋谷院' },
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

    createAdminClientMock.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

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
    expect(adminClient.from).toHaveBeenCalledWith('staff');
    expect(adminClient.from).toHaveBeenCalledWith('resources');
    expect(permissionWriteQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: createdUserId,
        clinic_id: clinicId,
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
        clinic_id: clinicId,
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
        clinic_id: clinicId,
      }
    );
  });
});
