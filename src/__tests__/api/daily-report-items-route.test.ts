import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';

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

const processApiRequestMock = processApiRequest as jest.Mock;
const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const itemId = '123e4567-e89b-12d3-a456-426614174010';
const reportId = '123e4567-e89b-12d3-a456-426614174011';
const customerId = '123e4567-e89b-12d3-a456-426614174012';
const menuId = '123e4567-e89b-12d3-a456-426614174013';
const staffResourceId = '123e4567-e89b-12d3-a456-426614174014';

const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function buildItemRow() {
  return {
    id: itemId,
    clinic_id: clinicId,
    daily_report_id: reportId,
    report_date: '2026-05-07',
    reservation_id: '123e4567-e89b-12d3-a456-426614174015',
    customer_id: customerId,
    menu_id: menuId,
    staff_resource_id: staffResourceId,
    patient_name: '山田 太郎',
    treatment_name: '整体',
    duration_minutes: 30,
    fee: 5000,
    billing_type: 'private',
    revenue_context_code: 'private',
    revenue_context_source: 'derived',
    amount_source: 'reservation',
    estimate_status: 'not_calculated',
    care_episode_id: null,
    visit_ordinal_in_episode: null,
    visit_stage_code: null,
    payment_method_id: null,
    next_reservation_start_time: null,
    next_reservation_end_time: null,
    next_reservation_id: null,
    source: 'reservation',
    notes: null,
    menu_billing_profile_id: null,
    customer_insurance_coverage_id: null,
    patient_burden_rate: null,
    coverage_resolution_source: null,
    pricing_snapshot_status: 'pending',
    pricing_confirmed_at: null,
    created_at: '2026-05-07T01:00:00.000Z',
    updated_at: '2026-05-07T01:00:00.000Z',
    created_by: 'user-1',
    updated_by: 'user-1',
  };
}

describe('/api/daily-reports/items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns daily report items and active payment methods', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [buildItemRow()],
        error: null,
      }),
    };
    const paymentMethodQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174020',
            name: '現金',
            is_active: true,
          },
        ],
        error: null,
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') {
          return { select: jest.fn().mockReturnValue(itemQuery) };
        }
        if (table === 'master_payment_methods') {
          return { select: jest.fn().mockReturnValue(paymentMethodQuery) };
        }
        return {};
      }),
    };
    const assertClinicInScope = jest.fn();

    processApiRequestMock.mockResolvedValue({
      success: true,
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&report_date=2026-05-07`
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        clinicId,
        requireClinicMatch: true,
        allowedRoles: expect.arrayContaining(['staff', 'therapist']),
      })
    );
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(client.from).toHaveBeenCalledWith('daily_report_items');
    expect(client.from).toHaveBeenCalledWith('master_payment_methods');
    expect(json.data.items[0]).toMatchObject({
      id: itemId,
      patientName: '山田 太郎',
      fee: 5000,
      revenueContextCode: 'private',
      revenueContextSource: 'derived',
      amountSource: 'reservation',
      estimateStatus: 'not_calculated',
    });
    expect(json.data.paymentMethods[0]).toMatchObject({ name: '現金' });
  });

  test('GET can include batch pricing context without per-item coverage calls', async () => {
    const insuranceItem = {
      ...buildItemRow(),
      id: itemId,
      customer_id: customerId,
      menu_id: menuId,
      billing_type: 'insurance',
      revenue_context_code: 'insurance',
      fee: 2000,
    };
    const privateItem = {
      ...buildItemRow(),
      id: '123e4567-e89b-12d3-a456-426614174030',
      customer_id: null,
      menu_id: '123e4567-e89b-12d3-a456-426614174031',
      billing_type: 'private',
      revenue_context_code: 'private',
      fee: 4500,
    };
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [insuranceItem, privateItem],
        error: null,
      }),
    };
    const coverageQuery = {
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      or: jest.fn().mockResolvedValue({
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174040',
            clinic_id: clinicId,
            customer_id: customerId,
            patient_burden_rate: 30,
            effective_from: '2026-04-01',
            effective_to: null,
            verification_status: 'confirmed',
            verified_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      }),
    };
    const profileQuery = {
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      or: jest.fn().mockResolvedValue({
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174050',
            clinic_id: clinicId,
            menu_id: menuId,
            revenue_context_code: 'insurance',
            calculation_method: 'insurance_master',
            fixed_amount_yen: null,
            default_patient_burden_rate: 30,
            requires_review: false,
            effective_from: '2026-04-01',
            effective_to: null,
            is_active: true,
            is_deleted: false,
            created_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174051',
            clinic_id: clinicId,
            menu_id: privateItem.menu_id,
            revenue_context_code: 'private',
            calculation_method: 'fixed_amount',
            fixed_amount_yen: 4500,
            default_patient_burden_rate: null,
            requires_review: false,
            effective_from: '2026-04-01',
            effective_to: null,
            is_active: true,
            is_deleted: false,
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      }),
    };
    const paymentMethodQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') {
          return { select: jest.fn().mockReturnValue(itemQuery) };
        }
        if (table === 'customer_insurance_coverages') {
          return { select: jest.fn().mockReturnValue(coverageQuery) };
        }
        if (table === 'menu_billing_profiles') {
          return { select: jest.fn().mockReturnValue(profileQuery) };
        }
        if (table === 'master_payment_methods') {
          return { select: jest.fn().mockReturnValue(paymentMethodQuery) };
        }
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&report_date=2026-05-07&include_pricing_context=true`
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith('customer_insurance_coverages');
    expect(client.from).toHaveBeenCalledWith('menu_billing_profiles');
    expect(coverageQuery.eq).toHaveBeenCalledWith(
      'verification_status',
      'confirmed'
    );
    expect(coverageQuery.in).toHaveBeenCalledWith('customer_id', [customerId]);
    expect(coverageQuery.or).toHaveBeenCalledWith(
      'effective_to.is.null,effective_to.gte.2026-05-07'
    );
    expect(profileQuery.in).toHaveBeenCalledWith('menu_id', [
      menuId,
      privateItem.menu_id,
    ]);
    expect(profileQuery.in).toHaveBeenCalledWith('revenue_context_code', [
      'insurance',
      'private',
    ]);
    expect(json.data.items[0].pricingContext).toMatchObject({
      currentPatientBurdenRate: 30,
      coverageResolutionSource: 'customer_default',
      activeMenuBillingProfile: {
        id: '123e4567-e89b-12d3-a456-426614174050',
        calculationMethod: 'insurance_master',
      },
    });
    expect(json.data.items[1].pricingContext).toMatchObject({
      currentPatientBurdenRate: null,
      coverageResolutionSource: null,
      activeMenuBillingProfile: {
        calculationMethod: 'fixed_amount',
        fixedAmountYen: 4500,
      },
    });
  });

  test('GET can skip payment methods for lightweight item refreshes', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [buildItemRow()],
        error: null,
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') {
          return { select: jest.fn().mockReturnValue(itemQuery) };
        }
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&report_date=2026-05-07&include_payment_methods=false`
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(client.from).toHaveBeenCalledWith('daily_report_items');
    expect(client.from).not.toHaveBeenCalledWith('master_payment_methods');
    expect(json.data.paymentMethods).toBeUndefined();
  });

  test('POST rejects inactive or unknown payment methods', async () => {
    const paymentMethodQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'master_payment_methods') {
          return { select: jest.fn().mockReturnValue(paymentMethodQuery) };
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        report_date: '2026-05-07',
        patientName: '山田 太郎',
        treatmentName: '整体',
        durationMinutes: 30,
        fee: 5000,
        billingType: 'private',
        paymentMethodId: '123e4567-e89b-12d3-a456-426614174020',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'POST',
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('選択した決済方法が見つかりません');
    expect(client.from).not.toHaveBeenCalledWith('daily_reports');
  });

  test('POST stores traffic accident context as private legacy billing with manual classification', async () => {
    const dailyReportQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: reportId },
        error: null,
      }),
    };
    const insertSelect = {
      single: jest.fn().mockResolvedValue({
        data: {
          ...buildItemRow(),
          reservation_id: null,
          source: 'manual',
          billing_type: 'private',
          revenue_context_code: 'traffic_accident',
          revenue_context_source: 'manual',
          amount_source: 'manual',
          estimate_status: 'not_calculated',
        },
        error: null,
      }),
    };
    const dailyReportItemsTable = {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(insertSelect),
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_reports') {
          return { select: jest.fn().mockReturnValue(dailyReportQuery) };
        }
        if (table === 'daily_report_items') return dailyReportItemsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        report_date: '2026-05-07',
        patientName: '山田 太郎',
        treatmentName: '整体',
        durationMinutes: 30,
        fee: 5000,
        billingType: 'private',
        revenueContextCode: 'traffic_accident',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'POST',
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(dailyReportItemsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_type: 'private',
        revenue_context_code: 'traffic_accident',
        revenue_context_source: 'manual',
        amount_source: 'manual',
        estimate_status: 'not_calculated',
      })
    );
    expect(json.data).toMatchObject({
      billingType: 'private',
      revenueContextCode: 'traffic_accident',
      revenueContextSource: 'manual',
    });
  });

  test('POST rejects incompatible billing type and revenue context', async () => {
    const client = { from: jest.fn() };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        report_date: '2026-05-07',
        patientName: '山田 太郎',
        treatmentName: '整体',
        durationMinutes: 30,
        fee: 5000,
        billingType: 'insurance',
        revenueContextCode: 'traffic_accident',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'POST',
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe(
      'billingType and revenueContextCode are incompatible'
    );
    expect(client.from).not.toHaveBeenCalledWith('daily_reports');
    expect(client.from).not.toHaveBeenCalledWith('daily_report_items');
  });

  test('POST returns 409 when next reservation insert hits the DB exclusion constraint', async () => {
    const dailyReportQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: reportId },
        error: null,
      }),
    };
    const conflictQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const reservationInsertSelect = {
      single: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23P01',
          message:
            'conflicting key value violates exclusion constraint "reservations_no_overlap"',
        },
      }),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(reservationInsertSelect),
      }),
    };
    const dailyReportItemsTable = {
      insert: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_reports') {
          return { select: jest.fn().mockReturnValue(dailyReportQuery) };
        }
        if (table === 'reservations') return reservationsTable;
        if (table === 'daily_report_items') return dailyReportItemsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        report_date: '2026-05-07',
        customerId,
        menuId,
        staffResourceId,
        patientName: '山田 太郎',
        treatmentName: '整体',
        durationMinutes: 30,
        fee: 5000,
        billingType: 'private',
        nextReservationStartTime: '2026-05-14T10:00:00.000Z',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'POST',
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('次回予約の時間帯に既存予約があります');
    expect(dailyReportItemsTable.insert).not.toHaveBeenCalled();
    expect(conflictQuery.eq).toHaveBeenCalledWith('is_deleted', false);
  });

  test('PATCH rejects next reservations that conflict with the same staff time', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: buildItemRow(),
        error: null,
      }),
    };
    const conflictQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ count: 1, error: null }),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn(),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        id: itemId,
        nextReservationStartTime: '2026-05-14T10:00:00.000Z',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'PATCH',
      }
    );
    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('次回予約の時間帯に既存予約があります');
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
    expect(reservationsTable.insert).not.toHaveBeenCalled();
    expect(conflictQuery.eq).toHaveBeenCalledWith('is_deleted', false);
  });

  test('PATCH returns 409 when next reservation update hits the DB exclusion constraint', async () => {
    const nextReservationId = '123e4567-e89b-12d3-a456-426614174016';
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ...buildItemRow(),
          next_reservation_start_time: '2026-05-14T10:00:00.000Z',
          next_reservation_end_time: '2026-05-14T10:30:00.000Z',
          next_reservation_id: nextReservationId,
        },
        error: null,
      }),
    };
    const conflictQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const reservationUpdateSelect = {
      single: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23P01',
          message:
            'conflicting key value violates exclusion constraint "reservations_no_overlap"',
        },
      }),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnValue(reservationUpdateSelect),
      }),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        id: itemId,
        nextReservationStartTime: '2026-05-14T10:15:00.000Z',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'PATCH',
      }
    );
    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('次回予約の時間帯に既存予約があります');
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
    expect(reservationsTable.update).toHaveBeenCalled();
    expect(conflictQuery.eq).toHaveBeenCalledWith('is_deleted', false);
    expect(conflictQuery.neq).toHaveBeenCalledWith('id', nextReservationId);
  });

  test('PATCH returns the existing item without writing when no fields changed', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: buildItemRow(),
        error: null,
      }),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        id: itemId,
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'PATCH',
      }
    );
    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      id: itemId,
      patientName: '山田 太郎',
    });
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
  });

  test('PATCH changes revenue context and marks the classification manual', async () => {
    const updatedRow = {
      ...buildItemRow(),
      billing_type: 'private',
      revenue_context_code: 'workers_comp',
      revenue_context_source: 'manual',
    };
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: buildItemRow(),
        error: null,
      }),
    };
    const updateSelect = {
      single: jest.fn().mockResolvedValue({
        data: updatedRow,
        error: null,
      }),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnValue(updateSelect),
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        id: itemId,
        revenueContextCode: 'workers_comp',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/daily-reports/items/route');
    const request = new NextRequest(
      'http://localhost/api/daily-reports/items',
      {
        method: 'PATCH',
      }
    );
    const response = await PATCH(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_type: 'private',
        revenue_context_code: 'workers_comp',
        revenue_context_source: 'manual',
      })
    );
    expect(json.data).toMatchObject({
      billingType: 'private',
      revenueContextCode: 'workers_comp',
      revenueContextSource: 'manual',
    });
  });
});
