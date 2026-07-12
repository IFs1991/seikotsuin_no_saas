import { NextRequest } from 'next/server';

import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';
import {
  evaluateMobileUiuxEnvRollout,
  resolveMobileUiuxPrincipal,
} from '@/lib/mobile-uiux/access';
import { fetchClinicNames } from '@/lib/mobile-uiux/clinic-names';
import { fetchManagerRevenuePeriodTotals } from '@/lib/services/manager-revenue-service';
import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/dashboard/read-model', () => ({
  createDashboardSupabaseReadModelClient: jest.fn(),
  fetchDashboardReadModel: jest.fn(),
}));

jest.mock('@/lib/daily-reports/read-model', () => ({
  fetchDailyReportsReadModel: jest.fn(),
}));

jest.mock('@/lib/mobile-uiux/access', () => ({
  evaluateMobileUiuxEnvRollout: jest.fn(),
  resolveMobileUiuxPrincipal: jest.fn(),
}));

jest.mock('@/lib/mobile-uiux/clinic-names', () => ({
  fetchClinicNames: jest.fn(),
}));

jest.mock('@/lib/services/manager-revenue-service', () => ({
  fetchManagerRevenuePeriodTotals: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
}));

const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const createDashboardSupabaseReadModelClientMock = jest.mocked(
  createDashboardSupabaseReadModelClient
);
const fetchDashboardReadModelMock = jest.mocked(fetchDashboardReadModel);
const fetchDailyReportsReadModelMock = jest.mocked(fetchDailyReportsReadModel);
const resolveMobileUiuxPrincipalMock = jest.mocked(resolveMobileUiuxPrincipal);
const evaluateMobileUiuxEnvRolloutMock = jest.mocked(
  evaluateMobileUiuxEnvRollout
);
const fetchClinicNamesMock = jest.mocked(fetchClinicNames);
const fetchManagerRevenuePeriodTotalsMock = jest.mocked(
  fetchManagerRevenuePeriodTotals
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reservationRows = [
  { status: 'confirmed' },
  { status: 'unconfirmed' },
  { status: 'tentative' },
  { status: 'cancelled' },
  { status: 'no_show' },
];
const reservationQuery = {
  select: jest.fn(() => reservationQuery),
  eq: jest.fn(() => reservationQuery),
  gte: jest.fn(() => reservationQuery),
  lt: jest.fn(() => reservationQuery),
  returns: jest.fn(),
};
const scopedSupabase = {
  name: 'scoped-supabase',
  from: jest.fn(() => reservationQuery),
};
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
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
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
    reservationQuery.returns.mockResolvedValue({
      data: reservationRows,
      error: null,
    });
    fetchDailyReportsReadModelMock.mockResolvedValue({
      reports: [
        {
          id: 'report-1',
          reportDate: '2026-06-12',
          staffName: 'BFF 先生',
          totalPatients: 18,
          newPatients: 3,
          totalRevenue: 120000,
          insuranceRevenue: 40000,
          privateRevenue: 80000,
          reportText: 'free text should not be returned by home status',
          createdAt: '2026-06-12T10:00:00.000Z',
        },
      ],
      summary: {
        totalReports: 1,
        averagePatients: 18,
        averageRevenue: 120000,
        totalRevenue: 120000,
      },
      monthlyTrends: [],
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    warnSpy.mockRestore();
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
        allowedRoles: [
          'admin',
          'clinic_admin',
          'manager',
          'therapist',
          'staff',
        ],
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
    expect(scopedSupabase.from).toHaveBeenCalledWith('reservation_list_view');
    expect(reservationQuery.select).toHaveBeenCalledWith('status');
    expect(reservationQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(fetchDailyReportsReadModelMock).toHaveBeenCalledWith({
      supabase: scopedSupabase,
      clinicId,
      startDate: '2026-06-12',
      endDate: '2026-06-12',
    });
    expect(payload).toEqual({
      success: true,
      data: {
        clinicId,
        date: '2026-06-12',
        timezone: 'Asia/Tokyo',
        dashboard: dashboardData,
        reservationSummary: {
          total: 3,
          unconfirmed: 2,
          cancelled: 2,
        },
        dailyReportStatus: {
          done: 1,
          review: 0,
          missing: 0,
          rows: [
            {
              name: '本日の日報',
              status: 'submitted',
            },
          ],
        },
      },
      generatedAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      ),
    });
    expect(JSON.stringify(payload)).not.toContain(
      'free text should not be returned by home status'
    );
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
    expect(warnSpy).toHaveBeenCalledWith(
      '[mobile-uiux] access denied',
      expect.objectContaining({
        reasonCode: 'clinic_scope_denied',
        allowedClinicCount: 1,
        scopedClinicCount: 0,
        writeTarget: 'home',
        status: 403,
      })
    );
    const logText = JSON.stringify(warnSpy.mock.calls);
    expect(logText).not.toContain(clinicId);
    expect(logText).not.toContain('staff@example.com');
  });

  it('fails closed when real data is disabled', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'false';

    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));

    expect(response.status).toBe(403);
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[mobile-uiux] access denied',
      expect.objectContaining({
        reasonCode: 'flag_disabled',
        allowedClinicCount: 1,
        scopedClinicCount: 0,
        writeTarget: 'home',
        status: 403,
      })
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(clinicId);
  });

  describe('clinicCards (manager/admin)', () => {
    const secondClinicId = '223e4567-e89b-12d3-a456-426614174001';
    const adminClient = { name: 'admin-client' };

    function useRole(role: string) {
      ensureClinicAccessMock.mockResolvedValue({
        supabase: scopedSupabase,
        user: { id: 'user-1', email: 'user@example.com' },
        permissions: {
          role,
          clinic_id: clinicId,
          clinic_scope_ids: [clinicId, secondClinicId],
        },
      } as never);
    }

    beforeEach(() => {
      process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = `${clinicId},${secondClinicId}`;
      createAdminClientMock.mockReturnValue(adminClient as never);
      resolveMobileUiuxPrincipalMock.mockResolvedValue({
        allowed: true,
        role: 'manager',
        clinicIds: [clinicId, secondClinicId],
      });
      evaluateMobileUiuxEnvRolloutMock.mockReturnValue({
        allowed: true,
        role: 'manager',
        clinicIds: [clinicId, secondClinicId],
      });
      fetchManagerRevenuePeriodTotalsMock.mockResolvedValue([
        {
          clinic_id: clinicId,
          operating_revenue: 184000,
          visit_count: 21,
        } as never,
      ]);
      fetchClinicNamesMock.mockResolvedValue([
        { id: clinicId, name: '本町院' },
        { id: secondClinicId, name: '駅前院' },
      ]);
    });

    it('returns per-clinic cards for manager scoped to principal-resolved clinic ids only', async () => {
      useRole('manager');

      const { GET } = await import('@/app/api/mobile-uiux/home/route');
      const response = await GET(
        buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`)
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      // RPC (service_role) には principal 解決済みの clinic id 以外を渡さない
      expect(resolveMobileUiuxPrincipalMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          permissions: expect.objectContaining({ role: 'manager' }),
        })
      );
      expect(fetchManagerRevenuePeriodTotalsMock).toHaveBeenCalledTimes(1);
      expect(fetchManagerRevenuePeriodTotalsMock).toHaveBeenCalledWith(
        adminClient,
        [clinicId, secondClinicId],
        '2026-06-12',
        '2026-06-12'
      );
      expect(fetchClinicNamesMock).toHaveBeenCalledWith(scopedSupabase, [
        clinicId,
        secondClinicId,
      ]);
      expect(payload.data.clinicCards).toEqual([
        {
          clinicId,
          name: '本町院',
          revenue: 184000,
          visitCount: 21,
        },
        {
          clinicId: secondClinicId,
          name: '駅前院',
          revenue: 0,
          visitCount: 0,
        },
      ]);
    });

    it.each(['staff', 'therapist', 'clinic_admin'])(
      'omits clinicCards and never calls the revenue RPC for %s',
      async role => {
        useRole(role);

        const { GET } = await import('@/app/api/mobile-uiux/home/route');
        const response = await GET(
          buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`)
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(resolveMobileUiuxPrincipalMock).not.toHaveBeenCalled();
        expect(fetchManagerRevenuePeriodTotalsMock).not.toHaveBeenCalled();
        expect(payload.data).not.toHaveProperty('clinicCards');
      }
    );

    it('omits clinics whose name cannot be resolved (fail-closed)', async () => {
      useRole('admin');
      fetchClinicNamesMock.mockResolvedValue([
        { id: clinicId, name: '本町院' },
      ]);

      const { GET } = await import('@/app/api/mobile-uiux/home/route');
      const response = await GET(
        buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`)
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.clinicCards).toEqual([
        { clinicId, name: '本町院', revenue: 184000, visitCount: 21 },
      ]);
    });

    it('omits clinicCards when the principal resolution denies access', async () => {
      useRole('manager');
      resolveMobileUiuxPrincipalMock.mockResolvedValue({
        allowed: false,
        status: 403,
        reason: 'clinic_scope_empty',
      });

      const { GET } = await import('@/app/api/mobile-uiux/home/route');
      const response = await GET(
        buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`)
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(fetchManagerRevenuePeriodTotalsMock).not.toHaveBeenCalled();
      expect(payload.data).not.toHaveProperty('clinicCards');
    });

    it('degrades to a card-less response when the revenue RPC fails', async () => {
      useRole('manager');
      fetchManagerRevenuePeriodTotalsMock.mockRejectedValue(
        new Error('rpc unavailable')
      );

      const { GET } = await import('@/app/api/mobile-uiux/home/route');
      const response = await GET(
        buildRequest(`?clinic_id=${clinicId}&date=2026-06-12`)
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data).not.toHaveProperty('clinicCards');
      expect(payload.data.dashboard).toEqual(dashboardData);
    });
  });
});
