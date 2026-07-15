import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';

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

jest.mock('@/lib/supabase', () => ({
  ...jest.requireActual('@/lib/supabase'),
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';

type ClinicRow = {
  id: string;
  name: string;
};

type AssignmentRow = {
  clinics:
    | {
        id: string;
        name: string;
        is_active: boolean | null;
      }
    | Array<{
        id: string;
        name: string;
        is_active: boolean | null;
      }>
    | null;
};

type DailyReportOverviewTestRow = {
  id: string;
  report_date: string;
  total_patients: number | null;
  total_revenue: number | null;
  insurance_revenue: number | null;
  private_revenue: number | null;
  updated_at: string | null;
  status?: string | null;
};

type QueryMock = {
  select: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  gte: jest.Mock;
  lte: jest.Mock;
  order: jest.Mock;
  returns: jest.Mock;
  maybeSingle: jest.Mock;
};

function createQueryMock<T>(result: {
  data: T;
  error: unknown | null;
}): QueryMock {
  const query: QueryMock = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn().mockResolvedValue(result),
    returns: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };

  return query;
}

function mockManagerAuth(role = 'manager') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'manager-user',
      email: 'manager@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: clinicId,
      clinic_scope_ids: [clinicId],
    },
    supabase: { from: jest.fn() },
  });
}

function mockAdminClient(params: {
  assignedClinic?: ClinicRow | null;
  assignmentError?: unknown;
  reports?: DailyReportOverviewTestRow[];
}) {
  const assignedClinic =
    params.assignedClinic === undefined
      ? { id: clinicId, name: '新宿院' }
      : params.assignedClinic;
  const assignmentQuery = createQueryMock<AssignmentRow | null>({
    data: assignedClinic
      ? {
          clinics: {
            id: assignedClinic.id,
            name: assignedClinic.name,
            is_active: true,
          },
        }
      : null,
    error: params.assignmentError ?? null,
  });
  const reportsQuery = createQueryMock<DailyReportOverviewTestRow[]>({
    data: params.reports ?? [],
    error: null,
  });
  const from = jest.fn((table: string) => {
    if (table === 'manager_clinic_assignments') {
      return assignmentQuery;
    }
    if (table === 'daily_reports') {
      return reportsQuery;
    }
    if (table === 'daily_report_items') {
      throw new Error('overview must not read daily_report_items');
    }
    return createQueryMock<null>({ data: null, error: null });
  });

  createAdminClientMock.mockReturnValue({ from });

  return { from, assignmentQuery, reportsQuery };
}

async function getOverview(url: string) {
  const { GET } =
    await import('@/app/api/manager/daily-reports/overview/route');
  return await GET(new NextRequest(url));
}

describe('GET /api/manager/daily-reports/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManagerAuth();
    mockAdminClient({});
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        {
          status: 401,
        }
      ),
    });

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-09`
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 for authenticated non-manager users', async () => {
    mockManagerAuth('clinic_admin');

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-09`
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 403 when manager clinic access is only available through fallback scope', async () => {
    const { from } = mockAdminClient({ assignedClinic: null });

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-09`
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('manager_clinic_assignments');
    expect(from).not.toHaveBeenCalledWith('daily_reports');
  });

  it('returns 403 for unassigned clinics', async () => {
    mockAdminClient({ assignedClinic: null });

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-09`
    );

    expect(response.status).toBe(403);
  });

  it('returns an information-free 503 when manager assignment authority is unavailable', async () => {
    mockAdminClient({
      assignmentError: {
        code: 'PGRST500',
        message: 'sensitive manager assignment lookup failure',
      },
    });

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-09`
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(body)).not.toContain('PGRST500');
    expect(JSON.stringify(body)).not.toContain('sensitive');
  });

  it('rejects invalid date formats, reversed dates, and ranges over 93 days', async () => {
    const invalidDate = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-99&end_date=2026-06-09`
    );
    const reversedDate = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-10&end_date=2026-06-09`
    );
    const tooLong = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-01-01&end_date=2026-04-10`
    );

    expect(invalidDate.status).toBe(400);
    expect(reversedDate.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  it('returns assigned clinic overview with sorted timeline and missing-day zeros', async () => {
    const { from } = mockAdminClient({
      assignedClinic: { id: clinicId, name: '新宿院' },
      reports: [
        {
          id: 'report-2',
          report_date: '2026-06-10',
          total_patients: 0,
          total_revenue: 1000,
          insurance_revenue: 300,
          private_revenue: 700,
          updated_at: '2026-06-10T09:00:00.000Z',
          status: 'approved',
        },
        {
          id: 'report-1',
          report_date: '2026-06-08',
          total_patients: 10,
          total_revenue: null,
          insurance_revenue: 1200,
          private_revenue: 800,
          updated_at: '2026-06-08T09:00:00.000Z',
          status: 'rejected',
        },
      ],
    });

    const response = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-08&end_date=2026-06-10`
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.clinic).toEqual({ id: clinicId, name: '新宿院' });
    expect(json.data.summary).toMatchObject({
      totalRevenue: 3000,
      averageRevenue: 1500,
      patientCount: 10,
      averageRevenuePerPatient: 300,
      missingReportDays: 1,
      needsReviewDays: 1,
    });
    expect(json.data.timeline.map((row: { date: string }) => row.date)).toEqual(
      ['2026-06-08', '2026-06-09', '2026-06-10']
    );
    expect(json.data.timeline[1]).toMatchObject({
      date: '2026-06-09',
      totalRevenue: 0,
      patientCount: 0,
      averageRevenuePerPatient: 0,
    });
    expect(from).not.toHaveBeenCalledWith('daily_report_items');
    expect(from).not.toHaveBeenCalledWith('clinics');
  });

  it('maps write-side statuses to manager-facing statuses and filters reports', async () => {
    mockAdminClient({
      reports: [
        {
          id: 'submitted-report',
          report_date: '2026-06-01',
          total_patients: 1,
          total_revenue: 100,
          insurance_revenue: 100,
          private_revenue: 0,
          updated_at: '2026-06-01T09:00:00.000Z',
          status: 'submitted',
        },
        {
          id: 'approved-report',
          report_date: '2026-06-02',
          total_patients: 1,
          total_revenue: 200,
          insurance_revenue: 100,
          private_revenue: 100,
          updated_at: '2026-06-02T09:00:00.000Z',
          status: 'approved',
        },
        {
          id: 'rejected-report',
          report_date: '2026-06-03',
          total_patients: 1,
          total_revenue: 300,
          insurance_revenue: 100,
          private_revenue: 200,
          updated_at: '2026-06-03T09:00:00.000Z',
          status: 'rejected',
        },
        {
          id: 'draft-report',
          report_date: '2026-06-04',
          total_patients: 1,
          total_revenue: 400,
          insurance_revenue: 100,
          private_revenue: 300,
          updated_at: '2026-06-04T09:00:00.000Z',
          status: 'draft',
        },
      ],
    });

    const allResponse = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-01&end_date=2026-06-05&status=all`
    );
    const allJson = await allResponse.json();
    const filteredResponse = await getOverview(
      `http://localhost/api/manager/daily-reports/overview?clinic_id=${clinicId}&start_date=2026-06-01&end_date=2026-06-05&status=needs_review`
    );
    const filteredJson = await filteredResponse.json();

    expect(
      allJson.data.reports.map((row: { status: string }) => row.status)
    ).toEqual([
      'submitted',
      'confirmed',
      'needs_review',
      'needs_review',
      'missing',
    ]);
    expect(
      filteredJson.data.reports.map((row: { id: string }) => row.id)
    ).toEqual(['rejected-report', 'draft-report']);
  });
});
