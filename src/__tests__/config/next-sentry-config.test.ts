describe('next.config.js Sentry integration', () => {
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

  it('does not wrap next config with Sentry when SENTRY_DSN is missing', () => {
    delete process.env.SENTRY_DSN;

    const withSentryConfig = jest.fn(config => ({
      ...config,
      sentryWrapped: true,
    }));

    jest.doMock('@sentry/nextjs', () => ({ withSentryConfig }), {
      virtual: true,
    });

    const config = require('../../../next.config.js');

    expect(withSentryConfig).not.toHaveBeenCalled();
    expect(config.output).toBe('standalone');
  });

  it.each(['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'])(
    'wraps next config when %s is configured',
    key => {
      process.env[key] = 'https://public@example.ingest.sentry.io/1';

      const withSentryConfig = jest.fn(config => ({
        ...config,
        sentryWrapped: true,
      }));

      jest.doMock('@sentry/nextjs', () => ({ withSentryConfig }), {
        virtual: true,
      });

      const config = require('../../../next.config.js');

      expect(withSentryConfig).toHaveBeenCalledTimes(1);
      expect(withSentryConfig).toHaveBeenCalledWith(
        expect.objectContaining({ output: 'standalone' }),
        expect.objectContaining({
          silent: true,
          sourcemaps: { deleteSourcemapsAfterUpload: true },
        })
      );
      expect(config.sentryWrapped).toBe(true);
      expect(config.output).toBe('standalone');
    }
  );
});
