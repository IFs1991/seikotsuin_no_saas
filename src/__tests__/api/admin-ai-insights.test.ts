import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';

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

interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

function createThenableQuery(result: QueryResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    then(
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return query;
}

describe('GET /api/admin/ai-insights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockAuth(scopedClinicIds: string[] = ['clinic-1', 'clinic-2']) {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: {
        role: 'admin',
        clinic_id: null,
        clinic_scope_ids: scopedClinicIds,
      },
      supabase: {},
    });
  }

  function setupAdminClient() {
    const revenueQuery = createThenableQuery({
      data: [
        { clinic_id: 'clinic-1', total_revenue: 100000 },
        { clinic_id: 'clinic-2', total_revenue: 50000 },
      ],
      error: null,
    });
    const patientQuery = createThenableQuery({
      data: [
        { clinic_id: 'clinic-1', patient_id: 'patient-1' },
        { clinic_id: 'clinic-2', patient_id: 'patient-2' },
      ],
      error: null,
    });
    const staffQuery = createThenableQuery({
      data: [
        { clinic_id: 'clinic-1', total_revenue_generated: 100000 },
        { clinic_id: 'clinic-2', total_revenue_generated: 50000 },
      ],
      error: null,
    });
    const clinicsQuery = createThenableQuery({
      data: [
        { id: 'parent-1', parent_id: null },
        { id: 'clinic-1', parent_id: 'parent-1' },
        { id: 'clinic-2', parent_id: 'other-parent' },
      ],
      error: null,
    });

    const client = {
      from: jest.fn().mockImplementation((tableName: string) => {
        if (tableName === 'clinics') return clinicsQuery;
        if (tableName === 'daily_revenue_summary') return revenueQuery;
        if (tableName === 'patient_visit_summary') return patientQuery;
        if (tableName === 'staff_performance_summary') return staffQuery;
        return createThenableQuery({ data: [], error: null });
      }),
    };

    createScopedAdminContextMock.mockReturnValue({
      client,
      scopedClinicIds: ['clinic-1', 'clinic-2', 'parent-1'],
      assertClinicInScope: jest.fn(),
    });

    return { client, revenueQuery, patientQuery, staffQuery, clinicsQuery };
  }

  it('allows ADMIN_UI_ROLES through processApiRequest', async () => {
    mockAuth();
    setupAdminClient();

    const { GET } = await import('@/app/api/admin/ai-insights/route');
    await GET(new NextRequest('http://localhost/api/admin/ai-insights'));

    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        allowedRoles: ['admin', 'clinic_admin'],
        requireClinicMatch: false,
      })
    );
  });

  it('returns validation error for invalid period_days', async () => {
    const { GET } = await import('@/app/api/admin/ai-insights/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/ai-insights?period_days=0')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(processApiRequestMock).not.toHaveBeenCalled();
  });

  it('returns auth failure from processApiRequest', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          status: 401,
        }
      ),
    });

    const { GET } = await import('@/app/api/admin/ai-insights/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/ai-insights')
    );

    expect(response.status).toBe(401);
  });

  it('rejects clinic_id outside scopedClinicIds', async () => {
    mockAuth(['clinic-1']);
    createScopedAdminContextMock.mockReturnValue({
      client: { from: jest.fn() },
      scopedClinicIds: ['clinic-1'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/ai-insights/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/ai-insights?clinic_id=22222222-2222-4222-8222-222222222222'
      )
    );

    expect(response.status).toBe(403);
  });

  it('scopes service-role KPI queries to the requested clinic_id', async () => {
    mockAuth(['11111111-1111-4111-8111-111111111111']);
    const { revenueQuery, patientQuery, staffQuery } = setupAdminClient();
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest.fn().mockImplementation((tableName: string) => {
          if (tableName === 'daily_revenue_summary') return revenueQuery;
          if (tableName === 'patient_visit_summary') return patientQuery;
          if (tableName === 'staff_performance_summary') return staffQuery;
          return createThenableQuery({ data: [], error: null });
        }),
      },
      scopedClinicIds: ['11111111-1111-4111-8111-111111111111'],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/ai-insights/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/ai-insights?clinic_id=11111111-1111-4111-8111-111111111111&period_days=14'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.scope).toEqual({
      clinic_ids: ['11111111-1111-4111-8111-111111111111'],
      clinic_count: 1,
      period_days: 14,
    });
    expect(revenueQuery.in).toHaveBeenCalledWith('clinic_id', [
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(patientQuery.in).toHaveBeenCalledWith('clinic_id', [
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(staffQuery.in).toHaveBeenCalledWith('clinic_id', [
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('limits parent_id requests to scoped child clinics only', async () => {
    mockAuth([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    const revenueQuery = createThenableQuery({ data: [], error: null });
    const clinicsQuery = createThenableQuery({
      data: [
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', parent_id: null },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          parent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          parent_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
      ],
      error: null,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest.fn().mockImplementation((tableName: string) => {
          if (tableName === 'clinics') return clinicsQuery;
          if (tableName === 'daily_revenue_summary') return revenueQuery;
          if (tableName === 'patient_visit_summary')
            return createThenableQuery({ data: [], error: null });
          if (tableName === 'staff_performance_summary')
            return createThenableQuery({ data: [], error: null });
          return createThenableQuery({ data: [], error: null });
        }),
      },
      scopedClinicIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/ai-insights/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/ai-insights?parent_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clinicsQuery.in).toHaveBeenCalledWith('id', [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    expect(body.data.scope.clinic_ids).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    expect(revenueQuery.in).toHaveBeenCalledWith('clinic_id', [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });
});
