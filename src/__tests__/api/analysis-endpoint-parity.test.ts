/**
 * 🔴 Red: 分析エンドポイントの同値性テスト
 *
 * /api/patients と /api/customers/analysis が同じレスポンスを返すことを保証する
 */

import { ensureClinicAccess } from '@/lib/supabase/guards';
import { getRequestInfo } from '@/lib/audit-logger';

jest.mock('@/lib/supabase/guards');
jest.mock('@/lib/audit-logger');

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;
const getRequestInfoMock = getRequestInfo as jest.Mock;

let getPatientsHandler: (request: {
  nextUrl: { searchParams: URLSearchParams };
}) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

let getCustomersAnalysisHandler: (request: {
  nextUrl: { searchParams: URLSearchParams };
}) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

beforeAll(async () => {
  const patientsModule = await import('@/app/api/patients/route');
  const customersAnalysisModule =
    await import('@/app/api/customers/analysis/route');
  getPatientsHandler = patientsModule.GET as typeof getPatientsHandler;
  getCustomersAnalysisHandler =
    customersAnalysisModule.GET as typeof getCustomersAnalysisHandler;
});

const createRequest = (clinicId: string) => ({
  nextUrl: {
    searchParams: new URLSearchParams({ clinic_id: clinicId }),
  },
});

describe('🔴 Red: Analysis Endpoint Parity', () => {
  const clinicId = '11111111-1111-4111-8111-111111111111';
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
  };

  const mockPatients = [
    {
      patient_id: 'patient-1',
      patient_name: '田中太郎',
      clinic_id: clinicId,
      visit_count: 5,
      total_revenue: 50000,
      last_visit_date: '2025-01-15',
      visit_category: '中度リピート',
    },
    {
      patient_id: 'patient-2',
      patient_name: '佐藤花子',
      clinic_id: clinicId,
      visit_count: 10,
      total_revenue: 100000,
      last_visit_date: '2025-01-20',
      visit_category: '高度リピート',
    },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    getRequestInfoMock.mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            returns: jest.fn().mockResolvedValue({
              data: mockPatients,
              error: null,
            }),
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({ data: 100000 }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: mockUser,
    });
  });

  it('🔴 両エンドポイントが同じペイロードを返す', async () => {
    const request = createRequest(clinicId);

    // 両方のエンドポイントを呼び出す
    const [patientsResponse, customersAnalysisResponse] = await Promise.all([
      getPatientsHandler(request),
      getCustomersAnalysisHandler(request),
    ]);

    expect(patientsResponse.status).toBe(200);
    expect(customersAnalysisResponse.status).toBe(200);

    const patientsData = await patientsResponse.json();
    const customersAnalysisData = await customersAnalysisResponse.json();

    // ペイロードが完全に一致することを確認
    expect(customersAnalysisData).toEqual(patientsData);
  });

  it('🔴 両エンドポイントが同じ構造のデータを返す', async () => {
    const request = createRequest(clinicId);

    const [patientsResponse, customersAnalysisResponse] = await Promise.all([
      getPatientsHandler(request),
      getCustomersAnalysisHandler(request),
    ]);

    const patientsData = await patientsResponse.json();
    const customersAnalysisData = await customersAnalysisResponse.json();

    // データ構造が同じであることを確認
    expect(Object.keys(customersAnalysisData)).toEqual(
      Object.keys(patientsData)
    );

    // 必須フィールドの存在を確認
    const requiredFields = ['success', 'data'];

    requiredFields.forEach(field => {
      expect(customersAnalysisData).toHaveProperty(field);
      expect(patientsData).toHaveProperty(field);
    });

    if (
      (customersAnalysisData as any).success &&
      (patientsData as any).success
    ) {
      const requiredDataFields = [
        'conversionData',
        'visitCounts',
        'riskScores',
        'ltvRanking',
        'segmentData',
        'followUpList',
        'totalPatients',
        'activePatients',
      ];

      requiredDataFields.forEach(field => {
        expect((customersAnalysisData as any).data).toHaveProperty(field);
        expect((patientsData as any).data).toHaveProperty(field);
      });
    }
  });

  it('🔴 エラーケースでも両エンドポイントが同じ挙動をする', async () => {
    const invalidRequest = createRequest('invalid-uuid');

    const [patientsResponse, customersAnalysisResponse] = await Promise.all([
      getPatientsHandler(invalidRequest),
      getCustomersAnalysisHandler(invalidRequest),
    ]);

    // 両方とも同じステータスコードを返す
    expect(customersAnalysisResponse.status).toBe(patientsResponse.status);

    const patientsError = await patientsResponse.json();
    const customersAnalysisError = await customersAnalysisResponse.json();

    // エラーレスポンスの構造が同じ
    expect((customersAnalysisError as any).success).toBe(
      (patientsError as any).success
    );
    expect((customersAnalysisError as any).success).toBe(false);
  });
});
