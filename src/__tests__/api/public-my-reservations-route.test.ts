const mockCreatePublicClinicContext = jest.fn();
const mockVerifyLineIdTokenForClinic = jest.fn();

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createPublicClinicContext: (...args: unknown[]) =>
    mockCreatePublicClinicContext(...args),
  ClinicNotFoundError: class ClinicNotFoundError extends Error {},
  ClinicInactiveError: class ClinicInactiveError extends Error {},
}));

jest.mock('@/lib/line/id-token', () => ({
  verifyLineIdTokenForClinic: (...args: unknown[]) =>
    mockVerifyLineIdTokenForClinic(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => data,
    }),
  },
}));

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000201';
const RESERVATION_ID = '00000000-0000-0000-0000-000000000301';
const MENU_ID = '00000000-0000-0000-0000-000000000401';
const STAFF_ID = '00000000-0000-0000-0000-000000000501';
const LINE_USER_ID = 'U1234567890abcdef';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

type QueryChain = {
  eq: jest.Mock<QueryChain, [string, unknown]>;
  gte: jest.Mock<QueryChain, [string, unknown]>;
  not: jest.Mock<QueryChain, [string, string, string]>;
  limit: jest.Mock<QueryChain, [number]>;
  in: jest.Mock<Promise<QueryResult>, [string, readonly unknown[]]>;
  order: jest.Mock<Promise<QueryResult>, [string, { ascending?: boolean }]>;
  maybeSingle: jest.Mock<Promise<QueryResult>, []>;
  select: jest.Mock<QueryChain, [string]>;
};

type MockClientOptions = {
  customerSelectResults?: QueryResult[];
  reservationSelectResults?: QueryResult[];
  bookingCalendarSettings?: Record<string, unknown>;
  clinicBasicSettings?: Record<string, unknown>;
  reservationUpdateResult?: QueryResult;
  customerUpdateResult?: QueryResult;
};

type MockClient = {
  from: jest.Mock;
  reservationUpdate: jest.Mock;
  customerUpdate: jest.Mock;
  emailInsert: jest.Mock;
  customerSelectChains: QueryChain[];
  reservationSelectChains: QueryChain[];
};

type RouteGetRequest = {
  nextUrl: URL;
  headers: Headers;
};

type RouteJsonRequest = {
  headers: Headers;
  json: () => Promise<unknown>;
};

type RouteResponse = {
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

function createQuery(result: () => QueryResult | Promise<QueryResult>) {
  const query = {
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    not: jest.fn(() => query),
    limit: jest.fn(() => query),
    in: jest.fn(async () => result()),
    order: jest.fn(async () => result()),
    maybeSingle: jest.fn(async () => result()),
    select: jest.fn(() => query),
  } satisfies QueryChain;

  return query;
}

function nextResult(queue: QueryResult[], fallback: QueryResult): QueryResult {
  return queue.length > 0 ? queue.shift() ?? fallback : fallback;
}

function buildMockClient(options: MockClientOptions = {}): MockClient {
  const customerSelectQueue = [...(options.customerSelectResults ?? [])];
  const reservationSelectQueue = [...(options.reservationSelectResults ?? [])];
  const customerSelectChains: QueryChain[] = [];
  const reservationSelectChains: QueryChain[] = [];
  const reservationUpdate = jest.fn();
  const customerUpdate = jest.fn();
  const emailInsert = jest.fn();

  const clinicSettingsSelect = jest.fn(() => {
    let category: string | null = null;
    const query = createQuery(() => {
      if (category === 'clinic_basic') {
        return {
          data: { settings: options.clinicBasicSettings ?? { email: null } },
          error: null,
        };
      }
      return {
        data: {
          settings: options.bookingCalendarSettings ?? {
            allowCancellation: true,
            cancellationDeadlineHours: 24,
          },
        },
        error: null,
      };
    });
    query.eq.mockImplementation((column, value) => {
      if (column === 'category' && typeof value === 'string') {
        category = value;
      }
      return query;
    });
    return query;
  });

  const nameSelect = (id: string, name: string) =>
    jest.fn(() => {
      const query = createQuery(() => ({
        data: { name },
        error: null,
      }));
      query.in.mockImplementation(async () => ({
        data: [{ id, name }],
        error: null,
      }));
      return query;
    });

  const from = jest.fn((table: string) => {
    if (table === 'customers') {
      return {
        select: jest.fn(() => {
          const query = createQuery(() =>
            nextResult(customerSelectQueue, { data: null, error: null })
          );
          customerSelectChains.push(query);
          return query;
        }),
        update: customerUpdate.mockImplementation(() => ({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue(
              options.customerUpdateResult ?? {
                data: { consent_marketing: false },
                error: null,
              }
            ),
          }),
        })),
      };
    }

    if (table === 'reservations') {
      return {
        select: jest.fn(() => {
          const query = createQuery(() =>
            nextResult(reservationSelectQueue, { data: [], error: null })
          );
          reservationSelectChains.push(query);
          return query;
        }),
        update: reservationUpdate.mockImplementation(payload => ({
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue(
              options.reservationUpdateResult ?? {
                data: { ...baseReservation(), ...payload },
                error: null,
              }
            ),
          }),
        })),
      };
    }

    if (table === 'clinic_settings') {
      return { select: clinicSettingsSelect };
    }

    if (table === 'menus') {
      return { select: nameSelect(MENU_ID, '標準施術') };
    }

    if (table === 'resources') {
      return { select: nameSelect(STAFF_ID, '田中先生') };
    }

    if (table === 'email_outbox') {
      return {
        insert: emailInsert.mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'outbox-001' },
              error: null,
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    reservationUpdate,
    customerUpdate,
    emailInsert,
    customerSelectChains,
    reservationSelectChains,
  };
}

function setupClinicContext(client: MockClient): void {
  mockCreatePublicClinicContext.mockResolvedValue({
    client,
    clinicId: CLINIC_ID,
    clinic: { id: CLINIC_ID, name: 'テスト整骨院', is_active: true },
  });
}

function buildGetRequest(token: string | null = 'id-token-001'): RouteGetRequest {
  return {
    nextUrl: new URL(
      `https://example.com/api/public/my-reservations?clinic_id=${CLINIC_ID}`
    ),
    headers: new Headers(
      token ? { Authorization: `Bearer ${token}` } : undefined
    ),
  };
}

function buildJsonRequest(
  body: unknown,
  token: string | null = 'id-token-001'
): RouteJsonRequest {
  return {
    headers: new Headers(
      token ? { Authorization: `Bearer ${token}` } : undefined
    ),
    json: async () => body,
  };
}

function baseCustomer() {
  return {
    id: CUSTOMER_ID,
    name: 'LINE 太郎',
    email: 'line@example.com',
    consent_marketing: true,
  };
}

function baseReservation() {
  return {
    id: RESERVATION_ID,
    clinic_id: CLINIC_ID,
    customer_id: CUSTOMER_ID,
    menu_id: MENU_ID,
    staff_id: STAFF_ID,
    start_time: '2026-07-10T01:00:00.000Z',
    end_time: '2026-07-10T02:00:00.000Z',
    status: 'confirmed',
    channel: 'line',
    updated_at: '2026-07-06T00:00:00.000Z',
  };
}

describe('LIFF my-reservations public APIs', () => {
  let GET: (request: RouteGetRequest) => Promise<RouteResponse>;
  let PATCH: (request: RouteJsonRequest) => Promise<RouteResponse>;
  let CANCEL: (
    request: RouteJsonRequest,
    context: { params: Promise<{ id: string }> }
  ) => Promise<RouteResponse>;

  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-07-06T00:00:00.000Z'),
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    mockVerifyLineIdTokenForClinic.mockResolvedValue({
      ok: true,
      lineUserId: LINE_USER_ID,
      displayName: 'LINE 太郎',
      audience: '2000000001',
    });
    const myRoute = await import('@/app/api/public/my-reservations/route');
    const cancelRoute = await import(
      '@/app/api/public/reservations/[id]/cancel/route'
    );
    GET = myRoute.GET as (request: RouteGetRequest) => Promise<RouteResponse>;
    PATCH = myRoute.PATCH as (
      request: RouteJsonRequest
    ) => Promise<RouteResponse>;
    CANCEL = cancelRoute.POST as (
      request: RouteJsonRequest,
      context: { params: Promise<{ id: string }> }
    ) => Promise<RouteResponse>;
  });

  it('Bearer tokenがない場合は予約一覧を返さず401にする', async () => {
    const client = buildMockClient();
    setupClinicContext(client);

    const response = await GET(buildGetRequest(null));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: 'LINE authentication is required',
    });
    expect(client.from).not.toHaveBeenCalledWith('customers');
  });

  it('検証済みline_user_idに紐づく将来予約だけを返す', async () => {
    const client = buildMockClient({
      customerSelectResults: [{ data: baseCustomer(), error: null }],
      reservationSelectResults: [
        { data: [baseReservation()], error: null },
      ],
    });
    setupClinicContext(client);

    const response = await GET(buildGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        customer: {
          name: 'LINE 太郎',
          consent_marketing: true,
        },
        reservations: [
          {
            id: RESERVATION_ID,
            menu_name: '標準施術',
            staff_name: '田中先生',
            can_cancel: true,
          },
        ],
      },
    });
    expect(client.customerSelectChains[0].eq).toHaveBeenCalledWith(
      'line_user_id',
      LINE_USER_ID
    );
    expect(client.reservationSelectChains[0].eq).toHaveBeenCalledWith(
      'customer_id',
      CUSTOMER_ID
    );
  });

  it('opt-outトグルは本人のline_user_id一致でのみ更新する', async () => {
    const client = buildMockClient({
      customerSelectResults: [{ data: baseCustomer(), error: null }],
      customerUpdateResult: {
        data: { consent_marketing: false },
        error: null,
      },
    });
    setupClinicContext(client);

    const response = await PATCH(
      buildJsonRequest({
        clinic_id: CLINIC_ID,
        consent_marketing: false,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { consent_marketing: false },
    });
    expect(client.customerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        consent_marketing: false,
      })
    );
    expect(client.customerSelectChains[0].eq).toHaveBeenCalledWith(
      'line_user_id',
      LINE_USER_ID
    );
  });

  it('本人以外の予約キャンセルは404にして更新しない', async () => {
    const client = buildMockClient({
      reservationSelectResults: [{ data: baseReservation(), error: null }],
      customerSelectResults: [{ data: null, error: null }],
    });
    setupClinicContext(client);

    const response = await CANCEL(buildJsonRequest({ clinic_id: CLINIC_ID }), {
      params: Promise.resolve({ id: RESERVATION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: 'Reservation not found',
    });
    expect(client.customerSelectChains[0].eq).toHaveBeenCalledWith(
      'line_user_id',
      LINE_USER_ID
    );
    expect(client.reservationUpdate).not.toHaveBeenCalled();
    expect(client.emailInsert).not.toHaveBeenCalled();
  });

  it('キャンセル期限を過ぎた予約は403にして更新しない', async () => {
    const client = buildMockClient({
      reservationSelectResults: [{ data: baseReservation(), error: null }],
      customerSelectResults: [{ data: baseCustomer(), error: null }],
      bookingCalendarSettings: {
        allowCancellation: true,
        cancellationDeadlineHours: 120,
      },
    });
    setupClinicContext(client);

    const response = await CANCEL(buildJsonRequest({ clinic_id: CLINIC_ID }), {
      params: Promise.resolve({ id: RESERVATION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: 'The cancellation deadline has passed',
    });
    expect(client.reservationUpdate).not.toHaveBeenCalled();
  });

  it('本人予約を期限内にキャンセルし院側メール通知をエンキューする', async () => {
    const client = buildMockClient({
      reservationSelectResults: [{ data: baseReservation(), error: null }],
      customerSelectResults: [{ data: baseCustomer(), error: null }],
      clinicBasicSettings: { email: 'clinic@example.com' },
      reservationUpdateResult: {
        data: {
          ...baseReservation(),
          status: 'cancelled',
          updated_at: '2026-07-06T00:05:00.000Z',
        },
        error: null,
      },
    });
    setupClinicContext(client);

    const response = await CANCEL(buildJsonRequest({ clinic_id: CLINIC_ID }), {
      params: Promise.resolve({ id: RESERVATION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        reservation_id: RESERVATION_ID,
        status: 'cancelled',
      },
    });
    expect(client.reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        cancellation_reason: 'line_mypage',
      })
    );
    expect(client.emailInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_type: 'public-reservation-cancelled',
        to_email: 'clinic@example.com',
        reservation_id: RESERVATION_ID,
      })
    );
  });
});
