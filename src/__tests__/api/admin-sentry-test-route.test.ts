import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;

describe('POST /api/admin/monitoring/sentry-test', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 503 when Sentry is not configured', async () => {
    delete process.env.SENTRY_DSN;
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      supabase: {},
    });

    const { POST } = await import('@/app/api/admin/monitoring/sentry-test/route');
    const response = await POST(
      new Request('http://localhost/api/admin/monitoring/sentry-test', {
        method: 'POST',
      }) as any
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
  });

  it('captures a test exception and returns an event id when configured', async () => {
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      supabase: {},
    });

    const { captureException } = await import('@sentry/nextjs');
    (captureException as jest.Mock).mockReturnValue('event-123');

    const { POST } = await import('@/app/api/admin/monitoring/sentry-test/route');
    const response = await POST(
      new Request('http://localhost/api/admin/monitoring/sentry-test', {
        method: 'POST',
      }) as any
    );
    const body = await response.json();

    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.eventId).toBe('event-123');
  });
});
