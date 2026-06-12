import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { getManagerDashboardDateKeys } from '@/lib/manager-dashboard';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerDashboardResponse } from '@/types/manager-dashboard';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinics
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerDashboardResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

type QueryResult<T> = {
  data: T;
  error: null;
};

type MockQuery<T> = {
  select: jest.Mock<MockQuery<T>, [string]>;
  in: jest.Mock<MockQuery<T>, [string, string[]]>;
  gte: jest.Mock<MockQuery<T>, [string, string]>;
  lte: jest.Mock<MockQuery<T>, [string, string]>;
  lt: jest.Mock<MockQuery<T>, [string, string]>;
  eq: jest.Mock<MockQuery<T>, [string, string]>;
  or: jest.Mock<MockQuery<T>, [string]>;
  returns: jest.Mock<Promise<QueryResult<T>>, []>;
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

function createQuery<T>(data: T): MockQuery<T> {
  const query = {
    select: jest.fn(),
    in: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    lt: jest.fn(),
    eq: jest.fn(),
    or: jest.fn(),
    returns: jest.fn(),
  } as MockQuery<T>;

  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.returns.mockResolvedValue({ data, error: null });

  return query;
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

function toUtcMorningIso(dateKey: string): string {
  return `${dateKey}T01:00:00.000Z`;
}

async function getDashboard() {
  const { GET } = await import('@/app/api/manager/dashboard/route');
  return await GET(new NextRequest('http://localhost/api/manager/dashboard'));
}

describe('GET /api/manager/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
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
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      ),
    });

    const response = await getDashboard();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users including admin', async () => {
    mockAuth('admin');

    const response = await getDashboard();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns empty dashboard when manager has no active assignments', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);
    createAdminClientMock.mockReturnValue({ from: jest.fn(), rpc: jest.fn() });

    const response = await getDashboard();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.clinics).toEqual([]);
    expect(json.data.summary.assignedClinicCount).toBe(0);
    expect(json.data.summary.missingDailyReportCount).toBe(0);
  });

  it('aggregates assigned clinics only and does not fallback to permission or JWT clinic scope', async () => {
    const date = getManagerDashboardDateKeys(new Date());
    const dailyReportsQuery = createQuery([
      {
        id: 'today-a',
        clinic_id: clinicA,
        report_date: date.today,
        total_patients: 10,
        total_revenue: 50000,
        insurance_revenue: 20000,
        private_revenue: 30000,
        updated_at: toUtcMorningIso(date.today),
      },
      {
        id: 'previous-a',
        clinic_id: clinicA,
        report_date: date.previousDay,
        total_patients: 12,
        total_revenue: 100000,
        insurance_revenue: 40000,
        private_revenue: 60000,
        updated_at: toUtcMorningIso(date.previousDay),
      },
    ]);
    const reviewSignalsQuery = createQuery([
      {
        clinic_id: clinicA,
        report_date: date.today,
        estimate_status: 'needs_review',
        updated_at: toUtcMorningIso(date.today),
      },
    ]);
    const reservationsQuery = createQuery([
      {
        id: 'reservation-active',
        clinic_id: clinicA,
        start_time: toUtcMorningIso(date.today),
        status: 'confirmed',
      },
      {
        id: 'reservation-cancelled',
        clinic_id: clinicA,
        start_time: toUtcMorningIso(date.today),
        status: 'cancelled',
      },
      {
        id: 'reservation-cancelled-2',
        clinic_id: clinicA,
        start_time: toUtcMorningIso(date.today),
        status: 'no_show',
      },
      {
        id: 'reservation-previous',
        clinic_id: clinicA,
        start_time: toUtcMorningIso(date.previousWeekday),
        status: 'confirmed',
      },
    ]);
    const from = jest.fn((table: string) => {
      if (table === 'daily_reports') {
        return dailyReportsQuery;
      }
      if (table === 'daily_report_items') {
        return reviewSignalsQuery;
      }
      if (table === 'reservation_list_view') {
        return reservationsQuery;
      }
      throw new Error(`unexpected table: ${table}`);
    });
    createAdminClientMock.mockReturnValue({ from, rpc: jest.fn() });

    const response = await getDashboard();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(resolveManagerAssignedClinicsMock).toHaveBeenCalledWith(
      expect.any(Object),
      'manager-user'
    );
    expect(dailyReportsQuery.in).toHaveBeenCalledWith('clinic_id', [clinicA]);
    expect(reviewSignalsQuery.in).toHaveBeenCalledWith('clinic_id', [clinicA]);
    expect(reservationsQuery.in).toHaveBeenCalledWith('clinic_id', [clinicA]);
    expect(reservationsQuery.or).toHaveBeenCalledWith(
      expect.stringContaining('and(start_time.gte.')
    );
    expect(json.data.clinics).toEqual([{ id: clinicA, name: '池袋院' }]);
    expect(json.data.summary).toMatchObject({
      assignedClinicCount: 1,
      todayRevenue: 50000,
      todayVisitCount: 10,
      todayReservationCount: 1,
      needsReviewCount: 1,
      lowRevenueClinicCount: 1,
    });
    expect(json.data.attentionItems.map(item => item.type)).toEqual(
      expect.arrayContaining([
        'needs_review',
        'low_revenue',
        'high_cancellations',
      ])
    );
  });
});
