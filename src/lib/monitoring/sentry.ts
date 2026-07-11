type SentryInitModule = {
  init: (options: Record<string, unknown>) => void;
};

type SentryExceptionModule = {
  captureException: (
    error: Error,
    context?: { tags?: Record<string, string> }
  ) => string | undefined;
};

type SentryRequestErrorModule = {
  captureRequestError?: (...args: unknown[]) => unknown;
};

type SentryRuntime = 'client' | 'server' | 'edge';

export type OperationalErrorContext = {
  source: string;
  operation?: string;
  endpoint?: string;
  reason?: string;
  status?: number;
};

export function isSentryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.SENTRY_DSN === 'string' && env.SENTRY_DSN.length > 0;
}

export function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return (
    env.SENTRY_RELEASE ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  );
}

export function buildSentryInitOptions(runtime: SentryRuntime) {
  const release = resolveSentryRelease();
  const options = {
    dsn: process.env.SENTRY_DSN,
    enabled: true,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    _runtime: runtime,
  };

  return release ? { ...options, release } : options;
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

function createRedactedError(error: unknown): Error {
  const candidateName = error instanceof Error ? error.name.trim() : '';
  const errorName = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidateName)
    ? candidateName
    : 'UnknownError';
  const redacted = new Error('Operational error details redacted');
  redacted.name = errorName;

  if (error instanceof Error && error.stack) {
    const stackFrames = error.stack.split('\n').slice(1).join('\n');
    if (stackFrames) {
      redacted.stack = `${redacted.name}: ${redacted.message}\n${stackFrames}`;
    }
  }

  return redacted;
}

function createOperationalErrorTags(
  context: OperationalErrorContext
): Record<string, string> {
  return {
    source: context.source,
    ...(context.operation ? { operation: context.operation } : {}),
    ...(context.endpoint ? { endpoint: context.endpoint } : {}),
    ...(context.reason ? { reason: context.reason } : {}),
    ...(context.status !== undefined
      ? { status: context.status.toString() }
      : {}),
  };
}

export function captureRedactedException(
  sentry: SentryExceptionModule,
  error: unknown,
  context: OperationalErrorContext
): string | undefined {
  return sentry.captureException(createRedactedError(error), {
    tags: createOperationalErrorTags(context),
  });
}

export async function captureOperationalError(
  error: unknown,
  context: OperationalErrorContext
): Promise<void> {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    const sentry = await import('@sentry/nextjs');
    captureRedactedException(sentry, error, context);
  } catch {
    // Monitoring must never replace the original application response.
  }
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
