import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase';
import { toJson } from '@/lib/billing/json';
import {
  claimStripeWebhookEvent,
  markWebhookEvent,
  processStripeEvent,
} from '@/lib/billing/stripe-events';
import { constructStripeWebhookEvent } from '@/lib/stripe/server';
import { logError } from '@/lib/api-helpers';

const WEBHOOK_ENDPOINT = '/api/stripe/webhook';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    );
  }

  const payload = await request.text();
  const requestId = request.headers.get('x-request-id');
  let event: Stripe.Event;

  try {
    event = constructStripeWebhookEvent({
      payload,
      signature,
    });
  } catch (error) {
    logError(error, {
      endpoint: WEBHOOK_ENDPOINT,
      userId: 'stripe-webhook',
      method: 'POST',
      params: { stage: 'verify_signature' },
    });
    return NextResponse.json(
      { error: 'Invalid Stripe signature' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  let claim: Awaited<ReturnType<typeof claimStripeWebhookEvent>>;
  try {
    claim = await claimStripeWebhookEvent({
      client: adminClient,
      event,
      payload: toJson(event),
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      endpoint: WEBHOOK_ENDPOINT,
      userId: 'stripe-webhook',
      method: 'POST',
      params: {
        stage: 'claim_event',
        stripe_event_id: event.id,
      },
    });
    return NextResponse.json(
      { error: 'Webhook claim failed' },
      { status: 500 }
    );
  }

  if (claim.status === 'duplicate') {
    return NextResponse.json({
      received: true,
      duplicate: true,
      status: claim.processingStatus,
    });
  }

  if (claim.status === 'terminal_failure') {
    return NextResponse.json({
      received: true,
      duplicate: true,
      status: 'failed',
      retryable: false,
    });
  }

  if (claim.status === 'busy') {
    return NextResponse.json(
      {
        received: false,
        status: claim.processingStatus,
        retryable: true,
      },
      {
        status: 503,
        headers: { 'Retry-After': '5' },
      }
    );
  }

  try {
    const status = await processStripeEvent({
      client: adminClient,
      event,
      source: 'stripe_webhook',
      requestId,
    });
    await markWebhookEvent({
      client: adminClient,
      stripeEventId: event.id,
      status,
    });
    return NextResponse.json({ received: true, status });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown webhook processing error';
    try {
      await markWebhookEvent({
        client: adminClient,
        stripeEventId: event.id,
        status: 'failed',
        retryable: true,
        processingError: message,
      });
    } catch (markError) {
      logError(
        markError instanceof Error ? markError : new Error(String(markError)),
        {
          endpoint: WEBHOOK_ENDPOINT,
          userId: 'stripe-webhook',
          method: 'POST',
          params: {
            stage: 'mark_event_failed',
            stripe_event_id: event.id,
          },
        }
      );
    }
    logError(error, {
      endpoint: WEBHOOK_ENDPOINT,
      userId: 'stripe-webhook',
      method: 'POST',
      params: {
        stage: 'process_event',
        stripe_event_id: event.id,
        event_type: event.type,
      },
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
