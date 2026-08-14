import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { decryptLineCredential } from '@/lib/line/crypto';
import type { LineIntegrationClient } from '@/lib/line/integration-db';
import type { Json } from '@/types/supabase';

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

const LineWebhookBodySchema = z.object({
  destination: z.string().min(1),
  events: z
    .array(
      z.object({
        deliveryContext: z
          .object({ isRedelivery: z.boolean().optional() })
          .optional(),
        message: z
          .object({
            id: z.string().min(1),
            text: z.string().optional(),
            type: z.string().min(1),
          })
          .optional(),
        source: z
          .object({
            type: z.string().optional(),
            userId: z.string().min(1).optional(),
          })
          .optional(),
        timestamp: z.number().int().nonnegative(),
        type: z.string().min(1),
        unsend: z.object({ messageId: z.string().min(1) }).optional(),
        webhookEventId: z.string().min(1),
      })
    )
    .max(1000),
});

type LineWebhookCredential = {
  bot_user_id: string | null;
  channel_secret_encrypted: string;
  credential_generation_id: string;
};

export class LineWebhookRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 413
  ) {
    super(message);
    this.name = 'LineWebhookRequestError';
  }
}

export async function verifyLineWebhookRequest(params: {
  body: string;
  clinicId: string;
  client: LineIntegrationClient;
  signature: string | null;
}): Promise<{ credentialGenerationId: string; events: Json }> {
  if (Buffer.byteLength(params.body, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    throw new LineWebhookRequestError('Webhook body is too large', 413);
  }

  const credential = await fetchActiveWebhookCredential(
    params.client,
    params.clinicId
  );
  if (!credential) {
    throw new LineWebhookRequestError('LINE integration not found', 404);
  }

  let channelSecret: string;
  try {
    channelSecret = decryptLineCredential(credential.channel_secret_encrypted);
  } catch {
    throw new LineWebhookRequestError('LINE webhook is unavailable', 403);
  }

  const events = parseSignedLineWebhook({
    body: params.body,
    botUserId: credential.bot_user_id,
    channelSecret,
    signature: params.signature,
  });

  return {
    credentialGenerationId: credential.credential_generation_id,
    events,
  };
}

export async function persistLineWebhookDelivery(params: {
  clinicId: string;
  client: LineIntegrationClient;
  credentialGenerationId: string;
  events: Json;
}): Promise<Json> {
  const { data, error } = await params.client.rpc(
    'process_line_webhook_delivery',
    {
      p_clinic_id: params.clinicId,
      p_credential_generation_id: params.credentialGenerationId,
      p_events: params.events,
    }
  );
  if (error) throw error;
  return data;
}

export function parseSignedLineWebhook(params: {
  body: string;
  botUserId: string | null;
  channelSecret: string;
  signature: string | null;
}): Json {
  if (
    !verifyLineWebhookSignature(
      params.body,
      params.signature,
      params.channelSecret
    )
  ) {
    throw new LineWebhookRequestError('Invalid LINE signature', 401);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(params.body);
  } catch {
    throw new LineWebhookRequestError('Invalid webhook JSON', 400);
  }
  const parsed = LineWebhookBodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    throw new LineWebhookRequestError('Invalid webhook payload', 400);
  }
  if (!params.botUserId || parsed.data.destination !== params.botUserId) {
    throw new LineWebhookRequestError('LINE destination mismatch', 403);
  }

  return parsed.data.events.map(event => ({
    eventType: event.type,
    isRedelivery: event.deliveryContext?.isRedelivery === true,
    lineMessageId: event.message?.id ?? null,
    lineUserId: event.source?.userId ?? null,
    messageType: event.message?.type ?? null,
    occurredAt: new Date(event.timestamp).toISOString(),
    payloadDigest: createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex'),
    sourceType: event.source?.type ?? null,
    textContent:
      event.message?.type === 'text' ? (event.message.text ?? null) : null,
    unsendMessageId: event.unsend?.messageId ?? null,
    webhookEventId: event.webhookEventId,
  }));
}

export function verifyLineWebhookSignature(
  body: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', channelSecret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

async function fetchActiveWebhookCredential(
  client: LineIntegrationClient,
  clinicId: string
): Promise<LineWebhookCredential | null> {
  const { data, error } = await client
    .from('clinic_line_credentials')
    .select('bot_user_id, channel_secret_encrypted, credential_generation_id')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    typeof data.channel_secret_encrypted !== 'string' ||
    typeof data.credential_generation_id !== 'string'
  ) {
    return null;
  }
  return data;
}
