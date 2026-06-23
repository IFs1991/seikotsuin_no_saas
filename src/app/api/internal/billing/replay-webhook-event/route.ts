import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import { writeBillingAuditLog } from '@/lib/billing/audit';
import {
  isPersistedStripeEventPayload,
  markWebhookEvent,
  processStripeEvent,
} from '@/lib/billing/stripe-events';

const INTERNAL_ACTOR = 'api/internal/billing/replay-webhook-event';

const ReplayRequestSchema = z.object({
  stripe_event_id: z.string().min(1),
  force_processed: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = requireBillingInternalRequest(request, {
    internalActor: INTERNAL_ACTOR,
  });
  if (auth.success === false) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = ReplayRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const client = createAdminClient();
  const { data, error } = await client
    .from('stripe_webhook_events')
    .select('stripe_event_id, event_type, payload, processing_status')
    .eq('stripe_event_id', parsed.data.stripe_event_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: 'Webhook event not found' },
      { status: 404 }
    );
  }

  if (
    data.processing_status === 'processed' &&
    parsed.data.force_processed !== true
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Webhook event is already processed; set force_processed to replay',
      },
      { status: 409 }
    );
  }

  if (!isPersistedStripeEventPayload(data.payload)) {
    return NextResponse.json(
      { success: false, error: 'Persisted webhook payload is invalid' },
      { status: 422 }
    );
  }

  await writeBillingAuditLog({
    client,
    audit: {
      actorType: 'internal',
      internalActor: auth.actor.internalActor,
      eventType: 'billing.webhook_replayed',
      beforeState: {
        stripe_event_id: data.stripe_event_id,
        processing_status: data.processing_status,
      },
      stripeEventId: data.stripe_event_id,
      requestId: auth.actor.requestId,
      metadata: { force_processed: parsed.data.force_processed === true },
    },
  });

  try {
    const status = await processStripeEvent({
      client,
      event: data.payload,
      source: 'internal_replay',
      internalActor: auth.actor.internalActor,
      requestId: auth.actor.requestId,
    });
    await markWebhookEvent({
      client,
      stripeEventId: data.stripe_event_id,
      status,
    });

    return NextResponse.json({
      success: true,
      data: {
        stripe_event_id: data.stripe_event_id,
        status,
      },
    });
  } catch (replayError) {
    const message =
      replayError instanceof Error
        ? replayError.message
        : 'Unknown replay processing error';
    await markWebhookEvent({
      client,
      stripeEventId: data.stripe_event_id,
      status: 'failed',
      retryable: true,
      processingError: message,
    });
    throw replayError;
  }
}
