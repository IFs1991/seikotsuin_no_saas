import { processClinicScopedBody } from '@/lib/route-helpers';
import { processApiRequest } from '@/lib/api-helpers';
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

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
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
const processApiRequestMock = processApiRequest as jest.Mock;
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

const buildUsableResourceRow = (id: string) => ({
  id,
  type: 'staff',
  is_deleted: false,
  is_active: true,
  is_bookable: true,
  nomination_fee: 0,
});

const buildReservationListViewRow = (row: {
  id: string;
  clinic_id: string;
  customer_id: string;
  menu_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string | null;
}) => ({
  id: row.id,
  clinic_id: row.clinic_id,
  customer_id: row.customer_id,
  customer_name: 'テスト患者',
  menu_id: row.menu_id,
  menu_name: '整体',
  staff_id: row.staff_id,
  staff_name: '田中先生',
  start_time: row.start_time,
  end_time: row.end_time,
  status: row.status,
  channel: 'web',
  notes: row.notes ?? null,
  selected_options: [],
  is_staff_requested: false,
  staff_nomination_fee: 0,
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
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-001', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-001',
        clinic_scope_ids: ['clinic-001'],
      },
      supabase: { from: jest.fn() },
    });
  });

  it('passes menu_id and the scoped admin client into reservation_created enqueue', async () => {
    const assertClinicInScope = jest.fn();

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
        .mockReturnValue(
          createMaybeSingleSelectBuilder(buildUsableResourceRow('staff-001'))
        ),
    };
    const customersTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'customer-001' })),
    };
    const menusTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'menu-001', price: 0 })),
    };
    const reservationListViewTable = {
      select: jest
        .fn()
        .mockReturnValue(
          createMaybeSingleSelectBuilder(buildReservationListViewRow(insertedRow))
        ),
    };
    const notificationClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        if (table === 'resources') return resourcesTable;
        if (table === 'customers') return customersTable;
        if (table === 'menus') return menusTable;
        if (table === 'reservation_list_view') return reservationListViewTable;
        return {};
      }),
    };
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope,
    });

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
      supabase: notificationClient,
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
        .mockReturnValue(
          createMaybeSingleSelectBuilder(buildUsableResourceRow('staff-001'))
        ),
    };
    const customersTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'customer-002' })),
    };
    const menusTable = {
      select: jest
        .fn()
        .mockReturnValue(createMaybeSingleSelectBuilder({ id: 'menu-002', price: 0 })),
    };
    const reservationListViewTable = {
      select: jest
        .fn()
        .mockReturnValue(
          createMaybeSingleSelectBuilder(buildReservationListViewRow(insertedRow))
        ),
    };
    const notificationClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        if (table === 'resources') return resourcesTable;
        if (table === 'customers') return customersTable;
        if (table === 'menus') return menusTable;
        if (table === 'reservation_list_view') return reservationListViewTable;
        return {};
      }),
    };
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope: jest.fn(),
    });

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
      supabase: notificationClient,
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
    const assertClinicInScope = jest.fn();
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
    const notificationClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'reservations') return reservationsTable;
        return {};
      }),
    };
    createScopedAdminContextMock.mockReturnValue({
      client: notificationClient,
      assertClinicInScope,
    });

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
      supabase: notificationClient,
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
