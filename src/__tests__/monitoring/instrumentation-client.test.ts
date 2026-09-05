describe('instrumentation-client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not initialize Sentry when SENTRY_DSN is missing', async () => {
    delete process.env.SENTRY_DSN;

    const initMock = jest.fn();
    jest.doMock('@sentry/nextjs', () => ({ init: initMock }), {
      virtual: true,
    });

    await import('../../../instrumentation-client');

    expect(initMock).not.toHaveBeenCalled();
  });

  it('initializes the browser with its build-time public DSN', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://public@example.ingest.sentry.io/1';
    process.env.NODE_ENV = 'production';

    const initMock = jest.fn();
    jest.doMock('@sentry/nextjs', () => ({ init: initMock }), {
      virtual: true,
    });

    await import('../../../instrumentation-client');

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        enabled: true,
        environment: 'production',
      })
    );
  });
});
