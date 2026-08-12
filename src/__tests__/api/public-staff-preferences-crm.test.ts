import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/public/staff-preferences/route';

const mockCreatePublicClinicContext = jest.fn();
const mockVerifyPublicLineMyPageAuth = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createPublicClinicContext: (...args: unknown[]) =>
      mockCreatePublicClinicContext(...args),
  };
});

jest.mock('@/lib/line/public-my-page-auth', () => ({
  verifyPublicLineMyPageAuth: (...args: unknown[]) =>
    mockVerifyPublicLineMyPageAuth(...args),
}));

jest.mock('@/lib/crm-line/db', () => ({
  createCrmAdminClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

type QueryResult = { data: unknown; error: null };

function query(data: unknown) {
  const result: QueryResult = { data, error: null };
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    order: jest.fn(() => chain),
    returns: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => result),
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined
      );
    },
  };
  return chain;
}

const CLINIC_ID = '00000000-0000-4000-8000-000000000101';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000201';
const STAFF_ID = '00000000-0000-4000-8000-000000000301';

describe('/api/public/staff-preferences CRM rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePublicClinicContext.mockResolvedValue({
      client: { from: jest.fn() },
      clinic: { id: CLINIC_ID, name: 'テスト整骨院', is_active: true },
    });
    mockVerifyPublicLineMyPageAuth.mockResolvedValue({
      ok: true,
      lineUserId: 'Uline-user-001',
      displayName: 'LINE 太郎',
    });
  });

  it('LINE token audienceが不正なら401を返して設定を参照しない', async () => {
    mockVerifyPublicLineMyPageAuth.mockResolvedValue({
      ok: false,
      reason: 'aud_mismatch',
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/public/staff-preferences?clinic_id=${CLINIC_ID}`,
        { headers: { Authorization: 'Bearer wrong-audience-token' } }
      )
    );

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('GETはcompleted/arrived担当履歴のあるactive・bookableスタッフだけを返す', async () => {
    mockFrom
      .mockReturnValueOnce(
        query({
          id: CUSTOMER_ID,
          name: '山田 太郎',
          line_user_id: 'Uline-user-001',
        })
      )
      .mockReturnValueOnce(query([{ staff_id: STAFF_ID }]))
      .mockReturnValueOnce(query([{ id: STAFF_ID, name: '田中先生' }]))
      .mockReturnValueOnce(
        query([
          {
            id: 'preference-001',
            clinic_id: CLINIC_ID,
            customer_id: CUSTOMER_ID,
            staff_id: STAFF_ID,
            notification_enabled: true,
            registered_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ])
      );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/public/staff-preferences?clinic_id=${CLINIC_ID}`,
        { headers: { Authorization: 'Bearer line-id-token' } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        customerId: CUSTOMER_ID,
        staff: [{ id: STAFF_ID, name: '田中先生', notificationEnabled: true }],
      },
    });
  });

  it('PUTは過去担当履歴のないスタッフを409で拒否する', async () => {
    mockFrom
      .mockReturnValueOnce(
        query({
          id: CUSTOMER_ID,
          name: '山田 太郎',
          line_user_id: 'Uline-user-001',
        })
      )
      .mockReturnValueOnce(query({ id: STAFF_ID }))
      .mockReturnValueOnce(query(null));

    const response = await PUT(
      new NextRequest('http://localhost/api/public/staff-preferences', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer line-id-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinic_id: CLINIC_ID,
          staff_id: STAFF_ID,
          notification_enabled: true,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: '過去に担当したスタッフだけを通知対象に設定できます',
    });
  });
});
