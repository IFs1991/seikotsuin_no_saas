const mockCreateAdminClient = jest.fn();
const mockProcessLineOutbox = jest.fn();

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

jest.mock('@/lib/notifications/line-processor', () => ({
  processLineOutbox: (...args: unknown[]) => mockProcessLineOutbox(...args),
}));

type RouteRequest = {
  headers: {
    get: (name: string) => string | null;
  };
};

describe('GET /api/internal/process-line-outbox', () => {
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
      await import('@/app/api/internal/process-line-outbox/route');

    const response = await GET({
      headers: { get: () => null },
    } as RouteRequest);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockProcessLineOutbox).not.toHaveBeenCalled();
  });

  it('processes LINE outbox for authorized cron requests', async () => {
    const client = { from: jest.fn() };
    mockCreateAdminClient.mockReturnValue(client);
    mockProcessLineOutbox.mockResolvedValue({
      processed: 1,
      sent: 1,
      retried: 0,
      failed: 0,
      fallbackEnqueued: 0,
      skipped: 0,
    });
    const { GET } =
      await import('@/app/api/internal/process-line-outbox/route');

    const response = await GET({
      headers: { get: () => 'Bearer secret' },
    } as RouteRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      processed: 1,
      sent: 1,
      retried: 0,
      failed: 0,
      fallbackEnqueued: 0,
      skipped: 0,
    });
    expect(mockProcessLineOutbox).toHaveBeenCalledWith(client);
  });

  it('does not expose processor error details', async () => {
    mockCreateAdminClient.mockReturnValue({ from: jest.fn() });
    mockProcessLineOutbox.mockRejectedValue(
      new Error('database password=secret')
    );
    const { GET } =
      await import('@/app/api/internal/process-line-outbox/route');

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
