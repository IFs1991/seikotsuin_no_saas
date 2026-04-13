import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { enqueueReservationChange } from '@/lib/notifications/email/reservation-enqueue';
import { STAFF_ROLES } from '@/lib/constants/roles';

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

jest.mock('@/lib/notifications/email/reservation-enqueue', () => ({
  enqueueReservationCreated: jest.fn(),
  enqueueReservationChange: jest.fn(),
}));

const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const enqueueReservationChangeMock = enqueueReservationChange as jest.Mock;

const validClinicId = '123e4567-e89b-12d3-a456-426614174000';
const validId = '123e4567-e89b-12d3-a456-426614174001';

describe('PATCH /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes allowedRoles to processClinicScopedBody for role guard', async () => {
    const notificationClient = { from: jest.fn() };
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope: jest.fn(),
    });

    const existingRow = {
      id: validId,
      clinic_id: validClinicId,
      customer_id: 'cust-001',
      menu_id: 'menu-001',
      status: 'confirmed',
      staff_id: 'staff-001',
      start_time: '2026-04-15T10:00:00Z',
      end_time: '2026-04-15T11:00:00Z',
      notes: null,
    };
    const updatedRow = {
      ...existingRow,
      status: 'cancelled',
      updated_at: '2026-04-14T09:00:00.000Z',
    };

    const existingSelect = {
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: existingRow, error: null }),
    };
    const updateSelect = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(existingSelect),
      update: jest.fn().mockReturnValue(updateSelect),
    };
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    } as any;

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: validClinicId,
        id: validId,
        status: 'cancelled',
      },
      auth: { id: 'user-1', email: 'test@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: validClinicId,
        clinic_scope_ids: [validClinicId],
      },
      supabase,
    });
    enqueueReservationChangeMock.mockResolvedValueOnce({ id: 'outbox-1' });

    const { PATCH } = await import('@/app/api/reservations/route');

    const response = await PATCH({} as any);

    expect(response.status).toBe(200);
    expect(processClinicScopedBodyMock).toHaveBeenCalledTimes(1);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
  });
});
