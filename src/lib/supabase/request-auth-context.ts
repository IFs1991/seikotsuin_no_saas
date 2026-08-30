import 'server-only';

import type { Session, User } from '@supabase/supabase-js';

import { AppError, ERROR_CODES } from '@/lib/error-handler';
import {
  RequestTiming,
  type RequestTimingMetric,
} from '@/lib/performance/request-timing';
import { throwAuthorityUnavailable } from './auth-context';
import type { SupabaseServerClient, UserAccessContext } from './server';

class VerifiedSubjectState {
  private accessContextPromise: Promise<UserAccessContext> | null = null;
  readonly user: Readonly<User>;
  readonly session: Readonly<Session> | null;
  readonly #verifiedUserId: string;
  readonly #attenuationAccessToken: string | null;

  constructor(
    user: User,
    session: Session | null,
    private readonly client: SupabaseServerClient,
    private readonly timing: RequestTiming
  ) {
    this.#verifiedUserId = user.id;
    this.#attenuationAccessToken = session?.access_token ?? null;
    this.user = Object.freeze({ ...user });
    this.session = session ? Object.freeze({ ...session }) : null;
  }

  isBoundTo(client: SupabaseServerClient): boolean {
    return this.client === client;
  }

  getOrCreateAccessContext(
    load: () => Promise<UserAccessContext>
  ): Promise<UserAccessContext> {
    if (!this.accessContextPromise) {
      this.accessContextPromise = load().catch(error => {
        this.accessContextPromise = null;
        throw error;
      });
    }

    return this.accessContextPromise;
  }

  measure<T>(
    metric: RequestTimingMetric,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.timing.measure(metric, operation);
  }

  logTiming(label: string): void {
    this.timing.log(label);
  }

  serverTimingHeader(): string {
    return this.timing.toServerTimingHeader();
  }

  authorityInput(): Readonly<{
    userId: string;
    accessToken: string | null;
  }> {
    return {
      userId: this.#verifiedUserId,
      accessToken: this.#attenuationAccessToken,
    };
  }
}

export type VerifiedSubject = VerifiedSubjectState;

export async function resolveVerifiedSubject(
  client: SupabaseServerClient,
  requestTiming?: RequestTiming
): Promise<VerifiedSubject | null> {
  const timing = requestTiming ?? new RequestTiming();
  const userResult = await timing.measure('auth.user', () =>
    client.auth.getUser()
  );

  if (userResult.error || !userResult.data.user) {
    if (!requestTiming) {
      timing.log('auth.subject');
    }
    return null;
  }

  const sessionResult = await timing.measure('auth.session', () =>
    client.auth.getSession()
  );

  if (sessionResult.error) {
    if (!requestTiming) {
      timing.log('auth.subject');
    }
    throwAuthorityUnavailable(sessionResult.error, {
      operation: 'getAuthoritySession',
      userId: userResult.data.user.id,
    });
  }

  return new VerifiedSubjectState(
    userResult.data.user,
    sessionResult.data.session,
    client,
    timing
  );
}

export function getOrCreateVerifiedSubjectAccessContext(
  subject: VerifiedSubject,
  client: SupabaseServerClient,
  load: () => Promise<UserAccessContext>
): Promise<UserAccessContext> {
  if (!subject.isBoundTo(client)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, undefined, 403);
  }

  return subject.getOrCreateAccessContext(load);
}

export function measureVerifiedSubject<T>(
  subject: VerifiedSubject,
  metric: RequestTimingMetric,
  operation: () => Promise<T>
): Promise<T> {
  return subject.measure(metric, operation);
}

export function logVerifiedSubjectTiming(
  subject: VerifiedSubject,
  label: string
): void {
  subject.logTiming(label);
}

export function getVerifiedSubjectServerTiming(
  subject: VerifiedSubject
): string {
  return subject.serverTimingHeader();
}

export function getVerifiedSubjectAuthorityInput(
  subject: VerifiedSubject
): Readonly<{ userId: string; accessToken: string | null }> {
  return subject.authorityInput();
}
