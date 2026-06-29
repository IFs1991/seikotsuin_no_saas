import { NextRequest } from 'next/server';

import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logDataAccess: jest.fn(),
  },
  getRequestInfo: jest.fn(),
}));

jest.mock('@/lib/services/patient-analysis-service', () => ({
  generatePatientAnalysis: jest.fn(),
}));

const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const logDataAccessMock = jest.mocked(AuditLogger.logDataAccess);
const getRequestInfoMock = jest.mocked(getRequestInfo);
const generatePatientAnalysisMock = jest.mocked(generatePatientAnalysis);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const scopedSupabase = { from: jest.fn() };
const analysisData = {
  conversionData: {
    newPatients: 2,
    returnPatients: 1,
    conversionRate: 50,
    stages: [{ name: '初回来院', value: 2 }],
  },
  visitCounts: { average: 1.5, monthlyChange: 5.2 },
  riskScores: [
    {
      patient_id: 'patient-1',
      name: '山田 太郎',
      riskScore: 80,
      lastVisit: '2026-06-01',
      category: 'high' as const,
    },
  ],
  ltvRanking: [
    {
      patient_id: 'patient-1',
      name: '山田 太郎',
      ltv: 30000,
      visit_count: 3,
      total_revenue: 30000,
    },
  ],
  segmentData: { visit: [{ label: '中度リピート', value: 1 }] },
  followUpList: [
    {
      patient_id: 'patient-1',
      name: '山田 太郎',
      reason: '80%の離脱リスク',
      lastVisit: '2026-06-01',
      action: '電話フォロー推奨',
    },
  ],
  totalPatients: 1,
  activePatients: 1,
};

function buildRequest(search: string) {
  return new NextRequest(
    `http://localhost/api/mobile-uiux/patient-analysis${search}`
  );
}

describe('GET /api/mobile-uiux/patient-analysis', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    getRequestInfoMock.mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    ensureClinicAccessMock.mockResolvedValue({
      supabase: scopedSupabase,
      user: { id: 'user-1', email: 'staff@example.com' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
    });
    generatePatientAnalysisMock.mockResolvedValue(analysisData);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the PC customers analysis service after clinic scope guard and audits data access', async () => {
    const { GET } = await import(
      '@/app/api/mobile-uiux/patient-analysis/route'
    );
    const request = buildRequest(`?clinic_id=${clinicId}&analysis=churn`);

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/mobile-uiux/patient-analysis',
      clinicId,
      {
        requireClinicMatch: true,
        allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      }
    );
    expect(logDataAccessMock).toHaveBeenCalledWith(
      'user-1',
      'staff@example.com',
      'patient_visit_summary',
      clinicId,
      clinicId,
      '127.0.0.1',
      {
        analysis_type: 'churn',
      }
    );
    expect(generatePatientAnalysisMock).toHaveBeenCalledWith(
      scopedSupabase,
      clinicId
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        analysis: analysisData,
      },
    });
  });

  it('does not use deprecated /api/patients data sources', async () => {
    const { GET } = await import(
      '@/app/api/mobile-uiux/patient-analysis/route'
    );

    await GET(buildRequest(`?clinic_id=${clinicId}`));

    expect(scopedSupabase.from).not.toHaveBeenCalledWith('patients');
  });

  it('returns 403 and does not load patient PII when clinic scope fails', async () => {
    ensureClinicAccessMock.mockRejectedValue(new Error('forbidden'));

    const { GET } = await import(
      '@/app/api/mobile-uiux/patient-analysis/route'
    );
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(generatePatientAnalysisMock).not.toHaveBeenCalled();
  });
});
