import 'server-only';
import { after } from 'next/server';
import { captureOperationalError } from '@/lib/monitoring/sentry';

const lastReported = new Map<string, number>();
const COOLDOWN_MS = 60_000;

// Deliberately accept no request, body, error text, identifiers or arbitrary tags.
// This is a per-process notification cooldown, not a distributed rate limiter.
export function reportApiFailure(
  status: number,
  source: 'api' | 'readiness' = 'api'
): void {
  if (
    process.env.NODE_ENV !== 'production' ||
    !process.env.SENTRY_DSN ||
    !Number.isInteger(status) ||
    status < 500 ||
    status > 599
  )
    return;
  const key = `${source}:${status}`;
  const now = Date.now();
  const previous = lastReported.get(key);
  if (previous !== undefined && now - previous < COOLDOWN_MS) return;
  try {
    after(async () => {
      await captureOperationalError(
        new Error('Handled server failure'),
        { source, operation: 'handled_response', status },
        { waitForDelivery: true }
      );
    });
    lastReported.set(key, now);
  } catch {
    // Monitoring must not replace the application response outside a lifecycle.
  }
}
