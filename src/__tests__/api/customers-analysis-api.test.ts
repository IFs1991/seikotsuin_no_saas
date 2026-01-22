import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger } from '@/lib/audit-logger';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logDataAccess: jest.fn(),
  },
  getRequestInfo: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let getHandler: (request: {
  nextUrl: { searchParams: URLSearchParams };
}) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

beforeAll(async () => {
  const analysisModule = await import('@/app/api/customers/analysis/route');
  getHandler = analysisModule.GET as typeof getHandler;
});

const createGetRequest = (clinicId: string) => ({
  nextUrl: {
    searchParams: new URLSearchParams({ clinic_id: clinicId }),
  },
});

describe('🔴 Red: GET /api/customers/analysis', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('clinic_idが無効な場合はバリデーションエラーを返す', async () => {
    const request = createGetRequest('not-a-uuid');

    const response = await getHandler(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect((payload as { success: boolean }).success).toBe(false);
  });

  it('clinic_idが有効な場合は患者分析データを返す', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [
              {
                patient_id: 'patient-1',
                patient_name: '田中太郎',
                clinic_id: clinicId,
                visit_count: 5,
                total_revenue: 50000,
                last_visit_date: '2025-01-15',
                visit_category: '中度リピート',
              },
            ],
            error: null,
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({ data: 100000 }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: mockUser,
    });

    const request = createGetRequest(clinicId);
    const response = await getHandler(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect((payload as { success: boolean }).success).toBe(true);
    expect((payload as any).data).toHaveProperty('conversionData');
    expect((payload as any).data).toHaveProperty('visitCounts');
    expect((payload as any).data).toHaveProperty('riskScores');
    expect((payload as any).data).toHaveProperty('ltvRanking');
    expect((payload as any).data).toHaveProperty('followUpList');
  });

  it('ensureClinicAccessを呼び出してクリニック境界をチェックする', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({ data: 0 }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: mockUser,
    });

    const request = createGetRequest(clinicId);
    await getHandler(request);

    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/customers/analysis',
      clinicId,
      { requireClinicMatch: true }
    );
  });

  it('AuditLogger.logDataAccessを呼び出してアクセスログを記録する', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({ data: 0 }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: mockUser,
    });

    const request = createGetRequest(clinicId);
    await getHandler(request);

    expect(AuditLogger.logDataAccess).toHaveBeenCalledWith(
      mockUser.id,
      mockUser.email,
      'patient_visit_summary',
      clinicId,
      clinicId,
      '127.0.0.1',
      expect.any(Object)
    );
  });
});
