import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import {
  fetchManagerRevenueContextBreakdown,
  fetchManagerRevenuePeriodSeries,
  fetchManagerRevenuePeriodTotals,
} from '@/lib/services/manager-revenue-service';
import type { ManagerRevenueAnalysisResponse } from '@/lib/manager-revenue-analysis';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (
    error: string,
    status = 500,
    details?: unknown,
    code?: string
  ) =>
    Response.json(
      {
        success: false,
        error,
        ...(details !== undefined ? { details } : {}),
        ...(code !== undefined ? { code } : {}),
      },
      { status }
    ),
  createSuccessResponse: <T>(data: T, status = 200, message?: string) =>
    Response.json(
      {
        success: true,
        data,
        ...(message !== undefined ? { message } : {}),
      },
      { status }
    ),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/services/manager-revenue-service', () => ({
  fetchManagerRevenueContextBreakdown: jest.fn(),
  fetchManagerRevenuePeriodSeries: jest.fn(),
  fetchManagerRevenuePeriodTotals: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);
const fetchTotalsMock = jest.mocked(fetchManagerRevenuePeriodTotals);
const fetchSeriesMock = jest.mocked(fetchManagerRevenuePeriodSeries);
const fetchContextMock = jest.mocked(fetchManagerRevenueContextBreakdown);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerRevenueAnalysisResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

function isSuccessPayload(value: unknown): value is ApiSuccessPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false &&
    'error' in value
  );
}

function mockAuth(role = 'manager') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'manager-user',
      email: 'manager@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: clinicB,
      clinic_scope_ids: [clinicB],
    },
    supabase: { from: jest.fn() },
  });
}

async function getAnalysis(path = '/api/manager/revenue/analysis') {
  const { GET } = await import('@/app/api/manager/revenue/analysis/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/revenue/analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    createAdminClientMock.mockReturnValue({ from: jest.fn(), rpc: jest.fn() });
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    fetchTotalsMock.mockResolvedValue([
      {
        clinic_id: clinicA,
        operating_revenue: 30000,
        insurance_revenue: 12000,
        private_revenue: 18000,
        product_revenue: 1000,
        ticket_revenue: 0,
        traffic_accident_revenue: 0,
        workers_comp_revenue: 0,
        patient_copay_estimated: 0,
        insurer_receivable_estimated: 0,
        private_revenue_estimated: 0,
        visit_count: 10,
        report_days: 10,
        missing_report_days: 0,
        needs_review_count: 2,
        blocked_count: 1,
        first_report_date: '2026-06-01',
      },
    ]);
    fetchSeriesMock.mockResolvedValue([
      {
        bucket_start: '2026-06-01',
        bucket_end: '2026-06-11',
        operating_revenue: 30000,
        insurance_revenue: 12000,
        private_revenue: 18000,
        visit_count: 10,
      },
    ]);
    fetchContextMock.mockResolvedValue([
      {
        revenue_context_code: 'product',
        revenue_context_name: '物販',
        total_revenue: 1000,
        item_count: 1,
        needs_review_count: 0,
        blocked_count: 0,
      },
    ]);
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      ),
    });

    const response = await getAnalysis();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users including admin', async () => {
    mockAuth('admin');

    const response = await getAnalysis();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns empty data when manager has no active assignments and no clinic_id is requested', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const response = await getAnalysis();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.assignedClinics).toEqual([]);
    expect(json.data.summary.clinicCount).toBe(0);
    expect(fetchTotalsMock).not.toHaveBeenCalled();
    expect(fetchSeriesMock).not.toHaveBeenCalled();
    expect(fetchContextMock).not.toHaveBeenCalled();
  });

  it('does not fallback to permission clinic_id or JWT clinic_scope_ids', async () => {
    const response = await getAnalysis(
      `/api/manager/revenue/analysis?target=total&clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
    expect(fetchTotalsMock).not.toHaveBeenCalled();
  });

  it('returns assigned clinic revenue analysis and calls RPC services with assignment clinic ids', async () => {
    const response = await getAnalysis();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(fetchTotalsMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String)
    );
    expect(fetchTotalsMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String)
    );
    expect(fetchSeriesMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String),
      'daily'
    );
    expect(fetchContextMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String)
    );
    expect(json.data.summary).toMatchObject({
      clinicCount: 1,
      operatingRevenue: 30000,
      visitCount: 10,
      needsReviewCount: 2,
      blockedCount: 1,
    });
    expect(json.data.disclaimers).toEqual(
      expect.arrayContaining([
        'この画面の売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。',
      ])
    );
  });

  it('uses selected clinic ids only for target=clinic series and context while preserving all-clinic comparison', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'assignment-b',
        manager_user_id: 'manager-user',
        clinic_id: clinicB,
        clinic_name: '渋谷院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const response = await getAnalysis(
      `/api/manager/revenue/analysis?target=clinic&clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    expect(fetchTotalsMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      [clinicA, clinicB],
      expect.any(String),
      expect.any(String)
    );
    expect(fetchSeriesMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicB],
      expect.any(String),
      expect.any(String),
      'daily'
    );
    expect(fetchContextMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicB],
      expect.any(String),
      expect.any(String)
    );
  });

  it('returns 400 for invalid query parameters', async () => {
    const invalidPeriod = await getAnalysis(
      '/api/manager/revenue/analysis?period=quarter'
    );
    const invalidClinic = await getAnalysis(
      '/api/manager/revenue/analysis?clinic_id=not-a-uuid'
    );
    const invalidTarget = await getAnalysis(
      '/api/manager/revenue/analysis?target=clinic'
    );
    const invalidCompare = await getAnalysis(
      '/api/manager/revenue/analysis?compare=previous_year'
    );

    expect(invalidPeriod.status).toBe(400);
    expect(invalidClinic.status).toBe(400);
    expect(invalidTarget.status).toBe(400);
    expect(invalidCompare.status).toBe(400);
  });
});
