import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createAdminClient, createScopedAdminContext } from '@/lib/supabase';
import { enqueueReservationCreated } from '@/lib/notifications/email/reservation-enqueue';

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
    createAdminClient: jest.fn(),
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/notifications/email/reservation-enqueue', () => ({
  enqueueReservationCreated: jest.fn(),
  enqueueReservationChange: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const processClinicScopedBodyMock = jest.mocked(processClinicScopedBody);
const createAdminClientMock = jest.mocked(createAdminClient);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);
const enqueueReservationCreatedMock = jest.mocked(enqueueReservationCreated);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reservationId = '123e4567-e89b-12d3-a456-426614174001';
const customerId = '123e4567-e89b-12d3-a456-426614174002';
const menuId = '123e4567-e89b-12d3-a456-426614174003';
const staffId = '123e4567-e89b-12d3-a456-426614174004';

function buildRequest(search = '') {
  return new NextRequest(
    `http://localhost/api/mobile-uiux/reservations${search}`
  );
}

function buildMutationRequest(method: 'POST' | 'PATCH') {
  return new NextRequest('http://localhost/api/mobile-uiux/reservations', {
    method,
  });
}

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

type MaybeSingleBuilder<T> = {
  eq: jest.MockedFunction<(field: string, value: unknown) => MaybeSingleBuilder<T>>;
  maybeSingle: jest.MockedFunction<() => Promise<{ data: T; error: null }>>;
};

type SingleBuilder<T> = {
  eq: jest.MockedFunction<(field: string, value: unknown) => SingleBuilder<T>>;
  single: jest.MockedFunction<() => Promise<{ data: T; error: null }>>;
};

function createPendingCountQuery(count: number): PendingCountQuery {
  const query = {} as PendingCountQuery;
  query.eq = jest.fn().mockReturnValue(query);
  query.lt = jest.fn().mockReturnValue(query);
  query.gt = jest.fn().mockReturnValue(query);
  query.not = jest.fn().mockReturnValue(query);
  query.neq = jest.fn().mockReturnValue(query);
  query.then = (resolve, reject) =>
    Promise.resolve({ count, error: null }).then(resolve, reject);
  return query;
}

function createMaybeSingleBuilder<T>(data: T): MaybeSingleBuilder<T> {
  const builder = {} as MaybeSingleBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function createSingleBuilder<T>(data: T): SingleBuilder<T> {
  const builder = {} as SingleBuilder<T>;
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue({ data, error: null });
  return builder;
}

const mutationDto = {
  clinic_id: clinicId,
  customerId,
  menuId,
  staffId,
  startTime: '2026-04-15T10:00:00.000Z',
  endTime: '2026-04-15T10:30:00.000Z',
  channel: 'phone',
  isStaffRequested: true,
  selectedOptions: [
    {
      optionId: 'option-1',
      name: 'テーピング',
      priceDelta: 800,
      durationDeltaMinutes: 10,
    },
  ],
};

const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

const auth = { id: 'user-1', email: 'staff@example.com', role: 'staff' };

function buildMutationClient(params?: {
  conflictCount?: number;
  customerFound?: boolean;
  menuFound?: boolean;
  staffFound?: boolean;
}) {
  const conflictQuery = createPendingCountQuery(params?.conflictCount ?? 0);
  const customerQuery = createMaybeSingleBuilder(
    params?.customerFound === false ? null : { id: customerId }
  );
  const menuQuery = createMaybeSingleBuilder(
    params?.menuFound === false ? null : { id: menuId, price: 5000 }
  );
  const staffQuery = createMaybeSingleBuilder(
    params?.staffFound === false
      ? null
      : {
          id: staffId,
          type: 'staff',
          is_deleted: false,
          is_active: true,
          is_bookable: true,
          nomination_fee: 1500,
        }
  );
  const insertRow = {
    id: reservationId,
    clinic_id: clinicId,
    customer_id: customerId,
    menu_id: menuId,
    status: 'unconfirmed',
    start_time: mutationDto.startTime,
    end_time: mutationDto.endTime,
    staff_id: staffId,
    updated_at: '2026-04-14T09:00:00.000Z',
  };
  const reservationViewRow = {
    id: reservationId,
    customer_id: customerId,
    customer_name: '山田 太郎',
    menu_id: menuId,
    menu_name: '整体',
    staff_id: staffId,
    staff_name: '田中先生',
    start_time: mutationDto.startTime,
    end_time: mutationDto.endTime,
    status: 'unconfirmed',
    channel: 'phone',
    notes: null,
    selected_options: mutationDto.selectedOptions,
    is_staff_requested: true,
    staff_nomination_fee: 1500,
  };
  const insertBuilder = {
    select: jest.fn().mockReturnValue(createSingleBuilder(insertRow)),
  };
  const reservationsTable = {
    select: jest.fn().mockReturnValue(conflictQuery),
    insert: jest.fn().mockReturnValue(insertBuilder),
  };
  const reservationListViewTable = {
    select: jest
      .fn()
      .mockReturnValue(createMaybeSingleBuilder(reservationViewRow)),
  };
  const client = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'customers') {
        return { select: jest.fn().mockReturnValue(customerQuery) };
      }
      if (table === 'menus') {
        return { select: jest.fn().mockReturnValue(menuQuery) };
      }
      if (table === 'resources') {
        return { select: jest.fn().mockReturnValue(staffQuery) };
      }
      if (table === 'reservations') return reservationsTable;
      if (table === 'reservation_list_view') return reservationListViewTable;
      return {};
    }),
  };

  return {
    client,
    conflictQuery,
    reservationsTable,
    reservationListViewTable,
  };
}

describe('GET /api/mobile-uiux/reservations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_WRITE_ENABLED: 'false',
      MOBILE_UIUX_RESERVATION_WRITE_ENABLED: 'false',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: { from: jest.fn() },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('queries reservation_list_view with clinic scope and a JST day range', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: reservationId,
            customer_id: customerId,
            customer_name: '山田 太郎',
            menu_id: menuId,
            menu_name: '整体',
            staff_id: staffId,
            staff_name: '田中先生',
            start_time: '2026-04-26T15:30:00.000Z',
            end_time: '2026-04-26T16:00:00.000Z',
            status: 'confirmed',
            channel: 'phone',
            notes: null,
            selected_options: [],
            is_staff_requested: true,
            staff_nomination_fee: 1500,
          },
        ],
        error: null,
      }),
    };
    const scopedClient = {
      from: jest.fn().mockReturnValue(query),
    };
    const assertClinicInScope = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: scopedClient,
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildRequest(
      `?clinic_id=${clinicId}&date=2026-04-27&staff_id=${staffId}`
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'staff',
        clinic_id: clinicId,
      })
    );
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(scopedClient.from).toHaveBeenCalledWith('reservation_list_view');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(query.eq).toHaveBeenCalledWith('staff_id', staffId);
    expect(query.gte).toHaveBeenCalledWith(
      'start_time',
      '2026-04-26T15:00:00.000Z'
    );
    expect(query.lt).toHaveBeenCalledWith(
      'start_time',
      '2026-04-27T15:00:00.000Z'
    );
    expect(payload.data).toMatchObject({
      clinicId,
      date: '2026-04-27',
      timezone: 'Asia/Tokyo',
      reservations: [
        {
          id: reservationId,
          customerId,
          customerName: '山田 太郎',
          menuId,
          menuName: '整体',
          staffId,
          staffName: '田中先生',
          startTime: '2026-04-26T15:30:00.000Z',
          endTime: '2026-04-26T16:00:00.000Z',
          status: 'confirmed',
          channel: 'phone',
          selectedOptions: [],
          isStaffRequested: true,
          staffNominationFee: 1500,
        },
      ],
    });
  });

  it('uses the PC manager assignment-aware guard and stops on assigned clinic violation', async () => {
    const guardResponse = Response.json(
      { success: false, error: '対象クリニックへのアクセス権がありません' },
      { status: 403 }
    );
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: guardResponse,
    });

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildRequest(`?clinic_id=${clinicId}`);
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('uses the admin read client for manager after assignment-aware access passes', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const adminClient = {
      from: jest.fn().mockReturnValue(query),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: 'fallback-clinic',
        clinic_scope_ids: ['jwt-clinic'],
      },
      supabase: { from: jest.fn() },
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));

    expect(response.status).toBe(200);
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
  });

  it('returns 403 for mobile reservation writes while write flags are off', async () => {
    const { POST, PATCH } = await import(
      '@/app/api/mobile-uiux/reservations/route'
    );

    const postResponse = await POST(
      new NextRequest('http://localhost/api/mobile-uiux/reservations', {
        method: 'POST',
      })
    );
    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/mobile-uiux/reservations', {
        method: 'PATCH',
      })
    );

    expect(postResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
  });
});

describe('POST/PATCH /api/mobile-uiux/reservations write pilot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_WRITE_ENABLED: 'true',
      MOBILE_UIUX_RESERVATION_WRITE_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 403 when the global write flag is off', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'false';
    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');

    const response = await POST(buildMutationRequest('POST'));

    expect(response.status).toBe(403);
    expect(processClinicScopedBodyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the reservation write flag is off', async () => {
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'false';
    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');

    const response = await POST(buildMutationRequest('POST'));

    expect(response.status).toBe(403);
    expect(processClinicScopedBodyMock).not.toHaveBeenCalled();
  });

  it('denies manager writes before DB access', async () => {
    const managerDeniedResponse = Response.json(
      { success: false, error: 'マネージャーは予約の作成はできません。' },
      { status: 403 }
    );
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: false,
      error: managerDeniedResponse,
    });

    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildMutationRequest('POST');
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      request,
      expect.anything(),
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: 'マネージャーは予約の作成はできません。',
      }
    );
  });

  it('returns 409 when the requested reservation slot conflicts', async () => {
    const { client, reservationsTable } = buildMutationClient({
      conflictCount: 1,
    });
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: mutationDto,
      auth,
      permissions,
      supabase: client,
    });

    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');
    const response = await POST(buildMutationRequest('POST'));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.success).toBe(false);
    expect(reservationsTable.insert).not.toHaveBeenCalled();
  });

  it('returns 403 without inserting when references are outside the clinic scope', async () => {
    const { client, reservationsTable } = buildMutationClient({
      customerFound: false,
    });
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: mutationDto,
      auth,
      permissions,
      supabase: client,
    });

    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');
    const response = await POST(buildMutationRequest('POST'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(customerId);
    expect(reservationsTable.insert).not.toHaveBeenCalled();
  });

  it('creates a reservation through the mobile BFF using PC schema and read serializer', async () => {
    const { client, reservationsTable, reservationListViewTable } =
      buildMutationClient();
    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: mutationDto,
      auth,
      permissions,
      supabase: client,
    });
    enqueueReservationCreatedMock.mockResolvedValueOnce({ id: 'outbox-1' });

    const { POST } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildMutationRequest('POST');
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      request,
      expect.anything(),
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: 'マネージャーは予約の作成はできません。',
      }
    );
    expect(reservationsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        customer_id: customerId,
        menu_id: menuId,
        staff_id: staffId,
        status: 'unconfirmed',
        is_staff_requested: true,
        staff_nomination_fee: 1500,
        price: 7300,
      })
    );
    expect(reservationListViewTable.select).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        reservation: {
          id: reservationId,
          customerId,
          customerName: '山田 太郎',
          menuId,
          staffId,
          status: 'unconfirmed',
          isStaffRequested: true,
          staffNominationFee: 1500,
        },
      },
    });
    expect(enqueueReservationCreatedMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        id: reservationId,
        clinic_id: clinicId,
        customer_id: customerId,
        menu_id: menuId,
        staff_id: staffId,
      })
    );
  });
});
