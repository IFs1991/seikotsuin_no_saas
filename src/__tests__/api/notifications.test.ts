import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;

function createNotificationsQueryMock(result: {
  data: unknown[];
  count: number;
  error: unknown;
}) {
  const range = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ range });
  const eqIsRead = jest.fn().mockReturnValue({ order, range });
  const eqUser = jest.fn().mockReturnValue({
    eq: eqIsRead,
    order,
    range,
  });
  const select = jest.fn().mockReturnValue({
    eq: eqUser,
  });

  return {
    select,
    eqUser,
    eqIsRead,
    order,
    range,
  };
}

function createUnreadCountQueryMock(result: { count: number; error: unknown }) {
  const eqIsRead = jest.fn().mockResolvedValue(result);
  const eqUser = jest.fn().mockReturnValue({ eq: eqIsRead });
  const select = jest.fn().mockReturnValue({ eq: eqUser });

  return {
    select,
    eqUser,
    eqIsRead,
  };
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-N01: 認証済みユーザーが自分の通知一覧を取得できる', async () => {
    const mockRows = [
      {
        id: 'n-1',
        user_id: 'user-1',
        title: '通知A',
        message: '本文A',
        is_read: false,
        type: 'appointment_reminder',
        created_at: '2026-02-27T00:00:00Z',
      },
    ];

    const listQuery = createNotificationsQueryMock({
      data: mockRows,
      count: 1,
      error: null,
    });
    const countQuery = createUnreadCountQueryMock({ count: 1, error: null });

    const from = jest
      .fn()
      .mockReturnValueOnce({ select: listQuery.select })
      .mockReturnValueOnce({ select: countQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'u@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    const response = await GET(
      new Request('http://localhost/api/notifications') as any
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toEqual(mockRows);
    expect(body.data.total).toBe(1);
    expect(body.data.unreadCount).toBe(1);
    expect(listQuery.eqUser).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('TC-N02: 未読通知のみフィルタで取得できる', async () => {
    const listQuery = createNotificationsQueryMock({
      data: [],
      count: 0,
      error: null,
    });
    const countQuery = createUnreadCountQueryMock({ count: 0, error: null });

    const from = jest
      .fn()
      .mockReturnValueOnce({ select: listQuery.select })
      .mockReturnValueOnce({ select: countQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'u@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    await GET(
      new Request(
        'http://localhost/api/notifications?unread_only=true&include_count=true'
      ) as any
    );

    expect(listQuery.eqIsRead).toHaveBeenCalledWith('is_read', false);
  });

  it('TC-N05: 未認証リクエストは 401 を返す', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      ),
    });

    const { GET } = await import('@/app/api/notifications/route');
    const response = await GET(
      new Request('http://localhost/api/notifications') as any
    );

    expect(response.status).toBe(401);
  });

  it('TC-N07: limit の上限 (100) を超える値はクランプされる', async () => {
    const listQuery = createNotificationsQueryMock({
      data: [],
      count: 0,
      error: null,
    });

    const from = jest.fn().mockReturnValueOnce({ select: listQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'u@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    await GET(
      new Request('http://localhost/api/notifications?limit=999&include_count=false') as any
    );

    expect(listQuery.range).toHaveBeenCalledWith(0, 99);
  });

  it('TC-N08: clinic_admin/admin でも endpoint-level filter を強制する', async () => {
    const listQuery = createNotificationsQueryMock({
      data: [],
      count: 0,
      error: null,
    });
    const countQuery = createUnreadCountQueryMock({ count: 0, error: null });

    const from = jest
      .fn()
      .mockReturnValueOnce({ select: listQuery.select })
      .mockReturnValueOnce({ select: countQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    await GET(new Request('http://localhost/api/notifications') as any);

    expect(listQuery.eqUser).toHaveBeenCalledWith('user_id', 'admin-1');
  });
});
