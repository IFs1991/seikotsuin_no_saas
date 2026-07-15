import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import {
  resolveManagerAssignedClinicIds,
  resolveManagerAssignedClinics,
} from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicIds: jest.fn(),
  resolveManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  ...jest.requireActual('@/lib/supabase'),
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const resolveManagerAssignedClinicsMock =
  resolveManagerAssignedClinics as jest.Mock;
const resolveManagerAssignedClinicIdsMock =
  resolveManagerAssignedClinicIds as jest.Mock;
const logAdminActionMock = AuditLogger.logAdminAction as jest.Mock;

type QueryResult<T> = {
  data: T;
  error: unknown;
};

type SelectQuery<T> = {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  in: jest.Mock;
  is: jest.Mock;
  returns: jest.Mock;
  maybeSingle: jest.Mock;
  then: jest.Mock;
  result: QueryResult<T>;
};

function createSelectQuery<T>(result: QueryResult<T>): SelectQuery<T> {
  const query: SelectQuery<T> = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    in: jest.fn(),
    is: jest.fn(),
    returns: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn(
      (
        resolve: (value: QueryResult<T>) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject)
    ),
    result,
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.returns.mockReturnValue(query);

  return query;
}

type ManagerPrimaryQueryRow = {
  clinic_id: string | null;
  clinics: { name: string } | null;
};

function createManagerPrimaryQuery({
  clinicId,
  error = null,
  found = true,
}: {
  clinicId: string | null;
  error?: unknown;
  found?: boolean;
}) {
  return createSelectQuery<ManagerPrimaryQueryRow | null>({
    data: found
      ? {
          clinic_id: clinicId,
          clinics: clinicId ? { name: '主所属院' } : null,
        }
      : null,
    error,
  });
}

function mockAdminAuth(role = 'admin') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: { id: `${role}-actor`, email: `${role}@example.com`, role },
    permissions: {
      role,
      clinic_id: null,
      clinic_scope_ids: [
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
    },
    supabase: {},
  });
}

describe('GET /api/admin/managers', () => {
  const managerUserId = '22222222-2222-4222-8222-222222222222';
  const primaryClinicId = '33333333-3333-4333-8333-333333333333';
  const assignedClinicA = '44444444-4444-4444-8444-444444444444';
  const assignedClinicB = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('returns manager list with active assigned clinic counts', async () => {
    mockAdminAuth();

    const permissionQuery = createSelectQuery({
      data: [
        {
          id: 'permission-1',
          staff_id: managerUserId,
          username: 'manager-permission@example.com',
          clinic_id: primaryClinicId,
          created_at: '2026-06-04T00:00:00.000Z',
          clinics: { name: '主所属院' },
        },
      ],
      error: null,
    });
    const profileQuery = createSelectQuery({
      data: [
        {
          user_id: managerUserId,
          email: 'manager@example.com',
          full_name: '担当 太郎',
        },
      ],
      error: null,
    });
    const assignmentQuery = createSelectQuery({
      data: [
        {
          id: 'assignment-b',
          manager_user_id: managerUserId,
          clinic_id: assignedClinicB,
          assigned_at: '2026-06-04T01:00:00.000Z',
          revoked_at: null,
          clinics: { id: assignedClinicB, name: 'B院', is_active: true },
        },
        {
          id: 'assignment-a',
          manager_user_id: managerUserId,
          clinic_id: assignedClinicA,
          assigned_at: '2026-06-04T00:30:00.000Z',
          revoked_at: null,
          clinics: { id: assignedClinicA, name: 'A院', is_active: true },
        },
      ],
      error: null,
    });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionQuery;
        }
        if (table === 'profiles') {
          return profileQuery;
        }
        if (table === 'manager_clinic_assignments') {
          return assignmentQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/managers/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/managers')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(permissionQuery.select).toHaveBeenCalledWith(
      'staff_id, username, clinic_id, clinics(name)'
    );
    expect(permissionQuery.eq).toHaveBeenCalledWith('role', 'manager');
    expect(assignmentQuery.select).toHaveBeenCalledWith(
      'id, manager_user_id, clinic_id, assigned_at, clinics(id, name, is_active)'
    );
    expect(profileQuery.in).toHaveBeenCalledWith('user_id', [managerUserId]);
    expect(assignmentQuery.in).toHaveBeenCalledWith('manager_user_id', [
      managerUserId,
    ]);
    expect(assignmentQuery.is).toHaveBeenCalledWith('revoked_at', null);
    expect(assignmentQuery.eq).not.toHaveBeenCalled();
    expect(assignmentQuery.order).not.toHaveBeenCalled();
    expect(body.data).toEqual({
      managers: [
        {
          user_id: managerUserId,
          email: 'manager@example.com',
          full_name: '担当 太郎',
          primary_clinic_id: primaryClinicId,
          primary_clinic_name: '主所属院',
          assigned_clinic_count: 2,
          assigned_clinics: [
            {
              assignment_id: 'assignment-a',
              clinic_id: assignedClinicA,
              clinic_name: 'A院',
              assigned_at: '2026-06-04T00:30:00.000Z',
            },
            {
              assignment_id: 'assignment-b',
              clinic_id: assignedClinicB,
              clinic_name: 'B院',
              assigned_at: '2026-06-04T01:00:00.000Z',
            },
          ],
        },
      ],
      total: 1,
    });
  });

  it('returns empty list without profile or assignment queries when no manager exists', async () => {
    mockAdminAuth();

    const permissionQuery = createSelectQuery({
      data: [],
      error: null,
    });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return permissionQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/managers/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/managers')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminClient.from).toHaveBeenCalledTimes(1);
    expect(body.data).toEqual({
      managers: [],
      total: 0,
    });
  });

  it('returns 403 before creating a service-role client when canonical scope is empty', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: {},
    });

    const { GET } = await import('@/app/api/admin/managers/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/managers')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('クリニックスコープが設定されていません');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('excludes managers with an out-of-scope primary or active assignment', async () => {
    mockAdminAuth();
    const safeManagerUserId = '66666666-6666-4666-8666-666666666661';
    const outsideAssignmentManagerUserId =
      '66666666-6666-4666-8666-666666666662';
    const outsidePrimaryManagerUserId = '66666666-6666-4666-8666-666666666663';
    const outsideClinicId = '77777777-7777-4777-8777-777777777777';

    const permissionQuery = createSelectQuery({
      data: [
        {
          staff_id: safeManagerUserId,
          username: 'safe@example.com',
          clinic_id: primaryClinicId,
          clinics: { name: '主所属院' },
        },
        {
          staff_id: outsideAssignmentManagerUserId,
          username: 'outside-assignment@example.com',
          clinic_id: primaryClinicId,
          clinics: { name: '主所属院' },
        },
        {
          staff_id: outsidePrimaryManagerUserId,
          username: 'outside-primary@example.com',
          clinic_id: outsideClinicId,
          clinics: { name: 'スコープ外院' },
        },
      ],
      error: null,
    });
    const assignmentQuery = createSelectQuery({
      data: [
        {
          id: 'safe-assignment',
          manager_user_id: safeManagerUserId,
          clinic_id: assignedClinicA,
          assigned_at: '2026-06-04T00:00:00.000Z',
          clinics: { id: assignedClinicA, name: 'A院', is_active: true },
        },
        {
          id: 'outside-assignment',
          manager_user_id: outsideAssignmentManagerUserId,
          clinic_id: outsideClinicId,
          assigned_at: '2026-06-04T00:00:00.000Z',
          clinics: {
            id: outsideClinicId,
            name: 'スコープ外院',
            is_active: true,
          },
        },
      ],
      error: null,
    });
    const profileQuery = createSelectQuery({
      data: [
        {
          user_id: safeManagerUserId,
          email: 'safe@example.com',
          full_name: '安全 太郎',
        },
      ],
      error: null,
    });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') return permissionQuery;
        if (table === 'manager_clinic_assignments') return assignmentQuery;
        if (table === 'profiles') return profileQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/admin/managers/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/managers')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(assignmentQuery.in).toHaveBeenCalledWith('manager_user_id', [
      safeManagerUserId,
      outsideAssignmentManagerUserId,
    ]);
    expect(profileQuery.in).toHaveBeenCalledWith('user_id', [
      safeManagerUserId,
    ]);
    expect(body.data.managers).toHaveLength(1);
    expect(body.data.managers[0].user_id).toBe(safeManagerUserId);
  });

  it.each(['manager', 'clinic_admin', 'therapist', 'staff', 'customer'])(
    'denies %s',
    async role => {
      mockAdminAuth(role);

      const { GET } = await import('@/app/api/admin/managers/route');
      const response = await GET(
        new NextRequest('http://localhost/api/admin/managers')
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('管理者権限が必要です');
      expect(createAdminClientMock).not.toHaveBeenCalled();
    }
  );
});

describe('GET /api/admin/managers/[managerUserId]/clinics', () => {
  const managerUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active assignments for an admin', async () => {
    mockAdminAuth();
    const clinicId = '33333333-3333-4333-8333-333333333333';
    const primaryQuery = createManagerPrimaryQuery({ clinicId });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([clinicId]);
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-1',
        manager_user_id: managerUserId,
        clinic_id: clinicId,
        clinic_name: '渋谷院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const { GET } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(resolveManagerAssignedClinicsMock).toHaveBeenCalledWith(
      adminClient,
      managerUserId
    );
    expect(body.data).toEqual({
      assignments: [
        {
          id: 'assignment-1',
          manager_user_id: managerUserId,
          clinic_id: clinicId,
          clinic_name: '渋谷院',
          assigned_at: '2026-06-04T00:00:00.000Z',
          revoked_at: null,
        },
      ],
      total: 1,
    });
  });

  it('returns 403 without reading manager authority when canonical scope is empty', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: {},
    });

    const { GET } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(resolveManagerAssignedClinicIdsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when any active assignment is outside actor scope', async () => {
    mockAdminAuth();
    const primaryClinicId = '33333333-3333-4333-8333-333333333333';
    const outsideClinicId = '77777777-7777-4777-8777-777777777777';
    const primaryQuery = createManagerPrimaryQuery({
      clinicId: primaryClinicId,
    });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([
      primaryClinicId,
      outsideClinicId,
    ]);

    const { GET } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });

  it('returns 503 when manager authority lookup fails', async () => {
    mockAdminAuth();
    const authorityError = { code: '08006', message: 'connection failed' };
    const primaryQuery = createManagerPrimaryQuery({
      clinicId: null,
      error: authorityError,
    });
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([]);

    const { GET } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(503);
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });

  it('does not implement manager self-read', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: managerUserId,
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: { role: 'manager', clinic_id: null },
      supabase: {},
    });

    const { GET } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/managers/[managerUserId]/clinics', () => {
  const managerUserId = '22222222-2222-4222-8222-222222222222';
  const clinicA = '33333333-3333-4333-8333-333333333333';
  const clinicB = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([clinicA]);
  });

  it('replaces assignments atomically through the database function', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA, clinicB],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicA, clinicA, clinicB],
        primary_clinic_id: clinicA,
        revoke_reason: '担当エリア変更',
      },
    });
    const primaryQuery = createManagerPrimaryQuery({ clinicId: clinicA });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: managerUserId,
        clinic_id: clinicA,
        clinic_name: 'A院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'assignment-b',
        manager_user_id: managerUserId,
        clinic_id: clinicB,
        clinic_name: 'B院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({
            clinic_ids: [clinicA, clinicA, clinicB],
            primary_clinic_id: clinicA,
            revoke_reason: '担当エリア変更',
          }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminClient.rpc).toHaveBeenCalledWith(
      'replace_manager_clinic_assignments',
      {
        p_actor_user_id: 'admin-actor',
        p_clinic_ids: [clinicA, clinicB],
        p_manager_user_id: managerUserId,
        p_primary_clinic_id: clinicA,
        p_revoke_reason: '担当エリア変更',
      }
    );
    expect(resolveManagerAssignedClinicsMock).toHaveBeenCalledWith(
      adminClient,
      managerUserId
    );
    expect(adminClient.from).toHaveBeenCalledWith('user_permissions');
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-actor',
      'admin@example.com',
      'manager_clinic_assignments_replace',
      managerUserId,
      {
        manager_user_id: managerUserId,
        clinic_ids: [clinicA, clinicB],
        primary_clinic_id: clinicA,
        assigned_clinic_count: 2,
        revoke_reason: '担当エリア変更',
      }
    );
    expect(body.data.total).toBe(2);
    expect(body.data.primary_clinic_id).toBe(clinicA);
    expect(body.data.primary_clinic_name).toBe('A院');
  });

  it('allows an empty clinic list to clear active assignments', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA, clinicB],
      },
      supabase: {},
      body: {
        clinic_ids: [],
        primary_clinic_id: null,
        revoke_reason: null,
      },
    });
    const primaryQuery = createManagerPrimaryQuery({ clinicId: clinicA });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({
            clinic_ids: [],
            primary_clinic_id: null,
            revoke_reason: null,
          }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminClient.rpc).toHaveBeenCalledWith(
      'replace_manager_clinic_assignments',
      expect.objectContaining({
        p_clinic_ids: [],
        p_primary_clinic_id: null,
        p_revoke_reason: null,
      })
    );
    expect(adminClient.from).toHaveBeenCalledWith('user_permissions');
    expect(body.data).toEqual({
      assignments: [],
      primary_clinic_id: null,
      primary_clinic_name: null,
      total: 0,
    });
  });

  it('rejects primary clinic outside submitted assignments', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA, clinicB],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
        primary_clinic_id: clinicB,
      },
    });

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({
            clinic_ids: [clinicA],
            primary_clinic_id: clinicB,
          }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('所属拠点は担当店舗の中から選択してください');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('denies manager self update', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: managerUserId,
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: { role: 'manager', clinic_id: null },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
        revoke_reason: null,
      },
    });

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({ clinic_ids: [clinicA] }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('管理者権限が必要です');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 403 before service-role access for requested clinics outside canonical scope', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicB],
        primary_clinic_id: clinicB,
      },
    });

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({
            clinic_ids: [clinicB],
            primary_clinic_id: clinicB,
          }),
        }
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 403 before the RPC when existing authority crosses actor scope', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA],
      },
      supabase: {},
      body: { clinic_ids: [clinicA] },
    });
    const primaryQuery = createManagerPrimaryQuery({ clinicId: clinicA });
    const adminClient = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([clinicA, clinicB]);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({ clinic_ids: [clinicA] }),
        }
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(403);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects an unassigned manager whose tenant authority is empty', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
        primary_clinic_id: clinicA,
      },
    });
    const primaryQuery = createManagerPrimaryQuery({ clinicId: null });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicIdsMock.mockResolvedValue([]);
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: managerUserId,
        clinic_id: clinicA,
        clinic_name: 'A院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({
            clinic_ids: [clinicA],
            primary_clinic_id: clinicA,
          }),
        }
      ),
      { params: { managerUserId } }
    );

    expect(response.status).toBe(403);
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when the target user is not a manager', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA, clinicB],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
      },
    });
    const primaryQuery = createManagerPrimaryQuery({
      clinicId: null,
      found: false,
    });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({
        error: {
          code: '23514',
          message: 'manager_user_id must have manager role',
        },
      }),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({ clinic_ids: [clinicA] }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('対象ユーザーはmanagerロールではありません');
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });

  it('returns 400 for inactive clinics or parent tenants', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: [clinicA, clinicB],
      },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
      },
    });
    const primaryQuery = createManagerPrimaryQuery({ clinicId: clinicA });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({
        error: {
          code: '23514',
          message: 'clinic_ids must reference active child clinics',
        },
      }),
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          return primaryQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    const { PUT } =
      await import('@/app/api/admin/managers/[managerUserId]/clinics/route');
    const response = await PUT(
      new NextRequest(
        `http://localhost/api/admin/managers/${managerUserId}/clinics`,
        {
          method: 'PUT',
          body: JSON.stringify({ clinic_ids: [clinicA] }),
        }
      ),
      { params: { managerUserId } }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('担当店舗には有効な子クリニックのみ指定できます');
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });
});
