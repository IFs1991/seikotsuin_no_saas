import { NextRequest } from 'next/server';
import { GET } from '@/app/api/customers/identity-candidates/route';

const mockProcessApiRequest = jest.fn();
const mockAssertClinicInScope = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: (...args: unknown[]) => mockProcessApiRequest(...args),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(() => ({
      assertClinicInScope: mockAssertClinicInScope,
    })),
  };
});

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
    ilike: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    order: jest.fn(() => chain),
    returns: jest.fn(() => chain),
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

describe('GET /api/customers/identity-candidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessApiRequest.mockResolvedValue({
      success: true,
      id: 'user-001',
      permissions: { clinicId: CLINIC_ID },
    });
  });

  it('canonical氏名・電話に一致しなくてもnormalized aliasだけで患者を発見する', async () => {
    mockFrom
      .mockReturnValueOnce(query([{ customer_id: CUSTOMER_ID }]))
      .mockReturnValueOnce(
        query([
          {
            id: CUSTOMER_ID,
            name: '山田 太郎',
            name_kana: 'やまだ たろう',
            phone: '09011112222',
            normalized_phone: '09011112222',
            line_user_id: null,
            created_at: '2025-01-01T00:00:00.000Z',
          },
        ])
      )
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(
        query([
          {
            id: 'alias-001',
            clinic_id: CLINIC_ID,
            customer_id: CUSTOMER_ID,
            alias: '山田さん',
            normalized_alias: '山田さん',
            alias_type: 'other',
            source: 'manual',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ])
      )
      .mockReturnValueOnce(query([]));

    const request = new NextRequest(
      `http://localhost/api/customers/identity-candidates?clinic_id=${CLINIC_ID}&name=${encodeURIComponent('山田さん')}`
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        candidates: [
          expect.objectContaining({
            customerId: CUSTOMER_ID,
            displayName: '山田 太郎',
            score: 20,
          }),
        ],
      },
    });
    expect(mockAssertClinicInScope).toHaveBeenCalledWith(CLINIC_ID);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'patient_identity_aliases');
  });

  it('氏名・電話・LINE IDがすべて空なら400を返す', async () => {
    const request = new NextRequest(
      `http://localhost/api/customers/identity-candidates?clinic_id=${CLINIC_ID}`
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(mockProcessApiRequest).not.toHaveBeenCalled();
  });

  it('他clinicまたはmanager拒否はデータ検索前にそのまま返す', async () => {
    mockProcessApiRequest.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: 'Clinic access denied' },
        { status: 403 }
      ),
    });
    const request = new NextRequest(
      `http://localhost/api/customers/identity-candidates?clinic_id=${CLINIC_ID}&name=${encodeURIComponent('山田')}`
    );

    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockProcessApiRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        clinicId: CLINIC_ID,
        requireClinicMatch: true,
        deniedRoles: ['manager'],
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
