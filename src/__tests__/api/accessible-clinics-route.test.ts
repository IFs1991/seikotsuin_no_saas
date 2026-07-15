import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createAdminClient,
  createScopedAdminContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const mockResolveManagerAssignedClinicsWithinScope = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: (...args: unknown[]) =>
    mockResolveManagerAssignedClinicsWithinScope(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
  createScopedAdminContext: jest.fn(),
  resolveScopedClinicIds: jest.fn(),
  ScopeNotConfiguredError: class ScopeNotConfiguredError extends Error {},
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const resolveScopedClinicIdsMock = resolveScopedClinicIds as jest.Mock;

describe('GET /api/clinics/accessible manager assignment scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only clinics from active manager assignments and selects the first sorted clinic', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: 'clinic-a',
      clinic_scope_ids: ['clinic-a', 'clinic-b'],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinicsWithinScope.mockResolvedValue([
      {
        id: 'assignment-b',
        manager_user_id: 'manager-1',
        clinic_id: 'clinic-b',
        clinic_name: '渋谷院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'assignment-a',
        manager_user_id: 'manager-1',
        clinic_id: 'clinic-a',
        clinic_name: '池袋院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions,
      supabase: {
        from: jest.fn(() => {
          throw new Error('user scoped client should not be used for manager');
        }),
      },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      clinics: [
        { id: 'clinic-b', name: '渋谷院' },
        { id: 'clinic-a', name: '池袋院' },
      ],
      currentClinicId: 'clinic-b',
    });
    expect(mockResolveManagerAssignedClinicsWithinScope).toHaveBeenCalledWith(
      adminClient,
      'manager-1',
      ['clinic-a', 'clinic-b']
    );
    expect(adminClient.from).not.toHaveBeenCalled();
    expect(resolveScopedClinicIdsMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('selects the only active manager assignment as currentClinicId', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: null,
      clinic_scope_ids: ['clinic-a'],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinicsWithinScope.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-1',
        clinic_id: 'clinic-a',
        clinic_name: '池袋院',
        assigned_at: '2026-06-04T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions,
      supabase: { from: jest.fn() },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      clinics: [{ id: 'clinic-a', name: '池袋院' }],
      currentClinicId: 'clinic-a',
    });
    expect(resolveScopedClinicIdsMock).not.toHaveBeenCalled();
  });

  it('returns empty clinics and null currentClinicId when manager has no assignments', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: [],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinicsWithinScope.mockResolvedValue([]);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions,
      supabase: { from: jest.fn() },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      clinics: [],
      currentClinicId: null,
    });
    expect(mockResolveManagerAssignedClinicsWithinScope).toHaveBeenCalledWith(
      adminClient,
      'manager-1',
      []
    );
    expect(resolveScopedClinicIdsMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('does not fall back to primary clinic or JWT scope for managers', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: [],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    resolveScopedClinicIdsMock.mockReturnValue([
      'primary-clinic',
      'jwt-clinic',
    ]);
    mockResolveManagerAssignedClinicsWithinScope.mockResolvedValue([]);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions,
      supabase: { from: jest.fn() },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      clinics: [],
      currentClinicId: null,
    });
    expect(resolveScopedClinicIdsMock).not.toHaveBeenCalled();
    expect(mockResolveManagerAssignedClinicsWithinScope).toHaveBeenCalledWith(
      adminClient,
      'manager-1',
      []
    );
  });

  it('returns an information-free 503 when manager authority cannot be resolved', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinicsWithinScope.mockRejectedValue(
      new AppError(
        ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
        undefined,
        503
      )
    );
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: ['clinic-a'],
      },
      supabase: { from: jest.fn() },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
  });

  it('does not re-expand an admin canonical root-only JWT subset to child clinics', async () => {
    let clinicRows = [
      { id: 'root-clinic', name: '本部', parent_id: null, is_active: true },
      {
        id: 'child-clinic',
        name: '子院',
        parent_id: 'root-clinic',
        is_active: true,
      },
    ];
    const query = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      returns: jest.fn(() =>
        Promise.resolve({ data: clinicRows, error: null })
      ),
    };
    query.in.mockImplementation((column: string, values: readonly string[]) => {
      if (column === 'id') {
        clinicRows = clinicRows.filter(row => values.includes(row.id));
      }
      return query;
    });
    const adminClient = { from: jest.fn(() => query) };

    resolveScopedClinicIdsMock.mockReturnValue(['root-clinic']);
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['root-clinic'],
      assertClinicInScope: jest.fn(),
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'root-clinic',
        clinic_scope_ids: ['root-clinic'],
      },
      supabase: { from: jest.fn() },
    });

    const { GET } = await import('@/app/api/clinics/accessible/route');
    const response = await GET(
      new NextRequest('http://localhost/api/clinics/accessible')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.in).toHaveBeenCalledWith('id', ['root-clinic']);
    expect(body.data).toEqual({ clinics: [], currentClinicId: null });
  });
});
