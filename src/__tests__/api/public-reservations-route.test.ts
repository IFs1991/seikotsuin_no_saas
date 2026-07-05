/**
 * POST /api/public/reservations route tests
 *
 * Tests the route handler directly, mocking scoped-admin for clinic context
 * and verifying HTTP response codes and bodies.
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-06)
 */

const mockCreatePublicClinicContext = jest.fn();
const mockVerifyLineIdTokenForClinic = jest.fn();

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

jest.mock('@/lib/line/id-token', () => ({
  verifyLineIdTokenForClinic: (...args: unknown[]) =>
    mockVerifyLineIdTokenForClinic(...args),
}));

const VALID_CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const VALID_MENU_ID = '00000000-0000-0000-0000-000000000201';
const VALID_RESOURCE_ID = '00000000-0000-0000-0000-000000000301';
const VALID_CUSTOMER_ID = '00000000-0000-0000-0000-000000000401';
const VALID_RESERVATION_ID = '00000000-0000-0000-0000-000000000501';
const EMPTY_LIST = { data: [], error: null };
const NO_CONFLICT = { count: 0, error: null };

type MockQueryResult = {
  data: unknown;
  error: unknown;
};

type CustomerTableMock = {
  select: jest.Mock;
  insert: jest.Mock;
  update?: jest.Mock;
};

type PublicReservationRouteRequest = {
  json: () => Promise<unknown>;
};

type PublicReservationRouteResponse = {
  status: number;
  json: () => Promise<unknown>;
};

type InsertableTableMock = {
  insert: jest.Mock;
};

function isCustomerTableMock(value: unknown): value is CustomerTableMock {
  return (
    typeof value === 'object' &&
    value !== null &&
    'select' in value &&
    'insert' in value &&
    typeof value.select === 'function' &&
    typeof value.insert === 'function'
  );
}

function isInsertableTableMock(value: unknown): value is InsertableTableMock {
  return (
    typeof value === 'object' &&
    value !== null &&
    'insert' in value &&
    typeof value.insert === 'function'
  );
}

function findReservationInsertPayload(
  supabase: ReturnType<typeof buildMockSupabase>
) {
  for (const [index, result] of supabase.from.mock.results.entries()) {
    if (supabase.from.mock.calls[index]?.[0] !== 'reservations') {
      continue;
    }
    if (result.type !== 'return') {
      continue;
    }
    if (!isInsertableTableMock(result.value)) {
      continue;
    }
    if (result.value.insert.mock.calls.length === 0) {
      continue;
    }
    return result.value.insert.mock.calls[0][0];
  }
  return null;
}

function createThenableQuery(result: MockQueryResult) {
  const query = {
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    lt: jest.fn(() => query),
    gte: jest.fn(() => query),
    gt: jest.fn(() => query),
    neq: jest.fn(() => query),
    not: jest.fn(() => query),
    order: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then<TResult1 = MockQueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: MockQueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(result).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined
      );
    },
  };

  return query;
}

const buildRequest = (
  body: Record<string, unknown>
): PublicReservationRouteRequest => ({
  json: async () => body,
});

const buildValidBody = () => ({
  clinic_id: VALID_CLINIC_ID,
  customer_name: 'テスト患者',
  customer_phone: '09012345678',
  customer_email: 'patient@example.com',
  menu_id: VALID_MENU_ID,
  resource_id: VALID_RESOURCE_ID,
  start_time: '2026-07-10T10:00:00+09:00',
  channel: 'web' as const,
});

/**
 * Build a mock supabase client whose `.from(table)` returns table-specific chains.
 */
function buildMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultTables: Record<string, unknown> = {
    clinic_settings: {
      select: jest.fn((columns: string) => {
        if (columns === 'category, settings') {
          return createThenableQuery({
            data: [
              {
                category: 'clinic_hours',
                settings: {
                  hoursByDay: {
                    friday: {
                      isOpen: true,
                      timeSlots: [{ start: '09:00', end: '19:00' }],
                    },
                  },
                  holidays: [],
                  specialClosures: [],
                },
              },
              {
                category: 'booking_calendar',
                settings: {
                  allowOnlineBooking: true,
                  slotMinutes: 30,
                  minAdvanceBookingHours: 0,
                  maxAdvanceBookingDays: 36500,
                },
              },
            ],
            error: null,
          });
        }

        const query = {
          eq: jest.fn(() => query),
          single: jest.fn().mockResolvedValue({
            data: {
              settings: { allowOnlineBooking: true },
            },
            error: null,
          }),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };
        return query;
      }),
    },
    menus: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
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
      }),
    },
    resources: {
      select: jest.fn((columns: string) => {
        if (columns === 'id, display_order, created_at') {
          return createThenableQuery({
            data: [
              {
                id: VALID_RESOURCE_ID,
                display_order: 1,
                created_at: '2026-01-01T00:00:00.000Z',
              },
            ],
            error: null,
          });
        }

        if (columns === 'name') {
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { name: '山田先生' },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: VALID_RESOURCE_ID },
            error: null,
          }),
        };
      }),
    },
    reservations_select: {
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue(NO_CONFLICT),
    },
    blocks: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                lt: jest.fn().mockReturnValue({
                  gt: jest.fn().mockResolvedValue(EMPTY_LIST),
                }),
              }),
            }),
          }),
        }),
      }),
    },
    customers: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
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
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
      }),
    },
    reservations_insert: {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: VALID_RESERVATION_ID,
            start_time: '2026-07-10T01:00:00.000Z',
            end_time: '2026-07-10T02:00:00.000Z',
            status: 'unconfirmed',
            updated_at: '2026-07-05T00:00:00.000Z',
          },
          error: null,
        }),
      }),
    },
    reservation_notifications: {
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'notification-001' },
            error: null,
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
    email_outbox: {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'outbox-001' },
            error: null,
          }),
        }),
      }),
    },
  };

  const tables = { ...defaultTables, ...overrides };

  return {
    from: jest.fn((table: string) => {
      if (table === 'reservations') {
        return {
          select: jest.fn().mockReturnValue(tables.reservations_select),
          insert: jest.fn().mockReturnValue(tables.reservations_insert),
        };
      }
      if (table === 'customers') {
        if (!isCustomerTableMock(tables.customers)) {
          throw new Error('Unexpected customers mock shape');
        }

        return {
          select: tables.customers.select,
          insert: tables.customers.insert,
          update: tables.customers.update,
        };
      }
      if (table === 'reservation_notifications') {
        return tables.reservation_notifications;
      }
      if (table === 'email_outbox') {
        return tables.email_outbox;
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
  let POST: (
    req: PublicReservationRouteRequest
  ) => Promise<PublicReservationRouteResponse>;

  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-07-05T00:00:00.000Z'),
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerifyLineIdTokenForClinic.mockResolvedValue({
      ok: false,
      reason: 'not_configured',
    });
    // Dynamic import to pick up mocks
    jest.resetModules();
    const mod = await import('@/app/api/public/reservations/route');
    POST = mod.POST as (
      req: PublicReservationRouteRequest
    ) => Promise<PublicReservationRouteResponse>;
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
      start_time: '2026-07-10T01:00:00.000Z',
      end_time: '2026-07-10T02:00:00.000Z',
      status: 'unconfirmed',
      resource_id: VALID_RESOURCE_ID,
      is_staff_requested: true,
    });
  });

  it('LINE IDトークン検証成功時は顧客にLINE IDを保存して予約を継続する', async () => {
    mockVerifyLineIdTokenForClinic.mockResolvedValue({
      ok: true,
      lineUserId: 'Uline-user-001',
      displayName: 'LINE 太郎',
      audience: '2000000001',
    });
    const customerInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: VALID_CUSTOMER_ID },
          error: null,
        }),
      }),
    });
    const supabase = buildMockSupabase({
      customers: {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
        insert: customerInsert,
      },
    });
    setupClinicContext(supabase);

    const response = await POST(
      buildRequest({
        ...buildValidBody(),
        line_id_token: 'id-token-001',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(mockVerifyLineIdTokenForClinic).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: VALID_CLINIC_ID,
        idToken: 'id-token-001',
      })
    );
    expect(customerInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        line_user_id: 'Uline-user-001',
        line_display_name: 'LINE 太郎',
      })
    );
    expect(findReservationInsertPayload(supabase)).toEqual(
      expect.objectContaining({
        channel: 'line',
      })
    );
  });

  it('LINE IDトークン検証失敗時もWeb予約として継続する', async () => {
    mockVerifyLineIdTokenForClinic.mockResolvedValue({
      ok: false,
      reason: 'aud_mismatch',
    });
    const customerInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: VALID_CUSTOMER_ID },
          error: null,
        }),
      }),
    });
    const supabase = buildMockSupabase({
      customers: {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
        insert: customerInsert,
      },
    });
    setupClinicContext(supabase);

    const response = await POST(
      buildRequest({
        ...buildValidBody(),
        line_id_token: 'id-token-001',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(customerInsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        line_user_id: expect.any(String),
      })
    );
    expect(findReservationInsertPayload(supabase)).toEqual(
      expect.objectContaining({
        channel: 'web',
      })
    );
  });

  it('resource_id=any の場合はスタッフを自動割当して 201 を返す', async () => {
    const supabase = buildMockSupabase();
    setupClinicContext(supabase);

    const response = await POST(
      buildRequest({
        ...buildValidBody(),
        resource_id: 'any',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({
      reservation_id: VALID_RESERVATION_ID,
      clinic_name: 'テスト整骨院',
      menu_name: '標準施術',
      start_time: '2026-07-10T01:00:00.000Z',
      end_time: '2026-07-10T02:00:00.000Z',
      status: 'unconfirmed',
      resource_id: VALID_RESOURCE_ID,
      is_staff_requested: false,
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
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: VALID_CUSTOMER_ID },
            error: null,
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
    const response = await POST(buildRequest({ clinic_id: 'not-a-uuid' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Validation error');
  });

  it('電話番号がない場合は booking_form の必須検証で 400 を返す', async () => {
    const supabase = buildMockSupabase();
    setupClinicContext(supabase);
    const body = buildValidBody();
    const { customer_phone: customerPhone, ...withoutPhone } = body;
    expect(customerPhone).toBe('09012345678');

    const response = await POST(buildRequest(withoutPhone));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('電話番号は必須です');
  });

  it('start_timeにtimezone offsetがない場合は 400 を返す', async () => {
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
      'start_time must be ISO 8601 format with timezone offset'
    );
  });

  it('院設定のslotMinutes境界外の場合は 400 を返す', async () => {
    const supabase = buildMockSupabase();
    setupClinicContext(supabase);

    const response = await POST(
      buildRequest({
        ...buildValidBody(),
        start_time: '2026-07-10T10:15:00+09:00',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      success: false,
      error: 'Requested time is outside the configured slot boundary',
    });
  });

  it('不正なJSONの場合は 400 を返す', async () => {
    const badRequest: PublicReservationRouteRequest = {
      json: async () => {
        throw new Error('Invalid JSON');
      },
    };

    const response = await POST(badRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ success: false, error: 'Invalid JSON data' });
  });
});
