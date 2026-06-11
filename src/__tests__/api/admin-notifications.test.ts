import type { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createScopedAdminContext,
  ScopeAccessError,
} from '@/lib/supabase/scoped-admin';

const mockAdminClient = {
  from: jest.fn(),
};
const mockAssertClinicInScope = jest.fn();
const mockClinicId = '22222222-2222-4222-8222-222222222222';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createScopedAdminContext: jest.fn(() => ({
    client: mockAdminClient,
    scopedClinicIds: [mockClinicId],
    assertClinicInScope: mockAssertClinicInScope,
  })),
  ScopeAccessError: class ScopeAccessError extends Error {},
  ScopeNotConfiguredError: class ScopeNotConfiguredError extends Error {},
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

function toNextRequest(input: string, init?: RequestInit): NextRequest {
  return new Request(input, init) as unknown as NextRequest;
}

function createListQueryMock(result: {
  data: unknown[];
  count: number;
  error: unknown;
}) {
  const query = {
    eq: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
  };
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue(result);
  return query;
}

function createCountQueryMock(result: { count: number; error: unknown }) {
  const query = {
    ...result,
    eq: jest.fn(),
  };
  query.eq.mockReturnValue(query);
  return query;
}

function createUpdateQueryMock(result: { data: unknown[]; error: unknown }) {
  const query = {
    eq: jest.fn(),
    in: jest.fn(),
    select: jest.fn(),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.select.mockResolvedValue(result);
  return query;
}

describe('/api/admin/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminClient.from.mockReset();
    mockAssertClinicInScope.mockReset();
    createScopedAdminContextMock.mockClear();
    processApiRequestMock.mockImplementation(async (request: Request) => {
      const body =
        request.method === 'PATCH' ? await request.json() : undefined;
      return {
        success: true,
        auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        permissions: {
          role: 'admin',
          clinic_id: mockClinicId,
          clinic_scope_ids: [mockClinicId],
        },
        supabase: {},
        body,
      };
    });
  });

  it('GET: clinic scope と未読数を使ってadmin通知一覧を返す', async () => {
    const listQuery = createListQueryMock({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: 'admin-1',
          clinic_id: mockClinicId,
          title: '重要通知',
          message: '本文',
          type: 'security',
          is_read: false,
          related_entity_type: null,
          related_entity_id: null,
          created_at: '2026-04-22T00:00:00Z',
          read_at: null,
        },
      ],
      count: 1,
      error: null,
    });
    const countQuery = createCountQueryMock({ count: 1, error: null });

    mockAdminClient.from
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue(listQuery) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue(countQuery) });

    const { GET } = await import('@/app/api/admin/notifications/route');
    const response = await GET(
      toNextRequest(
        `http://localhost/api/admin/notifications?clinic_id=${mockClinicId}&unread_only=true`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.unreadCount).toBe(1);
    expect(mockAssertClinicInScope).toHaveBeenCalledWith(mockClinicId);
    expect(listQuery.eq).toHaveBeenCalledWith('clinic_id', mockClinicId);
    expect(listQuery.eq).toHaveBeenCalledWith('is_read', false);
    expect(countQuery.eq).toHaveBeenCalledWith('is_read', false);
  });

  it('GET: scope外clinicは403を返し通知を読まない', async () => {
    const scopeOutClinicId = '33333333-3333-4333-8333-333333333333';
    mockAssertClinicInScope.mockImplementation(() => {
      throw new ScopeAccessError();
    });

    const { GET } = await import('@/app/api/admin/notifications/route');
    const response = await GET(
      toNextRequest(
        `http://localhost/api/admin/notifications?clinic_id=${scopeOutClinicId}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockAssertClinicInScope).toHaveBeenCalledWith(scopeOutClinicId);
    expect(mockAdminClient.from).not.toHaveBeenCalled();
  });

  it('PATCH: ids指定で通知を既読化し、更新後の未読数を返す', async () => {
    const updateQuery = createUpdateQueryMock({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          is_read: true,
          read_at: '2026-04-22T00:00:00Z',
        },
      ],
      error: null,
    });
    const countQuery = createCountQueryMock({ count: 0, error: null });
    const update = jest.fn().mockReturnValue(updateQuery);

    mockAdminClient.from
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue(countQuery) });

    const { PATCH } = await import('@/app/api/admin/notifications/route');
    const response = await PATCH(
      toNextRequest('http://localhost/api/admin/notifications', {
        method: 'PATCH',
        body: JSON.stringify({
          clinic_id: mockClinicId,
          ids: ['11111111-1111-4111-8111-111111111111'],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updatedIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(body.data.unreadCount).toBe(0);
    expect(update).toHaveBeenCalledWith({
      is_read: true,
      read_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(updateQuery.eq).toHaveBeenCalledWith('clinic_id', mockClinicId);
    expect(updateQuery.in).toHaveBeenCalledWith('id', [
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('PATCH: mark_all はclinic内の未読通知だけを一括既読にする', async () => {
    const updateQuery = createUpdateQueryMock({
      data: [],
      error: null,
    });
    const countQuery = createCountQueryMock({ count: 0, error: null });

    mockAdminClient.from
      .mockReturnValueOnce({ update: jest.fn().mockReturnValue(updateQuery) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnValue(countQuery) });

    const { PATCH } = await import('@/app/api/admin/notifications/route');
    const response = await PATCH(
      toNextRequest('http://localhost/api/admin/notifications', {
        method: 'PATCH',
        body: JSON.stringify({
          clinic_id: mockClinicId,
          mark_all: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updateQuery.eq).toHaveBeenCalledWith('clinic_id', mockClinicId);
    expect(updateQuery.eq).toHaveBeenCalledWith('is_read', false);
    expect(updateQuery.in).not.toHaveBeenCalled();
  });
});
