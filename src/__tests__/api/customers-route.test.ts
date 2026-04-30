/**
 * PR-03: customers route の振る舞い保持テスト
 *
 * 先に固定する観点:
 * - processApiRequest 二重呼び出しを消しても認可が変わらない
 * - PATCH に clinic_id scope が残る
 * - error status の戻り値が変わらない
 */
import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope, createScopedAdminContext } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    canAccessClinicScope: jest.fn(),
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/postgrest-sanitizer', () => ({
  buildSafeSearchFilter: jest.fn().mockReturnValue(null),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const canAccessClinicScopeMock = canAccessClinicScope as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const validClinicId = '123e4567-e89b-12d3-a456-426614174000';
const validId = '123e4567-e89b-12d3-a456-426614174001';

describe('GET /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists customers through scoped admin client after route-level scope guard', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const order = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({
        data: [
          {
            id: validId,
            name: 'Persisted Customer',
            phone: '090-0000-0000',
            email: null,
            notes: null,
            custom_attributes: null,
          },
        ],
        error: null,
      }),
    });
    const eqDeleted = jest.fn().mockReturnValue({ order });
    const eqClinic = jest.fn().mockReturnValue({ eq: eqDeleted });
    const select = jest.fn().mockReturnValue({ eq: eqClinic });
    const from = jest.fn().mockReturnValue({ select });
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'clinic_admin',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth: {
        id: 'user-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/customers/route');
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams({ clinic_id: validClinicId }),
      },
      url: `http://localhost/api/customers?clinic_id=${validClinicId}`,
      method: 'GET',
    } as any;
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId: validClinicId,
      requireClinicMatch: true,
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(json.data).toEqual([
      {
        id: validId,
        name: 'Persisted Customer',
        phone: '090-0000-0000',
      },
    ]);
  });
});

describe('POST /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies clinic scope when creating a customer (single processApiRequest call)', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const single = jest.fn().mockResolvedValue({
      data: { id: validId, name: 'Test', phone: '090-0000-0000' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: {
        clinic_id: validClinicId,
        name: 'Test Customer',
        phone: '090-0000-0000',
      },
      auth: { id: 'user-1', email: 'test@example.com', role: 'staff' },
      permissions,
      supabase: userScopedSupabase,
    });
    canAccessClinicScopeMock.mockReturnValue(true);
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as any);

    expect(response.status).toBe(201);
    // processApiRequest is now called only once (not twice)
    expect(processApiRequestMock).toHaveBeenCalledTimes(1);
    // Clinic scope is verified via canAccessClinicScope
    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: validClinicId }),
      validClinicId
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
  });

  it('returns auth error when processApiRequest fails on first call', async () => {
    const { createErrorResponse } = jest.requireActual('@/lib/api-helpers');
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: createErrorResponse('認証エラー', 401),
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as any);

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: { clinic_id: 'not-uuid' }, // missing name, phone
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: validClinicId },
      supabase: {},
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as any);

    expect(response.status).toBe(400);
  });

  it('returns 403 when clinic scope check fails on POST', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: {
        clinic_id: validClinicId,
        name: 'Test',
        phone: '090-0000-0000',
      },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'other-clinic' },
      supabase: {},
    });
    canAccessClinicScopeMock.mockReturnValue(false);

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as any);

    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies clinic_id scope on update', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const single = jest.fn().mockResolvedValue({
      data: { id: validId, name: 'Updated' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const eq2 = jest.fn().mockReturnValue({ select });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const update = jest.fn().mockReturnValue({ eq: eq1 });
    const from = jest.fn().mockReturnValue({ update });
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: {
        clinic_id: validClinicId,
        id: validId,
        name: 'Updated Name',
      },
      auth: { id: 'user-1', email: 'test@example.com', role: 'staff' },
      permissions,
      supabase: userScopedSupabase,
    });
    canAccessClinicScopeMock.mockReturnValue(true);
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { PATCH } = await import('@/app/api/customers/route');
    const response = await PATCH({} as any);

    expect(response.status).toBe(200);
    // Clinic scope is checked via canAccessClinicScope (not second processApiRequest)
    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: validClinicId }),
      validClinicId
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
  });

  it('returns 403 when clinic scope check rejects', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: {
        clinic_id: validClinicId,
        id: validId,
        name: 'Updated',
      },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'other-clinic' },
      supabase: {},
    });
    canAccessClinicScopeMock.mockReturnValue(false);

    const { PATCH } = await import('@/app/api/customers/route');
    const response = await PATCH({} as any);

    expect(response.status).toBe(403);
  });
});
