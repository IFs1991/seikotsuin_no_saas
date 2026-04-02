import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const ensureClinicAccessMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

jest.mock('@/lib/error-handler', () => {
  const actual = jest.requireActual('@/lib/error-handler');
  return {
    ...actual,
    logError: jest.fn(),
  };
});

import { GET } from '@/app/api/clinic/analysis/route';

const TEST_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';

function buildRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/clinic/analysis');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

function createQueryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

describe('GET /api/clinic/analysis', () => {
  beforeEach(() => {
    ensureClinicAccessMock.mockReset();
  });

  it('TC-CA01: clinic_id なしで 400 を返す', async () => {
    const response = await GET(buildRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('TC-CA02: 不正な UUID 形式で 400 を返す', async () => {
    const response = await GET(buildRequest({ clinic_id: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('TC-CA03: 未認証リクエストは 401 を返す', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401)
    );

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('TC-CA04: 別クリニックのユーザーは 403 を返す', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden clinic access', 403)
    );

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(403);
  });

  it('TC-CA05: 正常系 — clinic_id フィルタ付きでデータを返す', async () => {
    const revenueData = [
      { amount: 10000, created_at: '2026-03-01T00:00:00Z' },
      { amount: 20000, created_at: '2026-03-02T00:00:00Z' },
    ];
    const patientData = [
      { is_new: true, created_at: '2026-03-01T00:00:00Z' },
    ];
    const therapistData = [
      { staff_name: '田中太郎', performance_score: 90 },
    ];

    const makeChain = (data: unknown) => {
      const chain: Record<string, jest.Mock> = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data, error: null }),
      };
      // limit が最後ではないケース (patients/therapists) に対応
      chain.order.mockImplementation(function (this: typeof chain) {
        const lastChain: Record<string, jest.Mock> = {
          ...this,
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve({ data, error: null }).then(resolve),
        };
        return lastChain;
      });
      return chain;
    };

    const supabaseMock = {
      from: jest
        .fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: revenueData, error: null }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: patientData, error: null }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: therapistData, error: null }),
        }),
    };

    ensureClinicAccessMock.mockResolvedValue({ supabase: supabaseMock });

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.salesData).toHaveLength(2);
    expect(body.data.patientData).toHaveLength(1);
    expect(body.data.therapistData).toHaveLength(1);
    expect(body.data.therapistData[0].staff_name).toBe('田中太郎');
  });

  it('TC-CA06: Supabase エラー時は 500 を返す', async () => {
    const supabaseMock = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB error' },
        }),
      }),
    };

    ensureClinicAccessMock.mockResolvedValue({ supabase: supabaseMock });

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('TC-CA07: clinic_id フィルタが revenues クエリに適用されること', async () => {
    const revenueChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const otherChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const supabaseMock = {
      from: jest
        .fn()
        .mockReturnValueOnce(revenueChain)
        .mockReturnValueOnce(otherChain)
        .mockReturnValueOnce(otherChain),
    };

    ensureClinicAccessMock.mockResolvedValue({ supabase: supabaseMock });

    await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));

    // revenues テーブルに clinic_id フィルタが適用されていること
    expect(revenueChain.eq).toHaveBeenCalledWith('clinic_id', TEST_CLINIC_ID);
  });
});
