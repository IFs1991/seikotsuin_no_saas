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

describe('PATCH /api/admin/users/[permission_id]', () => {
  const permissionId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const clinicId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('updates permissions through the admin client and returns success', async () => {
    const userScopedSupabase = {
      from: jest.fn(() => {
        throw new Error('user scoped client should not be used');
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
          clinic_id: clinicId,
          clinics: { name: '新宿院' },
          username: 'user@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        error: null,
      }),
    };

    createAdminClientMock.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table !== 'user_permissions') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return updateQuery;
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

    const { PATCH } = await import('@/app/api/admin/users/[permission_id]/route');
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
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'manager',
        clinic_id: clinicId,
      })
    );
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'admin-1',
      'admin@example.com',
      'permission_update',
      permissionId,
      expect.objectContaining({
        role: 'manager',
        clinic_id: clinicId,
      })
    );
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: permissionId,
          user_id: userId,
          role: 'manager',
          clinic_name: '新宿院',
        }),
      })
    );
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

    const { PATCH } = await import('@/app/api/admin/users/[permission_id]/route');
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
});
