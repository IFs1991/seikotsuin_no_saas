import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createAdminClient,
  createScopedAdminContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';

const mockResolveManagerAssignedClinics = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinics: (...args: unknown[]) =>
    mockResolveManagerAssignedClinics(...args),
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

  it('returns only clinics from active manager assignments', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: 'clinic-a',
      clinic_scope_ids: ['stale-jwt-clinic'],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinics.mockResolvedValue([
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
      currentClinicId: 'clinic-a',
    });
    expect(mockResolveManagerAssignedClinics).toHaveBeenCalledWith(
      adminClient,
      'manager-1'
    );
    expect(adminClient.from).not.toHaveBeenCalled();
    expect(resolveScopedClinicIdsMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('returns empty clinics and null currentClinicId when manager has no assignments', async () => {
    const adminClient = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'manager',
      clinic_id: 'primary-clinic',
      clinic_scope_ids: ['stale-jwt-clinic'],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinics.mockResolvedValue([]);
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
    expect(mockResolveManagerAssignedClinics).toHaveBeenCalledWith(
      adminClient,
      'manager-1'
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
      clinic_scope_ids: ['jwt-clinic'],
    };

    createAdminClientMock.mockReturnValue(adminClient);
    resolveScopedClinicIdsMock.mockReturnValue([
      'primary-clinic',
      'jwt-clinic',
    ]);
    mockResolveManagerAssignedClinics.mockResolvedValue([]);
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
    expect(mockResolveManagerAssignedClinics).toHaveBeenCalledWith(
      adminClient,
      'manager-1'
    );
  });
});
