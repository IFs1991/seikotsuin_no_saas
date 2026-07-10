import { NextRequest } from 'next/server';

const mockCreateAdminClient = jest.fn();
const mockProcessEmailOutbox = jest.fn();
const mockEmailProvider = { send: jest.fn() };

jest.mock('@/lib/supabase', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('@/lib/notifications/email/resend-provider', () => ({
  ResendEmailProvider: jest.fn().mockImplementation(() => mockEmailProvider),
}));

jest.mock('@/lib/notifications/email/processor', () => ({
  processEmailOutbox: (...args: unknown[]) => mockProcessEmailOutbox(...args),
}));

describe('GET /api/internal/process-email-outbox', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }
    process.env.CRON_SECRET = originalCronSecret;
  });

  it('rejects requests without CRON_SECRET bearer auth', async () => {
    const { GET } =
      await import('@/app/api/internal/process-email-outbox/route');

    const response = await GET(
      new NextRequest('http://localhost/api/internal/process-email-outbox')
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockProcessEmailOutbox).not.toHaveBeenCalled();
  });

  it('processes email outbox for authorized cron requests', async () => {
    const client = { from: jest.fn() };
    mockCreateAdminClient.mockReturnValue(client);
    mockProcessEmailOutbox.mockResolvedValue({
      processed: 1,
      succeeded: 1,
      failed: 0,
    });
    const { GET } =
      await import('@/app/api/internal/process-email-outbox/route');

    const response = await GET(
      new NextRequest('http://localhost/api/internal/process-email-outbox', {
        headers: { authorization: 'Bearer secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      processed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(mockProcessEmailOutbox).toHaveBeenCalledWith(
      client,
      mockEmailProvider
    );
  });

  it('does not expose processor error details', async () => {
    mockCreateAdminClient.mockReturnValue({ from: jest.fn() });
    mockProcessEmailOutbox.mockRejectedValue(
      new Error('provider token=secret patient@example.com')
    );
    const { GET } =
      await import('@/app/api/internal/process-email-outbox/route');

    const response = await GET(
      new NextRequest('http://localhost/api/internal/process-email-outbox', {
        headers: { authorization: 'Bearer secret' },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Internal job failed',
      code: 'JOB_FAILED',
    });
  });
});
