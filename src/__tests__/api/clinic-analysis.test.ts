import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const ensureClinicAccessMock = jest.fn();
const createAdminClientMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

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

describe('GET /api/clinic/analysis', () => {
  beforeEach(() => {
    ensureClinicAccessMock.mockReset();
    createAdminClientMock.mockReset();
  });

  it('TC-CA01: clinic_id なしで 400 を返す', async () => {
    const response = await GET(buildRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('TC-CA02: 不正な UUID 形式で 400 を返す', async () => {
    const response = await GET(buildRequest({ clinic_id: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('TC-CA03: 未認証リクエストは 401 を返す', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401)
    );

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('TC-CA04: 別クリニックのユーザーは 403 を返す', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden clinic access', 403)
    );

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('TC-CA05: 正常系 — clinic_id フィルタ付きでデータを返す', async () => {
    const revenueData = [
      { amount: 10000, created_at: '2026-03-01T00:00:00Z' },
      { amount: 20000, created_at: '2026-03-02T00:00:00Z' },
    ];
    const patientData = [{ is_new: true, created_at: '2026-03-01T00:00:00Z' }];
    const therapistData = [
      { staff_name: '田中太郎', average_satisfaction_score: 90 },
    ];
    const revenueChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: revenueData, error: null }),
    };
    const patientChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: patientData, error: null }),
    };
    const therapistChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: therapistData, error: null }),
    };
    const authenticatedFrom = jest
      .fn()
      .mockReturnValueOnce(patientChain)
      .mockReturnValueOnce(therapistChain);
    const adminFrom = jest.fn().mockReturnValue(revenueChain);

    ensureClinicAccessMock.mockResolvedValue({
      supabase: { from: authenticatedFrom },
    });
    createAdminClientMock.mockReturnValue({ from: adminFrom });

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.salesData).toHaveLength(2);
    expect(body.data.patientData).toHaveLength(1);
    expect(body.data.therapistData).toHaveLength(1);
    expect(body.data.therapistData[0].staff_name).toBe('田中太郎');
    expect(body.data.therapistData[0].performance_score).toBe(90);
    expect(adminFrom).toHaveBeenCalledWith('revenues');
    expect(authenticatedFrom).not.toHaveBeenCalledWith('revenues');
    expect(authenticatedFrom).toHaveBeenNthCalledWith(1, 'patients');
    expect(authenticatedFrom).toHaveBeenNthCalledWith(
      2,
      'staff_performance_summary'
    );
    expect(revenueChain.eq).toHaveBeenCalledWith('clinic_id', TEST_CLINIC_ID);

    const guardCallOrder = ensureClinicAccessMock.mock.invocationCallOrder[0];
    const adminCallOrder = createAdminClientMock.mock.invocationCallOrder[0];
    expect(guardCallOrder).toBeDefined();
    expect(adminCallOrder).toBeDefined();
    if (guardCallOrder === undefined || adminCallOrder === undefined) {
      throw new Error('Expected guard and admin client call order evidence');
    }
    expect(guardCallOrder).toBeLessThan(adminCallOrder);
  });

  it('TC-CA06: Supabase エラー時は 500 を返す', async () => {
    const successfulAuthenticatedChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const revenueErrorChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: {
        from: jest.fn().mockReturnValue(successfulAuthenticatedChain),
      },
    });
    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(revenueErrorChain),
    });

    const response = await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('TC-CA07: clinic_id フィルタが service-role revenues クエリに適用されること', async () => {
    const revenueChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const authenticatedChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const authenticatedFrom = jest.fn().mockReturnValue(authenticatedChain);
    const adminFrom = jest.fn().mockReturnValue(revenueChain);

    ensureClinicAccessMock.mockResolvedValue({
      supabase: { from: authenticatedFrom },
    });
    createAdminClientMock.mockReturnValue({ from: adminFrom });

    await GET(buildRequest({ clinic_id: TEST_CLINIC_ID }));

    expect(adminFrom).toHaveBeenCalledWith('revenues');
    expect(authenticatedFrom).not.toHaveBeenCalledWith('revenues');
    expect(revenueChain.eq).toHaveBeenCalledWith('clinic_id', TEST_CLINIC_ID);
  });
});
