import {
  AvailabilityBookingDisabledError,
  AvailabilityValidationError,
  PublicAvailabilityService,
  PublicBookingTimeValidationError,
  type PublicAvailabilityClient,
} from '@/lib/services/public-availability-service';

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const MENU_ID = '00000000-0000-0000-0000-000000000201';
const STAFF_1 = '00000000-0000-0000-0000-000000000301';
const STAFF_2 = '00000000-0000-0000-0000-000000000302';

type QueryResult = {
  data: unknown;
  error: unknown;
};

type QueryCall = {
  method: string;
  column?: string;
  value?: unknown;
  values?: readonly unknown[];
};

type TableCall = {
  table: string;
  columns: string;
  query: MockFilterBuilder;
};

class MockFilterBuilder implements PromiseLike<QueryResult> {
  readonly calls: QueryCall[] = [];

  constructor(private readonly result: QueryResult) {}

  eq(column: string, value: unknown): MockFilterBuilder {
    this.calls.push({ method: 'eq', column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): MockFilterBuilder {
    this.calls.push({ method: 'in', column, values });
    return this;
  }

  lt(column: string, value: unknown): MockFilterBuilder {
    this.calls.push({ method: 'lt', column, value });
    return this;
  }

  gt(column: string, value: unknown): MockFilterBuilder {
    this.calls.push({ method: 'gt', column, value });
    return this;
  }

  not(column: string, operator: string, value: string): MockFilterBuilder {
    this.calls.push({ method: 'not', column, value: `${operator}:${value}` });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): MockFilterBuilder {
    this.calls.push({ method: 'order', column, value: options });
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

function buildClient(results: Record<string, QueryResult[]>): {
  client: PublicAvailabilityClient;
  calls: TableCall[];
} {
  const queues = new Map<string, QueryResult[]>(
    Object.entries(results).map(([table, tableResults]) => [
      table,
      [...tableResults],
    ])
  );
  const calls: TableCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            const queue = queues.get(table);
            const result = queue?.shift();
            if (!result) {
              throw new Error(`Unexpected query for ${table}`);
            }

            const query = new MockFilterBuilder(result);
            calls.push({ table, columns, query });
            return query;
          },
        };
      },
    },
  };
}

function settingsResult(
  overrides: {
    bookingCalendar?: Record<string, unknown>;
  } = {}
): QueryResult {
  return {
    data: [
      {
        category: 'clinic_hours',
        settings: {
          hoursByDay: {
            monday: {
              isOpen: true,
              timeSlots: [{ start: '09:00', end: '11:00' }],
            },
            friday: {
              isOpen: true,
              timeSlots: [{ start: '09:00', end: '19:00' }],
            },
            sunday: { isOpen: false, timeSlots: [] },
          },
          holidays: ['2026-07-07'],
          specialClosures: [],
        },
      },
      {
        category: 'booking_calendar',
        settings: {
          slotMinutes: 30,
          allowOnlineBooking: true,
          minAdvanceBookingHours: 2,
          maxAdvanceBookingDays: 14,
          ...overrides.bookingCalendar,
        },
      },
    ],
    error: null,
  };
}

describe('PublicAvailabilityService', () => {
  it('営業時間・予約・ブロックを反映してresource_id=anyの空きスタッフだけ返す', async () => {
    const { client, calls } = buildClient({
      clinic_settings: [settingsResult()],
      menus: [
        {
          data: { id: MENU_ID, duration_minutes: 60 },
          error: null,
        },
      ],
      resources: [
        {
          data: [
            { id: STAFF_1, display_order: 1, created_at: '2026-01-01' },
            { id: STAFF_2, display_order: 2, created_at: '2026-01-02' },
          ],
          error: null,
        },
      ],
      reservations: [
        {
          data: [
            {
              staff_id: STAFF_1,
              start_time: '2026-07-06T00:00:00.000Z',
              end_time: '2026-07-06T01:00:00.000Z',
            },
          ],
          error: null,
        },
      ],
      blocks: [
        {
          data: [
            {
              resource_id: STAFF_2,
              start_time: '2026-07-06T00:30:00.000Z',
              end_time: '2026-07-06T01:30:00.000Z',
            },
          ],
          error: null,
        },
      ],
    });
    const service = new PublicAvailabilityService(
      client,
      CLINIC_ID,
      () => new Date('2026-07-05T00:00:00+09:00')
    );

    const result = await service.getAvailability({
      menuId: MENU_ID,
      resourceId: 'any',
      dateFrom: '2026-07-06',
      dateTo: '2026-07-06',
    });

    expect(result).toEqual({
      slot_minutes: 30,
      days: [
        {
          date: '2026-07-06',
          is_closed: false,
          slots: [
            { start: '09:00', available: false, resource_ids: [] },
            { start: '09:30', available: false, resource_ids: [] },
            { start: '10:00', available: true, resource_ids: [STAFF_1] },
            { start: '10:30', available: false, resource_ids: [] },
          ],
        },
      ],
    });

    const reservationCall = calls.find(call => call.table === 'reservations');
    expect(reservationCall?.query.calls).toEqual(
      expect.arrayContaining([
        { method: 'eq', column: 'clinic_id', value: CLINIC_ID },
        { method: 'eq', column: 'is_deleted', value: false },
        {
          method: 'not',
          column: 'status',
          value: 'in:("cancelled","no_show")',
        },
      ])
    );
  });

  it('休診日はis_closed=trueでslotsを返さない', async () => {
    const { client } = buildClient({
      clinic_settings: [settingsResult()],
      menus: [{ data: { id: MENU_ID, duration_minutes: 60 }, error: null }],
      resources: [{ data: [{ id: STAFF_1, display_order: 1 }], error: null }],
      reservations: [{ data: [], error: null }],
      blocks: [{ data: [], error: null }],
    });
    const service = new PublicAvailabilityService(
      client,
      CLINIC_ID,
      () => new Date('2026-07-05T00:00:00+09:00')
    );

    await expect(
      service.getAvailability({
        menuId: MENU_ID,
        resourceId: STAFF_1,
        dateFrom: '2026-07-07',
        dateTo: '2026-07-07',
      })
    ).resolves.toMatchObject({
      days: [{ date: '2026-07-07', is_closed: true, slots: [] }],
    });
  });

  it('オンライン予約OFFの場合は空き枠を返さない', async () => {
    const { client } = buildClient({
      clinic_settings: [
        settingsResult({ bookingCalendar: { allowOnlineBooking: false } }),
      ],
      menus: [{ data: { id: MENU_ID, duration_minutes: 60 }, error: null }],
      resources: [{ data: [{ id: STAFF_1, display_order: 1 }], error: null }],
    });
    const service = new PublicAvailabilityService(client, CLINIC_ID);

    await expect(
      service.getAvailability({
        menuId: MENU_ID,
        resourceId: 'any',
        dateFrom: '2026-07-06',
        dateTo: '2026-07-06',
      })
    ).rejects.toThrow(AvailabilityBookingDisabledError);
  });

  it('date_fromから15日分以上の場合は拒否する', async () => {
    const { client } = buildClient({});
    const service = new PublicAvailabilityService(client, CLINIC_ID);

    await expect(
      service.getAvailability({
        menuId: MENU_ID,
        resourceId: 'any',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-15',
      })
    ).rejects.toThrow(AvailabilityValidationError);
  });

  it('予約作成時の時間検証で過去・営業時間外・受付期間外・slot境界外を拒否する', async () => {
    const now = () => new Date('2026-07-05T00:00:00+09:00');

    const past = new PublicAvailabilityService(
      buildClient({ clinic_settings: [settingsResult()] }).client,
      CLINIC_ID,
      now
    );
    await expect(
      past.validateReservationTime(
        '2026-07-04T01:00:00.000Z',
        '2026-07-04T02:00:00.000Z'
      )
    ).rejects.toThrow(PublicBookingTimeValidationError);

    const outsideHours = new PublicAvailabilityService(
      buildClient({ clinic_settings: [settingsResult()] }).client,
      CLINIC_ID,
      now
    );
    await expect(
      outsideHours.validateReservationTime(
        '2026-07-06T03:00:00.000Z',
        '2026-07-06T04:00:00.000Z'
      )
    ).rejects.toThrow('Requested time is outside clinic hours');

    const outsideWindow = new PublicAvailabilityService(
      buildClient({ clinic_settings: [settingsResult()] }).client,
      CLINIC_ID,
      now
    );
    await expect(
      outsideWindow.validateReservationTime(
        '2026-07-25T01:00:00.000Z',
        '2026-07-25T02:00:00.000Z'
      )
    ).rejects.toThrow('Requested time is outside the booking window');

    const offBoundary = new PublicAvailabilityService(
      buildClient({ clinic_settings: [settingsResult()] }).client,
      CLINIC_ID,
      now
    );
    await expect(
      offBoundary.validateReservationTime(
        '2026-07-06T01:15:00.000Z',
        '2026-07-06T02:15:00.000Z'
      )
    ).rejects.toThrow('Requested time is outside the configured slot boundary');
  });
});
