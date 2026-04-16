import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { assertEnv } from '@/lib/env';

export const PASSWORD_RECOVERY_INTENT_COOKIE = 'password_recovery_intent';
const PASSWORD_RECOVERY_INTENT_TTL_SECONDS = 10 * 60;

function buildPayload(userId: string, expiresAt: number) {
  return `${userId}:${expiresAt}`;
}

function signPayload(payload: string) {
  return createHmac('sha256', assertEnv('SUPABASE_SERVICE_ROLE_KEY'))
    .update(payload)
    .digest('hex');
}

export function createPasswordRecoveryIntent(userId: string, now = Date.now()) {
  const expiresAt = now + PASSWORD_RECOVERY_INTENT_TTL_SECONDS * 1000;
  const payload = buildPayload(userId, expiresAt);

  return `${payload}:${signPayload(payload)}`;
}

export function validatePasswordRecoveryIntent(
  token: string | undefined,
  userId: string,
  now = Date.now()
) {
  if (!token) {
    return false;
  }

  const [tokenUserId, expiresAtRaw, signature] = token.split(':');
  if (!tokenUserId || !expiresAtRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (
    tokenUserId !== userId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return false;
  }

  const expectedSignature = signPayload(buildPayload(tokenUserId, expiresAt));
  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    providedBuffer.length === 0 ||
    providedBuffer.length !== expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function getPasswordRecoveryIntentCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/reset-password',
    maxAge: maxAge ?? PASSWORD_RECOVERY_INTENT_TTL_SECONDS,
  };
}

export async function readPasswordRecoveryIntent() {
  const cookieStore = await cookies();
  return cookieStore.get(PASSWORD_RECOVERY_INTENT_COOKIE)?.value;
}

export async function clearPasswordRecoveryIntent() {
  const cookieStore = await cookies();
  cookieStore.set(
    PASSWORD_RECOVERY_INTENT_COOKIE,
    '',
    getPasswordRecoveryIntentCookieOptions(0)
  );
}
