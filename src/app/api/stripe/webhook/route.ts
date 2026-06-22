import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase';
import type { Json } from '@/types/supabase';
import { assertBillingPriceEnv } from '@/lib/billing/config';
import { deriveBillingState } from '@/lib/billing/state';
import { mapStripeSubscriptionToBillingSnapshot } from '@/lib/billing/stripe-mapper';
import {
  constructStripeWebhookEvent,
  getStripeClient,
} from '@/lib/stripe/server';
import { logError } from '@/lib/api-helpers';

const WEBHOOK_ENDPOINT = '/api/stripe/webhook';

type WebhookProcessingStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed';

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJson);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(
      childValue => childValue === undefined || isJson(childValue)
    );
  }

  return false;
}

function toJson(value: unknown): Json {
  const parsed = JSON.parse(JSON.stringify(value)) as unknown;
  if (!isJson(parsed)) {
    throw new Error('Value is not JSON serializable');
  }
  return parsed;
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

function objectType(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  return typeof objectValue.object === 'string' ? objectValue.object : null;
}

function isCheckoutSession(value: unknown): value is Stripe.Checkout.Session {
  return objectType(value) === 'checkout.session';
}

function isSubscription(value: unknown): value is Stripe.Subscription {
  return objectType(value) === 'subscription';
}

function isInvoice(value: unknown): value is Stripe.Invoice {
  return objectType(value) === 'invoice';
}

function extractStripeId(value: string | { id: string } | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : value.id;
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return extractStripeId(subscription);
}

async function markWebhookEvent(input: {
  stripeEventId: string;
  status: WebhookProcessingStatus;
  retryable?: boolean;
  processingError?: string | null;
}) {
  const adminClient = createAdminClient();
  await adminClient
    .from('stripe_webhook_events')
    .update({
      processing_status: input.status,
      retryable: input.retryable ?? false,
      processing_error: input.processingError ?? null,
      processed_at:
        input.status === 'processed' || input.status === 'ignored'
          ? new Date().toISOString()
          : null,
    })
    .eq('stripe_event_id', input.stripeEventId);
}

async function resolveOrgRootClinicId(input: {
  subscription: Stripe.Subscription;
  stripeCustomerId: string;
}) {
  const metadataOrgRootClinicId =
    input.subscription.metadata.org_root_clinic_id;
  if (metadataOrgRootClinicId) {
    return metadataOrgRootClinicId;
  }

  const adminClient = createAdminClient();
  const bySubscription = await adminClient
    .from('subscriptions')
    .select('org_root_clinic_id')
    .eq('stripe_subscription_id', input.subscription.id)
    .maybeSingle();

  if (bySubscription.error) {
    throw bySubscription.error;
  }

  if (bySubscription.data?.org_root_clinic_id) {
    return bySubscription.data.org_root_clinic_id;
  }

  const byCustomer = await adminClient
    .from('subscriptions')
    .select('org_root_clinic_id')
    .eq('stripe_customer_id', input.stripeCustomerId)
    .maybeSingle();

  if (byCustomer.error) {
    throw byCustomer.error;
  }

  return byCustomer.data?.org_root_clinic_id ?? null;
}

async function syncSubscription(input: {
  subscription: Stripe.Subscription;
  stripeEventId: string;
  stripeEventCreatedAt: string | null;
}) {
  const billingPriceEnv = assertBillingPriceEnv();
  const snapshot = mapStripeSubscriptionToBillingSnapshot({
    subscription: input.subscription,
    priceIds: billingPriceEnv.priceIds,
  });
  const orgRootClinicId = await resolveOrgRootClinicId({
    subscription: input.subscription,
    stripeCustomerId: snapshot.stripeCustomerId,
  });

  if (!orgRootClinicId) {
    throw new Error('Missing org_root_clinic_id for Stripe subscription sync');
  }

  const billingState = deriveBillingState({
    stripeStatus: snapshot.stripeStatus,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    pastDueSince: null,
    graceUntil: null,
    now: new Date(),
  });
  const adminClient = createAdminClient();
  const { error } = await adminClient.from('subscriptions').upsert(
    {
      org_root_clinic_id: orgRootClinicId,
      plan_code: snapshot.planCode,
      stripe_customer_id: snapshot.stripeCustomerId,
      stripe_subscription_id: snapshot.stripeSubscriptionId,
      stripe_single_subscription_item_id: snapshot.itemIds.single ?? null,
      stripe_group_base_subscription_item_id:
        snapshot.itemIds.groupBase ?? null,
      stripe_store_subscription_item_id: snapshot.itemIds.storeAddOn ?? null,
      stripe_status: snapshot.stripeStatus,
      billing_state: billingState,
      included_store_quantity: snapshot.includedStoreQuantity,
      paid_extra_store_quantity: snapshot.paidExtraStoreQuantity,
      current_period_start: snapshot.currentPeriodStart?.toISOString() ?? null,
      current_period_end: snapshot.currentPeriodEnd?.toISOString() ?? null,
      trial_end: snapshot.trialEnd?.toISOString() ?? null,
      cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      canceled_at: snapshot.canceledAt?.toISOString() ?? null,
      ended_at: snapshot.endedAt?.toISOString() ?? null,
      last_stripe_event_id: input.stripeEventId,
      last_stripe_event_created: input.stripeEventCreatedAt,
      last_synced_at: new Date().toISOString(),
      stripe_checkout_session_id: null,
      checkout_started_at: null,
      checkout_expires_at: null,
      checkout_plan_code: null,
      metadata: {
        source: 'stripe_webhook',
      },
    },
    {
      onConflict: 'org_root_clinic_id',
    }
  );

  if (error) {
    throw error;
  }

  if (snapshot.trialEnd !== null || snapshot.stripeStatus === 'trialing') {
    const trialUpdate = await adminClient
      .from('subscriptions')
      .update({ trial_consumed: true })
      .eq('org_root_clinic_id', orgRootClinicId);

    if (trialUpdate.error) {
      throw trialUpdate.error;
    }
  }
}

async function handleCheckoutSessionCompleted(input: {
  session: Stripe.Checkout.Session;
  stripeEventId: string;
  stripeEventCreatedAt: string | null;
}) {
  const subscriptionId = extractStripeId(input.session.subscription);
  if (!subscriptionId) {
    throw new Error('checkout.session.completed missing subscription');
  }

  const subscription = await getStripeClient().subscriptions.retrieve(
    subscriptionId,
    {
      expand: ['items.data.price'],
    }
  );
  await syncSubscription({
    subscription,
    stripeEventId: input.stripeEventId,
    stripeEventCreatedAt: input.stripeEventCreatedAt,
  });
}

async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('subscriptions')
    .update({
      billing_state: 'none',
      stripe_checkout_session_id: null,
      checkout_started_at: null,
      checkout_expires_at: null,
      checkout_plan_code: null,
    })
    .eq('stripe_checkout_session_id', session.id)
    .is('stripe_subscription_id', null);

  if (error) {
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return;
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('subscriptions')
    .update({
      billing_state: 'past_due_locked',
      stripe_status: 'past_due',
      past_due_since: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    throw error;
  }
}

async function processStripeEvent(event: Stripe.Event) {
  const stripeEventCreatedAt = fromUnixSeconds(event.created);
  const eventObject = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed':
      if (!isCheckoutSession(eventObject)) {
        throw new Error('Invalid checkout.session.completed payload');
      }
      await handleCheckoutSessionCompleted({
        session: eventObject,
        stripeEventId: event.id,
        stripeEventCreatedAt,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'checkout.session.expired':
      if (!isCheckoutSession(eventObject)) {
        throw new Error('Invalid checkout.session.expired payload');
      }
      await handleCheckoutSessionExpired(eventObject);
      return 'processed' satisfies WebhookProcessingStatus;

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      if (!isSubscription(eventObject)) {
        throw new Error('Invalid subscription payload');
      }
      await syncSubscription({
        subscription: eventObject,
        stripeEventId: event.id,
        stripeEventCreatedAt,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'invoice.payment_failed':
      if (!isInvoice(eventObject)) {
        throw new Error('Invalid invoice.payment_failed payload');
      }
      await handleInvoicePaymentFailed(eventObject);
      return 'processed' satisfies WebhookProcessingStatus;

    default:
      return 'ignored' satisfies WebhookProcessingStatus;
  }
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

  const eventObject = event.data.object;
  const insertResult = await adminClient.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    stripe_created_at: fromUnixSeconds(event.created),
    livemode: event.livemode,
    payload: toJson(event),
    processing_status: 'processing',
    retryable: false,
    related_stripe_subscription_id: isSubscription(eventObject)
      ? eventObject.id
      : null,
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
    const status = await processStripeEvent(event);
    await markWebhookEvent({
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
