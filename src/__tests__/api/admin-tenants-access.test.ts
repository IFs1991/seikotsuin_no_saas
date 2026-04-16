import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

function createListQueryMock(result: unknown[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    then(
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({ data: result, error: null }).then(
        resolve,
        reject
      );
    },
  };

  return query;
}

describe('Admin tenants access alignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/tenants scopes list by clinic_scope_ids for HQ admin', async () => {
    const clinics = [{ id: 'clinic-1', name: 'Scope Clinic' }];
    const clinicsQuery = createListQueryMock(clinics);
    const mockAdminClient = {
      from: jest.fn().mockReturnValue(clinicsQuery),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      },
      supabase: {},
    });
    createScopedAdminContextMock.mockReturnValue({
      client: mockAdminClient,
      scopedClinicIds: ['clinic-1', 'clinic-2'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/tenants/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/tenants')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', [
      'clinic-1',
      'clinic-2',
    ]);
    expect(body.data.items).toEqual(clinics);
  });

  it('GET /api/admin/tenants fails closed when admin has no clinic scope and no clinic_id', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
      },
      supabase: {},
    });
    createScopedAdminContextMock.mockImplementation(() => {
      throw new ScopeNotConfiguredError();
    });

    const { GET } = await import('@/app/api/admin/tenants/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/tenants')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('PATCH /api/admin/tenants/[clinic_id] rejects scope-out clinic', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: ['clinic-1'],
      },
      supabase: {},
      body: { is_active: false },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from: jest.fn() },
      scopedClinicIds: ['clinic-1'],
      assertClinicInScope: jest.fn(() => {
        throw new ScopeAccessError();
      }),
    });

    const { PATCH } = await import('@/app/api/admin/tenants/[clinic_id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/tenants/clinic-2', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      { params: { clinic_id: 'clinic-2' } }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });
});
