import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let postHandler: any;

beforeAll(async () => {
  const dailyReportsModule = await import('@/app/api/daily-reports/route');
  postHandler = dailyReportsModule.POST;
});

const clinicId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const foreignReportId = '33333333-3333-4333-8333-333333333333';
const staffId = '44444444-4444-4444-8444-444444444444';

const createRequest = (body: unknown) => ({
  json: jest.fn().mockResolvedValue(body),
});

// DB row returned by public.save_daily_report: an itemized report whose
// totals are derived from 2 detail rows (fees 3000 insurance + 2000 private).
const itemizedRow = {
  id: reportId,
  clinic_id: clinicId,
  staff_id: null,
  report_date: '2025-01-01',
  total_patients: 2,
  new_patients: 1,
  total_revenue: 5000,
  insurance_revenue: 3000,
  private_revenue: 2000,
  report_text: '古いタブから保存',
  aggregate_source: 'items',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T09:00:00.000Z',
};

// Stale browser payload: the tab loaded before detail rows changed.
const staleItemizedPayload = {
  clinic_id: clinicId,
  report_date: '2025-01-01',
  total_patients: 10,
  new_patients: 1,
  total_revenue: 99999,
  insurance_revenue: 50000,
  private_revenue: 49999,
  report_text: '古いタブから保存',
};

function mockSaveClient(result: {
  data: unknown;
  error: { code: string; message: string; details?: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue(result);
  const from = jest.fn(() => {
    throw new Error('daily report writes must not bypass save_daily_report');
  });
  ensureClinicAccessMock.mockResolvedValue({
    supabase: { rpc, from },
    permissions: { role: 'staff', clinic_id: clinicId },
  });
  return { rpc, from };
}

describe('POST /api/daily-reports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns validation error when payload is invalid', async () => {
    const request = createRequest({
      clinic_id: 'not-a-uuid',
      report_date: '2025-01-01',
      total_patients: -1,
    });

    const response = await postHandler(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.fieldErrors?.clinic_id?.[0]).toContain('UUID');
  });

  it('saves through the atomic DB boundary and returns DB totals instead of stale browser totals', async () => {
    const { rpc, from } = mockSaveClient({ data: itemizedRow, error: null });

    const response = await postHandler(createRequest(staleItemizedPayload));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_daily_report', {
      p_clinic_id: clinicId,
      p_report_date: '2025-01-01',
      p_report_id: undefined,
      p_staff_id: undefined,
      p_total_patients: 10,
      p_new_patients: 1,
      p_total_revenue: 99999,
      p_insurance_revenue: 50000,
      p_private_revenue: 49999,
      p_report_text: '古いタブから保存',
    });
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
      id: reportId,
      total_patients: 2,
      total_revenue: 5000,
      insurance_revenue: 3000,
      private_revenue: 2000,
      aggregate_source: 'items',
    });
  });

  it('passes report_id and staff_id to the same atomic boundary', async () => {
    const { rpc } = mockSaveClient({
      data: { ...itemizedRow, staff_id: staffId },
      error: null,
    });

    const response = await postHandler(
      createRequest({
        ...staleItemizedPayload,
        id: reportId,
        staff_id: staffId,
      })
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'save_daily_report',
      expect.objectContaining({ p_report_id: reportId, p_staff_id: staffId })
    );
  });

  it('rejects new_patients above the DB-derived total (2 detail rows, client total 10, new 5)', async () => {
    mockSaveClient({
      data: null,
      error: {
        code: '23514',
        message: 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL',
        details: '2',
      },
    });

    const response = await postHandler(
      createRequest({ ...staleItemizedPayload, new_patients: 5 })
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.fieldErrors?.new_patients?.[0]).toContain(
      '明細から集計した総患者数（2名）以下'
    );
  });

  it('does not reject DB-valid new_patients just because the stale client total is lower', async () => {
    const { rpc } = mockSaveClient({
      data: { ...itemizedRow, new_patients: 2 },
      error: null,
    });

    const response = await postHandler(
      createRequest({
        ...staleItemizedPayload,
        total_patients: 1,
        new_patients: 2,
        total_revenue: 100,
        insurance_revenue: 0,
        private_revenue: 100,
      })
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'save_daily_report',
      expect.objectContaining({ p_total_patients: 1, p_new_patients: 2 })
    );
    const payload = await response.json();
    expect(payload.data).toMatchObject({ total_patients: 2, new_patients: 2 });
  });

  it('keeps the manual new_patients <= total_patients rule from the DB boundary', async () => {
    mockSaveClient({
      data: null,
      error: {
        code: '23514',
        message: 'DAILY_REPORT_NEW_PATIENTS_EXCEEDS_TOTAL',
      },
    });

    const response = await postHandler(
      createRequest({
        clinic_id: clinicId,
        report_date: '2025-01-02',
        total_patients: 1,
        new_patients: 3,
        total_revenue: 10000,
        insurance_revenue: 5000,
        private_revenue: 5000,
      })
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.fieldErrors?.new_patients?.[0]).toContain(
      'total_patients以下'
    );
  });

  it('keeps the manual revenue breakdown rule from the DB boundary', async () => {
    mockSaveClient({
      data: null,
      error: {
        code: '23514',
        message: 'DAILY_REPORT_REVENUE_BREAKDOWN_EXCEEDS_TOTAL',
      },
    });

    const response = await postHandler(
      createRequest({
        clinic_id: clinicId,
        report_date: '2025-01-02',
        total_patients: 3,
        new_patients: 1,
        total_revenue: 1000,
        insurance_revenue: 800,
        private_revenue: 800,
      })
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.fieldErrors?.total_revenue?.[0]).toContain(
      '保険診療と自費診療の合計以上'
    );
  });

  it('returns 403 when the DB rejects a report_id outside the clinic/date', async () => {
    mockSaveClient({
      data: null,
      error: { code: '42501', message: 'DAILY_REPORT_NOT_ACCESSIBLE' },
    });

    const response = await postHandler(
      createRequest({ ...staleItemizedPayload, id: foreignReportId })
    );
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: '日報へのアクセス権がありません',
    });
    expect(JSON.stringify(payload)).not.toContain(foreignReportId);
  });

  it('returns 403 when the DB rejects a staff_id outside the clinic', async () => {
    mockSaveClient({
      data: null,
      error: { code: '42501', message: 'DAILY_REPORT_STAFF_NOT_ACCESSIBLE' },
    });

    const response = await postHandler(
      createRequest({ ...staleItemizedPayload, staff_id: staffId })
    );
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: '日報担当スタッフへのアクセス権がありません',
    });
  });

  it('returns a sanitized 500 for unmapped DB errors such as RLS denials', async () => {
    mockSaveClient({
      data: null,
      error: {
        code: '42501',
        message:
          'new row violates row-level security policy for table "daily_reports"',
      },
    });

    const response = await postHandler(createRequest(staleItemizedPayload));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain('row-level security');
  });

  it('returns a sanitized 503 without the internal DB error code', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.DATABASE_CONNECTION_ERROR,
        'sensitive authority query failed',
        503,
        { databaseCode: '42P01' }
      )
    );

    const response = await postHandler(
      createRequest({
        clinic_id: clinicId,
        report_date: '2025-01-01',
        total_patients: 10,
        new_patients: 2,
        total_revenue: 30000,
        insurance_revenue: 12000,
        private_revenue: 18000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(payload)).not.toContain('DATABASE_CONNECTION_ERROR');
    expect(JSON.stringify(payload)).not.toContain('42P01');
    expect(JSON.stringify(payload)).not.toContain('sensitive');
  });
});
