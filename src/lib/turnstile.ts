import { ERROR_CODES } from '@/lib/error-handler';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import { logger } from '@/lib/logger';

const TURNSTILE_SITEVERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TURNSTILE_TIMEOUT_MS = 3000;

type TurnstileFetch = (input: string, init: RequestInit) => Promise<Response>;

type TurnstileSiteverifyPayload = {
  success: boolean;
  'error-codes'?: string[];
};

export type TurnstileVerificationResult =
  | { ok: true; status: 'bypassed_non_production' | 'skipped_line' | 'passed' }
  | { ok: false; status: 'failed'; code: typeof ERROR_CODES.CAPTCHA_FAILED }
  | {
      ok: false;
      status: 'unavailable';
      code: typeof ERROR_CODES.CAPTCHA_UNAVAILABLE;
    };

export function isTurnstileNonProductionBypassEnabled(
  envSource: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    envSource.NODE_ENV !== 'production' &&
    envSource.TURNSTILE_BYPASS_NON_PRODUCTION === 'true'
  );
}

export function isTurnstileEnabled(
  envSource: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(
    envSource.TURNSTILE_SECRET_KEY && envSource.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
}

export function getPublicTurnstileSiteKey(
  envSource: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (
    isTurnstileNonProductionBypassEnabled(envSource) ||
    !isTurnstileEnabled(envSource)
  ) {
    return undefined;
  }

  return envSource.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

export async function verifyTurnstileForPublicReservation(params: {
  token: string | undefined;
  skipForVerifiedLine: boolean;
  remoteIp?: string;
  fetcher?: TurnstileFetch;
  timeoutMs?: number;
}): Promise<TurnstileVerificationResult> {
  if (params.skipForVerifiedLine) {
    return { ok: true, status: 'skipped_line' };
  }

  if (isTurnstileNonProductionBypassEnabled()) {
    return { ok: true, status: 'bypassed_non_production' };
  }

  if (!isTurnstileEnabled()) {
    await notifyTurnstileUnavailable(
      new Error('Turnstile configuration is incomplete'),
      'configuration_error'
    );
    return {
      ok: false,
      status: 'unavailable',
      code: ERROR_CODES.CAPTCHA_UNAVAILABLE,
    };
  }

  const token = params.token?.trim();
  if (!token) {
    return { ok: false, status: 'failed', code: ERROR_CODES.CAPTCHA_FAILED };
  }

  const result = await postTurnstileSiteverify({
    fetcher: params.fetcher ?? fetch,
    token,
    remoteIp: params.remoteIp,
    timeoutMs: params.timeoutMs ?? DEFAULT_TURNSTILE_TIMEOUT_MS,
  });

  if (result.kind === 'timeout') {
    await notifyTurnstileUnavailable(
      new Error('Turnstile siteverify timed out'),
      'timeout'
    );
    return {
      ok: false,
      status: 'unavailable',
      code: ERROR_CODES.CAPTCHA_UNAVAILABLE,
    };
  }

  if (result.kind === 'network_error') {
    await notifyTurnstileUnavailable(
      new Error(`Turnstile siteverify network error: ${result.errorName}`),
      'network_error'
    );
    return {
      ok: false,
      status: 'unavailable',
      code: ERROR_CODES.CAPTCHA_UNAVAILABLE,
    };
  }

  if (result.response.status >= 500 || result.response.status === 429) {
    await notifyTurnstileUnavailable(
      new Error(
        `Turnstile siteverify service status ${result.response.status}`
      ),
      'service_error',
      result.response.status
    );
    return {
      ok: false,
      status: 'unavailable',
      code: ERROR_CODES.CAPTCHA_UNAVAILABLE,
    };
  }

  const payload = await readTurnstilePayload(result.response);
  if (!isTurnstileSiteverifyPayload(payload)) {
    await notifyTurnstileUnavailable(
      new Error('Turnstile siteverify returned an invalid payload'),
      'invalid_response',
      result.response.status
    );
    return {
      ok: false,
      status: 'unavailable',
      code: ERROR_CODES.CAPTCHA_UNAVAILABLE,
    };
  }

  if (!payload.success) {
    return { ok: false, status: 'failed', code: ERROR_CODES.CAPTCHA_FAILED };
  }

  return { ok: true, status: 'passed' };
}

async function postTurnstileSiteverify(params: {
  fetcher: TurnstileFetch;
  token: string;
  remoteIp?: string;
  timeoutMs: number;
}): Promise<
  | { kind: 'response'; response: Response }
  | { kind: 'timeout' }
  | { kind: 'network_error'; errorName: string }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY ?? '',
      response: params.token,
    });
    if (params.remoteIp) {
      body.set('remoteip', params.remoteIp);
    }

    const response = await params.fetcher(TURNSTILE_SITEVERIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });

    return { kind: 'response', response };
  } catch (error) {
    if (isAbortError(error)) {
      return { kind: 'timeout' };
    }

    return {
      kind: 'network_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readTurnstilePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isTurnstileSiteverifyPayload(
  value: unknown
): value is TurnstileSiteverifyPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    success?: unknown;
    'error-codes'?: unknown;
  };
  return (
    typeof candidate.success === 'boolean' &&
    (candidate['error-codes'] === undefined ||
      (Array.isArray(candidate['error-codes']) &&
        candidate['error-codes'].every(item => typeof item === 'string')))
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

async function notifyTurnstileUnavailable(
  error: Error,
  reason:
    | 'configuration_error'
    | 'timeout'
    | 'network_error'
    | 'service_error'
    | 'invalid_response',
  status?: number
): Promise<void> {
  logger.warn('Turnstile verification unavailable', {
    reason,
    errorName: error.name,
    ...(status !== undefined ? { status } : {}),
  });
  await captureOperationalError(error, {
    source: 'turnstile',
    operation: 'siteverify',
    reason,
    ...(status !== undefined ? { status } : {}),
  });
}
