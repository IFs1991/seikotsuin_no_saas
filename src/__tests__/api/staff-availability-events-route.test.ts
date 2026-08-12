import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/staff/availability-events/route';
import {
  StaffAvailabilityStaffNotFoundError,
  StaffAvailabilityTimeRangeError,
} from '@/lib/services/staff-availability-service';

const mockProcessClinicScopedBody = jest.fn();
const mockCreateEvent = jest.fn();

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual<typeof import('@/lib/route-helpers')>(
    '@/lib/route-helpers'
  );
  return {
    ...actual,
    processClinicScopedBody: (...args: unknown[]) =>
      mockProcessClinicScopedBody(...args),
  };
});

jest.mock('@/lib/crm-line/db', () => ({
  createCrmAdminClient: jest.fn(() => ({ source: 'crm-test-client' })),
}));

jest.mock('@/lib/services/staff-availability-service', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/services/staff-availability-service')
  >('@/lib/services/staff-availability-service');
  return {
    ...actual,
    createAndNotifyStaffAvailabilityEvent: (...args: unknown[]) =>
      mockCreateEvent(...args),
  };
});

const CLINIC_ID = '00000000-0000-4000-8000-000000000101';
const STAFF_ID = '00000000-0000-4000-8000-000000000201';
const EVENT_ID = '00000000-0000-4000-8000-000000000301';
const USER_ID = '00000000-0000-4000-8000-000000000401';
const AVAILABLE_DATETIME = '2026-08-13T01:00:00.000Z';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/staff/availability-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

describe('POST /api/staff/availability-events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessClinicScopedBody.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: CLINIC_ID,
        staff_id: STAFF_ID,
        available_datetime: AVAILABLE_DATETIME,
        reward_type: 'priority_booking',
      },
      auth: { id: USER_ID },
    });
    mockCreateEvent.mockResolvedValue({
      event: {
        id: EVENT_ID,
        clinic_id: CLINIC_ID,
        staff_id: STAFF_ID,
        available_datetime: AVAILABLE_DATETIME,
        reward_type: 'priority_booking',
        status: 'notified',
        created_by: USER_ID,
        created_at: '2026-08-12T00:00:00.000Z',
        updated_at: '2026-08-12T00:00:00.000Z',
      },
      recipientCount: 1,
    });
  });

  it('clinic scope・role拒否ではservice-role書き込みを呼ばない', async () => {
    mockProcessClinicScopedBody.mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { success: false, error: 'Clinic access denied' },
        { status: 403 }
      ),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('許可roleだけがclinic-scoped event作成へ進む', async () => {
    const routeRequest = request();
    const response = await POST(routeRequest);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockProcessClinicScopedBody).toHaveBeenCalledWith(
      routeRequest,
      expect.anything(),
      {
        path: '/api/staff/availability-events',
        allowedRoles: ['admin', 'clinic_admin', 'manager'],
      }
    );
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clinicId: CLINIC_ID,
        staffId: STAFF_ID,
        createdBy: USER_ID,
      })
    );
    expect(body).toEqual(expect.objectContaining({ success: true }));
  });

  it('非スタッフ・無効スタッフは404を返す', async () => {
    mockCreateEvent.mockRejectedValue(
      new StaffAvailabilityStaffNotFoundError()
    );

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it('過去日時・14日範囲外は400を返す', async () => {
    mockCreateEvent.mockRejectedValue(new StaffAvailabilityTimeRangeError());

    const response = await POST(request());

    expect(response.status).toBe(400);
  });
});
