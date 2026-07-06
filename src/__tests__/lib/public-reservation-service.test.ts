/**
 * PublicReservationService unit tests (TDD Red → Green)
 *
 * Tests the service layer that handles the full public reservation flow:
 * booking settings → menu → time calc → resource → slot conflict → customer → reservation
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-06)
 */

import {
  PublicReservationService,
  BookingDisabledError,
  MenuNotFoundError,
  ResourceNotFoundError,
  SlotConflictError,
  CustomerLookupError,
  CustomerCreateError,
  ReservationCreateError,
  normalizeCustomerPhoneForMatch,
} from '@/lib/services/public-reservation-service';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const MENU_ID = '00000000-0000-0000-0000-000000000201';
const RESOURCE_ID = '00000000-0000-0000-0000-000000000301';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000401';
const RESERVATION_ID = '00000000-0000-0000-0000-000000000501';

const EMPTY = { data: [], error: null };
const NO_CONFLICT = { count: 0, error: null };
const NO_ROWS = {
  data: null,
  error: { code: 'PGRST116', message: 'No rows found' },
};

/** Minimal input for a valid reservation */
const validInput = () => ({
  clinic_id: CLINIC_ID,
  customer_name: 'テスト患者',
  customer_phone: '09012345678',
  customer_email: 'patient@example.com',
  menu_id: MENU_ID,
  resource_id: RESOURCE_ID,
  start_time: '2026-03-17T10:00',
  channel: 'web' as const,
});

/**
 * Creates a chainable mock that simulates Supabase query builder.
 * eq/lt/gt chain into each other, and terminal methods resolve the result.
 */
function mockChain(
  result: unknown,
  terminal: 'single' | 'list' | 'listWithNot' = 'single'
) {
  if (terminal === 'list') {
    // For queries that return arrays (overlap checks)
    const chain: Record<string, jest.Mock> = {
      eq: jest.fn(),
      lt: jest.fn(),
      gt: jest.fn(),
    };
    chain.eq.mockReturnValue(chain);
    chain.lt.mockReturnValue(chain);
    chain.gt.mockImplementation(() => Promise.resolve(result));
    return chain;
  }
  if (terminal === 'listWithNot') {
    const chain: Record<string, jest.Mock> = {
      eq: jest.fn(),
      lt: jest.fn(),
      gt: jest.fn(),
      not: jest.fn(),
    };
    chain.eq.mockReturnValue(chain);
    chain.lt.mockReturnValue(chain);
    chain.gt.mockReturnValue(chain);
    chain.not.mockResolvedValue(result);
    return chain;
  }
  // For queries that end with .single()
  const chain: Record<string, jest.Mock> = {
    eq: jest.fn(),
    limit: jest.fn(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

/**
 * Build a full mock supabase client with sensible defaults for the happy path.
 * Individual table behaviors can be overridden.
 */
function buildClient(overrides: Record<string, () => unknown> = {}) {
  const reservationsCalls = { select: 0 };
  const defaults: Record<string, () => unknown> = {
    clinic_settings: () => ({
      select: jest.fn().mockReturnValue(
        mockChain({
          data: { settings: { allowOnlineBooking: true } },
          error: null,
        })
      ),
    }),
    menus: () => ({
      select: jest.fn().mockReturnValue(
        mockChain({
          data: {
            id: MENU_ID,
            name: '標準施術',
            duration_minutes: 60,
            price: 5000,
          },
          error: null,
        })
      ),
    }),
    resources: () => ({
      select: jest.fn().mockReturnValue(
        mockChain({
          data: { id: RESOURCE_ID },
          error: null,
        })
      ),
    }),
    reservations_overlap: () => ({
      select: jest.fn().mockReturnValue(mockChain(NO_CONFLICT, 'listWithNot')),
    }),
    blocks: () => ({
      select: jest.fn().mockReturnValue(mockChain(EMPTY, 'list')),
    }),
    customers_find: () => ({
      select: jest.fn().mockReturnValue(mockChain(NO_ROWS)),
    }),
    customers_create: () => ({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: CUSTOMER_ID },
            error: null,
          }),
        }),
      }),
    }),
    reservations_insert: () => ({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: RESERVATION_ID,
              start_time: '2026-03-17T10:00:00.000Z',
              end_time: '2026-03-17T11:00:00.000Z',
              status: 'unconfirmed',
            },
            error: null,
          }),
        }),
      }),
    }),
  };

  const factories = { ...defaults, ...overrides };

  return {
    from: jest.fn((table: string) => {
      if (table === 'reservations') {
        reservationsCalls.select++;
        if (reservationsCalls.select === 1)
          return factories.reservations_overlap();
        return factories.reservations_insert();
      }
      if (table === 'customers') {
        return {
          ...(factories.customers_find() as object),
          ...(factories.customers_create() as object),
        };
      }
      const factory = factories[table];
      if (!factory) throw new Error(`Unexpected table: ${table}`);
      return factory();
    }),
  } as any;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('PublicReservationService', () => {
  describe('normalizeCustomerPhoneForMatch', () => {
    it('国内表記の区切り文字を除去する', () => {
      expect(normalizeCustomerPhoneForMatch('090-1234-5678')).toBe(
        '09012345678'
      );
      expect(normalizeCustomerPhoneForMatch('090 1234 5678')).toBe(
        '09012345678'
      );
    });

    it('+81表記を国内0始まりへ寄せる', () => {
      expect(normalizeCustomerPhoneForMatch('+819012345678')).toBe(
        '09012345678'
      );
    });

    it('+81単体は照合値なしにする', () => {
      expect(normalizeCustomerPhoneForMatch('+81')).toBeNull();
    });
  });

  describe('checkBookingEnabled', () => {
    it('オンライン予約が有効な場合は正常終了する', async () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.checkBookingEnabled()).resolves.not.toThrow();
    });

    it('booking_calendar が存在しない場合は BookingDisabledError を投げる', async () => {
      const client = buildClient({
        clinic_settings: () => ({
          select: jest.fn().mockReturnValue(
            mockChain({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            })
          ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.checkBookingEnabled()).rejects.toThrow(
        BookingDisabledError
      );
    });

    it('allowOnlineBooking=false の場合は BookingDisabledError を投げる', async () => {
      const client = buildClient({
        clinic_settings: () => ({
          select: jest.fn().mockReturnValue(
            mockChain({
              data: { settings: { allowOnlineBooking: false } },
              error: null,
            })
          ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.checkBookingEnabled()).rejects.toThrow(
        BookingDisabledError
      );
    });
  });

  describe('verifyMenu', () => {
    it('有効なメニューを返す', async () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      const menu = await service.verifyMenu(MENU_ID);
      expect(menu).toEqual({
        id: MENU_ID,
        name: '標準施術',
        duration_minutes: 60,
        price: 5000,
      });
    });

    it('メニューが存在しない場合は MenuNotFoundError を投げる', async () => {
      const client = buildClient({
        menus: () => ({
          select: jest
            .fn()
            .mockReturnValue(
              mockChain({ data: null, error: { code: 'PGRST116' } })
            ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.verifyMenu(MENU_ID)).rejects.toThrow(
        MenuNotFoundError
      );
    });
  });

  describe('verifyResource', () => {
    it('有効なリソースで正常終了する', async () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.verifyResource(RESOURCE_ID)).resolves.not.toThrow();
    });

    it('公開予約で使えるスタッフリソースだけを検証対象にする', async () => {
      const single = jest.fn().mockResolvedValue({
        data: { id: RESOURCE_ID },
        error: null,
      });
      const query = {
        eq: jest.fn().mockReturnThis(),
        single,
      };
      const client = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue(query),
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);

      await expect(service.verifyResource(RESOURCE_ID)).resolves.not.toThrow();

      expect(query.eq).toHaveBeenCalledWith('id', RESOURCE_ID);
      expect(query.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
      expect(query.eq).toHaveBeenCalledWith('type', 'staff');
      expect(query.eq).toHaveBeenCalledWith('is_active', true);
      expect(query.eq).toHaveBeenCalledWith('is_bookable', true);
      expect(query.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('リソースが存在しない場合は ResourceNotFoundError を投げる', async () => {
      const client = buildClient({
        resources: () => ({
          select: jest
            .fn()
            .mockReturnValue(
              mockChain({ data: null, error: { code: 'PGRST116' } })
            ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(service.verifyResource(RESOURCE_ID)).rejects.toThrow(
        ResourceNotFoundError
      );
    });
  });

  describe('checkSlotAvailability', () => {
    it('空きスロットの場合は正常終了する', async () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(
        service.checkSlotAvailability(
          RESOURCE_ID,
          '2026-03-17T10:00:00.000Z',
          '2026-03-17T11:00:00.000Z'
        )
      ).resolves.not.toThrow();
    });

    it('キャンセル済みと来院なしは重複チェックから除外する', async () => {
      const not = jest.fn().mockResolvedValue(NO_CONFLICT);
      const reservationsChain = {
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        not,
      };
      const blocksChain = mockChain(EMPTY, 'list');
      const client = {
        from: jest.fn((table: string) => {
          if (table === 'reservations') {
            return { select: jest.fn().mockReturnValue(reservationsChain) };
          }
          if (table === 'blocks') {
            return { select: jest.fn().mockReturnValue(blocksChain) };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);

      await expect(
        service.checkSlotAvailability(
          RESOURCE_ID,
          '2026-03-17T10:00:00.000Z',
          '2026-03-17T11:00:00.000Z'
        )
      ).resolves.not.toThrow();

      expect(not).toHaveBeenCalledWith(
        'status',
        'in',
        '("cancelled","no_show")'
      );
      expect(reservationsChain.eq).toHaveBeenCalledWith('is_deleted', false);
      expect(blocksChain.eq).toHaveBeenCalledWith('is_active', true);
      expect(blocksChain.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('重複予約がある場合は SlotConflictError を投げる', async () => {
      const client = buildClient({
        reservations_overlap: () => ({
          select: jest
            .fn()
            .mockReturnValue(
              mockChain({ count: 1, error: null }, 'listWithNot')
            ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(
        service.checkSlotAvailability(
          RESOURCE_ID,
          '2026-03-17T10:00:00.000Z',
          '2026-03-17T11:00:00.000Z'
        )
      ).rejects.toThrow(SlotConflictError);
    });

    it('重複ブロックがある場合は SlotConflictError を投げる', async () => {
      const client = buildClient({
        blocks: () => ({
          select: jest
            .fn()
            .mockReturnValue(
              mockChain(
                { data: [{ id: 'block-1', reason: 'lunch' }], error: null },
                'list'
              )
            ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(
        service.checkSlotAvailability(
          RESOURCE_ID,
          '2026-03-17T12:00:00.000Z',
          '2026-03-17T13:00:00.000Z'
        )
      ).rejects.toThrow(SlotConflictError);
    });
  });

  describe('findOrCreateCustomer', () => {
    it('既存顧客が見つかった場合はそのIDを返す', async () => {
      const client = buildClient({
        customers_find: () => ({
          select: jest
            .fn()
            .mockReturnValue(
              mockChain({ data: { id: CUSTOMER_ID }, error: null })
            ),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);
      const result = await service.findOrCreateCustomer(
        'テスト患者',
        '09012345678',
        'patient@example.com'
      );
      expect(result).toEqual({ customerId: CUSTOMER_ID, created: false });
    });

    it('電話番号はnormalized_phoneで既存顧客を検索する', async () => {
      const customerFindQuery = mockChain({
        data: { id: CUSTOMER_ID },
        error: null,
      });
      const client = buildClient({
        customers_find: () => ({
          select: jest.fn().mockReturnValue(customerFindQuery),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);

      const result = await service.findOrCreateCustomer(
        'テスト患者',
        '090-1234-5678',
        undefined
      );

      expect(result).toEqual({ customerId: CUSTOMER_ID, created: false });
      expect(customerFindQuery.eq).toHaveBeenCalledWith(
        'normalized_phone',
        '09012345678'
      );
    });

    it('LINE ID一致を電話番号一致より優先する', async () => {
      const customerFindQuery = mockChain({
        data: { id: CUSTOMER_ID },
        error: null,
      });
      const client = buildClient({
        customers_find: () => ({
          select: jest.fn().mockReturnValue(customerFindQuery),
        }),
        customers_create: () => ({
          insert: jest.fn(),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
          }),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);

      const result = await service.findOrCreateCustomer(
        'テスト患者',
        '09012345678',
        undefined,
        { lineUserId: 'Uline-user-001', displayName: 'LINE 太郎' }
      );

      expect(result).toEqual({ customerId: CUSTOMER_ID, created: false });
      expect(customerFindQuery.eq).toHaveBeenCalledWith(
        'line_user_id',
        'Uline-user-001'
      );
      expect(customerFindQuery.eq).not.toHaveBeenCalledWith(
        'normalized_phone',
        '09012345678'
      );
    });

    it('新規顧客を作成して返す', async () => {
      const client = buildClient(); // default: NO_ROWS for find, success for create
      const service = new PublicReservationService(client, CLINIC_ID);
      const result = await service.findOrCreateCustomer(
        'テスト患者',
        '09012345678',
        'patient@example.com'
      );
      expect(result).toEqual({ customerId: CUSTOMER_ID, created: true });
    });

    it('電話番号とemailがない場合は新規作成する', async () => {
      // No phone/email/LINE ID → skip lookup and go directly to insert.
      const client = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: CUSTOMER_ID },
                error: null,
              }),
            }),
          }),
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);
      const result = await service.findOrCreateCustomer(
        'テスト患者',
        undefined,
        undefined
      );
      expect(result).toEqual({ customerId: CUSTOMER_ID, created: true });
    });

    it('顧客作成失敗時は CustomerCreateError を投げる', async () => {
      // No phone/email/LINE ID → skip lookup, insert fails.
      const client = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'insert failed' },
              }),
            }),
          }),
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);
      await expect(
        service.findOrCreateCustomer('テスト患者', undefined, undefined)
      ).rejects.toThrow(CustomerCreateError);
    });
  });

  describe('createReservation', () => {
    it('予約を作成して結果を返す', async () => {
      // createReservation only does insert, so first from('reservations') = insert
      const client = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: RESERVATION_ID,
                  start_time: '2026-03-17T10:00:00.000Z',
                  end_time: '2026-03-17T11:00:00.000Z',
                  status: 'unconfirmed',
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);

      const result = await service.createReservation({
        customerId: CUSTOMER_ID,
        menuId: MENU_ID,
        resourceId: RESOURCE_ID,
        startIso: '2026-03-17T10:00:00.000Z',
        endIso: '2026-03-17T11:00:00.000Z',
        notes: null,
        channel: 'web',
      });

      expect(result).toEqual({
        id: RESERVATION_ID,
        start_time: '2026-03-17T10:00:00.000Z',
        end_time: '2026-03-17T11:00:00.000Z',
        status: 'unconfirmed',
      });
    });

    it('予約作成失敗時は ReservationCreateError を投げる', async () => {
      const client = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'insert failed' },
              }),
            }),
          }),
        }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);

      await expect(
        service.createReservation({
          customerId: CUSTOMER_ID,
          menuId: MENU_ID,
          resourceId: RESOURCE_ID,
          startIso: '2026-03-17T10:00:00.000Z',
          endIso: '2026-03-17T11:00:00.000Z',
          notes: null,
          channel: 'web',
        })
      ).rejects.toThrow(ReservationCreateError);
    });

    it('DB排他制約違反は SlotConflictError を投げる', async () => {
      const client = buildClient({
        reservations_overlap: () => ({
          insert: jest.fn().mockReturnValue({
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
          }),
        }),
      });
      const service = new PublicReservationService(client, CLINIC_ID);

      await expect(
        service.createReservation({
          customerId: CUSTOMER_ID,
          menuId: MENU_ID,
          resourceId: RESOURCE_ID,
          startIso: '2026-03-17T10:00:00.000Z',
          endIso: '2026-03-17T11:00:00.000Z',
          notes: null,
          channel: 'web',
        })
      ).rejects.toThrow(SlotConflictError);
    });
  });

  describe('rollbackCustomer', () => {
    it('作成した顧客を削除する', async () => {
      const deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });
      const client = {
        from: jest.fn().mockReturnValue({ delete: deleteMock }),
      } as any;
      const service = new PublicReservationService(client, CLINIC_ID);

      await expect(
        service.rollbackCustomer(CUSTOMER_ID)
      ).resolves.not.toThrow();
      expect(client.from).toHaveBeenCalledWith('customers');
    });
  });

  describe('calculateTimeSlot', () => {
    it('duration_minutes からend_time を計算する', () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      const { startIso, endIso } = service.calculateTimeSlot(
        '2026-03-17T10:00:00.000Z',
        60
      );
      expect(startIso).toBe('2026-03-17T10:00:00.000Z');
      expect(endIso).toBe('2026-03-17T11:00:00.000Z');
    });

    it('duration_minutes が null の場合はデフォルト60分を使う', () => {
      const client = buildClient();
      const service = new PublicReservationService(client, CLINIC_ID);
      const { startIso, endIso } = service.calculateTimeSlot(
        '2026-03-17T14:30:00.000Z',
        null
      );
      expect(startIso).toBe('2026-03-17T14:30:00.000Z');
      expect(endIso).toBe('2026-03-17T15:30:00.000Z');
    });
  });
});
