import { processClinicScopedBody } from '@/lib/route-helpers';
import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { enqueueReservationChange } from '@/lib/notifications/email/reservation-enqueue';
import { STAFF_ROLES } from '@/lib/constants/roles';

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

jest.mock('@/lib/notifications/email/reservation-enqueue', () => ({
  enqueueReservationCreated: jest.fn(),
  enqueueReservationChange: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const enqueueReservationChangeMock = enqueueReservationChange as jest.Mock;

const validClinicId = '123e4567-e89b-12d3-a456-426614174000';
const validId = '123e4567-e89b-12d3-a456-426614174001';
const validCustomerId = '123e4567-e89b-12d3-a456-426614174002';

describe('GET /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters by customer_id for patient reservation history', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: validId,
            customer_id: validCustomerId,
            customer_name: '山田 太郎',
            menu_id: '123e4567-e89b-12d3-a456-426614174003',
            menu_name: '整体',
            staff_id: '123e4567-e89b-12d3-a456-426614174004',
            staff_name: '田中先生',
            start_time: '2026-04-27T10:00:00.000Z',
            end_time: '2026-04-27T10:30:00.000Z',
            status: 'arrived',
            channel: 'phone',
            notes: null,
            selected_options: [],
          },
        ],
        error: null,
      }),
    };
    const supabase = {
      from: jest.fn().mockReturnValue(query),
    };

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/reservations/route');
    const request = {
      nextUrl: new URL(
        `http://localhost/api/reservations?clinic_id=${validClinicId}&customer_id=${validCustomerId}`
      ),
    } as any;

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('reservation_list_view');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', validClinicId);
    expect(query.eq).toHaveBeenCalledWith('customer_id', validCustomerId);
    expect(query.order).toHaveBeenCalledWith('start_time', {
      ascending: false,
    });
  });
});

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
