import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
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
  resolveManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const resolveManagerAssignedClinicsMock =
  resolveManagerAssignedClinics as jest.Mock;
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

function mockAdminAuth(role = 'admin') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: { id: `${role}-actor`, email: `${role}@example.com`, role },
    permissions: { role, clinic_id: null },
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
      'id, manager_user_id, assigned_at, clinics!inner(id, name, is_active)'
    );
    expect(profileQuery.in).toHaveBeenCalledWith('user_id', [managerUserId]);
    expect(assignmentQuery.in).toHaveBeenCalledWith('manager_user_id', [
      managerUserId,
    ]);
    expect(assignmentQuery.is).toHaveBeenCalledWith('revoked_at', null);
    expect(assignmentQuery.eq).toHaveBeenCalledWith(
      'clinics.is_active',
      true
    );
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
    const adminClient = { from: jest.fn() };
    createAdminClientMock.mockReturnValue(adminClient);
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-1',
        manager_user_id: managerUserId,
        clinic_id: '33333333-3333-4333-8333-333333333333',
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
          clinic_id: '33333333-3333-4333-8333-333333333333',
          clinic_name: '渋谷院',
          assigned_at: '2026-06-04T00:00:00.000Z',
          revoked_at: null,
        },
      ],
      total: 1,
    });
  });

  it('does not implement manager self-read', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: managerUserId, email: 'manager@example.com', role: 'manager' },
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
  });

  it('replaces assignments atomically through the database function', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        clinic_ids: [clinicA, clinicA, clinicB],
        revoke_reason: '担当エリア変更',
      },
    });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn(),
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
        p_revoke_reason: '担当エリア変更',
      }
    );
    expect(resolveManagerAssignedClinicsMock).toHaveBeenCalledWith(
      adminClient,
      managerUserId
    );
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-actor',
      'admin@example.com',
      'manager_clinic_assignments_replace',
      managerUserId,
      {
        manager_user_id: managerUserId,
        clinic_ids: [clinicA, clinicB],
        assigned_clinic_count: 2,
        revoke_reason: '担当エリア変更',
      }
    );
    expect(body.data.total).toBe(2);
  });

  it('allows an empty clinic list to clear active assignments', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        clinic_ids: [],
        revoke_reason: null,
      },
    });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn(),
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
          body: JSON.stringify({ clinic_ids: [], revoke_reason: null }),
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
        p_revoke_reason: null,
      })
    );
    expect(body.data).toEqual({
      assignments: [],
      total: 0,
    });
  });

  it('denies manager self update', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: managerUserId, email: 'manager@example.com', role: 'manager' },
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

  it('returns 400 when the target user is not a manager', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
      },
    });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({
        error: {
          code: '23514',
          message: 'manager_user_id must have manager role',
        },
      }),
      from: jest.fn(),
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
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        clinic_ids: [clinicA],
      },
    });
    const adminClient = {
      rpc: jest.fn().mockResolvedValue({
        error: {
          code: '23514',
          message: 'clinic_ids must reference active child clinics',
        },
      }),
      from: jest.fn(),
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
    expect(body.error).toBe(
      '担当店舗には有効な子クリニックのみ指定できます'
    );
    expect(resolveManagerAssignedClinicsMock).not.toHaveBeenCalled();
  });
});
