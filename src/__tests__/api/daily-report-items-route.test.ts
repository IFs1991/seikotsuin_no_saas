import type { NextRequest } from 'next/server';
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
    payment_method_id: null,
    next_reservation_start_time: null,
    next_reservation_end_time: null,
    next_reservation_id: null,
    source: 'reservation',
    notes: null,
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
    const request = {
      nextUrl: new URL(
        `http://localhost/api/daily-reports/items?clinic_id=${clinicId}&report_date=2026-05-07`
      ),
    } as unknown as NextRequest;

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(client.from).toHaveBeenCalledWith('daily_report_items');
    expect(client.from).toHaveBeenCalledWith('master_payment_methods');
    expect(json.data.items[0]).toMatchObject({
      id: itemId,
      patientName: '山田 太郎',
      fee: 5000,
    });
    expect(json.data.paymentMethods[0]).toMatchObject({ name: '現金' });
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
    const response = await POST({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('選択した決済方法が見つかりません');
    expect(client.from).not.toHaveBeenCalledWith('daily_reports');
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
    const response = await PATCH({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('次回予約の時間帯に既存予約があります');
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
    expect(reservationsTable.insert).not.toHaveBeenCalled();
  });
});
