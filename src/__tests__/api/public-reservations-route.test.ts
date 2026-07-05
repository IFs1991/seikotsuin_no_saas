/**
 * POST /api/public/reservations route tests
 *
 * Tests the route handler directly, mocking scoped-admin for clinic context
 * and verifying HTTP response codes and bodies.
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-06)
 */

const mockCreatePublicClinicContext = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createPublicClinicContext: (...args: unknown[]) =>
    mockCreatePublicClinicContext(...args),
  ClinicNotFoundError: class ClinicNotFoundError extends Error {
    constructor(msg = 'Clinic not found') {
      super(msg);
      this.name = 'ClinicNotFoundError';
    }
  },
  ClinicInactiveError: class ClinicInactiveError extends Error {
    constructor(msg = 'Clinic is not active') {
      super(msg);
      this.name = 'ClinicInactiveError';
    }
  },
}));

const VALID_CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const VALID_MENU_ID = '00000000-0000-0000-0000-000000000201';
const VALID_RESOURCE_ID = '00000000-0000-0000-0000-000000000301';
const VALID_CUSTOMER_ID = '00000000-0000-0000-0000-000000000401';
const VALID_RESERVATION_ID = '00000000-0000-0000-0000-000000000501';
const EMPTY_LIST = { data: [], error: null };
const NO_CONFLICT = { count: 0, error: null };

const buildRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
  }) as any;

const buildValidBody = () => ({
  clinic_id: VALID_CLINIC_ID,
  customer_name: 'テスト患者',
  customer_phone: '09012345678',
  customer_email: 'patient@example.com',
  menu_id: VALID_MENU_ID,
  resource_id: VALID_RESOURCE_ID,
  start_time: '2026-03-17T10:00',
  channel: 'web' as const,
});

/**
 * Build a mock supabase client whose `.from(table)` returns table-specific chains.
 */
function buildMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultTables: Record<string, unknown> = {
    clinic_settings: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                settings: { allowOnlineBooking: true },
              },
              error: null,
            }),
          }),
        }),
      }),
    },
    menus: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: VALID_MENU_ID,
                    name: '標準施術',
                    duration_minutes: 60,
                    price: 5000,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    },
    resources: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: VALID_RESOURCE_ID },
          error: null,
        }),
      }),
    },
    reservations_select: {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue(NO_CONFLICT),
    },
    blocks: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              gt: jest.fn().mockResolvedValue(EMPTY_LIST),
            }),
          }),
        }),
      }),
    },
    customers: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', message: 'No rows found' },
              }),
            }),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: VALID_CUSTOMER_ID },
            error: null,
          }),
        }),
      }),
    },
    reservations_insert: {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: VALID_RESERVATION_ID,
            start_time: '2026-03-17T10:00:00.000Z',
            end_time: '2026-03-17T11:00:00.000Z',
            status: 'unconfirmed',
          },
          error: null,
        }),
      }),
    },
  };

  const tables = { ...defaultTables, ...overrides };

  // Track call counts per table to distinguish select vs insert on same table
  const reservationsCallCount = { value: 0 };
  const customersCallCount = { value: 0 };

  return {
    from: jest.fn((table: string) => {
      if (table === 'reservations') {
        reservationsCallCount.value++;
        // First call is select (overlap check), second is insert
        if (reservationsCallCount.value === 1) {
          return { select: jest.fn().mockReturnValue(tables.reservations_select) };
        }
        return { insert: jest.fn().mockReturnValue(tables.reservations_insert) };
      }
      if (table === 'customers') {
        customersCallCount.value++;
        // First call is select (find existing), second may be insert
        if (customersCallCount.value === 1) {
          return { select: jest.fn().mockReturnValue((tables.customers as any).select()) };
        }
        return { insert: jest.fn().mockReturnValue((tables.customers as any).insert()) };
      }
      const t = tables[table];
      if (!t) throw new Error(`Unexpected table access: ${table}`);
      return t;
    }),
  };
}

function setupClinicContext(supabase: unknown) {
  mockCreatePublicClinicContext.mockResolvedValue({
    client: supabase,
    clinicId: VALID_CLINIC_ID,
    clinic: { id: VALID_CLINIC_ID, name: 'テスト整骨院', is_active: true },
  });
}

describe('POST /api/public/reservations', () => {
  let POST: (req: any) => Promise<any>;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Dynamic import to pick up mocks
    jest.resetModules();
    const mod = await import('@/app/api/public/reservations/route');
    POST = mod.POST;
  });

  it('クリニックが見つからない場合は 404 を返す', async () => {
    const { ClinicNotFoundError } = await import('@/lib/supabase/scoped-admin');
    mockCreatePublicClinicContext.mockRejectedValue(new ClinicNotFoundError());

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ success: false, error: 'Clinic not found' });
  });

  it('クリニックが無効な場合は 403 を返す', async () => {
    const { ClinicInactiveError } = await import('@/lib/supabase/scoped-admin');
    mockCreatePublicClinicContext.mockRejectedValue(new ClinicInactiveError());

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Clinic is not accepting reservations',
    });
  });

  it('booking_calendar レコードが存在しない場合は 403 を返す', async () => {
    const supabase = buildMockSupabase({
      clinic_settings: {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', message: 'No rows found' },
              }),
            }),
          }),
        }),
      },
    });
    setupClinicContext(supabase);

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Online booking is disabled for this clinic',
    });
  });

  it('allowOnlineBooking=false の場合は 403 を返す', async () => {
    const supabase = buildMockSupabase({
      clinic_settings: {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { settings: { allowOnlineBooking: false } },
                error: null,
              }),
            }),
          }),
        }),
      },
    });
    setupClinicContext(supabase);

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Online booking is disabled for this clinic',
    });
  });

  it('allowOnlineBooking=true の場合は予約作成フローを完了し 201 を返す', async () => {
    const supabase = buildMockSupabase();
    setupClinicContext(supabase);

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      reservation_id: VALID_RESERVATION_ID,
      clinic_name: 'テスト整骨院',
      menu_name: '標準施術',
      start_time: '2026-03-17T10:00:00.000Z',
      end_time: '2026-03-17T11:00:00.000Z',
      status: 'unconfirmed',
    });
  });

  it('重複予約がある場合は 409 を返す', async () => {
    const supabase = buildMockSupabase({
      reservations_select: {
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        not: jest.fn().mockResolvedValue({
          count: 1,
          error: null,
        }),
      },
    });
    setupClinicContext(supabase);

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      success: false,
      error: 'Requested time slot is not available',
    });
  });

  it('DB排他制約違反の場合は 409 を返す', async () => {
    const supabase = buildMockSupabase({
      customers: {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: VALID_CUSTOMER_ID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: jest.fn(),
      },
      reservations_insert: {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: '23P01',
              message:
                'conflicting key value violates exclusion constraint "reservations_no_overlap"',
            },
          }),
        }),
      },
    });
    setupClinicContext(supabase);

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      success: false,
      error: 'Requested time slot is not available',
    });
  });

  it('バリデーションエラーの場合は 400 を返す', async () => {
    const response = await POST(
      buildRequest({ clinic_id: 'not-a-uuid' })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Validation error');
  });

  it('開始時間が30分刻みではない場合は 400 を返す', async () => {
    const response = await POST(
      buildRequest({
        ...buildValidBody(),
        start_time: '2026-03-17T10:15',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Validation error');
    expect(data.details.fieldErrors.start_time).toContain(
      'start_time must be on a 30-minute boundary'
    );
  });

  it('不正なJSONの場合は 400 を返す', async () => {
    const badRequest = {
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as any;

    const response = await POST(badRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ success: false, error: 'Invalid JSON data' });
  });
});
