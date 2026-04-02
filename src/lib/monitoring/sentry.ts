type SentryInitModule = {
  init: (options: Record<string, unknown>) => void;
};

type SentryExceptionModule = {
  captureException: (error: Error) => string | undefined;
};

type SentryRequestErrorModule = {
  captureRequestError?: (...args: unknown[]) => unknown;
};

type SentryRuntime = 'client' | 'server' | 'edge';

export function isSentryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.SENTRY_DSN === 'string' && env.SENTRY_DSN.length > 0;
}

export function buildSentryInitOptions(runtime: SentryRuntime) {
  return {
    dsn: process.env.SENTRY_DSN,
    enabled: true,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    _runtime: runtime,
  };
}

export function initSentry(
  sentry: SentryInitModule,
  runtime: SentryRuntime
): boolean {
  if (!isSentryEnabled()) {
    return false;
  }

  sentry.init(buildSentryInitOptions(runtime));

  return true;
}

export function createSentryTestEvent(
  sentry: SentryExceptionModule,
  actorId: string
): string | undefined {
  return sentry.captureException(
    new Error(`Sentry test event from ${actorId}`)
  );
}

export async function captureRequestError(
  sentry: SentryRequestErrorModule,
  ...args: unknown[]
) {
  if (!isSentryEnabled() || typeof sentry.captureRequestError !== 'function') {
    return;
  }

  return await sentry.captureRequestError(...args);
}
