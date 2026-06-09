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

describe('PATCH /api/admin/users/[permission_id]', () => {
  const permissionId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const clinicId = '33333333-3333-4333-8333-333333333333';

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

  it('updates permissions through the admin client and returns success', async () => {
    const userScopedSupabase = {
      from: jest.fn(() => {
        throw new Error('user scoped client should not be used');
      }),
    };

    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'clinic_admin',
          clinic_id: clinicId,
          username: 'user@example.com',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'manager',
          clinic_id: null,
          clinics: null,
          username: 'user@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const resourcesQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, updateQuery];

    createAdminClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: userScopedSupabase,
      body: {
        role: 'manager',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'manager',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(existingQuery.maybeSingle).toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'manager',
        clinic_id: null,
      })
    );
    expect(resourcesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_bookable: false,
        updated_at: expect.any(String),
      })
    );
    expect(resourcesQuery.eq).toHaveBeenCalledWith('id', userId);
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-1',
      'admin@example.com',
      'permission_update',
      permissionId,
      expect.objectContaining({
        role: 'manager',
        clinic_id: null,
      })
    );
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: permissionId,
          user_id: userId,
          role: 'manager',
          clinic_id: null,
          clinic_name: null,
        }),
      })
    );
  });

  it('ロール更新時に予約担当 resource の予約可否を同期する', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'clinic_admin',
          clinic_id: clinicId,
          username: 'clinic-admin@example.com',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'therapist',
          clinic_id: clinicId,
          clinics: { name: '新宿院' },
          username: 'therapist@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const resourcesQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, updateQuery];
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        role: 'therapist',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'therapist',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(existingQuery.maybeSingle).toHaveBeenCalled();
    expect(resourcesQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId,
        clinic_id: clinicId,
        name: 'therapist@example.com',
        type: 'staff',
        is_active: true,
        is_bookable: true,
        is_deleted: false,
      }),
      { onConflict: 'id' }
    );
  });

  it('権限剥奪時に予約担当 resource を予約不可にする', async () => {
    const permissionQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'therapist',
          clinic_id: clinicId,
          username: 'therapist@example.com',
        },
        error: null,
      }),
      delete: jest.fn().mockReturnThis(),
    };
    const resourcesQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') return permissionQuery;
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        revoke: true,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revoke: true }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(permissionQuery.maybeSingle).toHaveBeenCalled();
    expect(permissionQuery.delete).toHaveBeenCalled();
    expect(resourcesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_bookable: false,
        updated_at: expect.any(String),
      })
    );
    expect(resourcesQuery.eq).toHaveBeenCalledWith('id', userId);
  });

  it('予約担当外ロールへの更新時に既存 resource を予約不可にする', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'therapist',
          clinic_id: clinicId,
          username: 'therapist@example.com',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'staff',
          clinic_id: clinicId,
          clinics: { name: '新宿院' },
          username: 'staff@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const resourcesQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, updateQuery];
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        role: 'staff',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'staff',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(existingQuery.maybeSingle).toHaveBeenCalled();
    expect(resourcesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_bookable: false,
        updated_at: expect.any(String),
      })
    );
    expect(resourcesQuery.eq).toHaveBeenCalledWith('id', userId);
  });

  it('manager権限にactive assignmentがある場合はrole downgradeを409で拒否する', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'manager',
          clinic_id: clinicId,
          username: 'manager@example.com',
        },
        error: null,
      }),
    };
    const assignmentQuery = createActiveAssignmentQuery({
      id: '44444444-4444-4444-8444-444444444444',
    });
    const updateQuery = {
      update: jest.fn(),
    };
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') return existingQuery;
        if (table === 'manager_clinic_assignments') return assignmentQuery;
        if (table === 'resources') {
          throw new Error('resources should not be written');
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        role: 'therapist',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'therapist',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('担当店舗が残っているためロールを変更できません');
    expect(assignmentQuery.select).toHaveBeenCalledWith('id');
    expect(assignmentQuery.eq).toHaveBeenCalledWith('manager_user_id', userId);
    expect(assignmentQuery.is).toHaveBeenCalledWith('revoked_at', null);
    expect(assignmentQuery.limit).toHaveBeenCalledWith(1);
    expect(updateQuery.update).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('manager権限にactive assignmentがある場合は権限剥奪を409で拒否する', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'manager',
          clinic_id: clinicId,
          username: 'manager@example.com',
        },
        error: null,
      }),
      delete: jest.fn(),
    };
    const assignmentQuery = createActiveAssignmentQuery({
      id: '44444444-4444-4444-8444-444444444444',
    });
    const resourcesQuery = {
      update: jest.fn(),
    };
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') return existingQuery;
        if (table === 'manager_clinic_assignments') return assignmentQuery;
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        revoke: true,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revoke: true }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('担当店舗が残っているためロールを変更できません');
    expect(assignmentQuery.eq).toHaveBeenCalledWith('manager_user_id', userId);
    expect(existingQuery.delete).not.toHaveBeenCalled();
    expect(resourcesQuery.update).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('manager権限のactive assignmentがなければrole downgradeを許可する', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'manager',
          clinic_id: clinicId,
          username: 'manager@example.com',
        },
        error: null,
      }),
    };
    const assignmentQuery = createActiveAssignmentQuery(null);
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'therapist',
          clinic_id: clinicId,
          clinics: { name: '新宿院' },
          username: 'manager@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const resourcesQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, updateQuery];
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'manager_clinic_assignments') return assignmentQuery;
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
      body: {
        role: 'therapist',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'therapist',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(assignmentQuery.maybeSingle).toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'therapist',
        clinic_id: clinicId,
      })
    );
    expect(resourcesQuery.upsert).toHaveBeenCalled();
  });

  it('prevents clinic_admin from updating permissions outside scoped clinics', async () => {
    const scopedClinicId = '44444444-4444-4444-8444-444444444444';
    const outsideClinicId = '55555555-5555-4555-8555-555555555555';

    const userScopedSupabase = {
      from: jest.fn(() => {
        throw new Error('user scoped client should not be used');
      }),
    };

    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'staff',
          clinic_id: outsideClinicId,
          username: 'staff@example.com',
        },
        error: null,
      }),
    };

    createAdminClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table !== 'user_permissions') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return existingQuery;
      }),
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: scopedClinicId,
        clinic_scope_ids: [scopedClinicId],
      },
      supabase: userScopedSupabase,
      body: {
        role: 'manager',
        clinic_id: outsideClinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'manager',
          clinic_id: outsideClinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(existingQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('rejects manager permission updates without clinic scope before reading permissions', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: {},
      body: {
        role: 'staff',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'staff',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('クリニックスコープが設定されていません');
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('allows manager to update scoped clinic_admin to staff', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'clinic_admin',
          clinic_id: clinicId,
          username: 'clinic-admin@example.com',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'staff',
          clinic_id: clinicId,
          clinics: { name: '新宿院' },
          username: 'clinic-admin@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const resourcesQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, updateQuery];
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        role: 'staff',
        clinic_id: clinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'staff',
          clinic_id: clinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(existingQuery.maybeSingle).toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'staff',
        clinic_id: clinicId,
      })
    );
    expect(resourcesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_bookable: false,
      })
    );
  });

  it.each(['admin', 'manager'] as const)(
    'prevents manager from updating %s permission rows',
    async existingRole => {
      const existingQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: permissionId,
            staff_id: userId,
            role: existingRole,
            clinic_id: clinicId,
            username: `${existingRole}@example.com`,
          },
          error: null,
        }),
      };
      createAdminClientMock.mockReturnValue({
        from: jest.fn((table: string) => {
          if (table !== 'user_permissions') {
            throw new Error(`Unexpected table: ${table}`);
          }
          return existingQuery;
        }),
      });

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
          role: 'staff',
          clinic_id: clinicId,
        },
      });

      const { PATCH } =
        await import('@/app/api/admin/users/[permission_id]/route');
      const response = await PATCH(
        new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            role: 'staff',
            clinic_id: clinicId,
          }),
        }),
        { params: { permission_id: permissionId } }
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('この権限はエリアマネージャーでは変更できません');
      expect(existingQuery.maybeSingle).toHaveBeenCalled();
      expect(logAdminActionMock).not.toHaveBeenCalled();
    }
  );

  it('prevents manager from moving a permission outside scope', async () => {
    const outsideClinicId = '44444444-4444-4444-8444-444444444444';
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'clinic_admin',
          clinic_id: clinicId,
          username: 'clinic-admin@example.com',
        },
        error: null,
      }),
    };
    createAdminClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table !== 'user_permissions') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return existingQuery;
      }),
    });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        role: 'staff',
        clinic_id: outsideClinicId,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'staff',
          clinic_id: outsideClinicId,
        }),
      }),
      { params: { permission_id: permissionId } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('対象クリニックへのアクセス権がありません');
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('allows manager to revoke scoped clinic_admin permissions', async () => {
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: permissionId,
          staff_id: userId,
          role: 'clinic_admin',
          clinic_id: clinicId,
          username: 'clinic-admin@example.com',
        },
        error: null,
      }),
    };
    const deleteQuery = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const resourcesQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const userPermissionQueries = [existingQuery, deleteQuery];
    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'user_permissions') {
          const query = userPermissionQueries.shift();
          if (!query) {
            throw new Error('Unexpected user_permissions query');
          }
          return query;
        }
        if (table === 'resources') return resourcesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    createAdminClientMock.mockReturnValue(adminClient);

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: {},
      body: {
        revoke: true,
      },
    });

    const { PATCH } =
      await import('@/app/api/admin/users/[permission_id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/admin/users/${permissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revoke: true }),
      }),
      { params: { permission_id: permissionId } }
    );

    expect(response.status).toBe(200);
    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(resourcesQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_bookable: false,
      })
    );
  });
});
