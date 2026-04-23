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
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const logAdminActionMock = AuditLogger.logAdminAction as jest.Mock;

describe('PATCH /api/admin/users/[permission_id]', () => {
  const permissionId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const clinicId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.resetAllMocks();
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
});
