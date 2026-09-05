import 'server-only';

import { createHash, generateKeyPairSync, type JsonWebKey } from 'node:crypto';

import {
  decryptLineCredential,
  encryptLineCredential,
} from '@/lib/line/crypto';
import { issueLineChannelAccessTokenForSetup } from '@/lib/line/token-manager';

const LINE_BOT_INFO_ENDPOINT = 'https://api.line.me/v2/bot/info';
const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const LINE_ID_TOKEN_VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_SETUP_REQUEST_TIMEOUT_MS = 30_000;
const SETUP_TEST_MESSAGE =
  'TiramisuとのLINE接続確認が完了しました。このメッセージへの返信は不要です。';

type SetupFetch = (input: string, init: RequestInit) => Promise<Response>;

export type LineSetupInput = {
  appEndpointId: string | null;
  appType: 'mini_app' | 'liff';
  channelSecret: string;
  liffId: string;
  loginChannelId: string | null;
  messagingChannelId: string;
  providerConfigurationConfirmed: boolean;
  publicKeyKid: string;
  testIdToken: string | null;
  testLineUserId: string | null;
};

export type LineSetupVerificationDraft = Omit<
  LineSetupInput,
  | 'providerConfigurationConfirmed'
  | 'publicKeyKid'
  | 'testIdToken'
  | 'testLineUserId'
> & {
  accessToken: string;
  accessTokenKeyId: string | null;
  botDisplayName: string;
  botPictureUrl: string | null;
  botUserId: string;
  oaBasicId: string;
  providerIdentityVerified: boolean;
  tokenExpiresAt: string;
};

export type LineSetupKeyMaterial = {
  encryptedPrivateJwk: string;
  fingerprint: string;
  publicJwk: JsonWebKey;
};

export type LineSetupVerificationResult =
  | {
      ok: true;
      draft: LineSetupVerificationDraft;
      pushTestSent: boolean;
    }
  | {
      ok: false;
      reason:
        | 'bot_info_failed'
        | 'provider_identity_failed'
        | 'push_test_failed'
        | 'token_issue_failed';
    };

type LineBotInfo = {
  basicId: string;
  displayName: string;
  pictureUrl?: string;
  userId: string;
};

type LineIdTokenVerification = {
  aud: string;
  sub: string;
};

export function createLineSetupPushRequestDigest(params: {
  botUserId: string;
  lineUserId: string;
  loginChannelId: string;
  messagingChannelId: string;
  publicKeyKid: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        botUserId: params.botUserId,
        loginChannelId: params.loginChannelId,
        messages: [{ text: SETUP_TEST_MESSAGE, type: 'text' }],
        messagingChannelId: params.messagingChannelId,
        publicKeyKid: params.publicKeyKid,
        to: params.lineUserId,
      })
    )
    .digest('hex');
}

export function generateLineSetupKeyMaterial(): LineSetupKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk: JsonWebKey = {
    ...publicKey.export({ format: 'jwk' }),
    alg: 'RS256',
    use: 'sig',
  };
  const privateJwk: JsonWebKey = {
    ...privateKey.export({ format: 'jwk' }),
    alg: 'RS256',
    use: 'sig',
  };

  return {
    encryptedPrivateJwk: encryptLineCredential(JSON.stringify(privateJwk)),
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          alg: publicJwk.alg,
          e: publicJwk.e,
          kty: publicJwk.kty,
          n: publicJwk.n,
          use: publicJwk.use,
        })
      )
      .digest('hex'),
    publicJwk,
  };
}

export async function verifyLineSetupInput(params: {
  encryptedPrivateJwk: string;
  fetcher?: SetupFetch;
  input: LineSetupInput;
  now?: Date;
  pushTestRetryKey: string;
  beforePushTest?: (requestDigest: string) => Promise<void>;
}): Promise<LineSetupVerificationResult> {
  const fetcher = withTimeout(params.fetcher ?? fetch);
  const now = params.now ?? new Date();
  const privateJwk = parsePrivateJwk(params.encryptedPrivateJwk);
  if (!params.input.providerConfigurationConfirmed) {
    return { ok: false, reason: 'provider_identity_failed' };
  }
  if (
    Boolean(params.input.testIdToken) !== Boolean(params.input.testLineUserId)
  ) {
    return { ok: false, reason: 'provider_identity_failed' };
  }

  let token;
  try {
    token = await issueLineChannelAccessTokenForSetup({
      assertionKid: params.input.publicKeyKid,
      assertionPrivateJwk: privateJwk,
      fetcher,
      messagingChannelId: params.input.messagingChannelId,
      now,
    });
  } catch {
    return { ok: false, reason: 'token_issue_failed' };
  }
  if (!token) {
    return { ok: false, reason: 'token_issue_failed' };
  }

  let botInfo: LineBotInfo | null;
  try {
    botInfo = await fetchLineBotInfo(fetcher, token.access_token);
  } catch {
    return { ok: false, reason: 'bot_info_failed' };
  }
  if (!botInfo) {
    return { ok: false, reason: 'bot_info_failed' };
  }

  let providerIdentityVerified = false;
  let pushTestSent = false;
  if (params.input.testIdToken && params.input.testLineUserId) {
    if (!params.input.loginChannelId) {
      return { ok: false, reason: 'provider_identity_failed' };
    }
    try {
      providerIdentityVerified = await verifyLineProviderIdentity({
        fetcher,
        idToken: params.input.testIdToken,
        lineUserId: params.input.testLineUserId,
        loginChannelId: params.input.loginChannelId,
      });
    } catch {
      return { ok: false, reason: 'provider_identity_failed' };
    }
    if (!providerIdentityVerified) {
      return { ok: false, reason: 'provider_identity_failed' };
    }
    try {
      await params.beforePushTest?.(
        createLineSetupPushRequestDigest({
          botUserId: botInfo.userId,
          lineUserId: params.input.testLineUserId,
          loginChannelId: params.input.loginChannelId,
          messagingChannelId: params.input.messagingChannelId,
          publicKeyKid: params.input.publicKeyKid,
        })
      );
      pushTestSent = await sendLineSetupTestMessage({
        accessToken: token.access_token,
        fetcher,
        lineUserId: params.input.testLineUserId,
        retryKey: params.pushTestRetryKey,
      });
    } catch {
      return { ok: false, reason: 'push_test_failed' };
    }
    if (!pushTestSent) {
      return { ok: false, reason: 'push_test_failed' };
    }
  }

  return {
    ok: true,
    draft: {
      accessToken: token.access_token,
      accessTokenKeyId: token.key_id ?? null,
      appEndpointId: params.input.appEndpointId,
      appType: params.input.appType,
      botDisplayName: botInfo.displayName,
      botPictureUrl: botInfo.pictureUrl ?? null,
      botUserId: botInfo.userId,
      channelSecret: params.input.channelSecret,
      liffId: params.input.liffId,
      loginChannelId: params.input.loginChannelId,
      messagingChannelId: params.input.messagingChannelId,
      oaBasicId: botInfo.basicId,
      providerIdentityVerified,
      tokenExpiresAt: new Date(
        now.getTime() + token.expires_in * 1000
      ).toISOString(),
    },
    pushTestSent,
  };
}

export function encryptLineSetupVerificationDraft(
  draft: LineSetupVerificationDraft
): string {
  return encryptLineCredential(JSON.stringify(draft));
}

export function decryptLineSetupVerificationDraft(
  encryptedDraft: string
): LineSetupVerificationDraft {
  const parsed: unknown = JSON.parse(decryptLineCredential(encryptedDraft));
  if (!isLineSetupVerificationDraft(parsed)) {
    throw new Error('Invalid encrypted LINE setup draft');
  }
  return parsed;
}

export function buildLineSetupUrls(clinicId: string): {
  endpointUrl: string;
  redirectUrl: string;
  webhookUrl: string;
} {
  const appUrl = resolveAppUrl();
  const bookingUrl = new URL(`/booking/${clinicId}`, appUrl).toString();
  return {
    endpointUrl: bookingUrl,
    redirectUrl: bookingUrl,
    webhookUrl: new URL(`/api/webhooks/line/${clinicId}`, appUrl).toString(),
  };
}

async function fetchLineBotInfo(
  fetcher: SetupFetch,
  accessToken: string
): Promise<LineBotInfo | null> {
  const response = await fetcher(LINE_BOT_INFO_ENDPOINT, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  return isLineBotInfo(payload) ? payload : null;
}

async function sendLineSetupTestMessage(params: {
  accessToken: string;
  fetcher: SetupFetch;
  lineUserId: string;
  retryKey: string;
}): Promise<boolean> {
  const response = await params.fetcher(LINE_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'content-type': 'application/json',
      'x-line-retry-key': params.retryKey,
    },
    body: JSON.stringify({
      messages: [{ text: SETUP_TEST_MESSAGE, type: 'text' }],
      to: params.lineUserId,
    }),
  });
  return (
    response.ok ||
    (response.status === 409 &&
      Boolean(response.headers.get('x-line-accepted-request-id')))
  );
}

async function verifyLineProviderIdentity(params: {
  fetcher: SetupFetch;
  idToken: string;
  lineUserId: string;
  loginChannelId: string;
}): Promise<boolean> {
  const response = await params.fetcher(LINE_ID_TOKEN_VERIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.loginChannelId,
      id_token: params.idToken,
    }),
  });
  if (!response.ok) return false;
  const payload: unknown = await response.json();
  return (
    isLineIdTokenVerification(payload) &&
    payload.aud === params.loginChannelId &&
    payload.sub === params.lineUserId
  );
}

function withTimeout(fetcher: SetupFetch): SetupFetch {
  return (input, init) =>
    fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(LINE_SETUP_REQUEST_TIMEOUT_MS),
    });
}

function parsePrivateJwk(encryptedPrivateJwk: string): JsonWebKey {
  const parsed: unknown = JSON.parse(
    decryptLineCredential(encryptedPrivateJwk)
  );
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid encrypted LINE setup private key');
  }
  const candidate = parsed as { d?: unknown; kty?: unknown };
  if (candidate.kty !== 'RSA' || typeof candidate.d !== 'string') {
    throw new Error('Invalid encrypted LINE setup private key');
  }
  return parsed as JsonWebKey;
}

function isLineBotInfo(value: unknown): value is LineBotInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    basicId?: unknown;
    displayName?: unknown;
    pictureUrl?: unknown;
    userId?: unknown;
  };
  return (
    typeof candidate.basicId === 'string' &&
    typeof candidate.displayName === 'string' &&
    (candidate.pictureUrl === undefined ||
      typeof candidate.pictureUrl === 'string') &&
    typeof candidate.userId === 'string'
  );
}

function isLineIdTokenVerification(
  value: unknown
): value is LineIdTokenVerification {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { aud?: unknown; sub?: unknown };
  return typeof candidate.aud === 'string' && typeof candidate.sub === 'string';
}

function isLineSetupVerificationDraft(
  value: unknown
): value is LineSetupVerificationDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<LineSetupVerificationDraft>;
  return (
    (candidate.appType === 'mini_app' || candidate.appType === 'liff') &&
    typeof candidate.loginChannelId === 'string' &&
    (candidate.appType !== 'mini_app' ||
      typeof candidate.appEndpointId === 'string') &&
    typeof candidate.liffId === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.botDisplayName === 'string' &&
    typeof candidate.botUserId === 'string' &&
    typeof candidate.channelSecret === 'string' &&
    typeof candidate.messagingChannelId === 'string' &&
    typeof candidate.oaBasicId === 'string' &&
    typeof candidate.providerIdentityVerified === 'boolean' &&
    typeof candidate.tokenExpiresAt === 'string'
  );
}

function resolveAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured');
  }
  return new URL(raw).toString();
}
