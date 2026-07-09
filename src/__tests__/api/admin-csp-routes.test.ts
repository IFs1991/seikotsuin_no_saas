import { processApiRequest } from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => ({
  processApiRequest: jest.fn(),
}));

const mockQuery = {
  select: jest.fn(() => mockQuery),
  gte: jest.fn(() => mockQuery),
  in: jest.fn(() => mockQuery),
  order: jest.fn(() => mockQuery),
  limit: jest.fn(() => mockQuery),
  eq: jest.fn(() => mockQuery),
  ilike: jest.fn(() => mockQuery),
  range: jest.fn(() => mockQuery),
  update: jest.fn(() => mockQuery),
  then: jest.fn(resolve =>
    resolve({
      data: [],
      count: 0,
      error: null,
    })
  ),
};

const mockSupabase = {
  from: jest.fn(() => mockQuery),
};

const processApiRequestMock = jest.mocked(processApiRequest);

function successAuth(clinicId = '550e8400-e29b-41d4-a716-446655440001') {
  return {
    success: true as const,
    auth: {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'clinic_admin',
    },
    permissions: {
      role: 'clinic_admin',
      clinic_id: clinicId,
    },
    supabase: mockSupabase,
  };
}

describe('admin CSP routes authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.then.mockImplementation(resolve =>
      resolve({
        data: [],
        count: 0,
        error: null,
      })
    );
  });

  it('uses ADMIN_UI_ROLES for CSP stats and forwards clinic_id to scope guard', async () => {
    processApiRequestMock.mockResolvedValue(successAuth());
    const { GET } = await import('@/app/api/admin/security/csp-stats/route');
    const request = new NextRequest(
      'http://localhost/api/admin/security/csp-stats?clinic_id=550e8400-e29b-41d4-a716-446655440001'
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: '550e8400-e29b-41d4-a716-446655440001',
      requireClinicMatch: true,
    });
  });

  it('uses ADMIN_UI_ROLES for CSP violations and forwards clinic_id to scope guard', async () => {
    processApiRequestMock.mockResolvedValue(successAuth());
    const { GET } =
      await import('@/app/api/admin/security/csp-violations/route');
    const request = new NextRequest(
      'http://localhost/api/admin/security/csp-violations?clinic_id=550e8400-e29b-41d4-a716-446655440001'
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: '550e8400-e29b-41d4-a716-446655440001',
      requireClinicMatch: true,
    });
  });

  it('returns 403 from the shared guard for manager CSP stats access', async () => {
    const denied = new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
    });
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: denied,
    });
    const { GET } = await import('@/app/api/admin/security/csp-stats/route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/security/csp-stats')
    );

    expect(response.status).toBe(403);
    expect(processApiRequestMock.mock.calls[0]?.[1]?.allowedRoles).toEqual(
      Array.from(ADMIN_UI_ROLES)
    );
    expect(Array.from(ADMIN_UI_ROLES)).not.toContain('manager');
  });

  it('returns 403 from the shared guard for cross-scope clinic access', async () => {
    const denied = new Response(JSON.stringify({ error: 'cross-scope' }), {
      status: 403,
    });
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: denied,
    });
    const { GET } =
      await import('@/app/api/admin/security/csp-violations/route');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/security/csp-violations?clinic_id=550e8400-e29b-41d4-a716-446655440099'
      )
    );

    expect(response.status).toBe(403);
  });
});
