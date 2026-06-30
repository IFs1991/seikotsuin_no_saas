import { NextRequest } from 'next/server';

import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/dashboard/read-model', () => ({
  createDashboardSupabaseReadModelClient: jest.fn(),
  fetchDashboardReadModel: jest.fn(),
}));

const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const createDashboardSupabaseReadModelClientMock = jest.mocked(
  createDashboardSupabaseReadModelClient
);
const fetchDashboardReadModelMock = jest.mocked(fetchDashboardReadModel);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const scopedSupabase = { name: 'scoped-supabase' };
const dashboardReadModelClient = { name: 'dashboard-read-model-client' };
const dashboardData = {
  dailyData: {
    revenue: 120000,
    patients: 18,
    insuranceRevenue: 40000,
    privateRevenue: 80000,
  },
  aiComment: null,
  revenueChartData: [
    {
      name: '2026-06-12',
      総売上: 120000,
      保険診療: 40000,
      自費診療: 80000,
    },
  ],
  heatmapData: [],
  alerts: [],
};

function buildRequest(search: string) {
  return new NextRequest(`http://localhost/api/mobile-uiux/home${search}`);
}

describe('GET /api/mobile-uiux/home', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
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
    createDashboardSupabaseReadModelClientMock.mockReturnValue(
      dashboardReadModelClient
    );
    fetchDashboardReadModelMock.mockResolvedValue(dashboardData);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the PC dashboard read model after validating mobile clinic scope', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const request = buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`);

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/mobile-uiux/home',
      clinicId,
      {
        allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      }
    );
    expect(createDashboardSupabaseReadModelClientMock).toHaveBeenCalledWith(
      scopedSupabase
    );
    expect(fetchDashboardReadModelMock).toHaveBeenCalledWith({
      supabase: dashboardReadModelClient,
      clinicId,
      now: new Date('2026-06-12T00:00:00.000Z'),
    });
    expect(payload).toEqual({
      success: true,
      data: {
        clinicId,
        date: '2026-06-12',
        timezone: 'Asia/Tokyo',
        dashboard: dashboardData,
      },
      generatedAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      ),
    });
  });

  it('returns 403 for clinic scope violations from the PC dashboard guard', async () => {
    ensureClinicAccessMock.mockRejectedValue(new Error('forbidden'));

    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(fetchDashboardReadModelMock).not.toHaveBeenCalled();
  });

  it('fails closed when real data is disabled', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'false';

    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));

    expect(response.status).toBe(403);
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});
