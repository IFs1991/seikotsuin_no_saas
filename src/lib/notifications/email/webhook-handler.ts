import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Resend Webhook の署名を検証する。
 * raw body + svix ヘッダーで HMAC 検証を行う。
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Map<string, string> | Headers,
  secret: string
): boolean {
  if (!secret) return false;

  const svixId = getHeader(headers, 'svix-id');
  const svixTimestamp = getHeader(headers, 'svix-timestamp');
  const svixSignature = getHeader(headers, 'svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Decode the secret (Resend uses whsec_ prefixed base64)
  const secretBytes = Buffer.from(
    secret.startsWith('whsec_') ? secret.slice(6) : secret,
    'base64'
  );

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = createHmac('sha256', secretBytes)
    .update(toSign)
    .digest('base64');

  // svix-signature can contain multiple signatures separated by spaces
  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
    try {
      const expected = Buffer.from(expectedSignature);
      const actual = Buffer.from(sigValue);
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function getHeader(
  headers: Map<string, string> | Headers,
  key: string
): string | null {
  if (headers instanceof Map) {
    return headers.get(key) ?? null;
  }
  return headers.get(key);
}

export type ResendWebhookEvent = {
  type: string;
  data: {
    email_id: string;
    to?: string[];
    [key: string]: unknown;
  };
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type WebhookOutboxRecord = {
  id: string;
  clinic_id: string | null;
};

function assertNoSupabaseError<T>(
  result: SupabaseQueryResult<T>,
  context: string
): T | null {
  if (result.error) {
    throw new Error(
      `${context}: ${result.error.message ?? 'Unknown Supabase error'}`
    );
  }

  return result.data;
}

/**
 * Resend Webhook イベントを処理し、email_logs に記録する。
 * outbox レコードを特定できる場合は、それに紐付けて記録する。
 */
export async function handleResendWebhookEvent(
  supabase: any,
  event: ResendWebhookEvent
): Promise<void> {
  const messageId = event.data.email_id;

  // outbox レコードを provider_message_id で検索
  const outboxResult = (await supabase
    .from('email_outbox')
    .select('id, clinic_id')
    .eq('provider_message_id', messageId)
    .maybeSingle()) as SupabaseQueryResult<WebhookOutboxRecord>;
  const outboxRecord = assertNoSupabaseError(
    outboxResult,
    'Failed to resolve email outbox record'
  );

  if (!outboxRecord?.clinic_id) {
    logger.warn('Skipping unmatched Resend webhook event', {
      eventType: event.type,
      providerMessageId: messageId,
    });
    return;
  }

  const outboxId = outboxRecord.id;

  // email_logs に記録
  const logResult = (await supabase.from('email_logs').insert({
    outbox_id: outboxId,
    clinic_id: outboxRecord.clinic_id,
    event_type: event.type,
    provider: 'resend',
    provider_message_id: messageId,
    detail: event.data,
  })) as SupabaseQueryResult<unknown>;

  assertNoSupabaseError(logResult, 'Failed to insert email log');
}
