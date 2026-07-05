import { createLogger } from '@/lib/logger';
import { resolveLinePublicBookingContext } from '@/lib/line/public-booking';
import type { SupabaseServerClient } from '@/lib/supabase';

const LINE_ID_TOKEN_VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';
const DEFAULT_VERIFY_TIMEOUT_MS = 3000;

type LineIdTokenClient = Pick<SupabaseServerClient, 'from'>;
type LineIdTokenFetch = (input: string, init: RequestInit) => Promise<Response>;

type LineIdTokenVerifyPayload = {
  sub: string;
  aud: string;
  exp: number;
  name?: string;
};

export type LineIdTokenVerificationFailureReason =
  | 'not_configured'
  | 'aud_mismatch'
  | 'expired'
  | 'timeout'
  | 'verify_failed'
  | 'invalid_response';

export type LineIdTokenVerificationResult =
  | {
      ok: true;
      lineUserId: string;
      displayName: string | null;
      audience: string;
    }
  | {
      ok: false;
      reason: LineIdTokenVerificationFailureReason;
      status?: number;
    };

const log = createLogger('LineIdToken');

export async function verifyLineIdTokenForClinic(params: {
  supabase: LineIdTokenClient;
  clinicId: string;
  idToken: string;
  now?: Date;
  fetcher?: LineIdTokenFetch;
  timeoutMs?: number;
}): Promise<LineIdTokenVerificationResult> {
  const context = await resolveLinePublicBookingContext({
    supabase: params.supabase,
    clinicId: params.clinicId,
  });
  const loginChannelId = context.credentials?.login_channel_id ?? null;
  if (!context.enabled || !loginChannelId) {
    return { ok: false, reason: 'not_configured' };
  }

  const response = await postLineIdTokenVerify({
    fetcher: params.fetcher ?? fetch,
    idToken: params.idToken,
    loginChannelId,
    timeoutMs: params.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS,
  });

  if (response.kind === 'timeout') {
    return { ok: false, reason: 'timeout' };
  }

  if (response.kind === 'network_error') {
    log.warn('LINE ID token verification request failed', {
      clinicId: params.clinicId,
      errorName: response.errorName,
    });
    return { ok: false, reason: 'verify_failed' };
  }

  if (!response.response.ok) {
    const errorPayload = await readLineVerifyError(response.response);
    return {
      ok: false,
      reason: classifyLineVerifyError(errorPayload.errorDescription),
      status: response.response.status,
    };
  }

  const payload = await readLineVerifyPayload(response.response);
  if (!isLineIdTokenVerifyPayload(payload)) {
    return { ok: false, reason: 'invalid_response' };
  }

  if (payload.aud !== loginChannelId) {
    return { ok: false, reason: 'aud_mismatch' };
  }

  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  if (payload.exp <= nowSeconds) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    lineUserId: payload.sub,
    displayName: payload.name?.trim() || null,
    audience: payload.aud,
  };
}

async function postLineIdTokenVerify(params: {
  fetcher: LineIdTokenFetch;
  idToken: string;
  loginChannelId: string;
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
      id_token: params.idToken,
      client_id: params.loginChannelId,
    });
    const response = await params.fetcher(LINE_ID_TOKEN_VERIFY_ENDPOINT, {
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

async function readLineVerifyError(
  response: Response
): Promise<{ errorDescription: string | null }> {
  try {
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      return { errorDescription: null };
    }

    const candidate = payload as { error_description?: unknown };
    return {
      errorDescription:
        typeof candidate.error_description === 'string'
          ? candidate.error_description
          : null,
    };
  } catch {
    return { errorDescription: null };
  }
}

async function readLineVerifyPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function classifyLineVerifyError(
  errorDescription: string | null
): LineIdTokenVerificationFailureReason {
  const normalized = errorDescription?.toLowerCase() ?? '';
  if (normalized.includes('audience')) {
    return 'aud_mismatch';
  }
  if (normalized.includes('expired')) {
    return 'expired';
  }
  return 'verify_failed';
}

function isLineIdTokenVerifyPayload(
  value: unknown
): value is LineIdTokenVerifyPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    sub?: unknown;
    aud?: unknown;
    exp?: unknown;
    name?: unknown;
  };
  return (
    typeof candidate.sub === 'string' &&
    candidate.sub.length > 0 &&
    typeof candidate.aud === 'string' &&
    typeof candidate.exp === 'number' &&
    Number.isFinite(candidate.exp) &&
    (candidate.name === undefined || typeof candidate.name === 'string')
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
