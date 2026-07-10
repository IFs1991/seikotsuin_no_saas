describe('Sentry monitoring setup', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not initialize Sentry when SENTRY_DSN is missing', async () => {
    delete process.env.SENTRY_DSN;

    const initMock = jest.fn();
    const { initSentry, isSentryEnabled } =
      await import('@/lib/monitoring/sentry');

    const initialized = initSentry({ init: initMock }, 'server');

    expect(isSentryEnabled()).toBe(false);
    expect(initialized).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('initializes Sentry when SENTRY_DSN is configured', async () => {
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    process.env.NODE_ENV = 'production';

    const initMock = jest.fn();
    const { buildSentryInitOptions, initSentry } =
      await import('@/lib/monitoring/sentry');

    expect(buildSentryInitOptions('edge')).toEqual(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        enabled: true,
        environment: 'production',
        tracesSampleRate: 0,
        sendDefaultPii: false,
        _runtime: 'edge',
      })
    );

    const initialized = initSentry({ init: initMock }, 'edge');

    expect(initialized).toBe(true);
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        enabled: true,
        environment: 'production',
      })
    );
  });

  it('adds release metadata when available and keeps default PII disabled', async () => {
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    process.env.SENTRY_RELEASE = 'seikotsuin@0.1.0-pilot+abc123';

    const { buildSentryInitOptions } = await import('@/lib/monitoring/sentry');

    expect(buildSentryInitOptions('server')).toEqual(
      expect.objectContaining({
        release: 'seikotsuin@0.1.0-pilot+abc123',
        sendDefaultPii: false,
      })
    );
  });

  it('creates a Sentry test event with actor context', async () => {
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

    const captureExceptionMock = jest.fn().mockReturnValue('event-123');
    const { createSentryTestEvent } = await import('@/lib/monitoring/sentry');

    const eventId = createSentryTestEvent(
      { captureException: captureExceptionMock },
      'admin-1'
    );

    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Sentry test event from admin-1',
      })
    );
    expect(eventId).toBe('event-123');
  });

  it('captures operational errors with redacted details and safe tags', async () => {
    const captureExceptionMock = jest.fn().mockReturnValue('event-456');
    const { captureRedactedException } =
      await import('@/lib/monitoring/sentry');

    const eventId = captureRedactedException(
      { captureException: captureExceptionMock },
      new Error('patient@example.com token=secret'),
      {
        source: 'cron',
        operation: 'process-email-outbox',
        endpoint: '/api/internal/process-email-outbox',
        status: 500,
      }
    );

    const capturedError = captureExceptionMock.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe('Operational error details redacted');
    expect(capturedError.stack).not.toContain('patient@example.com');
    expect(capturedError.stack).not.toContain('token=secret');
    expect(captureExceptionMock).toHaveBeenCalledWith(capturedError, {
      tags: {
        source: 'cron',
        operation: 'process-email-outbox',
        endpoint: '/api/internal/process-email-outbox',
        status: '500',
      },
    });
    expect(eventId).toBe('event-456');
  });

  it('delegates request errors to Sentry only when enabled', async () => {
    const captureRequestErrorMock = jest.fn();
    const request = {
      path: '/api/test',
      method: 'GET',
      headers: {},
    };
    const context = {
      routerKind: 'App Router',
      routePath: '/app/api/test/route',
      routeType: 'route',
      renderSource: 'server-rendering',
      revalidateReason: undefined,
      renderType: 'dynamic',
    };
    const error = new Error('boom');

    const { captureRequestError } = await import('@/lib/monitoring/sentry');

    await captureRequestError(
      { captureRequestError: captureRequestErrorMock },
      error,
      request,
      context
    );
    expect(captureRequestErrorMock).not.toHaveBeenCalled();

    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

    await captureRequestError(
      { captureRequestError: captureRequestErrorMock },
      error,
      request,
      context
    );
    expect(captureRequestErrorMock).toHaveBeenCalledWith(
      error,
      request,
      context
    );
  });
});
