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

function createListQueryMock() {
  const range = jest.fn().mockResolvedValue({ data: [], count: 0, error: null });
  const order = jest.fn().mockReturnValue({ range });
  const eqIsRead = jest.fn().mockReturnValue({ order, range });
  const eqUser = jest.fn().mockReturnValue({ eq: eqIsRead, order, range });
  const select = jest.fn().mockReturnValue({ eq: eqUser });

  return { select, eqUser };
}

function createUnreadCountQueryMock() {
  const eqIsRead = jest.fn().mockResolvedValue({ count: 0, error: null });
  const eqUser = jest.fn().mockReturnValue({ eq: eqIsRead });
  const select = jest.fn().mockReturnValue({ eq: eqUser });

  return { select };
}

describe('RLS: /api/notifications endpoint-level filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-RLS01: staff ユーザーは endpoint-level で自分の通知のみ取得する', async () => {
    const listQuery = createListQueryMock();
    const countQuery = createUnreadCountQueryMock();

    const from = jest
      .fn()
      .mockReturnValueOnce({ select: listQuery.select })
      .mockReturnValueOnce({ select: countQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'staff-user', email: 's@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-a' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    await GET(new Request('http://localhost/api/notifications') as any);

    expect(listQuery.eqUser).toHaveBeenCalledWith('user_id', 'staff-user');
  });

  it('TC-RLS09: clinic_admin/admin でも他ユーザー通知取得を許可しない', async () => {
    const listQuery = createListQueryMock();
    const countQuery = createUnreadCountQueryMock();

    const from = jest
      .fn()
      .mockReturnValueOnce({ select: listQuery.select })
      .mockReturnValueOnce({ select: countQuery.select });

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-user',
        email: 'admin@example.com',
        role: 'clinic_admin',
      },
      permissions: { role: 'clinic_admin', clinic_id: 'clinic-a' },
      supabase: { from },
    });

    const { GET } = await import('@/app/api/notifications/route');
    await GET(new Request('http://localhost/api/notifications') as any);

    expect(listQuery.eqUser).toHaveBeenCalledWith('user_id', 'admin-user');
  });
});
