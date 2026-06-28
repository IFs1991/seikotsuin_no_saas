import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase';
import { toJson } from '@/lib/billing/json';
import {
  extractRelatedOrgRootClinicId,
  extractRelatedStripeSubscriptionId,
  markWebhookEvent,
  processStripeEvent,
} from '@/lib/billing/stripe-events';
import { constructStripeWebhookEvent } from '@/lib/stripe/server';
import { logError } from '@/lib/api-helpers';

const WEBHOOK_ENDPOINT = '/api/stripe/webhook';

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

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
  const existing = await adminClient
    .from('stripe_webhook_events')
    .select('processing_status')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing.error) {
    logError(existing.error, {
      endpoint: WEBHOOK_ENDPOINT,
      userId: 'stripe-webhook',
      method: 'POST',
      params: {
        stage: 'lookup_event',
        stripe_event_id: event.id,
      },
    });
    return NextResponse.json(
      { error: 'Webhook lookup failed' },
      { status: 500 }
    );
  }

  if (existing.data) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const insertResult = await adminClient.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    stripe_created_at: fromUnixSeconds(event.created),
    livemode: event.livemode,
    payload: toJson(event),
    processing_status: 'processing',
    retryable: false,
    related_org_root_clinic_id: extractRelatedOrgRootClinicId(event),
    related_stripe_subscription_id: extractRelatedStripeSubscriptionId(event),
  });

  if (insertResult.error) {
    logError(insertResult.error, {
      endpoint: WEBHOOK_ENDPOINT,
      userId: 'stripe-webhook',
      method: 'POST',
      params: {
        stage: 'insert_event',
        stripe_event_id: event.id,
      },
    });
    return NextResponse.json(
      { error: 'Webhook insert failed' },
      { status: 500 }
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
    await markWebhookEvent({
      client: adminClient,
      stripeEventId: event.id,
      status: 'failed',
      retryable: true,
      processingError: message,
    });
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
