import 'server-only';

import Stripe from 'stripe';
import type { SupabaseServerClient } from '@/lib/supabase';
import { assertBillingPriceEnv } from '@/lib/billing/config';
import {
  writeBillingAuditLog,
  type BillingAuditEventType,
} from '@/lib/billing/audit';
import { enqueueBillingLifecycleEmail } from '@/lib/billing/notifications';
import { fetchActiveBillingOverride } from '@/lib/billing/overrides';
import { deriveBillingState } from '@/lib/billing/state';
import { mapStripeSubscriptionToBillingSnapshot } from '@/lib/billing/stripe-mapper';
import { getStripeClient } from '@/lib/stripe/server';
import type { Json } from '@/types/supabase';

export type WebhookProcessingStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed';

export type StripeEventProcessingSource =
  | 'stripe_webhook'
  | 'internal_replay'
  | 'internal_resync'
  | 'plan_upgrade';

export type StripeEventLike = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: unknown;
  };
};

export type PersistedStripeEventPayload = {
  [key: string]: Json | undefined;
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    [key: string]: Json | undefined;
    object: Json;
  };
};

const PAST_DUE_GRACE_DAYS = 14;

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

function nullableDate(value: string | null) {
  return value === null ? null : new Date(value);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
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

function metadataOrgRootClinicId(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const metadata = record.metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return null;
  }

  const orgRootClinicId = (metadata as Record<string, unknown>)
    .org_root_clinic_id;
  return typeof orgRootClinicId === 'string' && orgRootClinicId.length > 0
    ? orgRootClinicId
    : null;
}

function extractCheckoutSessionSubscriptionId(value: unknown) {
  if (!isCheckoutSession(value)) {
    return null;
  }

  return extractStripeId(value.subscription);
}

export function extractRelatedStripeSubscriptionId(event: StripeEventLike) {
  const eventObject = event.data.object;

  if (isSubscription(eventObject)) {
    return eventObject.id;
  }

  if (isInvoice(eventObject)) {
    return extractInvoiceSubscriptionId(eventObject);
  }

  return extractCheckoutSessionSubscriptionId(eventObject);
}

export function extractRelatedOrgRootClinicId(event: StripeEventLike) {
  const eventObject = event.data.object;
  if (isCheckoutSession(eventObject)) {
    return (
      metadataOrgRootClinicId(eventObject) ??
      (typeof eventObject.client_reference_id === 'string'
        ? eventObject.client_reference_id
        : null)
    );
  }

  return metadataOrgRootClinicId(eventObject);
}

async function resolveOrgRootClinicId(input: {
  client: SupabaseServerClient;
  subscription: Stripe.Subscription;
  stripeCustomerId: string;
}) {
  const metadataOrgRootClinicId =
    input.subscription.metadata.org_root_clinic_id;
  if (metadataOrgRootClinicId) {
    return metadataOrgRootClinicId;
  }

  const bySubscription = await input.client
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

  const byCustomer = await input.client
    .from('subscriptions')
    .select('org_root_clinic_id')
    .eq('stripe_customer_id', input.stripeCustomerId)
    .maybeSingle();

  if (byCustomer.error) {
    throw byCustomer.error;
  }

  return byCustomer.data?.org_root_clinic_id ?? null;
}

function auditEventForSyncedSnapshot(input: {
  stripeStatus: string;
  cancelAtPeriodEnd: boolean;
  previousBillingState: string | null;
  nextBillingState: string;
}): BillingAuditEventType {
  if (input.previousBillingState?.startsWith('past_due')) {
    if (
      input.nextBillingState === 'active' ||
      input.nextBillingState === 'trialing' ||
      input.nextBillingState === 'cancel_scheduled'
    ) {
      return 'billing.payment_recovered';
    }
  }

  if (input.stripeStatus === 'canceled') {
    return 'billing.subscription_canceled';
  }

  if (input.cancelAtPeriodEnd) {
    return 'billing.cancel_scheduled';
  }

  if (input.stripeStatus === 'trialing') {
    return 'billing.trial_started';
  }

  return 'billing.subscription_synced';
}

export async function markWebhookEvent(input: {
  client: SupabaseServerClient;
  stripeEventId: string;
  status: WebhookProcessingStatus;
  retryable?: boolean;
  processingError?: string | null;
}) {
  const { error } = await input.client
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

  if (error) {
    throw error;
  }
}

export async function syncStripeSubscription(input: {
  client: SupabaseServerClient;
  subscription: Stripe.Subscription;
  stripeEventId: string | null;
  stripeEventCreatedAt: string | null;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
}) {
  const billingPriceEnv = assertBillingPriceEnv();
  const snapshot = mapStripeSubscriptionToBillingSnapshot({
    subscription: input.subscription,
    priceIds: billingPriceEnv.priceIds,
  });
  const orgRootClinicId = await resolveOrgRootClinicId({
    client: input.client,
    subscription: input.subscription,
    stripeCustomerId: snapshot.stripeCustomerId,
  });

  if (!orgRootClinicId) {
    throw new Error('Missing org_root_clinic_id for Stripe subscription sync');
  }

  const beforeResult = await input.client
    .from('subscriptions')
    .select('*')
    .eq('org_root_clinic_id', orgRootClinicId)
    .maybeSingle();

  if (beforeResult.error) {
    throw beforeResult.error;
  }

  const before = beforeResult.data ?? null;
  const now = new Date();
  const activeOverride = await fetchActiveBillingOverride({
    client: input.client,
    orgRootClinicId,
    now,
  });
  const recoveredFromPastDue =
    snapshot.stripeStatus === 'active' || snapshot.stripeStatus === 'trialing';
  const pastDueSince = recoveredFromPastDue
    ? null
    : (before?.past_due_since ?? null);
  const graceUntil = recoveredFromPastDue
    ? null
    : (before?.grace_until ?? null);
  const billingState = deriveBillingState({
    stripeStatus: snapshot.stripeStatus,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    pastDueSince: nullableDate(pastDueSince),
    graceUntil: nullableDate(graceUntil),
    activeOverride,
    now,
  });
  const upsertPayload = {
    org_root_clinic_id: orgRootClinicId,
    plan_code: snapshot.planCode,
    stripe_customer_id: snapshot.stripeCustomerId,
    stripe_subscription_id: snapshot.stripeSubscriptionId,
    stripe_single_subscription_item_id: snapshot.itemIds.single ?? null,
    stripe_group_base_subscription_item_id: snapshot.itemIds.groupBase ?? null,
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
    past_due_since: pastDueSince,
    grace_until: graceUntil,
    last_stripe_event_id: input.stripeEventId,
    last_stripe_event_created: input.stripeEventCreatedAt,
    last_synced_at: now.toISOString(),
    stripe_checkout_session_id: null,
    checkout_started_at: null,
    checkout_expires_at: null,
    checkout_plan_code: null,
    metadata: {
      source: input.source,
    },
  };
  const { error } = await input.client
    .from('subscriptions')
    .upsert(upsertPayload, {
      onConflict: 'org_root_clinic_id',
    });

  if (error) {
    throw error;
  }

  if (snapshot.trialEnd !== null || snapshot.stripeStatus === 'trialing') {
    const trialUpdate = await input.client
      .from('subscriptions')
      .update({ trial_consumed: true })
      .eq('org_root_clinic_id', orgRootClinicId);

    if (trialUpdate.error) {
      throw trialUpdate.error;
    }
  }

  const eventType = auditEventForSyncedSnapshot({
    stripeStatus: snapshot.stripeStatus,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    previousBillingState: before?.billing_state ?? null,
    nextBillingState: billingState,
  });

  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId,
      actorType: input.source === 'stripe_webhook' ? 'stripe' : 'internal',
      internalActor: input.internalActor ?? null,
      eventType,
      beforeState: before ?? null,
      afterState: upsertPayload,
      stripeEventId: input.stripeEventId,
      requestId: input.requestId ?? null,
      metadata: {
        source: input.source,
        stripe_subscription_id: snapshot.stripeSubscriptionId,
      },
    },
  });

  if (eventType === 'billing.payment_recovered') {
    await enqueueBillingLifecycleEmail({
      client: input.client,
      orgRootClinicId,
      templateType: 'billing_payment_recovered',
      dedupeScope: input.stripeEventId ?? snapshot.stripeSubscriptionId,
      payload: {
        clinicName: orgRootClinicId,
        billingState,
        currentPeriodEnd: snapshot.currentPeriodEnd?.toISOString() ?? null,
      },
    });
  }

  return { orgRootClinicId, billingState, snapshot };
}

async function handleCheckoutSessionCompleted(input: {
  client: SupabaseServerClient;
  session: Stripe.Checkout.Session;
  stripeEventId: string;
  stripeEventCreatedAt: string | null;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
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
  await syncStripeSubscription({
    client: input.client,
    subscription,
    stripeEventId: input.stripeEventId,
    stripeEventCreatedAt: input.stripeEventCreatedAt,
    source: input.source,
    internalActor: input.internalActor ?? null,
    requestId: input.requestId ?? null,
  });
}

async function handleCheckoutSessionExpired(input: {
  client: SupabaseServerClient;
  session: Stripe.Checkout.Session;
  stripeEventId: string;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
}) {
  const beforeResult = await input.client
    .from('subscriptions')
    .select('*')
    .eq('stripe_checkout_session_id', input.session.id)
    .is('stripe_subscription_id', null)
    .maybeSingle();

  if (beforeResult.error) {
    throw beforeResult.error;
  }

  const before = beforeResult.data ?? null;
  const updatePayload = {
    billing_state: 'none',
    stripe_checkout_session_id: null,
    checkout_started_at: null,
    checkout_expires_at: null,
    checkout_plan_code: null,
  };
  const { error } = await input.client
    .from('subscriptions')
    .update(updatePayload)
    .eq('stripe_checkout_session_id', input.session.id)
    .is('stripe_subscription_id', null);

  if (error) {
    throw error;
  }

  if (before) {
    await writeBillingAuditLog({
      client: input.client,
      audit: {
        orgRootClinicId: before.org_root_clinic_id,
        actorType: input.source === 'stripe_webhook' ? 'stripe' : 'internal',
        internalActor: input.internalActor ?? null,
        eventType: 'billing.checkout_expired',
        beforeState: before,
        afterState: updatePayload,
        stripeEventId: input.stripeEventId,
        requestId: input.requestId ?? null,
        metadata: {
          source: input.source,
          stripe_checkout_session_id: input.session.id,
        },
      },
    });
  }
}

async function handleInvoicePaymentFailed(input: {
  client: SupabaseServerClient;
  invoice: Stripe.Invoice;
  stripeEventId: string;
  stripeEventCreatedAt: string | null;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
}) {
  const subscriptionId = extractInvoiceSubscriptionId(input.invoice);
  if (!subscriptionId) {
    return;
  }

  const beforeResult = await input.client
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (beforeResult.error) {
    throw beforeResult.error;
  }

  if (!beforeResult.data) {
    return;
  }

  const before = beforeResult.data;
  const now = new Date();
  const pastDueSince = before.past_due_since
    ? new Date(before.past_due_since)
    : now;
  const graceUntil = before.grace_until
    ? new Date(before.grace_until)
    : addDays(pastDueSince, PAST_DUE_GRACE_DAYS);
  const activeOverride = await fetchActiveBillingOverride({
    client: input.client,
    orgRootClinicId: before.org_root_clinic_id,
    now,
  });
  const billingState = deriveBillingState({
    stripeStatus: 'past_due',
    cancelAtPeriodEnd: before.cancel_at_period_end,
    currentPeriodEnd: nullableDate(before.current_period_end),
    pastDueSince,
    graceUntil,
    activeOverride,
    now,
  });
  const updatePayload = {
    billing_state: billingState,
    stripe_status: 'past_due',
    past_due_since: pastDueSince.toISOString(),
    grace_until: graceUntil.toISOString(),
    last_stripe_event_id: input.stripeEventId,
    last_stripe_event_created: input.stripeEventCreatedAt,
    last_synced_at: now.toISOString(),
  };
  const { error } = await input.client
    .from('subscriptions')
    .update(updatePayload)
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    throw error;
  }

  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId: before.org_root_clinic_id,
      actorType: input.source === 'stripe_webhook' ? 'stripe' : 'internal',
      internalActor: input.internalActor ?? null,
      eventType: 'billing.payment_failed',
      beforeState: before,
      afterState: updatePayload,
      stripeEventId: input.stripeEventId,
      requestId: input.requestId ?? null,
      metadata: {
        source: input.source,
        stripe_subscription_id: subscriptionId,
      },
    },
  });

  await enqueueBillingLifecycleEmail({
    client: input.client,
    orgRootClinicId: before.org_root_clinic_id,
    templateType: 'billing_payment_failed',
    dedupeScope: input.stripeEventId,
    payload: {
      clinicName: before.org_root_clinic_id,
      billingState,
      graceUntil: graceUntil.toISOString(),
      currentPeriodEnd: before.current_period_end,
    },
  });
}

async function handleInvoicePaid(input: {
  client: SupabaseServerClient;
  invoice: Stripe.Invoice;
  stripeEventId: string;
  stripeEventCreatedAt: string | null;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
}) {
  const subscriptionId = extractInvoiceSubscriptionId(input.invoice);
  if (!subscriptionId) {
    return;
  }

  const subscription = await getStripeClient().subscriptions.retrieve(
    subscriptionId,
    {
      expand: ['items.data.price'],
    }
  );
  await syncStripeSubscription({
    client: input.client,
    subscription,
    stripeEventId: input.stripeEventId,
    stripeEventCreatedAt: input.stripeEventCreatedAt,
    source: input.source,
    internalActor: input.internalActor ?? null,
    requestId: input.requestId ?? null,
  });
}

async function handleTrialWillEnd(input: {
  client: SupabaseServerClient;
  subscription: Stripe.Subscription;
  stripeEventId: string;
  requestId?: string | null;
}) {
  const stripeCustomerId =
    typeof input.subscription.customer === 'string'
      ? input.subscription.customer
      : input.subscription.customer.id;
  const orgRootClinicId = await resolveOrgRootClinicId({
    client: input.client,
    subscription: input.subscription,
    stripeCustomerId,
  });

  if (!orgRootClinicId) {
    throw new Error('Missing org_root_clinic_id for trial warning');
  }

  const trialEnd = input.subscription.trial_end
    ? fromUnixSeconds(input.subscription.trial_end)
    : null;

  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId,
      actorType: 'stripe',
      eventType: 'billing.trial_will_end',
      stripeEventId: input.stripeEventId,
      requestId: input.requestId ?? null,
      metadata: {
        stripe_subscription_id: input.subscription.id,
        trial_end: trialEnd,
      },
    },
  });

  await enqueueBillingLifecycleEmail({
    client: input.client,
    orgRootClinicId,
    templateType: 'billing_trial_will_end',
    dedupeScope: input.stripeEventId,
    payload: {
      clinicName: orgRootClinicId,
      trialEnd,
      billingState: 'trialing',
    },
  });
}

export async function processStripeEvent(input: {
  client: SupabaseServerClient;
  event: StripeEventLike;
  source: StripeEventProcessingSource;
  internalActor?: string | null;
  requestId?: string | null;
}) {
  const stripeEventCreatedAt = fromUnixSeconds(input.event.created);
  const eventObject = input.event.data.object;

  switch (input.event.type) {
    case 'checkout.session.completed':
      if (!isCheckoutSession(eventObject)) {
        throw new Error('Invalid checkout.session.completed payload');
      }
      await handleCheckoutSessionCompleted({
        client: input.client,
        session: eventObject,
        stripeEventId: input.event.id,
        stripeEventCreatedAt,
        source: input.source,
        internalActor: input.internalActor ?? null,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'checkout.session.expired':
      if (!isCheckoutSession(eventObject)) {
        throw new Error('Invalid checkout.session.expired payload');
      }
      await handleCheckoutSessionExpired({
        client: input.client,
        session: eventObject,
        stripeEventId: input.event.id,
        source: input.source,
        internalActor: input.internalActor ?? null,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      if (!isSubscription(eventObject)) {
        throw new Error('Invalid subscription payload');
      }
      await syncStripeSubscription({
        client: input.client,
        subscription: eventObject,
        stripeEventId: input.event.id,
        stripeEventCreatedAt,
        source: input.source,
        internalActor: input.internalActor ?? null,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'invoice.payment_failed':
      if (!isInvoice(eventObject)) {
        throw new Error('Invalid invoice.payment_failed payload');
      }
      await handleInvoicePaymentFailed({
        client: input.client,
        invoice: eventObject,
        stripeEventId: input.event.id,
        stripeEventCreatedAt,
        source: input.source,
        internalActor: input.internalActor ?? null,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'invoice.paid':
      if (!isInvoice(eventObject)) {
        throw new Error('Invalid invoice.paid payload');
      }
      await handleInvoicePaid({
        client: input.client,
        invoice: eventObject,
        stripeEventId: input.event.id,
        stripeEventCreatedAt,
        source: input.source,
        internalActor: input.internalActor ?? null,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    case 'customer.subscription.trial_will_end':
      if (!isSubscription(eventObject)) {
        throw new Error('Invalid trial_will_end subscription payload');
      }
      await handleTrialWillEnd({
        client: input.client,
        subscription: eventObject,
        stripeEventId: input.event.id,
        requestId: input.requestId ?? null,
      });
      return 'processed' satisfies WebhookProcessingStatus;

    default:
      return 'ignored' satisfies WebhookProcessingStatus;
  }
}

function isStripeEventData(
  value: Json
): value is PersistedStripeEventPayload['data'] {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    'object' in value
  );
}

export function isPersistedStripeEventPayload(
  value: Json
): value is PersistedStripeEventPayload {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }

  const id = value.id;
  const type = value.type;
  const created = value.created;
  const livemode = value.livemode;
  const data = value.data;

  return (
    typeof id === 'string' &&
    typeof type === 'string' &&
    typeof created === 'number' &&
    typeof livemode === 'boolean' &&
    data !== undefined &&
    isStripeEventData(data)
  );
}
