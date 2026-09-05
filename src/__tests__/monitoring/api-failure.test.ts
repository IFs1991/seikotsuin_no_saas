const mockAfter = jest.fn();
const mockCapture = jest.fn().mockResolvedValue(undefined);
jest.mock('next/server', () => ({ after: mockAfter }));
jest.mock('@/lib/monitoring/sentry', () => ({
  captureOperationalError: mockCapture,
}));

describe('handled API failure monitoring', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      SENTRY_DSN: 'fixture',
    };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('queues sanitized 503/500 events after the response, with a bounded cooldown', async () => {
    const { reportApiFailure } = await import('@/lib/monitoring/api-failure');
    reportApiFailure(503);
    reportApiFailure(503);
    reportApiFailure(500);
    reportApiFailure(402);
    expect(mockAfter).toHaveBeenCalledTimes(2);
    const callback: unknown = mockAfter.mock.calls[0]?.[0];
    if (typeof callback !== 'function')
      throw new Error('Missing deferred callback');
    await callback();
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Handled server failure' }),
      { source: 'api', operation: 'handled_response', status: 503 },
      { waitForDelivery: true }
    );
  });

  it('monitoring scheduling failure cannot change the API outcome', async () => {
    mockAfter.mockImplementationOnce(() => {
      throw new Error('No request lifecycle');
    });
    const { reportApiFailure } = await import('@/lib/monitoring/api-failure');
    expect(() => reportApiFailure(503, 'readiness')).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
