import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';

import { logPerfMetrics, nowMs } from './server-timing';

export type RequestTimingMetric =
  | 'auth.user'
  | 'auth.session'
  | 'authority.permissions'
  | 'authority.profile'
  | 'authority.clinic_scope'
  | 'business'
  | 'audit'
  | 'total';

const SERVER_TIMING_NAMES: Readonly<Record<RequestTimingMetric, string>> = {
  'auth.user': 'auth_user',
  'auth.session': 'auth_session',
  'authority.permissions': 'permissions',
  'authority.profile': 'profile',
  'authority.clinic_scope': 'clinic_scope',
  business: 'business',
  audit: 'audit',
  total: 'total',
};

const requestTimingStorage = new AsyncLocalStorage<RequestTiming>();

export class RequestTiming {
  private readonly startedAt = nowMs();
  private readonly durations = new Map<RequestTimingMetric, number>();
  private businessStartedAt: number | null = null;
  private auditDurationAtBusinessStart = 0;
  private completionScheduled = false;
  private completed = false;

  async measure<T>(
    metric: RequestTimingMetric,
    operation: () => Promise<T>
  ): Promise<T> {
    const startedAt = nowMs();
    try {
      return await operation();
    } finally {
      this.add(metric, nowMs() - startedAt);
    }
  }

  add(metric: RequestTimingMetric, durationMs: number): void {
    const normalizedDuration = Math.max(0, durationMs);
    this.durations.set(
      metric,
      (this.durations.get(metric) ?? 0) + normalizedDuration
    );
  }

  finish(): void {
    if (!this.durations.has('total')) {
      this.add('total', nowMs() - this.startedAt);
    }
  }

  scheduleCompletion(label: string): void {
    if (this.completionScheduled) {
      return;
    }

    this.completionScheduled = true;
    this.businessStartedAt = nowMs();
    this.auditDurationAtBusinessStart = this.durations.get('audit') ?? 0;

    const complete = () => {
      if (this.completed) {
        return;
      }

      this.completed = true;
      const auditDurationAfterBusinessStart = Math.max(
        0,
        (this.durations.get('audit') ?? 0) - this.auditDurationAtBusinessStart
      );
      this.add(
        'business',
        Math.max(
          0,
          nowMs() -
            (this.businessStartedAt ?? nowMs()) -
            auditDurationAfterBusinessStart
        )
      );
      this.durations.set('total', Math.max(0, nowMs() - this.startedAt));
      logPerfMetrics(label, this.toStructuredMetrics());
    };

    try {
      after(complete);
    } catch {
      // Unit tests and non-route callers have no Next.js request context.
      // Complete immediately there; production Route Handlers use `after()`.
      complete();
    }
  }

  toServerTimingHeader(): string {
    this.finish();
    return Array.from(this.durations.entries())
      .map(([metric, duration]) => {
        const roundedDuration = Math.round(duration * 10) / 10;
        return `${SERVER_TIMING_NAMES[metric]};dur=${roundedDuration}`;
      })
      .join(', ');
  }

  toStructuredMetrics(): Readonly<Record<string, number>> {
    this.finish();
    return Object.fromEntries(
      Array.from(this.durations.entries()).map(([metric, duration]) => [
        SERVER_TIMING_NAMES[metric],
        Math.round(duration * 10) / 10,
      ])
    );
  }

  log(label: string): void {
    logPerfMetrics(label, this.toStructuredMetrics());
  }
}

export function bindRequestTiming(timing: RequestTiming): void {
  requestTimingStorage.enterWith(timing);
}

export async function measureCurrentRequestTiming<T>(
  metric: RequestTimingMetric,
  operation: () => Promise<T>
): Promise<T> {
  const timing = requestTimingStorage.getStore();
  return timing ? await timing.measure(metric, operation) : await operation();
}
