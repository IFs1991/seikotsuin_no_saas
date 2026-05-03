import type { NextRequest } from 'next/server';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import {
  enqueueReservationCreated,
  enqueueReservationChange,
} from '@/lib/notifications/email/reservation-enqueue';
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
const enqueueReservationCreatedMock = enqueueReservationCreated as jest.Mock;
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
    const userScopedSupabase = {
      from: jest.fn(),
    };
    const permissions = {
      role: 'clinic_admin',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };
    const assertClinicInScope = jest.fn();

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: supabase,
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/reservations/route');
    const request = {
      nextUrl: new URL(
        `http://localhost/api/reservations?clinic_id=${validClinicId}&customer_id=${validCustomerId}`
      ),
    } as unknown as NextRequest;

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(supabase.from).toHaveBeenCalledWith('reservation_list_view');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('clinic_id', validClinicId);
    expect(query.eq).toHaveBeenCalledWith('customer_id', validCustomerId);
    expect(query.order).toHaveBeenCalledWith('start_time', {
      ascending: false,
    });
  });
});

describe('POST /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses scoped admin only for staff resource synchronization', async () => {
    const selectedStaffId = '123e4567-e89b-12d3-a456-426614174004';
    const adminResourceSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: { id: selectedStaffId },
          error: null,
        }),
    };
    const adminStaffSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const adminPermissionSelect = {
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          staff_id: selectedStaffId,
          clinic_id: validClinicId,
          role: 'therapist',
          username: 'therapist@example.com',
        },
        error: null,
      }),
    };
    const adminProfileSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          user_id: selectedStaffId,
          email: 'therapist@example.com',
          full_name: '田中先生',
        },
        error: null,
      }),
    };
    const adminResourcesTable = {
      select: jest.fn().mockReturnValue(adminResourceSelect),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const adminCustomerSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: validCustomerId },
        error: null,
      }),
    };
    const adminMenuSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: '123e4567-e89b-12d3-a456-426614174003' },
        error: null,
      }),
    };
    const adminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'resources') return adminResourcesTable;
        if (table === 'staff') {
          return { select: jest.fn().mockReturnValue(adminStaffSelect) };
        }
        if (table === 'user_permissions') {
          return { select: jest.fn().mockReturnValue(adminPermissionSelect) };
        }
        if (table === 'profiles') {
          return { select: jest.fn().mockReturnValue(adminProfileSelect) };
        }
        if (table === 'customers') {
          return { select: jest.fn().mockReturnValue(adminCustomerSelect) };
        }
        if (table === 'menus') {
          return { select: jest.fn().mockReturnValue(adminMenuSelect) };
        }
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };
    const assertClinicInScope = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      assertClinicInScope,
    });

    const conflictQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const insertSelect = {
      single: jest.fn().mockResolvedValue({
        data: {
          id: validId,
          clinic_id: validClinicId,
          customer_id: validCustomerId,
          menu_id: '123e4567-e89b-12d3-a456-426614174003',
          status: 'confirmed',
          start_time: '2026-04-15T10:00:00.000Z',
          end_time: '2026-04-15T10:30:00.000Z',
          staff_id: selectedStaffId,
          updated_at: '2026-04-14T09:00:00.000Z',
        },
        error: null,
      }),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(insertSelect),
      }),
    };
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: validClinicId,
        customerId: validCustomerId,
        menuId: '123e4567-e89b-12d3-a456-426614174003',
        staffId: selectedStaffId,
        startTime: '2026-04-15T10:00:00.000Z',
        endTime: '2026-04-15T10:30:00.000Z',
        status: 'confirmed',
        channel: 'phone',
      },
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: validClinicId,
        clinic_scope_ids: [validClinicId],
      },
      supabase,
    });
    enqueueReservationCreatedMock.mockResolvedValueOnce({ id: 'outbox-1' });

    const { POST } = await import('@/app/api/reservations/route');

    const response = await POST({} as unknown as NextRequest);

    expect(response.status).toBe(201);
    expect(assertClinicInScope).toHaveBeenCalledWith(validClinicId);
    expect(adminClient.from).toHaveBeenCalledWith('resources');
    expect(adminResourcesTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: selectedStaffId,
        clinic_id: validClinicId,
        type: 'staff',
        is_bookable: true,
      }),
      { onConflict: 'id' }
    );
    expect(adminClient.from).toHaveBeenCalledWith('reservations');
    expect(supabase.from).not.toHaveBeenCalledWith('reservations');
    expect(supabase.from).not.toHaveBeenCalledWith('resources');
  });

  it('returns a specific message when reservation insert trigger reports missing customer', async () => {
    const selectedStaffId = '123e4567-e89b-12d3-a456-426614174004';
    const menuId = '123e4567-e89b-12d3-a456-426614174003';
    const adminResourceSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValueOnce({ data: { id: selectedStaffId }, error: null })
        .mockResolvedValueOnce({ data: { id: selectedStaffId }, error: null }),
    };
    const adminCustomerSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: validCustomerId },
        error: null,
      }),
    };
    const adminMenuSelect = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: menuId },
        error: null,
      }),
    };
    const adminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'resources') {
          return {
            select: jest.fn().mockReturnValue(adminResourceSelect),
          };
        }
        if (table === 'customers') {
          return { select: jest.fn().mockReturnValue(adminCustomerSelect) };
        }
        if (table === 'menus') {
          return { select: jest.fn().mockReturnValue(adminMenuSelect) };
        }
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      assertClinicInScope: jest.fn(),
    });

    const conflictQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const insertSelect = {
      single: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'customers.id not found',
        },
      }),
    };
    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(insertSelect),
      }),
    };
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: validClinicId,
        customerId: validCustomerId,
        menuId,
        staffId: selectedStaffId,
        startTime: '2026-04-15T10:00:00.000Z',
        endTime: '2026-04-15T10:30:00.000Z',
        channel: 'phone',
      },
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: validClinicId,
        clinic_scope_ids: [validClinicId],
      },
      supabase,
    });

    const { POST } = await import('@/app/api/reservations/route');

    const response = await POST({} as unknown as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('予約に紐づく患者データが見つかりません');
  });
});

describe('PATCH /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes allowedRoles to processClinicScopedBody for role guard', async () => {
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
    const scopedClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };
    createScopedAdminContextMock.mockReturnValue({
      client: scopedClient,
      assertClinicInScope: jest.fn(),
    });
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };

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

    const response = await PATCH({} as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(processClinicScopedBodyMock).toHaveBeenCalledTimes(1);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
  });
});
