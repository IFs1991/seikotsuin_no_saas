import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createScopedAdminContext,
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

function createQueryMock(result: unknown[]) {
  let rows = [...result];
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),
    returns: jest.fn(() => Promise.resolve({ data: rows, error: null })),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockImplementation((column: string, values: readonly string[]) => {
    if (column === 'id') {
      rows = rows.filter(
        row =>
          typeof row === 'object' &&
          row !== null &&
          'id' in row &&
          typeof row.id === 'string' &&
          values.includes(row.id)
      );
    }
    return query;
  });
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return query;
}

describe('GET /api/admin/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not re-expand a canonical root-only JWT subset to child clinics', async () => {
    const clinicsQuery = createQueryMock([
      {
        id: 'parent-1',
        name: '本部',
        parent_id: null,
        is_active: true,
      },
      {
        id: 'child-1',
        name: '梅田院',
        parent_id: 'parent-1',
        is_active: true,
      },
    ]);
    const reportsQuery = createQueryMock([
      {
        clinic_id: 'child-1',
        total_patients: '10',
        total_revenue: '100000',
      },
    ]);
    const staffQuery = createQueryMock([
      {
        clinic_id: 'child-1',
        performance_score: '4.5',
      },
    ]);

    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'clinics') return clinicsQuery;
        if (table === 'daily_reports') return reportsQuery;
        if (table === 'staff_performance') return staffQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: 'parent-1',
        clinic_scope_ids: ['parent-1'],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['parent-1'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/dashboard/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/dashboard')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', ['parent-1']);
    expect(clinicsQuery.or).not.toHaveBeenCalled();
    expect(reportsQuery.in).not.toHaveBeenCalled();
    expect(staffQuery.in).not.toHaveBeenCalled();
    expect(body.data.clinicsData).toEqual([]);
  });

  it('scopes manager dashboard metrics to the resolved area clinic IDs only', async () => {
    const clinicsQuery = createQueryMock([
      {
        id: 'parent-1',
        name: '本部',
        parent_id: null,
        is_active: true,
      },
      {
        id: 'child-1',
        name: '梅田院',
        parent_id: 'parent-1',
        is_active: true,
      },
      {
        id: 'child-2',
        name: '心斎橋院',
        parent_id: 'parent-1',
        is_active: true,
      },
    ]);
    const reportsQuery = createQueryMock([
      {
        clinic_id: 'child-1',
        total_patients: '10',
        total_revenue: '100000',
      },
      {
        clinic_id: 'child-2',
        total_patients: '5',
        total_revenue: '50000',
      },
    ]);
    const staffQuery = createQueryMock([
      {
        clinic_id: 'child-1',
        performance_score: '4.5',
      },
      {
        clinic_id: 'child-2',
        performance_score: '4.0',
      },
    ]);

    const adminClient = {
      from: jest.fn((table: string) => {
        if (table === 'clinics') return clinicsQuery;
        if (table === 'daily_reports') return reportsQuery;
        if (table === 'staff_performance') return staffQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: 'child-1',
        clinic_scope_ids: ['child-1', 'child-2'],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['child-1', 'child-2'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/dashboard/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/dashboard')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', ['child-1', 'child-2']);
    expect(clinicsQuery.or).not.toHaveBeenCalled();
    expect(reportsQuery.in).toHaveBeenCalledWith('clinic_id', [
      'child-1',
      'child-2',
    ]);
    expect(staffQuery.in).toHaveBeenCalledWith('clinic_id', [
      'child-1',
      'child-2',
    ]);
    expect(
      body.data.clinicsData.map((clinic: { id: string }) => clinic.id)
    ).toEqual(['child-1', 'child-2']);
  });

  it('fails closed when manager dashboard scope is not configured', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: null,
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockImplementation(() => {
      throw new ScopeNotConfiguredError();
    });

    const { GET } = await import('@/app/api/admin/dashboard/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/dashboard')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('uses a valid JWT subset instead of the DB primary for clinic admin defaults', async () => {
    const clinicsQuery = createQueryMock([
      {
        id: 'child-subset',
        name: 'JWT subset院',
        parent_id: 'parent-1',
        is_active: true,
      },
    ]);
    const reportsQuery = createQueryMock([]);
    const staffQuery = createQueryMock([]);
    const userClient = {
      from: jest.fn((table: string) => {
        if (table === 'clinics') return clinicsQuery;
        if (table === 'daily_reports') return reportsQuery;
        if (table === 'staff_performance') return staffQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'child-primary',
        clinic_scope_ids: ['child-subset'],
      },
      supabase: userClient,
    });

    const { GET } = await import('@/app/api/admin/dashboard/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/dashboard')
    );

    expect(response.status).toBe(200);
    expect(clinicsQuery.eq).toHaveBeenCalledWith('id', 'child-subset');
    expect(clinicsQuery.eq).not.toHaveBeenCalledWith('id', 'child-primary');
  });
});
