import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import {
  enqueueReservationChange,
  enqueueReservationCreated,
} from '@/lib/notifications/email/reservation-enqueue';
import { NextRequest } from 'next/server';

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
const enqueueReservationCreatedMock = enqueueReservationCreated as jest.Mock;
const enqueueReservationChangeMock = enqueueReservationChange as jest.Mock;

type QueryResult<T> = { data: T; error: null };
type CountResult = { count: number; error: null };

type PendingCountQuery = {
  eq: jest.MockedFunction<(field: string, value: unknown) => PendingCountQuery>;
  lt: jest.MockedFunction<(field: string, value: unknown) => PendingCountQuery>;
  gt: jest.MockedFunction<(field: string, value: unknown) => PendingCountQuery>;
  not: jest.MockedFunction<
    (field: string, operator: string, value: unknown) => PendingCountQuery
  >;
  neq: jest.MockedFunction<(field: string, value: unknown) => PendingCountQuery>;
  then: Promise<CountResult>['then'];
};

type SingleSelectBuilder<T> = {
  eq: jest.MockedFunction<(field: string, value: unknown) => SingleSelectBuilder<T>>;
  single: jest.MockedFunction<() => Promise<QueryResult<T>>>;
};

type MaybeSingleSelectBuilder<T> = {
  eq: jest.MockedFunction<
    (field: string, value: unknown) => MaybeSingleSelectBuilder<T>
  >;
  maybeSingle: jest.MockedFunction<() => Promise<QueryResult<T>>>;
};

type InsertBuilder<T> = {
  select: jest.MockedFunction<() => InsertBuilder<T>>;
  single: jest.MockedFunction<() => Promise<QueryResult<T>>>;
};

type UpdateBuilder<T> = {
  eq: jest.MockedFunction<(field: string, value: unknown) => UpdateBuilder<T>>;
  select: jest.MockedFunction<() => UpdateBuilder<T>>;
  single: jest.MockedFunction<() => Promise<QueryResult<T>>>;
};

const buildRequest = () =>
  new NextRequest('http://localhost/api/reservations', {
    method: 'POST',
  });

function createPendingCountQuery(count: number) {
  const query = {} as PendingCountQuery;
  query.eq = jest.fn().mockReturnValue(query);
  query.lt = jest.fn().mockReturnValue(query);
  query.gt = jest.fn().mockReturnValue(query);
  query.not = jest.fn().mockReturnValue(query);
  query.neq = jest.fn().mockReturnValue(query);
  query.then = (
    resolve: (value: { count: number; error: null }) => unknown,
    reject: (reason?: unknown) => unknown
  ) =>
    Promise.resolve({
      count,
      error: null,
    }).then(resolve, reject);
  return query;
}

function createSingleSelectBuilder<T>(data: T) {
  const builder = {} as SingleSelectBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function createMaybeSingleSelectBuilder<T>(data: T) {
  const builder = {} as MaybeSingleSelectBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function createInsertBuilder<T>(data: T) {
  const builder = {} as InsertBuilder<T>;
  builder.select = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function createUpdateBuilder<T>(data: T) {
  const builder = {} as UpdateBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.select = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

describe('POST/PATCH /api/reservations email enqueue route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes menu_id and the scoped admin client into reservation_created enqueue', async () => {
    const notificationClient = { from: jest.fn() };
    const assertClinicInScope = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope,
    });

    const conflictQuery = createPendingCountQuery(0);
    const insertedRow = {
      id: 'res-001',
      clinic_id: 'clinic-001',
      customer_id: 'customer-001',
      menu_id: 'menu-001',
      status: 'unconfirmed',
      start_time: '2026-04-15T10:00:00.000Z',
      end_time: '2026-04-15T11:00:00.000Z',
      staff_id: 'staff-001',
      updated_at: '2026-04-14T09:00:00.000Z',
    };

    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn().mockReturnValue(createInsertBuilder(insertedRow)),
    };
    const resourcesTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'staff-001' })),
    };
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        if (table === 'resources') return resourcesTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: 'clinic-001',
        customerId: 'customer-001',
        menuId: 'menu-001',
        staffId: 'staff-001',
        startTime: '2026-04-15T10:00:00.000Z',
        endTime: '2026-04-15T11:00:00.000Z',
        channel: 'web',
        notes: 'initial booking',
      },
      auth: { id: 'user-001', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-001',
        clinic_scope_ids: ['clinic-001'],
      },
      supabase,
    });
    enqueueReservationCreatedMock.mockResolvedValueOnce({ id: 'outbox-001' });

    const { POST } = await import('@/app/api/reservations/route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(201);
    expect(createScopedAdminContextMock).toHaveBeenCalledWith({
      role: 'staff',
      clinic_id: 'clinic-001',
      clinic_scope_ids: ['clinic-001'],
    });
    expect(assertClinicInScope).toHaveBeenCalledWith('clinic-001');
    expect(enqueueReservationCreatedMock).toHaveBeenCalledWith(
      notificationClient,
      expect.objectContaining({
        clinic_id: 'clinic-001',
        customer_id: 'customer-001',
        menu_id: 'menu-001',
        staff_id: 'staff-001',
      })
    );
  });

  it('keeps POST successful even when reservation_created enqueue fails', async () => {
    const notificationClient = { from: jest.fn() };
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope: jest.fn(),
    });

    const conflictQuery = createPendingCountQuery(0);
    const insertedRow = {
      id: 'res-002',
      clinic_id: 'clinic-001',
      customer_id: 'customer-002',
      menu_id: 'menu-002',
      status: 'unconfirmed',
      start_time: '2026-04-16T10:00:00.000Z',
      end_time: '2026-04-16T11:00:00.000Z',
      staff_id: 'staff-001',
      updated_at: '2026-04-14T10:00:00.000Z',
    };

    const reservationsTable = {
      select: jest.fn().mockReturnValue(conflictQuery),
      insert: jest.fn().mockReturnValue(createInsertBuilder(insertedRow)),
    };
    const resourcesTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'staff-001' })),
    };
    const supabase = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        if (table === 'resources') return resourcesTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: 'clinic-001',
        customerId: 'customer-002',
        menuId: 'menu-002',
        staffId: 'staff-001',
        startTime: '2026-04-16T10:00:00.000Z',
        endTime: '2026-04-16T11:00:00.000Z',
        channel: 'web',
      },
      auth: { id: 'user-002', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-001',
        clinic_scope_ids: ['clinic-001'],
      },
      supabase,
    });
    enqueueReservationCreatedMock.mockRejectedValueOnce(
      new Error('RLS: permission denied for table email_outbox')
    );

    const { POST } = await import('@/app/api/reservations/route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(201);
    expect(enqueueReservationCreatedMock).toHaveBeenCalledTimes(1);
  });

  it('keeps PATCH successful even when reservation_change enqueue fails', async () => {
    const notificationClient = { from: jest.fn() };
    const assertClinicInScope = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope,
    });

    const existingRow = {
      id: 'res-003',
      clinic_id: 'clinic-001',
      customer_id: 'customer-003',
      menu_id: 'menu-003',
      status: 'confirmed',
      start_time: '2026-04-17T10:00:00.000Z',
      end_time: '2026-04-17T11:00:00.000Z',
      staff_id: 'staff-001',
      notes: 'before update',
    };
    const updatedRow = {
      ...existingRow,
      status: 'cancelled',
      notes: 'after update',
      updated_at: '2026-04-14T11:00:00.000Z',
    };

    const reservationsTable = {
      select: jest.fn().mockReturnValue(createSingleSelectBuilder(existingRow)),
      update: jest.fn().mockReturnValue(createUpdateBuilder(updatedRow)),
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
        clinic_id: 'clinic-001',
        id: 'res-003',
        status: 'cancelled',
        notes: 'after update',
      },
      auth: { id: 'user-003', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-001',
        clinic_scope_ids: ['clinic-001'],
      },
      supabase,
    });
    enqueueReservationChangeMock.mockRejectedValueOnce(
      new Error('RLS: permission denied for table email_outbox')
    );

    const { PATCH } = await import('@/app/api/reservations/route');
    const response = await PATCH(buildRequest());

    expect(response.status).toBe(200);
    expect(createScopedAdminContextMock).toHaveBeenCalledWith({
      role: 'staff',
      clinic_id: 'clinic-001',
      clinic_scope_ids: ['clinic-001'],
    });
    expect(assertClinicInScope).toHaveBeenCalledWith('clinic-001');
    expect(enqueueReservationChangeMock).toHaveBeenCalledWith(
      notificationClient,
      expect.objectContaining({
        menu_id: 'menu-003',
        status: 'confirmed',
      }),
      expect.objectContaining({
        menu_id: 'menu-003',
        status: 'cancelled',
      }),
      '2026-04-14T11:00:00.000Z'
    );
  });
});
