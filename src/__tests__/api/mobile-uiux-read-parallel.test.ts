import { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';
import { processClinicScopedBody } from '@/lib/route-helpers';

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  createAdminClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds:
    jest.requireActual('@/lib/supabase').resolveScopedClinicIds,
}));

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

jest.mock('@/lib/route-helpers', () => ({
  processClinicScopedBody: jest.fn(),
}));

const createClientMock = jest.mocked(createClient);
const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const createDashboardSupabaseReadModelClientMock = jest.mocked(
  createDashboardSupabaseReadModelClient
);
const fetchDashboardReadModelMock = jest.mocked(fetchDashboardReadModel);
const fetchDailyReportsReadModelMock = jest.mocked(fetchDailyReportsReadModel);
const processClinicScopedBodyMock = jest.mocked(processClinicScopedBody);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const staffId = '223e4567-e89b-12d3-a456-426614174000';

function buildEntitlementRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    clinic_id: clinicId,
    mobile_uiux_enabled: true,
    mobile_uiux_real_data_enabled: true,
    mobile_uiux_write_enabled: true,
    mobile_uiux_reservation_write_enabled: false,
    mobile_uiux_daily_report_write_enabled: true,
    mobile_uiux_settings_write_enabled: false,
    rollout_phase: 'pilot',
    ...overrides,
  };
}

function createEntitlementBuilder(
  rows: unknown[],
  onQuery?: () => Promise<void> | void
) {
  const builder: Record<string, jest.Mock> = {};
  builder.select = jest.fn(() => builder);
  builder.in = jest.fn(() => builder);
  builder.returns = jest.fn(async () => {
    await onQuery?.();
    return { data: rows, error: null };
  });
  return builder;
}

const dashboardData = {
  dailyData: {
    revenue: 120000,
    patients: 18,
    insuranceRevenue: 40000,
    privateRevenue: 80000,
  },
  aiComment: null,
  revenueChartData: [],
  heatmapData: [],
  alerts: [],
};

const dailyReportsReadModel = {
  reports: [],
  summary: {
    totalReports: 0,
    averagePatients: 0,
    averageRevenue: 0,
    totalRevenue: 0,
  },
  monthlyTrends: [],
};

describe('mobile-uiux read routes run access and entitlement checks concurrently', () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_USE_DB_ENTITLEMENTS: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    createDashboardSupabaseReadModelClientMock.mockReturnValue({
      name: 'dashboard-read-model-client',
    } as never);
    fetchDashboardReadModelMock.mockResolvedValue(dashboardData as never);
    fetchDailyReportsReadModelMock.mockResolvedValue(
      dailyReportsReadModel as never
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('queries DB entitlements before the clinic access check resolves (GET /home)', async () => {
    const order: string[] = [];

    const reservationQuery: Record<string, jest.Mock> = {};
    reservationQuery.select = jest.fn(() => reservationQuery);
    reservationQuery.eq = jest.fn(() => reservationQuery);
    reservationQuery.gte = jest.fn(() => reservationQuery);
    reservationQuery.lt = jest.fn(() => reservationQuery);
    reservationQuery.returns = jest.fn(async () => ({ data: [], error: null }));

    const scopedSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'reservation_list_view') return reservationQuery;
        if (table === 'clinic_feature_flags') {
          return createEntitlementBuilder([buildEntitlementRow()], () => {
            order.push('entitlement:query');
          });
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const entitlementClient = {
      from: jest.fn((table: string) => {
        if (table !== 'clinic_feature_flags') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return createEntitlementBuilder([buildEntitlementRow()], () => {
          order.push('entitlement:query');
        });
      }),
    };
    createClientMock.mockResolvedValue(entitlementClient as never);

    ensureClinicAccessMock.mockImplementation(async () => {
      order.push('access:start');
      await new Promise(resolve => setTimeout(resolve, 25));
      order.push('access:resolved');
      return {
        supabase: scopedSupabase,
        user: { id: 'user-1', email: 'staff@example.com' },
        permissions: {
          role: 'staff',
          clinic_id: clinicId,
          clinic_scope_ids: [clinicId],
        },
      } as never;
    });

    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/mobile-uiux/home?clinic_id=${clinicId}&date=2026-06-12`
      )
    );

    expect(response.status).toBe(200);
    const entitlementIndex = order.indexOf('entitlement:query');
    const accessResolvedIndex = order.indexOf('access:resolved');
    expect(entitlementIndex).toBeGreaterThan(-1);
    expect(entitlementIndex).toBeLessThan(accessResolvedIndex);
  });

  it('fails closed to 403 when the concurrent entitlement lookup errors (GET /home)', async () => {
    createClientMock.mockRejectedValue(new Error('entitlement client failed'));

    const scopedSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'clinic_feature_flags') {
          return createEntitlementBuilder([buildEntitlementRow()]);
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    ensureClinicAccessMock.mockResolvedValue({
      supabase: scopedSupabase,
      user: { id: 'user-1', email: 'staff@example.com' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
    } as never);

    const { GET } = await import('@/app/api/mobile-uiux/home/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/mobile-uiux/home?clinic_id=${clinicId}&date=2026-06-12`
      )
    );

    expect(response.status).toBe(403);
    expect(fetchDashboardReadModelMock).not.toHaveBeenCalled();
  });

  it('validates write scope while the entitlement lookup is in flight (POST /daily-reports)', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'true';

    const order: string[] = [];

    const staffQuery: Record<string, jest.Mock> = {};
    staffQuery.select = jest.fn(() => {
      order.push('scope:staff-query');
      return staffQuery;
    });
    staffQuery.eq = jest.fn(() => staffQuery);
    staffQuery.maybeSingle = jest.fn(async () => ({
      data: { id: staffId },
      error: null,
    }));

    const upsertBuilder: Record<string, jest.Mock> = {};
    upsertBuilder.select = jest.fn(() => upsertBuilder);
    upsertBuilder.single = jest.fn(async () => ({
      data: {
        id: 'report-1',
        clinic_id: clinicId,
        report_date: '2026-06-12',
      },
      error: null,
    }));

    const mutationClient = {
      from: jest.fn((table: string) => {
        if (table === 'staff') return staffQuery;
        if (table === 'daily_reports') {
          return { upsert: jest.fn(() => upsertBuilder) };
        }
        if (table === 'clinic_feature_flags') {
          return createEntitlementBuilder([buildEntitlementRow()], async () => {
            await new Promise(resolve => setTimeout(resolve, 25));
            order.push('entitlement:resolved');
          });
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        staff_id: staffId,
        report_date: '2026-06-12',
        total_patients: 10,
        new_patients: 2,
        total_revenue: 100000,
        insurance_revenue: 40000,
        private_revenue: 60000,
        report_text: 'ok',
      },
      auth: { id: 'user-1' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: mutationClient,
    } as never);

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(
      new NextRequest('http://localhost/api/mobile-uiux/daily-reports', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    const staffIndex = order.indexOf('scope:staff-query');
    const entitlementResolvedIndex = order.indexOf('entitlement:resolved');
    expect(staffIndex).toBeGreaterThan(-1);
    expect(staffIndex).toBeLessThan(entitlementResolvedIndex);
  });
});
