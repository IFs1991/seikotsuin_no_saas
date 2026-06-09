import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const processApiRequestMock = jest.mocked(processApiRequest);
const processClinicScopedBodyMock = jest.mocked(processClinicScopedBody);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reportId = '123e4567-e89b-12d3-a456-426614174011';
const itemId = '123e4567-e89b-12d3-a456-426614174010';

const managerPermissions = {
  role: 'manager',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function createManagerForbiddenResponse() {
  return Response.json(
    {
      success: false,
      error: 'Managers cannot mutate daily reports.',
    },
    { status: 403 }
  );
}

function allowedRolesContainManager(options: {
  allowedRoles?: readonly string[];
}) {
  return options.allowedRoles?.includes('manager') ?? false;
}

function mockDailyReportWriteGuard() {
  ensureClinicAccessMock.mockImplementation(
    async (_request, _path, _clinicId, options = {}) => {
      if (!allowedRolesContainManager(options)) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          'Managers cannot mutate daily reports.',
          403
        );
      }

      return {
        supabase: {
          from: jest.fn(() => ({
            upsert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: reportId, clinic_id: clinicId },
                  error: null,
                }),
              })),
            })),
            select: jest.fn(() => ({
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: { id: reportId, clinic_id: clinicId },
                error: null,
              }),
            })),
            delete: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ error: null }),
            })),
          })),
        },
        user: {
          id: 'manager-user',
          email: 'manager@example.com',
        },
        permissions: managerPermissions,
      };
    }
  );
}

function mockDailyReportItemBodyGuard() {
  processClinicScopedBodyMock.mockImplementation(
    async (_request, _schema, options) => {
      if (!allowedRolesContainManager(options ?? {})) {
        return {
          success: false,
          error: createManagerForbiddenResponse(),
        };
      }

      return {
        success: true,
        dto: {
          clinic_id: clinicId,
          id: itemId,
          report_date: '2026-06-09',
          patientName: '山田 太郎',
          treatmentName: '整体',
          durationMinutes: 30,
          fee: 5000,
          billingType: 'private',
        },
        auth: {
          id: 'manager-user',
          email: 'manager@example.com',
          role: 'manager',
        },
        permissions: managerPermissions,
        supabase: { from: jest.fn() },
      };
    }
  );
}

function mockDailyReportItemDeleteGuard() {
  processApiRequestMock.mockImplementation(async (_request, options = {}) => {
    if (!allowedRolesContainManager(options)) {
      return {
        success: false,
        error: createManagerForbiddenResponse(),
      };
    }

    return {
      success: true,
      auth: {
        id: 'manager-user',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: managerPermissions,
      supabase: { from: jest.fn() },
    };
  });
}

function mockDailyReportItemAdminClient() {
  const itemRow = {
    id: itemId,
    clinic_id: clinicId,
    daily_report_id: reportId,
    report_date: '2026-06-09',
    reservation_id: null,
    customer_id: null,
    menu_id: null,
    staff_resource_id: null,
    patient_name: '山田 太郎',
    treatment_name: '整体',
    duration_minutes: 30,
    fee: 5000,
    billing_type: 'private',
    revenue_context_code: 'private',
    revenue_context_source: 'manual',
    amount_source: 'manual',
    estimate_status: 'not_calculated',
    care_episode_id: null,
    visit_ordinal_in_episode: null,
    visit_stage_code: null,
    menu_billing_profile_id: null,
    customer_insurance_coverage_id: null,
    patient_burden_rate: null,
    coverage_resolution_source: null,
    pricing_snapshot_status: 'pending',
    pricing_confirmed_at: null,
    payment_method_id: null,
    next_reservation_start_time: null,
    next_reservation_end_time: null,
    next_reservation_id: null,
    source: 'manual',
    notes: null,
    created_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
    created_by: 'manager-user',
    updated_by: 'manager-user',
  };
  const itemQuery = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: itemRow,
      error: null,
    }),
  };
  const dailyReportQuery = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { id: reportId },
      error: null,
    }),
  };
  const insertQuery = {
    select: jest.fn(() => ({
      single: jest.fn().mockResolvedValue({
        data: itemRow,
        error: null,
      }),
    })),
  };
  const deleteQuery = {
    eq: jest.fn().mockResolvedValue({ error: null }),
  };

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'daily_reports') {
        return { select: jest.fn(() => dailyReportQuery) };
      }
      if (table === 'daily_report_items') {
        return {
          select: jest.fn(() => itemQuery),
          insert: jest.fn(() => insertQuery),
          update: jest.fn(() => ({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: itemRow,
                error: null,
              }),
            })),
          })),
          delete: jest.fn(() => deleteQuery),
        };
      }
      return { select: jest.fn() };
    }),
  };

  createScopedAdminContextMock.mockReturnValue({
    client,
    assertClinicInScope: jest.fn(),
  });
}

function buildDailyReportItemReadClient() {
  const itemQuery = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: [
        {
          id: itemId,
          clinic_id: clinicId,
          daily_report_id: reportId,
          report_date: '2026-06-09',
          reservation_id: null,
          customer_id: null,
          menu_id: null,
          staff_resource_id: null,
          patient_name: '山田 太郎',
          treatment_name: '整体',
          duration_minutes: 30,
          fee: 5000,
          billing_type: 'private',
          revenue_context_code: 'private',
          revenue_context_source: 'manual',
          amount_source: 'manual',
          estimate_status: 'not_calculated',
          care_episode_id: null,
          visit_ordinal_in_episode: null,
          visit_stage_code: null,
          menu_billing_profile_id: null,
          customer_insurance_coverage_id: null,
          patient_burden_rate: null,
          coverage_resolution_source: null,
          pricing_snapshot_status: 'pending',
          pricing_confirmed_at: null,
          payment_method_id: null,
          next_reservation_start_time: null,
          next_reservation_end_time: null,
          next_reservation_id: null,
          source: 'manual',
          notes: null,
          created_at: '2026-06-09T00:00:00.000Z',
          updated_at: '2026-06-09T00:00:00.000Z',
          created_by: 'manager-user',
          updated_by: 'manager-user',
        },
      ],
      error: null,
    }),
  };
  const paymentMethodQuery = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: [{ id: 'payment-1', name: '現金', is_active: true }],
      error: null,
    }),
  };

  return {
    from: jest.fn((table: string) => {
      if (table === 'daily_report_items') {
        return { select: jest.fn(() => itemQuery) };
      }
      if (table === 'master_payment_methods') {
        return { select: jest.fn(() => paymentMethodQuery) };
      }
      return { select: jest.fn() };
    }),
  };
}

describe('Daily Reports manager mutation authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDailyReportWriteGuard();
    mockDailyReportItemBodyGuard();
    mockDailyReportItemDeleteGuard();
    mockDailyReportItemAdminClient();
  });

  it('manager cannot POST /api/daily-reports', async () => {
    const { POST } = await import('@/app/api/daily-reports/route');
    const request = new NextRequest('http://localhost/api/daily-reports', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        report_date: '2026-06-09',
        total_patients: 10,
        new_patients: 2,
        total_revenue: 30000,
        insurance_revenue: 12000,
        private_revenue: 18000,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Managers cannot mutate daily reports.',
    });
  });

  it('manager cannot DELETE /api/daily-reports', async () => {
    const { DELETE } = await import('@/app/api/daily-reports/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports?id=${reportId}`,
      { method: 'DELETE' }
    );

    const response = await DELETE(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Managers cannot mutate daily reports.',
    });
  });

  it('manager cannot POST /api/daily-reports/items', async () => {
    const { POST } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Managers cannot mutate daily reports.',
    });
  });

  it('manager cannot PATCH /api/daily-reports/items', async () => {
    const { PATCH } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      { method: 'PATCH' }
    );

    const response = await PATCH(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Managers cannot mutate daily reports.',
    });
  });

  it('manager cannot DELETE /api/daily-reports/items', async () => {
    const { DELETE } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&id=${itemId}`,
      { method: 'DELETE' }
    );

    const response = await DELETE(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Managers cannot mutate daily reports.',
    });
  });

  it('manager can GET /api/daily-reports/items after assignment scope verification without clinic_id fallback', async () => {
    const readClient = buildDailyReportItemReadClient();
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-user',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: readClient,
    });
    createScopedAdminContextMock.mockImplementation(() => {
      throw new Error('manager GET must not use permissions clinic fallback');
    });

    const { GET } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&report_date=2026-06-09`,
      { method: 'GET' }
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(readClient.from).toHaveBeenCalledWith('daily_report_items');
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });
});
