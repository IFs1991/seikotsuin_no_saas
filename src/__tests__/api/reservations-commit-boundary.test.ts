import { NextRequest } from 'next/server';

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reservationId = '123e4567-e89b-12d3-a456-426614174001';
const customerId = '123e4567-e89b-12d3-a456-426614174002';
const menuId = '123e4567-e89b-12d3-a456-426614174003';
const staffId = '123e4567-e89b-12d3-a456-426614174004';
const version = '2026-09-06T01:00:00.123456+00:00';
const mockCreated = jest.fn(async (..._args: unknown[]) => undefined);
const mockChanged = jest.fn(async (..._args: unknown[]) => undefined);
const mockCapture = jest.fn(async (..._args: unknown[]) => undefined);
let mockProjection: 'error' | 'missing' | 'ok' = 'error';
let mockConcurrent = false;
let mockWrites = 0;
let mockProjectionReads = 0;
let mockDto: Record<string, unknown>;
let mockUpdateFilters: Map<string, unknown>;

const savedRow = {
  id: reservationId,
  clinic_id: clinicId,
  customer_id: customerId,
  menu_id: menuId,
  staff_id: staffId,
  status: 'confirmed',
  channel: 'phone',
  start_time: '2026-09-06T10:00:00Z',
  end_time: '2026-09-06T10:30:00Z',
  notes: '保存済みメモ',
  selected_options: [],
  intake_responses: [],
  is_staff_requested: false,
  staff_nomination_fee: 0,
  updated_at: version,
  booker_phone: 'PRIVATE-PHONE',
  created_by: 'PRIVATE-ACTOR',
};

class Query {
  private operation: 'read' | 'insert' | 'update' = 'read';
  private filters = new Map<string, unknown>();
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.set(key, value);
    return this;
  }
  insert() {
    this.operation = 'insert';
    return this;
  }
  update() {
    this.operation = 'update';
    return this;
  }
  async maybeSingle() {
    return this.single();
  }
  async single() {
    if (this.table === 'reservation_list_view') {
      mockProjectionReads += 1;
      return {
        data:
          mockProjection === 'ok'
            ? {
                ...savedRow,
                customer_name: '患者',
                staff_name: '担当',
                menu_name: '施術',
              }
            : null,
        error:
          mockProjection === 'error'
            ? { code: '08006', message: 'PRIVATE-DATABASE-ERROR' }
            : null,
      };
    }
    if (this.table === 'reservations') {
      if (this.operation === 'update') {
        mockUpdateFilters = this.filters;
        if (mockConcurrent && this.filters.get('updated_at') === version) {
          return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
        }
      }
      if (this.operation !== 'read') mockWrites += 1;
      return { data: savedRow, error: null };
    }
    return {
      data: {
        id: staffId,
        type: 'staff',
        is_deleted: false,
        is_active: true,
        is_bookable: true,
        nomination_fee: 0,
        price: 1000,
      },
      error: null,
    };
  }
}
const mockClient = { from: (table: string) => new Query(table) };

jest.mock('@/lib/route-helpers', () => ({
  ...jest.requireActual('@/lib/route-helpers'),
  processClinicScopedBody: jest.fn(async () => ({
    success: true,
    dto: mockDto,
    supabase: mockClient,
    auth: { id: 'actor', role: 'staff' },
    permissions: {
      role: 'staff',
      clinic_id: clinicId,
      clinic_scope_ids: [clinicId],
    },
  })),
}));
jest.mock('@/lib/supabase', () => ({
  ...jest.requireActual('@/lib/supabase'),
  createScopedAdminContext: () => ({
    client: mockClient,
    assertClinicInScope: () => undefined,
  }),
}));
jest.mock('@/lib/reservations/conflict', () => ({
  ...jest.requireActual('@/lib/reservations/conflict'),
  hasReservationConflict: async () => false,
}));
jest.mock('@/lib/notifications/email/reservation-enqueue', () => ({
  enqueueReservationCreated: (...args: unknown[]) => mockCreated(...args),
  enqueueReservationChange: (...args: unknown[]) => mockChanged(...args),
}));
jest.mock('@/lib/monitoring/sentry', () => ({
  captureOperationalError: (...args: unknown[]) => mockCapture(...args),
}));
jest.mock('@/lib/mobile-uiux/entitlements', () => ({
  fetchMobileUiuxClinicEntitlement: async () => ({
    status: 'enabled',
    enabled: true,
  }),
}));
jest.mock('@/lib/mobile-uiux/flags', () => ({
  ...jest.requireActual('@/lib/mobile-uiux/flags'),
  getMobileUiuxFlags: () => ({
    enabled: true,
    realDataEnabled: true,
    allowedClinicIds: [clinicId],
  }),
  areMobileUiuxWritesEnabled: () => true,
}));

describe.each(['standard', 'mobile'] as const)('%s 予約の保存境界', route => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConcurrent = false;
    mockWrites = 0;
    mockProjectionReads = 0;
    mockUpdateFilters = new Map();
    mockDto = {
      clinic_id: clinicId,
      id: reservationId,
      customerId,
      menuId,
      staffId,
      startTime: savedRow.start_time,
      endTime: savedRow.end_time,
      channel: 'phone',
      status: 'cancelled',
    };
  });

  async function invoke(method: 'POST' | 'PATCH') {
    const handlers =
      route === 'standard'
        ? await import('@/app/api/reservations/route')
        : await import('@/app/api/mobile-uiux/reservations/route');
    return handlers[method](
      new NextRequest('http://localhost/api/reservations', { method })
    );
  }

  it.each(['POST', 'PATCH'] as const)(
    '%s 保存後のview障害を再保存不要な成功として返す',
    async method => {
      mockProjection = 'error';
      const response = await invoke(method);
      const json = await response.json();
      expect(mockWrites).toBe(1);
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(json.success).toBe(true);
      const reservation =
        route === 'standard' ? json.data : json.data.reservation;
      expect(reservation).toMatchObject({
        id: reservationId,
        projectionStatus: 'unavailable',
        startTime: savedRow.start_time,
      });
      expect(JSON.stringify(json)).not.toContain('PRIVATE-');
      expect(mockWrites).toBe(1);
      expect(
        method === 'POST' ? mockCreated : mockChanged
      ).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), {
        source: 'reservation-projection',
        operation: 'read_after_commit',
        status: 503,
      });
    }
  );

  it.each(['POST', 'PATCH'] as const)(
    '%s 保存後のview欠落も保存済みを維持する',
    async method => {
      mockProjection = 'missing';
      const response = await invoke(method);
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(mockWrites).toBe(1);
    }
  );

  it.each(['POST', 'PATCH'] as const)(
    '%s 通知handoffが失敗で決着するまでprojectionと応答を待ち、保存成功を保つ',
    async method => {
      mockProjection = 'error';
      let markEnqueueStarted: () => void = () => undefined;
      const enqueueStarted = new Promise<void>(resolve => {
        markEnqueueStarted = resolve;
      });
      let failEnqueue: () => void = () => undefined;
      const pendingEnqueue = new Promise<void>((_resolve, reject) => {
        failEnqueue = () => reject(new Error('synthetic handoff failure'));
      });
      const enqueue = method === 'POST' ? mockCreated : mockChanged;
      enqueue.mockImplementationOnce(async () => {
        markEnqueueStarted();
        await pendingEnqueue;
        return undefined;
      });
      let responseSettled = false;
      const responsePromise = invoke(method).then(response => {
        responseSettled = true;
        return response;
      });

      await enqueueStarted;
      expect(mockWrites).toBe(1);
      expect(mockProjectionReads).toBe(0);
      expect(responseSettled).toBe(false);
      failEnqueue();

      const response = await responsePromise;
      const json = await response.json();
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(mockWrites).toBe(1);
      expect(mockProjectionReads).toBe(1);
      const reservation =
        route === 'standard' ? json.data : json.data.reservation;
      expect(reservation.projectionStatus).toBe('unavailable');
      expect(JSON.stringify(json)).not.toContain('synthetic handoff failure');
    }
  );

  it.each([
    { status: 'cancelled' },
    { startTime: '2026-09-06T11:00:00Z', endTime: '2026-09-06T11:30:00Z' },
    { staffId },
  ])('PATCH競合は409になり保存も通知もしない: %j', async changes => {
    mockDto = { clinic_id: clinicId, id: reservationId, ...changes };
    mockProjection = 'ok';
    mockConcurrent = true;
    const response = await invoke('PATCH');
    expect(response.status).toBe(409);
    expect(mockUpdateFilters.get('updated_at')).toBe(version);
    expect(mockUpdateFilters.get('clinic_id')).toBe(clinicId);
    expect(mockWrites).toBe(0);
    expect(mockChanged).not.toHaveBeenCalled();
  });
});
