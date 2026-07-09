import { NextRequest } from 'next/server';

import { ensureClinicAccess } from '@/lib/supabase/guards';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/daily-reports/read-model', () => ({
  fetchDailyReportsReadModel: jest.fn(),
}));

const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const fetchDailyReportsReadModelMock = jest.mocked(fetchDailyReportsReadModel);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const scopedSupabase = { from: jest.fn() };
const dailyReportsReadModel = {
  reports: [
    {
      id: 'report-1',
      reportDate: '2026-06-12',
      staffName: '佐藤',
      totalPatients: 18,
      newPatients: 3,
      totalRevenue: 120000,
      insuranceRevenue: 40000,
      privateRevenue: 80000,
      reportText: '共有事項',
      createdAt: '2026-06-12T09:00:00.000Z',
    },
  ],
  summary: {
    totalReports: 1,
    averagePatients: 18,
    averageRevenue: 120000,
    totalRevenue: 120000,
  },
  monthlyTrends: [
    {
      month: '2026-06',
      reports: 1,
      totalPatients: 18,
      totalRevenue: 120000,
    },
  ],
};

function buildRequest(search: string) {
  return new NextRequest(
    `http://localhost/api/mobile-uiux/daily-reports${search}`
  );
}

describe('GET /api/mobile-uiux/daily-reports', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED: 'false',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    ensureClinicAccessMock.mockResolvedValue({
      supabase: scopedSupabase,
      user: { id: 'user-1', email: 'staff@example.com' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
    });
    fetchDailyReportsReadModelMock.mockResolvedValue(dailyReportsReadModel);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the PC daily reports read model with clinic scope and requested dates', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const request = buildRequest(
      `?clinic_id=${clinicId}&start_date=2026-06-01&end_date=2026-06-30`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/mobile-uiux/daily-reports',
      clinicId,
      {
        allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      }
    );
    expect(fetchDailyReportsReadModelMock).toHaveBeenCalledWith({
      supabase: scopedSupabase,
      clinicId,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        dailyReports: dailyReportsReadModel,
      },
    });
  });

  it('returns 400 for invalid JST date keys before reading reports', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await GET(
      buildRequest(`?clinic_id=${clinicId}&start_date=2026-02-31`)
    );

    expect(response.status).toBe(400);
    expect(fetchDailyReportsReadModelMock).not.toHaveBeenCalled();
  });

  it('returns 403 for mobile daily report writes while write flags are off', async () => {
    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');

    const response = await POST(
      new NextRequest('http://localhost/api/mobile-uiux/daily-reports', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
  });
});
