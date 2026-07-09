import { NextRequest } from 'next/server';

import { processClinicScopedBody } from '@/lib/route-helpers';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/daily-reports/read-model', () => ({
  fetchDailyReportsReadModel: jest.fn(),
}));

const processClinicScopedBodyMock = jest.mocked(processClinicScopedBody);
const fetchDailyReportsReadModelMock = jest.mocked(fetchDailyReportsReadModel);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const otherClinicId = '123e4567-e89b-12d3-a456-426614174099';
const reportId = '123e4567-e89b-12d3-a456-426614174010';
const otherClinicReportId = '123e4567-e89b-12d3-a456-426614174011';
const staffId = '123e4567-e89b-12d3-a456-426614174020';

const validDto = {
  clinic_id: clinicId,
  report_date: '2026-06-30',
  staff_id: staffId,
  total_patients: 18,
  new_patients: 3,
  total_revenue: 120000,
  insurance_revenue: 40000,
  private_revenue: 80000,
  report_text: '共有事項',
};

const auth = { id: 'user-1', email: 'staff@example.com', role: 'staff' };
const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

const dailyReportsReadModel = {
  reports: [
    {
      id: reportId,
      reportDate: validDto.report_date,
      staffName: '佐藤',
      totalPatients: validDto.total_patients,
      newPatients: validDto.new_patients,
      totalRevenue: validDto.total_revenue,
      insuranceRevenue: validDto.insurance_revenue,
      privateRevenue: validDto.private_revenue,
      reportText: validDto.report_text,
      createdAt: '2026-06-30T09:00:00.000Z',
    },
  ],
  summary: {
    totalReports: 1,
    averagePatients: validDto.total_patients,
    averageRevenue: validDto.total_revenue,
    totalRevenue: validDto.total_revenue,
  },
  monthlyTrends: [
    {
      month: '2026-06',
      reports: 1,
      totalPatients: validDto.total_patients,
      totalRevenue: validDto.total_revenue,
    },
  ],
};

type MaybeSingleBuilder<T> = {
  eq: jest.MockedFunction<
    (field: string, value: unknown) => MaybeSingleBuilder<T>
  >;
  maybeSingle: jest.MockedFunction<() => Promise<{ data: T; error: null }>>;
};

type UpsertBuilder<T> = {
  select: jest.MockedFunction<() => UpsertSelectBuilder<T>>;
};

type UpsertSelectBuilder<T> = {
  single: jest.MockedFunction<() => Promise<{ data: T; error: null }>>;
};

type EntitlementRow = {
  clinic_id: string;
  mobile_uiux_enabled: boolean;
  mobile_uiux_real_data_enabled: boolean;
  mobile_uiux_write_enabled: boolean;
  mobile_uiux_reservation_write_enabled: boolean;
  mobile_uiux_daily_report_write_enabled: boolean;
  mobile_uiux_settings_write_enabled: boolean;
  rollout_phase: string;
  updated_at: string;
  updated_by: string | null;
};

type EntitlementBuilder = {
  select: jest.MockedFunction<(columns: string) => EntitlementBuilder>;
  in: jest.MockedFunction<
    (column: string, values: readonly string[]) => EntitlementBuilder
  >;
  returns: jest.MockedFunction<
    () => Promise<{ data: EntitlementRow[]; error: null }>
  >;
};

function createMaybeSingleBuilder<T>(data: T): MaybeSingleBuilder<T> {
  const builder = {} as MaybeSingleBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function createUpsertBuilder<T>(data: T): UpsertBuilder<T> {
  const selectBuilder: UpsertSelectBuilder<T> = {
    single: jest.fn().mockResolvedValue({ data, error: null }),
  };
  return {
    select: jest.fn().mockReturnValue(selectBuilder),
  };
}

function buildEntitlementRow(
  enabled: boolean,
  dailyReportWriteEnabled: boolean
): EntitlementRow {
  return {
    clinic_id: clinicId,
    mobile_uiux_enabled: enabled,
    mobile_uiux_real_data_enabled: enabled,
    mobile_uiux_write_enabled: dailyReportWriteEnabled,
    mobile_uiux_reservation_write_enabled: false,
    mobile_uiux_daily_report_write_enabled: dailyReportWriteEnabled,
    mobile_uiux_settings_write_enabled: false,
    rollout_phase: enabled ? 'pilot' : 'off',
    updated_at: '2026-07-02T00:00:00.000Z',
    updated_by: null,
  };
}

function createEntitlementBuilder(rows: EntitlementRow[]): EntitlementBuilder {
  let builder: EntitlementBuilder;
  builder = {
    select: jest.fn(() => builder),
    in: jest.fn(() => builder),
    returns: jest.fn(async () => ({ data: rows, error: null })),
  };
  return builder;
}

function buildMutationRequest(payload = validDto) {
  return new NextRequest('http://localhost/api/mobile-uiux/daily-reports', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
    },
  });
}

function buildMutationClient(params?: {
  staffFound?: boolean;
  reportFound?: boolean;
  entitlementRows?: EntitlementRow[];
}) {
  const upsertedRow = {
    id: reportId,
    clinic_id: clinicId,
    staff_id: validDto.staff_id,
    report_date: validDto.report_date,
    total_patients: validDto.total_patients,
    new_patients: validDto.new_patients,
    total_revenue: validDto.total_revenue,
    insurance_revenue: validDto.insurance_revenue,
    private_revenue: validDto.private_revenue,
    report_text: validDto.report_text,
    created_at: '2026-06-30T09:00:00.000Z',
    updated_at: '2026-06-30T09:00:00.000Z',
  };
  const staffQuery = createMaybeSingleBuilder(
    params?.staffFound === false ? null : { id: staffId }
  );
  const reportQuery = createMaybeSingleBuilder(
    params?.reportFound === false ? null : { id: reportId }
  );
  const upsertBuilder = createUpsertBuilder(upsertedRow);
  const entitlementBuilder = createEntitlementBuilder(
    params?.entitlementRows ?? []
  );
  const staffTable = {
    select: jest.fn().mockReturnValue(staffQuery),
  };
  const dailyReportsTable = {
    select: jest.fn().mockReturnValue(reportQuery),
    upsert: jest.fn().mockReturnValue(upsertBuilder),
  };
  const client = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'staff') return staffTable;
      if (table === 'daily_reports') return dailyReportsTable;
      if (table === 'clinic_feature_flags') return entitlementBuilder;
      return {};
    }),
  };

  return {
    client,
    staffQuery,
    reportQuery,
    dailyReportsTable,
    entitlementBuilder,
  };
}

describe('POST /api/mobile-uiux/daily-reports write pilot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_WRITE_ENABLED: 'true',
      MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    fetchDailyReportsReadModelMock.mockResolvedValue(dailyReportsReadModel);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 403 when the global write flag is off', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'false';
    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');

    const response = await POST(buildMutationRequest());

    expect(response.status).toBe(403);
    expect(processClinicScopedBodyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the daily report write flag is off', async () => {
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'false';
    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');

    const response = await POST(buildMutationRequest());

    expect(response.status).toBe(403);
    expect(processClinicScopedBodyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when DB entitlement disables daily report write', async () => {
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    const { client, dailyReportsTable } = buildMutationClient({
      entitlementRows: [buildEntitlementRow(true, false)],
    });
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: validDto,
      auth,
      permissions,
      supabase: client,
    });
    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');

    const response = await POST(buildMutationRequest());

    expect(response.status).toBe(403);
    expect(dailyReportsTable.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when new_patients exceeds total_patients', async () => {
    const invalidDto = {
      ...validDto,
      total_patients: 2,
      new_patients: 3,
    };
    processClinicScopedBodyMock.mockImplementationOnce(
      async (_request, schema) => {
        const parsed = schema.safeParse(invalidDto);
        if (!parsed.success) {
          return {
            success: false,
            error: Response.json({ success: false }, { status: 400 }),
          };
        }
        return {
          success: true,
          dto: parsed.data,
          auth,
          permissions,
          supabase: buildMutationClient().client,
        };
      }
    );

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(buildMutationRequest(invalidDto));

    expect(response.status).toBe(400);
  });

  it('returns 400 when revenue details exceed total_revenue', async () => {
    const invalidDto = {
      ...validDto,
      total_revenue: 1000,
      insurance_revenue: 800,
      private_revenue: 300,
    };
    processClinicScopedBodyMock.mockImplementationOnce(
      async (_request, schema) => {
        const parsed = schema.safeParse(invalidDto);
        if (!parsed.success) {
          return {
            success: false,
            error: Response.json({ success: false }, { status: 400 }),
          };
        }
        return {
          success: true,
          dto: parsed.data,
          auth,
          permissions,
          supabase: buildMutationClient().client,
        };
      }
    );

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(buildMutationRequest(invalidDto));

    expect(response.status).toBe(400);
  });

  it('returns 400 when report_date is not a valid JST date key', async () => {
    const invalidDto = {
      ...validDto,
      report_date: '2026-02-31',
    };
    processClinicScopedBodyMock.mockImplementationOnce(
      async (_request, schema) => {
        const parsed = schema.safeParse(invalidDto);
        if (!parsed.success) {
          return {
            success: false,
            error: Response.json({ success: false }, { status: 400 }),
          };
        }
        return {
          success: true,
          dto: parsed.data,
          auth,
          permissions,
          supabase: buildMutationClient().client,
        };
      }
    );

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(buildMutationRequest(invalidDto));

    expect(response.status).toBe(400);
  });

  it('returns 403 without upsert when report_id belongs outside the clinic scope', async () => {
    const { client, dailyReportsTable } = buildMutationClient({
      reportFound: false,
    });
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        ...validDto,
        id: otherClinicReportId,
      },
      auth,
      permissions,
      supabase: client,
    });

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(
      buildMutationRequest({
        ...validDto,
        id: otherClinicReportId,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(otherClinicReportId);
    expect(dailyReportsTable.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 without upsert when clinic_id is outside the authenticated clinic scope', async () => {
    const forbiddenResponse = Response.json(
      { success: false, error: 'このクリニックへのアクセス権がありません' },
      { status: 403 }
    );
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: false,
      error: forbiddenResponse,
    });

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(
      buildMutationRequest({
        ...validDto,
        clinic_id: otherClinicId,
      })
    );

    expect(response.status).toBe(403);
  });

  it('returns 403 without upsert when staff_id is outside the clinic scope', async () => {
    const { client, staffQuery, dailyReportsTable } = buildMutationClient({
      staffFound: false,
    });
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: validDto,
      auth,
      permissions,
      supabase: client,
    });

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const response = await POST(buildMutationRequest());

    expect(response.status).toBe(403);
    expect(staffQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(staffQuery.eq).toHaveBeenCalledWith('id', staffId);
    expect(dailyReportsTable.upsert).not.toHaveBeenCalled();
  });

  it('upserts through the mobile BFF and verifies the same report through the PC read model', async () => {
    const { client, dailyReportsTable } = buildMutationClient();
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: validDto,
      auth,
      permissions,
      supabase: client,
    });

    const { POST } = await import('@/app/api/mobile-uiux/daily-reports/route');
    const request = buildMutationRequest();
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      request,
      expect.anything(),
      {
        allowedRoles: ['admin', 'clinic_admin', 'therapist', 'staff'],
      }
    );
    expect(dailyReportsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        staff_id: staffId,
        report_date: '2026-06-30',
        total_patients: 18,
        new_patients: 3,
        total_revenue: 120000,
        insurance_revenue: 40000,
        private_revenue: 80000,
        report_text: '共有事項',
      }),
      {
        onConflict: 'clinic_id,report_date',
      }
    );
    expect(fetchDailyReportsReadModelMock).toHaveBeenCalledWith({
      supabase: client,
      clinicId,
      startDate: '2026-06-30',
      endDate: '2026-06-30',
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        reportDate: '2026-06-30',
        report: {
          id: reportId,
        },
        dailyReports: dailyReportsReadModel,
      },
    });
  });
});
