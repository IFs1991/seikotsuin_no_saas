import { createPrivateKey, createSign, type JsonWebKey } from 'node:crypto';

import {
  decryptLineCredential,
  encryptLineCredential,
  getLineCredentialsEncryptionStatus,
} from '@/lib/line/crypto';
import { createLogger } from '@/lib/logger';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

const LINE_TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v2.1/token';
const JWT_ASSERTION_AUDIENCE = 'https://api.line.me/';
const JWT_ASSERTION_TTL_SECONDS = 30 * 60;
const LINE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

type ClinicLineCredentialsRow =
  Database['public']['Tables']['clinic_line_credentials']['Row'];
type LineTokenCredentialRow = Pick<
  ClinicLineCredentialsRow,
  | 'clinic_id'
  | 'is_active'
  | 'messaging_channel_id'
  | 'assertion_private_key_encrypted'
  | 'assertion_kid'
  | 'access_token_encrypted'
  | 'token_expires_at'
>;

type LineTokenFetch = (input: string, init: RequestInit) => Promise<Response>;

type LineTokenEndpointResponse = {
  access_token: string;
  expires_in: number;
  token_type?: string;
};

export type LineChannelAccessTokenResult =
  | {
      ok: true;
      accessToken: string;
      expiresAt: string;
      refreshed: boolean;
    }
  | {
      ok: false;
      reason:
        | 'encryption_key_unavailable'
        | 'not_configured'
        | 'inactive'
        | 'credential_decryption_failed'
        | 'token_issue_failed'
        | 'token_cache_update_failed';
    };

const log = createLogger('LineTokenManager');

export function shouldRefreshLineAccessToken(
  tokenExpiresAt: string | null,
  now = new Date()
): boolean {
  if (!tokenExpiresAt) {
    return true;
  }

  const expiresAtMs = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs - now.getTime() < REFRESH_THRESHOLD_MS;
}

export async function getLineChannelAccessToken(params: {
  supabase: Pick<SupabaseServerClient, 'from'>;
  clinicId: string;
  now?: Date;
  fetcher?: LineTokenFetch;
}): Promise<LineChannelAccessTokenResult> {
  const now = params.now ?? new Date();
  const fetcher = params.fetcher ?? fetch;

  if (getLineCredentialsEncryptionStatus() !== 'ready') {
    return { ok: false, reason: 'encryption_key_unavailable' };
  }

  try {
    const row = await fetchLineTokenCredentialRow(
      params.supabase,
      params.clinicId
    );
    if (!row) {
      return { ok: false, reason: 'not_configured' };
    }
    if (!row.is_active) {
      return { ok: false, reason: 'inactive' };
    }

    const cachedTokenExpiresAt = row.token_expires_at;
    if (
      row.access_token_encrypted &&
      cachedTokenExpiresAt &&
      !shouldRefreshLineAccessToken(cachedTokenExpiresAt, now)
    ) {
      try {
        return {
          ok: true,
          accessToken: decryptLineCredential(row.access_token_encrypted),
          expiresAt: cachedTokenExpiresAt,
          refreshed: false,
        };
      } catch {
        log.warn('Cached LINE access token could not be decrypted', {
          clinicId: row.clinic_id,
        });
      }
    }

    const privateJwk = decryptPrivateJwk(row);
    if (!privateJwk) {
      return { ok: false, reason: 'credential_decryption_failed' };
    }

    const token = await issueLineChannelAccessToken({
      fetcher,
      messagingChannelId: row.messaging_channel_id,
      assertionKid: row.assertion_kid,
      assertionPrivateJwk: privateJwk,
      now,
    });
    if (!token) {
      return { ok: false, reason: 'token_issue_failed' };
    }

    const expiresAt = new Date(
      now.getTime() + token.expires_in * 1000
    ).toISOString();
    const encryptedAccessToken = encryptLineCredential(token.access_token);

    const { error } = await params.supabase
      .from('clinic_line_credentials')
      .update({
        access_token_encrypted: encryptedAccessToken,
        token_expires_at: expiresAt,
      })
      .eq('clinic_id', row.clinic_id);

    if (error) {
      log.warn('Failed to cache LINE access token', {
        clinicId: row.clinic_id,
        errorCode: error.code,
      });
      return { ok: false, reason: 'token_cache_update_failed' };
    }

    return {
      ok: true,
      accessToken: token.access_token,
      expiresAt,
      refreshed: true,
    };
  } catch (error) {
    log.warn('LINE access token resolution failed closed', {
      clinicId: params.clinicId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return { ok: false, reason: 'token_issue_failed' };
  }
}

async function fetchLineTokenCredentialRow(
  supabase: Pick<SupabaseServerClient, 'from'>,
  clinicId: string
): Promise<LineTokenCredentialRow | null> {
  const { data, error } = await supabase
    .from('clinic_line_credentials')
    .select(
      [
        'clinic_id',
        'is_active',
        'messaging_channel_id',
        'assertion_private_key_encrypted',
        'assertion_kid',
        'access_token_encrypted',
        'token_expires_at',
      ].join(', ')
    )
    .eq('clinic_id', clinicId)
    .returns<LineTokenCredentialRow>()
    .maybeSingle();

  if (error) {
    log.warn('Failed to read LINE token credential row', {
      clinicId,
      errorCode: error.code,
    });
    return null;
  }

  return data ?? null;
}

function decryptPrivateJwk(row: LineTokenCredentialRow): JsonWebKey | null {
  try {
    const parsed = JSON.parse(
      decryptLineCredential(row.assertion_private_key_encrypted)
    );
    return isJsonWebKey(parsed) ? parsed : null;
  } catch {
    log.warn('LINE assertion private key could not be decrypted', {
      clinicId: row.clinic_id,
    });
    return null;
  }
}

async function issueLineChannelAccessToken(params: {
  fetcher: LineTokenFetch;
  messagingChannelId: string;
  assertionKid: string;
  assertionPrivateJwk: JsonWebKey;
  now: Date;
}): Promise<LineTokenEndpointResponse | null> {
  const assertion = createLineChannelAccessTokenAssertion({
    messagingChannelId: params.messagingChannelId,
    assertionKid: params.assertionKid,
    assertionPrivateJwk: params.assertionPrivateJwk,
    now: params.now,
  });
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type:
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
  });

  const response = await params.fetcher(LINE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    log.warn('LINE token endpoint returned non-success status', {
      status: response.status,
    });
    return null;
  }

  const payload = await response.json();
  return isLineTokenEndpointResponse(payload) ? payload : null;
}

function createLineChannelAccessTokenAssertion(params: {
  messagingChannelId: string;
  assertionKid: string;
  assertionPrivateJwk: JsonWebKey;
  now: Date;
}): string {
  const issuedAt = Math.floor(params.now.getTime() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: params.assertionKid,
  };
  const payload = {
    iss: params.messagingChannelId,
    sub: params.messagingChannelId,
    aud: JWT_ASSERTION_AUDIENCE,
    exp: issuedAt + JWT_ASSERTION_TTL_SECONDS,
    token_exp: LINE_TOKEN_TTL_SECONDS,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const key = createPrivateKey({
    key: params.assertionPrivateJwk,
    format: 'jwk',
  });
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(key);

  return `${signingInput}.${signature.toString('base64url')}`;
}

function base64UrlJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function isJsonWebKey(value: unknown): value is JsonWebKey {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const key = value as { kty?: unknown; d?: unknown };
  return typeof key.kty === 'string' && typeof key.d === 'string';
}

function isLineTokenEndpointResponse(
  value: unknown
): value is LineTokenEndpointResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    access_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  };
  return (
    typeof candidate.access_token === 'string' &&
    typeof candidate.expires_in === 'number' &&
    candidate.expires_in > 0 &&
    (candidate.token_type === undefined ||
      typeof candidate.token_type === 'string')
  );
}
