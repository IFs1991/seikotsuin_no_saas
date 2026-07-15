import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerStaffAnalysisResponse } from '@/types/manager-staff-analysis';

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

type ApiSuccessPayload = {
  success: true;
  data: ManagerStaffAnalysisResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

type MockTableName =
  | 'resources'
  | 'reservations'
  | 'staff_shifts'
  | 'daily_report_items';

type MockTableRow = {
  id: string;
  clinic_id?: string;
  name?: string;
  is_active?: boolean | null;
  is_deleted?: boolean | null;
  is_bookable?: boolean | null;
  type?: string;
  staff_id?: string;
  staff_resource_id?: string | null;
  status?: string;
  start_time?: string;
  report_date?: string;
  fee?: number;
};

class SupabaseQueryMock {
  private rows: MockTableRow[];
  private rangeStart = 0;
  private rangeEnd = 999;

  constructor(rows: MockTableRow[]) {
    this.rows = rows;
  }

  select() {
    return this;
  }

  in(column: string, values: string[]) {
    this.rows = this.rows.filter(row => {
      const value = row[column as keyof MockTableRow];
      return typeof value === 'string' && values.includes(value);
    });
    return this;
  }

  eq(column: string, value: string | boolean) {
    this.rows = this.rows.filter(
      row => row[column as keyof MockTableRow] === value
    );
    return this;
  }

  gte() {
    return this;
  }

  lte() {
    return this;
  }

  order() {
    return this;
  }

  // PostgREST の max_rows=1000 と同じく1ページ分だけ返す
  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  returns<T>() {
    return Promise.resolve({
      data: this.rows.slice(this.rangeStart, this.rangeEnd + 1) as T,
      error: null,
    });
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

function mockAdminClient(
  overrides: Partial<Record<MockTableName, MockTableRow[]>> = {}
) {
  const tables: Record<MockTableName, MockTableRow[]> = {
    resources: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: '池袋 太郎',
        clinic_id: clinicA,
        is_active: true,
        is_deleted: false,
        is_bookable: true,
        type: 'staff',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: '担当外 花子',
        clinic_id: clinicB,
        is_active: true,
        is_deleted: false,
        is_bookable: true,
        type: 'staff',
      },
    ],
    reservations: [
      {
        id: 'reservation-a',
        clinic_id: clinicA,
        staff_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'completed',
        start_time: '2026-06-01T00:00:00.000Z',
        is_deleted: false,
      },
      {
        id: 'reservation-b',
        clinic_id: clinicB,
        staff_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'completed',
        start_time: '2026-06-01T00:00:00.000Z',
        is_deleted: false,
      },
    ],
    staff_shifts: [],
    daily_report_items: [
      {
        id: 'item-a',
        clinic_id: clinicA,
        staff_resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        report_date: '2026-06-01',
        fee: 10000,
      },
      {
        id: 'item-b',
        clinic_id: clinicB,
        staff_resource_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        report_date: '2026-06-01',
        fee: 50000,
      },
    ],
  };

  createAdminClientMock.mockReturnValue({
    from: (table: MockTableName) =>
      new SupabaseQueryMock(overrides[table] ?? tables[table]),
  });
}

async function getAnalysis(path = '/api/manager/staff-analysis') {
  const { GET } = await import('@/app/api/manager/staff-analysis/route');
  return await GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/manager/staff-analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    mockAdminClient();
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

    const response = await getAnalysis();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getAnalysis();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns empty response when manager has no active assignments and does not use fallback clinic scope', async () => {
    resolveManagerAssignedClinicsMock.mockResolvedValue([]);

    const response = await getAnalysis(
      `/api/manager/staff-analysis?target=clinic&clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.scope.clinics).toEqual([]);
    expect(json.data.staff).toEqual([]);
    expect(json.data.summary.staffCount).toBe(0);
  });

  it('aggregates only actively assigned clinics for total target', async () => {
    const response = await getAnalysis(
      '/api/manager/staff-analysis?period=month'
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.staff).toHaveLength(1);
    expect(json.data.staff[0]?.clinicId).toBe(clinicA);
    expect(json.data.summary.totalRevenue).toBe(10000);
    expect(json.data.disclaimers.length).toBeGreaterThan(0);
  });

  it('aggregates all rows beyond the PostgREST 1000-row page limit', async () => {
    const manyReservations: MockTableRow[] = Array.from(
      { length: 1500 },
      (_, index) => ({
        id: `reservation-${index}`,
        clinic_id: clinicA,
        staff_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'completed',
        start_time: '2026-06-01T03:00:00.000Z',
        is_deleted: false,
      })
    );
    mockAdminClient({ reservations: manyReservations });

    const response = await getAnalysis(
      '/api/manager/staff-analysis?period=custom&start_date=2026-06-01&end_date=2026-06-30'
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.summary.reservationCount).toBe(1500);
    expect(json.data.summary.completedReservationCount).toBe(1500);
  });

  it('returns 403 for unassigned clinic_id', async () => {
    const response = await getAnalysis(
      `/api/manager/staff-analysis?target=clinic&clinic_id=${clinicB}`
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
  });

  it('returns 400 for invalid query parameters', async () => {
    const missingClinic = await getAnalysis(
      '/api/manager/staff-analysis?target=clinic'
    );
    const invalidCustom = await getAnalysis(
      '/api/manager/staff-analysis?period=custom&start_date=2026-06-30&end_date=2026-06-01'
    );
    const invalidCompare = await getAnalysis(
      '/api/manager/staff-analysis?compare=last_month'
    );

    expect(missingClinic.status).toBe(400);
    expect(invalidCustom.status).toBe(400);
    expect(invalidCompare.status).toBe(400);
  });
});
