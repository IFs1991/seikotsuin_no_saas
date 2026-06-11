import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import { fetchManagerPatientVisitSummaryRows } from '@/lib/services/patient-analysis-service';
import {
  fetchManagerPatientPeriodSeries,
  fetchManagerPatientPeriodTotals,
} from '@/lib/services/manager-patient-period-service';
import type { ManagerPatientAnalysisResponse } from '@/lib/manager-patient-analysis';

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
  resolveManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/services/patient-analysis-service', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/services/patient-analysis-service')
  >('@/lib/services/patient-analysis-service');

  return {
    ...actual,
    fetchManagerPatientVisitSummaryRows: jest.fn(),
  };
});

jest.mock('@/lib/services/manager-patient-period-service', () => ({
  fetchManagerPatientPeriodSeries: jest.fn(),
  fetchManagerPatientPeriodTotals: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinics
);
const createAdminClientMock = jest.mocked(createAdminClient);
const fetchRowsMock = jest.mocked(fetchManagerPatientVisitSummaryRows);
const fetchPeriodTotalsMock = jest.mocked(fetchManagerPatientPeriodTotals);
const fetchPeriodSeriesMock = jest.mocked(fetchManagerPatientPeriodSeries);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerPatientAnalysisResponse;
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

async function getAnalysis(path = '/api/manager/patients/analysis') {
  const { GET } = await import('@/app/api/manager/patients/analysis/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/patients/analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    createAdminClientMock.mockReturnValue({ from: jest.fn() });
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
    fetchPeriodTotalsMock.mockResolvedValue([
      {
        clinic_id: clinicA,
        patient_count: 1,
        new_patients: 1,
        repeat_patients: 1,
        converted_new_patients: 1,
        visit_count: 2,
        total_revenue: 12000,
      },
    ]);
    fetchPeriodSeriesMock.mockResolvedValue([
      {
        bucket_start: '2026-06-01',
        bucket_end: '2026-06-30',
        patient_count: 1,
        new_patients: 1,
        repeat_patients: 1,
        converted_new_patients: 1,
        visit_count: 2,
        total_revenue: 12000,
      },
    ]);
    fetchRowsMock.mockResolvedValue([
      {
        clinic_id: clinicA,
        patient_id: '11111111-1111-4111-8111-000000000001',
        patient_name: '池袋 太郎',
        first_visit_date: '2026-05-01',
        last_visit_date: '2026-05-10',
        visit_count: 2,
        total_revenue: 12000,
        average_revenue_per_visit: 6000,
        treatment_period_days: 9,
        visit_category: '軽度リピート',
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

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getAnalysis();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns empty summary when manager has no active assignments and ignores fallback clinic scope', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const response = await getAnalysis(
      `/api/manager/patients/analysis?clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.summary.assignedClinicCount).toBe(0);
    expect(json.data.clinics).toEqual([]);
    expect(json.data.selectedClinic).toBeNull();
    expect(fetchRowsMock).not.toHaveBeenCalled();
    expect(fetchPeriodTotalsMock).not.toHaveBeenCalled();
    expect(fetchPeriodSeriesMock).not.toHaveBeenCalled();
  });

  it('returns assigned clinic aggregate from RPC period data', async () => {
    const response = await getAnalysis();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(fetchRowsMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      clinicIds: [clinicA],
      selectedClinicId: clinicA,
    });
    expect(fetchPeriodTotalsMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String)
    );
    expect(fetchPeriodSeriesMock).toHaveBeenCalledWith(
      expect.any(Object),
      [clinicA],
      expect.any(String),
      expect.any(String),
      'daily'
    );
    expect(json.data.summary).toMatchObject({
      assignedClinicCount: 1,
      totalPatients: 1,
      newPatients: 1,
      returnPatients: 1,
      visitCount: 2,
      totalRevenue: 12000,
    });
    expect(json.data.period).toEqual({
      type: 'month',
      startDate: expect.any(String),
      endDate: expect.any(String),
      bucket: 'daily',
    });
    expect(json.data.charts.revenue[0]).toMatchObject({
      bucketStart: '2026-06-01',
      bucketEnd: '2026-06-30',
      value: 12000,
    });
    expect(json.data.clinics[0] && 'riskScores' in json.data.clinics[0]).toBe(
      false
    );
    expect(json.data.selectedClinic?.riskScores[0]?.name).toBe('池袋 太郎');
  });

  it('returns 403 when focused clinic_id is not actively assigned', async () => {
    const response = await getAnalysis(
      `/api/manager/patients/analysis?clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
    expect(fetchRowsMock).not.toHaveBeenCalled();
    expect(fetchPeriodTotalsMock).not.toHaveBeenCalled();
    expect(fetchPeriodSeriesMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid query parameters', async () => {
    const invalidPeriod = await getAnalysis(
      '/api/manager/patients/analysis?period=quarter'
    );
    const invalidClinic = await getAnalysis(
      '/api/manager/patients/analysis?clinic_id=not-a-uuid'
    );
    const invalidCustom = await getAnalysis(
      '/api/manager/patients/analysis?period=custom&start_date=2026-99-01&end_date=2026-06-10'
    );
    const invalidClinicTarget = await getAnalysis(
      '/api/manager/patients/analysis?target=clinic'
    );

    expect(invalidPeriod.status).toBe(400);
    expect(invalidClinic.status).toBe(400);
    expect(invalidCustom.status).toBe(400);
    expect(invalidClinicTarget.status).toBe(400);
  });
});
