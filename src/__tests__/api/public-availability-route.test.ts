const mockCreatePublicClinicContext = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createPublicClinicContext: (...args: unknown[]) =>
    mockCreatePublicClinicContext(...args),
  ClinicNotFoundError: class ClinicNotFoundError extends Error {
    constructor(message = 'Clinic not found') {
      super(message);
      this.name = 'ClinicNotFoundError';
    }
  },
  ClinicInactiveError: class ClinicInactiveError extends Error {
    constructor(message = 'Clinic is not active') {
      super(message);
      this.name = 'ClinicInactiveError';
    }
  },
}));

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const MENU_ID = '00000000-0000-0000-0000-000000000201';
const STAFF_ID = '00000000-0000-0000-0000-000000000301';

type QueryResult = {
  data: unknown;
  error: unknown;
};

class MockFilterBuilder implements PromiseLike<QueryResult> {
  constructor(private readonly result: QueryResult) {}

  eq(): MockFilterBuilder {
    return this;
  }

  in(): MockFilterBuilder {
    return this;
  }

  lt(): MockFilterBuilder {
    return this;
  }

  gt(): MockFilterBuilder {
    return this;
  }

  not(): MockFilterBuilder {
    return this;
  }

  order(): MockFilterBuilder {
    return this;
  }

  single(): Promise<QueryResult> {
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined
    );
  }
}

function buildSupabase(results: Record<string, QueryResult[]>) {
  const queues = new Map<string, QueryResult[]>(
    Object.entries(results).map(([table, tableResults]) => [
      table,
      [...tableResults],
    ])
  );

  return {
    from(table: string) {
      return {
        select() {
          const result = queues.get(table)?.shift();
          if (!result) {
            throw new Error(`Unexpected query for ${table}`);
          }
          return new MockFilterBuilder(result);
        },
      };
    },
  };
}

function buildUrl(params: Record<string, string>) {
  const url = new URL('https://example.test/api/public/availability');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

describe('GET /api/public/availability', () => {
  let GET: (request: { url: string }) => Promise<{
    status: number;
    headers: HeadersInit;
    json: () => Promise<unknown>;
  }>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    const mod = await import('@/app/api/public/availability/route');
    GET = mod.GET;
  });

  it('空き枠を統一エンベロープで返しCache-Control no-storeを設定する', async () => {
    const supabase = buildSupabase({
      clinic_settings: [
        {
          data: [
            {
              category: 'clinic_hours',
              settings: {
                hoursByDay: {
                  friday: {
                    isOpen: true,
                    timeSlots: [{ start: '09:00', end: '10:00' }],
                  },
                },
                holidays: [],
                specialClosures: [],
              },
            },
            {
              category: 'booking_calendar',
              settings: {
                slotMinutes: 30,
                allowOnlineBooking: true,
                minAdvanceBookingHours: 0,
                maxAdvanceBookingDays: 36500,
              },
            },
          ],
          error: null,
        },
      ],
      menus: [{ data: { id: MENU_ID, duration_minutes: 30 }, error: null }],
      resources: [{ data: [{ id: STAFF_ID, display_order: 1 }], error: null }],
      reservations: [{ data: [], error: null }],
      blocks: [{ data: [], error: null }],
    });
    mockCreatePublicClinicContext.mockResolvedValue({
      client: supabase,
      clinicId: CLINIC_ID,
      clinic: { id: CLINIC_ID, name: 'テスト整骨院', is_active: true },
    });

    const response = await GET({
      url: buildUrl({
        clinic_id: CLINIC_ID,
        menu_id: MENU_ID,
        resource_id: 'any',
        date_from: '2099-07-10',
        date_to: '2099-07-10',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(data).toEqual({
      success: true,
      data: {
        slot_minutes: 30,
        days: [
          {
            date: '2099-07-10',
            is_closed: false,
            slots: [
              { start: '09:00', available: true, resource_ids: [STAFF_ID] },
              { start: '09:30', available: true, resource_ids: [STAFF_ID] },
            ],
          },
        ],
      },
    });
  });

  it('不正なqueryは400を返す', async () => {
    const response = await GET({
      url: buildUrl({
        clinic_id: 'bad',
        menu_id: MENU_ID,
        resource_id: 'any',
        date_from: '2026-07-10',
        date_to: '2026-07-10',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      success: false,
      error: 'Invalid query parameters',
    });
  });

  it('オンライン予約OFFの場合は403を返す', async () => {
    const supabase = buildSupabase({
      clinic_settings: [
        {
          data: [
            {
              category: 'clinic_hours',
              settings: {
                hoursByDay: {
                  friday: {
                    isOpen: true,
                    timeSlots: [{ start: '09:00', end: '10:00' }],
                  },
                },
                holidays: [],
                specialClosures: [],
              },
            },
            {
              category: 'booking_calendar',
              settings: {
                slotMinutes: 30,
                allowOnlineBooking: false,
                minAdvanceBookingHours: 0,
                maxAdvanceBookingDays: 30,
              },
            },
          ],
          error: null,
        },
      ],
      menus: [{ data: { id: MENU_ID, duration_minutes: 30 }, error: null }],
      resources: [{ data: [{ id: STAFF_ID, display_order: 1 }], error: null }],
    });
    mockCreatePublicClinicContext.mockResolvedValue({
      client: supabase,
      clinicId: CLINIC_ID,
      clinic: { id: CLINIC_ID, name: 'テスト整骨院', is_active: true },
    });

    const response = await GET({
      url: buildUrl({
        clinic_id: CLINIC_ID,
        menu_id: MENU_ID,
        resource_id: 'any',
        date_from: '2026-07-10',
        date_to: '2026-07-10',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Online booking is disabled for this clinic',
    });
  });

  it('クリニックが存在しない場合は404を返す', async () => {
    const { ClinicNotFoundError } = await import('@/lib/supabase/scoped-admin');
    mockCreatePublicClinicContext.mockRejectedValue(new ClinicNotFoundError());

    const response = await GET({
      url: buildUrl({
        clinic_id: CLINIC_ID,
        menu_id: MENU_ID,
        resource_id: STAFF_ID,
        date_from: '2026-07-10',
        date_to: '2026-07-10',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ success: false, error: 'Clinic not found' });
  });
});
