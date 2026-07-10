const mockCreateAdminClient = jest.fn();
const mockProcessReservationReminders = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('@/lib/notifications/reservation-reminders', () => ({
  processReservationReminders: (...args: unknown[]) =>
    mockProcessReservationReminders(...args),
}));

type RouteRequest = {
  headers: {
    get: (name: string) => string | null;
  };
};

describe('GET /api/internal/reservation-reminders', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it('rejects requests without CRON_SECRET bearer auth', async () => {
    const { GET } =
      await import('@/app/api/internal/reservation-reminders/route');

    const response = await GET({
      headers: { get: () => null },
    } as RouteRequest);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockProcessReservationReminders).not.toHaveBeenCalled();
  });

  it('processes reminders for authorized cron requests', async () => {
    const client = { from: jest.fn() };
    mockCreateAdminClient.mockReturnValue(client);
    mockProcessReservationReminders.mockResolvedValue({
      scanned: 1,
      enqueued: 1,
      skipped: 0,
      duplicates: 0,
    });
    const { GET } =
      await import('@/app/api/internal/reservation-reminders/route');

    const response = await GET({
      headers: { get: () => 'Bearer secret' },
    } as RouteRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      scanned: 1,
      enqueued: 1,
      skipped: 0,
      duplicates: 0,
    });
    expect(mockProcessReservationReminders).toHaveBeenCalledWith(client);
  });

  it('does not expose reminder processor error details', async () => {
    mockCreateAdminClient.mockReturnValue({ from: jest.fn() });
    mockProcessReservationReminders.mockRejectedValue(
      new Error('customer email patient@example.com')
    );
    const { GET } =
      await import('@/app/api/internal/reservation-reminders/route');

    const response = await GET({
      headers: { get: () => 'Bearer secret' },
    } as RouteRequest);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'Internal job failed',
      code: 'JOB_FAILED',
    });
  });
});
