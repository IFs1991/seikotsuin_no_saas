import * as Sentry from '@sentry/nextjs';

import { captureRequestError, isSentryEnabled } from '@/lib/monitoring/sentry';

export async function register() {
  if (!isSentryEnabled()) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export async function onRequestError(...args: unknown[]) {
  await captureRequestError(Sentry, ...args);
}
