import type { Event } from '@sentry/nextjs';

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

export function isSentryEnabled(
  env: NodeJS.ProcessEnv = process.env,
  runtime: SentryRuntime = 'server'
): boolean {
  const dsn =
    runtime === 'client' ? env.NEXT_PUBLIC_SENTRY_DSN : env.SENTRY_DSN;
  return typeof dsn === 'string' && dsn.length > 0;
}

function safeFrameFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const path = filename.replace(/\\/g, '/').split(/[?#]/)[0];
  return (
    path.match(
      /(?:_next\/static\/|\.next\/server\/|src\/)[A-Za-z0-9_./()[\]-]+\.(?:[cm]?js|tsx?)$/
    )?.[0] ?? '<redacted>'
  );
}

// Automatic SDK exceptions can otherwise carry request bodies, breadcrumbs and
// patient strings even with sendDefaultPii=false. Allow only diagnostic fields.
export function redactSentryEvent(event: Event): Event {
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    tags: Object.fromEntries(
      Object.entries(event.tags ?? {}).filter(
        ([key, value]) =>
          ['source', 'operation', 'endpoint', 'reason', 'status'].includes(
            key
          ) &&
          typeof value === 'string' &&
          /^[A-Za-z0-9_./:-]{1,120}$/.test(value)
      )
    ),
    exception: event.exception
      ? {
          values: event.exception.values?.map(value => ({
            type: 'Error',
            value: 'Operational error details redacted',
            stacktrace: {
              frames: value.stacktrace?.frames?.map(frame => ({
                filename: safeFrameFilename(frame.filename),
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              })),
            },
          })),
        }
      : undefined,
  };
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
    dsn:
      runtime === 'client'
        ? process.env.NEXT_PUBLIC_SENTRY_DSN
        : process.env.SENTRY_DSN,
    enabled: true,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: redactSentryEvent,
    _runtime: runtime,
  };

  return release ? { ...options, release } : options;
}

export function initSentry(
  sentry: SentryInitModule,
  runtime: SentryRuntime
): boolean {
  // Client public env values are replaced at build time only at direct accesses.
  const options = buildSentryInitOptions(runtime);
  if (!options.dsn) {
    return false;
  }

  sentry.init(options);

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
  context: OperationalErrorContext,
  options: { waitForDelivery?: boolean } = {}
): Promise<void> {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    const sentry = await import('@sentry/nextjs');
    captureRedactedException(sentry, error, context);
    if (options.waitForDelivery) await sentry.flush(2000);
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
