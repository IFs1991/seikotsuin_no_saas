import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerClinicComparisonResponse } from '@/types/manager-clinic-comparison';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const clinicOutside = '33333333-3333-4333-8333-333333333333';

type ApiSuccessPayload = {
  success: true;
  data: ManagerClinicComparisonResponse;
};

type ReservationRow = {
  id: string;
  clinic_id: string;
  status: string | null;
  start_time: string;
  is_deleted: boolean;
};

type RevenueRpcRow = {
  clinic_id: string;
  operating_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  product_revenue: number;
  ticket_revenue: number;
  traffic_accident_revenue: number;
  workers_comp_revenue: number;
  patient_copay_estimated: number;
  insurer_receivable_estimated: number;
  private_revenue_estimated: number;
  visit_count: number;
  report_days: number;
  missing_report_days: number;
  needs_review_count: number;
  blocked_count: number;
  first_report_date: string | null;
};

class ReservationQueryMock {
  private rows: ReservationRow[];

  constructor(rows: readonly ReservationRow[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  in(column: string, values: string[]) {
    if (column === 'clinic_id') {
      this.rows = this.rows.filter(row => values.includes(row.clinic_id));
    }
    return this;
  }

  eq(column: string, value: boolean) {
    if (column === 'is_deleted') {
      this.rows = this.rows.filter(row => row.is_deleted === value);
    }
    return this;
  }

  gte(column: string, value: string) {
    if (column === 'start_time') {
      this.rows = this.rows.filter(row => row.start_time >= value);
    }
    return this;
  }

  lte(column: string, value: string) {
    if (column === 'start_time') {
      this.rows = this.rows.filter(row => row.start_time <= value);
    }
    return this;
  }

  order() {
    return this;
  }

  range(from: number, to: number) {
    this.rows = this.rows.slice(from, to + 1);
    return this;
  }

  returns<T>() {
    return Promise.resolve({ data: this.rows as T, error: null });
  }
}

function isSuccessPayload(value: unknown): value is ApiSuccessPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
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
      clinic_id: clinicOutside,
      clinic_scope_ids: [clinicOutside],
    },
    supabase: { from: jest.fn() },
  });
}

function revenueRow(clinicId: string, operatingRevenue: number): RevenueRpcRow {
  return {
    clinic_id: clinicId,
    operating_revenue: operatingRevenue,
    insurance_revenue: 0,
    private_revenue: 0,
    product_revenue: 0,
    ticket_revenue: 0,
    traffic_accident_revenue: 0,
    workers_comp_revenue: 0,
    patient_copay_estimated: 0,
    insurer_receivable_estimated: 0,
    private_revenue_estimated: 0,
    visit_count: 0,
    report_days: 0,
    missing_report_days: 0,
    needs_review_count: 0,
    blocked_count: 0,
    first_report_date: null,
  };
}

function mockAdminClient(params: {
  reservations: readonly ReservationRow[];
  currentRevenue: readonly RevenueRpcRow[];
  previousRevenue: readonly RevenueRpcRow[];
}) {
  const fromMock = jest.fn(
    (table: string) =>
      new ReservationQueryMock(
        table === 'reservations' ? params.reservations : []
      )
  );
  const rpcMock = jest.fn(
    (
      functionName: string,
      args: {
        p_start: string | null;
      }
    ) => {
      const rows =
        functionName === 'manager_revenue_period_totals' &&
        args.p_start === '2026-05-02'
          ? params.previousRevenue
          : params.currentRevenue;
      return Promise.resolve({ data: rows, error: null });
    }
  );

  createAdminClientMock.mockReturnValue({
    from: fromMock,
    rpc: rpcMock,
  });

  return { fromMock, rpcMock };
}

async function getClinicComparison(
  path = '/api/manager/clinic-comparison?period=custom&start_date=2026-06-01&end_date=2026-06-30'
) {
  const { GET } = await import('@/app/api/manager/clinic-comparison/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/clinic-comparison', () => {
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
      {
        id: 'assignment-b',
        manager_user_id: 'manager-user',
        clinic_id: clinicB,
        clinic_name: '横浜院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    mockAdminClient({
      currentRevenue: [
        revenueRow(clinicA, 150000),
        revenueRow(clinicB, 100000),
        revenueRow(clinicOutside, 999999),
      ],
      previousRevenue: [revenueRow(clinicA, 100000), revenueRow(clinicB, 0)],
      reservations: [
        {
          id: 'reservation-a',
          clinic_id: clinicA,
          status: 'completed',
          start_time: '2026-06-10T00:00:00.000Z',
          is_deleted: false,
        },
        {
          id: 'reservation-b',
          clinic_id: clinicA,
          status: 'cancelled',
          start_time: '2026-06-11T00:00:00.000Z',
          is_deleted: false,
        },
        {
          id: 'reservation-c',
          clinic_id: clinicB,
          status: 'confirmed',
          start_time: '2026-06-12T00:00:00.000Z',
          is_deleted: false,
        },
        {
          id: 'reservation-outside',
          clinic_id: clinicOutside,
          status: 'completed',
          start_time: '2026-06-13T00:00:00.000Z',
          is_deleted: false,
        },
      ],
    });
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      ),
    });

    const response = await getClinicComparison();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getClinicComparison();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns comparison rows for assigned clinics only', async () => {
    const response = await getClinicComparison();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.clinics.map(clinic => clinic.id)).toEqual([
      clinicB,
      clinicA,
    ]);
    expect(json.data.rows.map(row => row.clinicId)).toEqual([clinicA, clinicB]);
    expect(json.data.rows).not.toContainEqual(
      expect.objectContaining({ clinicId: clinicOutside })
    );
    expect(json.data.rows[0]).toMatchObject({
      clinicId: clinicA,
      totalRevenue: 150000,
      reservationCount: 2,
      completedReservationCount: 1,
      cancellationRate: 50,
      revenueChangeRate: 50,
    });
  });

  it('returns empty data when manager has no assignments without fallback scope', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const response = await getClinicComparison();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) throw new Error('expected success payload');
    expect(json.data.clinics).toEqual([]);
    expect(json.data.rows).toEqual([]);
  });

  it('returns 400 for invalid period query', async () => {
    const response = await getClinicComparison(
      '/api/manager/clinic-comparison?period=custom&start_date=2026-06-30&end_date=2026-06-01'
    );

    expect(response.status).toBe(400);
  });
});
