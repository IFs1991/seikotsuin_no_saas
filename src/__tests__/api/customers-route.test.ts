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
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { NextRequest } from 'next/server';
import {
  decodeCustomerCursor,
  encodeCustomerCursor,
} from '@/app/api/customers/schema';

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

jest.mock('@/lib/supabase/guards', () => {
  const actual = jest.requireActual('@/lib/supabase/guards');
  return {
    ...actual,
    ensureClinicAccess: jest.fn(),
  };
});

jest.mock('@/lib/postgrest-sanitizer', () => ({
  buildSafeSearchFilter: jest.fn().mockReturnValue(null),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const canAccessClinicScopeMock = canAccessClinicScope as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

const validClinicId = '123e4567-e89b-12d3-a456-426614174000';
const validId = '123e4567-e89b-12d3-a456-426614174001';
const managerDeniedMessage = 'マネージャーは患者情報APIへアクセスできません。';

describe('GET /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists customers through scoped admin client after route-level scope guard', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: validId,
          name: 'Persisted Customer',
          phone: '090-0000-0000',
          email: null,
          notes: null,
          custom_attributes: null,
          created_at: '2026-07-10T00:00:00.000Z',
          updated_at: '2026-07-10T00:00:00.000Z',
          consent_marketing: false,
          consent_reminder: true,
          line_user_id: null,
        },
      ],
      error: null,
    });
    const orderById = jest.fn().mockReturnValue({ limit });
    const orderByCreatedAt = jest.fn().mockReturnValue({ order: orderById });
    const eqDeleted = jest.fn().mockReturnValue({ order: orderByCreatedAt });
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
    } as unknown as NextRequest;
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId: validClinicId,
      requireClinicMatch: true,
      deniedRoles: ['manager'],
      deniedRoleMessage: managerDeniedMessage,
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(orderByCreatedAt).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(orderById).toHaveBeenCalledWith('id', { ascending: false });
    expect(limit).toHaveBeenCalledWith(51);
    expect(json.data).toEqual({
      items: [
        {
          id: validId,
          name: 'Persisted Customer',
          phone: '090-0000-0000',
          consentMarketing: false,
          consentReminder: true,
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('uses the opaque cursor with deterministic ordering and returns a next cursor', async () => {
    const cursorPayload = {
      createdAt: '2026-07-10T00:00:00.000Z',
      id: validId,
    };
    const encodedCursor = encodeCustomerCursor(cursorPayload);
    const nextId = '123e4567-e89b-12d3-a456-426614174002';
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: validId,
          name: 'First Customer',
          phone: '090-0000-0001',
          email: null,
          notes: null,
          custom_attributes: null,
          created_at: '2026-07-09T00:00:00.000Z',
          updated_at: '2026-07-09T00:00:00.000Z',
          consent_marketing: false,
          consent_reminder: false,
          line_user_id: null,
        },
        {
          id: nextId,
          name: 'Lookahead Customer',
          phone: '090-0000-0002',
          email: null,
          notes: null,
          custom_attributes: null,
          created_at: '2026-07-08T00:00:00.000Z',
          updated_at: '2026-07-08T00:00:00.000Z',
          consent_marketing: false,
          consent_reminder: false,
          line_user_id: null,
        },
      ],
      error: null,
    });
    const orderById = jest.fn().mockReturnValue({ limit });
    const orderByCreatedAt = jest.fn().mockReturnValue({ order: orderById });
    const cursorFilter = jest.fn().mockReturnValue({ order: orderByCreatedAt });
    const eqDeleted = jest.fn().mockReturnValue({ or: cursorFilter });
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
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/customers/route');
    const request = new NextRequest(
      `http://localhost/api/customers?clinic_id=${validClinicId}&limit=1&cursor=${encodedCursor}`
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(cursorFilter).toHaveBeenCalledWith(
      `created_at.lt.${cursorPayload.createdAt},and(created_at.eq.${cursorPayload.createdAt},id.lt.${cursorPayload.id})`
    );
    expect(limit).toHaveBeenCalledWith(2);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0].id).toBe(validId);
    expect(decodeCustomerCursor(json.data.nextCursor)).toEqual({
      createdAt: '2026-07-09T00:00:00.000Z',
      id: validId,
    });
  });

  it('returns 403 for manager customer list access', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: Response.json(
        { success: false, error: managerDeniedMessage },
        { status: 403 }
      ),
    });

    const { GET } = await import('@/app/api/customers/route');
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams({ clinic_id: validClinicId }),
      },
      url: `http://localhost/api/customers?clinic_id=${validClinicId}`,
      method: 'GET',
    } as unknown as NextRequest;
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe(managerDeniedMessage);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId: validClinicId,
      requireClinicMatch: true,
      deniedRoles: ['manager'],
      deniedRoleMessage: managerDeniedMessage,
    });
  });

  it('returns 403 for manager customer detail access', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: Response.json(
        { success: false, error: managerDeniedMessage },
        { status: 403 }
      ),
    });

    const { GET } = await import('@/app/api/customers/route');
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams({
          clinic_id: validClinicId,
          id: validId,
        }),
      },
      url: `http://localhost/api/customers?clinic_id=${validClinicId}&id=${validId}`,
      method: 'GET',
    } as unknown as NextRequest;
    const response = await GET(request);

    expect(response.status).toBe(403);
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
    ensureClinicAccessMock.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com' },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as unknown as NextRequest);

    expect(response.status).toBe(201);
    // processApiRequest is now called only once (not twice)
    expect(processApiRequestMock).toHaveBeenCalledTimes(1);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      '/api/unknown',
      validClinicId,
      {
        requireClinicMatch: true,
        allowedRoles: undefined,
      }
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
  });

  it('returns 403 for manager create access', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: Response.json(
        { success: false, error: managerDeniedMessage },
        { status: 403 }
      ),
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe(managerDeniedMessage);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requireBody: true,
        deniedRoles: ['manager'],
        deniedRoleMessage: managerDeniedMessage,
      })
    );
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('returns auth error when processApiRequest fails on first call', async () => {
    const { createErrorResponse } = jest.requireActual('@/lib/api-helpers');
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: createErrorResponse('認証エラー', 401),
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as unknown as NextRequest);

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
    const response = await POST({} as unknown as NextRequest);

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
    ensureClinicAccessMock.mockRejectedValueOnce(
      new AppError(
        ERROR_CODES.AUTHORIZATION_ERROR,
        'このクリニックへのアクセス権がありません',
        403
      )
    );

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as unknown as NextRequest);

    expect(response.status).toBe(403);
  });

  it('returns a specific message when customer clinic reference is missing', async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23503',
        message:
          'insert or update on table "customers" violates foreign key constraint "customers_clinic_id_fkey"',
      },
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
        name: 'Test',
        phone: '090-0000-0000',
      },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    canAccessClinicScopeMock.mockReturnValue(true);
    ensureClinicAccessMock.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'a@b.com' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe(
      '患者を登録する院データが見つかりません。院の選択を確認してください'
    );
  });
});

describe('PATCH /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureClinicAccessMock.mockReset();
  });

  it.each<{
    label: string;
    patch: Record<string, unknown>;
    expected: Record<string, unknown>;
  }>([
    {
      label: '名前だけ変更してemailとnotesを保持',
      patch: { name: '変更後' },
      expected: { name: '変更後' },
    },
    {
      label: '電話だけ変更して他項目を保持',
      patch: { phone: '090-2222-3333' },
      expected: { phone: '090-2222-3333' },
    },
    {
      label: 'emailを意図した値へ変更',
      patch: { email: ' new@example.com ' },
      expected: { email: 'new@example.com' },
    },
    {
      label: 'notesを意図した値へ変更',
      patch: { notes: ' 新しいメモ ' },
      expected: { notes: '新しいメモ' },
    },
    {
      label: 'emailのnullを明示削除として扱う',
      patch: { email: null },
      expected: { email: null },
    },
    {
      label: 'notesのnullを明示削除として扱う',
      patch: { notes: null },
      expected: { notes: null },
    },
    {
      label: 'フォームの空emailを明示削除として扱う',
      patch: { email: '' },
      expected: { email: null },
    },
    {
      label: '空白notesを明示削除として扱う',
      patch: { notes: '   ' },
      expected: { notes: null },
    },
    {
      label: 'undefinedは未指定として保持',
      patch: { name: '変更後', email: undefined, notes: undefined },
      expected: { name: '変更後' },
    },
  ])('$label', async ({ patch, expected }) => {
    const original = {
      id: validId,
      name: '既存の患者',
      phone: '090-0000-1111',
      email: 'existing@example.com',
      notes: '消えてはいけないメモ',
      custom_attributes: { source: '受付' },
    };
    let stored: Record<string, unknown> = { ...original };
    const single = jest.fn(async () => ({ data: stored, error: null }));
    const select = jest.fn(() => ({ single }));
    const eqClinic = jest.fn(() => ({ select }));
    const eqId = jest.fn(() => ({ eq: eqClinic }));
    const update = jest.fn((values: Record<string, unknown>) => {
      // PostgRESTへ送るJSONと同じくundefinedキーだけを除外し、nullは実際に保存する。
      stored = {
        ...stored,
        ...Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== undefined)
        ),
      };
      return { eq: eqId };
    });
    const from = jest.fn(() => ({ update }));
    const permissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: { clinic_id: validClinicId, id: validId, ...patch },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    canAccessClinicScopeMock.mockReturnValue(true);
    ensureClinicAccessMock.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'staff@example.com' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/customers/route');
    const request = new NextRequest('http://localhost/api/customers', {
      method: 'PATCH',
      body: JSON.stringify({ clinic_id: validClinicId, id: validId, ...patch }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(stored).toEqual({ ...original, ...expected });
    expect((await response.json()).data).toEqual({ ...original, ...expected });
    expect(eqId).toHaveBeenCalledWith('id', validId);
    expect(eqClinic).toHaveBeenCalledWith('clinic_id', validClinicId);
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
    ensureClinicAccessMock.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com' },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { PATCH } = await import('@/app/api/customers/route');
    const response = await PATCH({} as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      '/api/unknown',
      validClinicId,
      {
        requireClinicMatch: true,
        allowedRoles: undefined,
      }
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
  });

  it('returns 403 for manager update access', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: false,
      error: Response.json(
        { success: false, error: managerDeniedMessage },
        { status: 403 }
      ),
    });

    const { PATCH } = await import('@/app/api/customers/route');
    const response = await PATCH({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe(managerDeniedMessage);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requireBody: true,
        deniedRoles: ['manager'],
        deniedRoleMessage: managerDeniedMessage,
      })
    );
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
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
    ensureClinicAccessMock.mockRejectedValueOnce(
      new AppError(
        ERROR_CODES.AUTHORIZATION_ERROR,
        'このクリニックへのアクセス権がありません',
        403
      )
    );

    const { PATCH } = await import('@/app/api/customers/route');
    const response = await PATCH({} as unknown as NextRequest);

    expect(response.status).toBe(403);
  });
});
