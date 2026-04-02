jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

import { createAdminClient } from '@/lib/supabase';

const createAdminClientMock = createAdminClient as jest.Mock;

const VALID_CLINIC_ID = '00000000-0000-0000-0000-000000000101';
const VALID_MENU_ID = '00000000-0000-0000-0000-000000000201';
const VALID_RESOURCE_ID = '00000000-0000-0000-0000-000000000301';
const VALID_CUSTOMER_ID = '00000000-0000-0000-0000-000000000401';
const VALID_RESERVATION_ID = '00000000-0000-0000-0000-000000000501';
const EMPTY_LIST = { data: [], error: null };

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

const createEqChain = (result: unknown, finalMethod: 'single' | 'maybeSingle' = 'single') => {
  const terminal = jest.fn().mockResolvedValue(result);
  const chain: Record<string, jest.Mock> = {
    eq: jest.fn(),
    [finalMethod]: terminal,
  };
  chain.eq.mockReturnValue(chain);
  return chain;
};

describe('POST /api/public/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('booking_calendar レコードが存在しない場合は 403 を返す', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'clinic_settings') {
          return {
            select: jest.fn().mockReturnValue(
              createEqChain(
                {
                  data: null,
                  error: { code: 'PGRST116', message: 'No rows found' },
                },
                'single'
              )
            ),
          };
        }

        throw new Error(`Unexpected table access: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(supabase);

    const { POST } = await import('@/app/api/public/reservations/route');

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Online booking is disabled for this clinic',
    });
  });

  it('allowOnlineBooking=false の場合は 403 を返す', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'clinic_settings') {
          return {
            select: jest.fn().mockReturnValue(
              createEqChain({
                data: {
                  settings: {
                    allowOnlineBooking: false,
                  },
                },
                error: null,
              })
            ),
          };
        }

        throw new Error(`Unexpected table access: ${table}`);
      }),
    };

    createAdminClientMock.mockReturnValue(supabase);

    const { POST } = await import('@/app/api/public/reservations/route');

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Online booking is disabled for this clinic',
    });
  });

  it('allowOnlineBooking=true の場合は既存の予約作成フローを継続する', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        switch (table) {
          case 'clinic_settings':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    settings: {
                      allowOnlineBooking: true,
                    },
                  },
                  error: null,
                })
              ),
            };
          case 'clinics':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_CLINIC_ID,
                    name: 'テスト整骨院',
                    is_active: true,
                  },
                  error: null,
                })
              ),
            };
          case 'menus':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_MENU_ID,
                    name: '標準施術',
                    duration_minutes: 60,
                    price: 5000,
                  },
                  error: null,
                })
              ),
            };
          case 'resources':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_RESOURCE_ID,
                  },
                  error: null,
                })
              ),
            };
          case 'blocks':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                      gt: jest.fn().mockResolvedValue(EMPTY_LIST),
                    }),
                  }),
                }),
              }),
            };
          case 'customers':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: null,
                  error: { code: 'PGRST116', message: 'No rows found' },
                })
              ),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: VALID_CUSTOMER_ID,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          case 'reservations':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                      gt: jest.fn().mockResolvedValue(EMPTY_LIST),
                    }),
                  }),
                }),
              }),
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: VALID_RESERVATION_ID,
                      start_time: '2026-03-17T10:00:00.000Z',
                      end_time: '2026-03-17T11:00:00.000Z',
                      status: 'pending',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          default:
            throw new Error(`Unexpected table access: ${table}`);
        }
      }),
    };

    createAdminClientMock.mockReturnValue(supabase);

    const { POST } = await import('@/app/api/public/reservations/route');

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
      status: 'pending',
    });
  });

  it('重複予約がある場合は 409 を返す', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        switch (table) {
          case 'clinic_settings':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    settings: {
                      allowOnlineBooking: true,
                    },
                  },
                  error: null,
                })
              ),
            };
          case 'clinics':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_CLINIC_ID,
                    name: 'テスト整骨院',
                    is_active: true,
                  },
                  error: null,
                })
              ),
            };
          case 'menus':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_MENU_ID,
                    name: '標準施術',
                    duration_minutes: 60,
                    price: 5000,
                  },
                  error: null,
                })
              ),
            };
          case 'resources':
            return {
              select: jest.fn().mockReturnValue(
                createEqChain({
                  data: {
                    id: VALID_RESOURCE_ID,
                  },
                  error: null,
                })
              ),
            };
          case 'reservations':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                      gt: jest.fn().mockResolvedValue({
                        data: [{ id: VALID_RESERVATION_ID }],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          case 'blocks':
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    lt: jest.fn().mockReturnValue({
                      gt: jest.fn().mockResolvedValue(EMPTY_LIST),
                    }),
                  }),
                }),
              }),
            };
          default:
            throw new Error(`Unexpected table access: ${table}`);
        }
      }),
    };

    createAdminClientMock.mockReturnValue(supabase);

    const { POST } = await import('@/app/api/public/reservations/route');

    const response = await POST(buildRequest(buildValidBody()));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      success: false,
      error: 'Requested time slot is not available',
    });
  });
});
