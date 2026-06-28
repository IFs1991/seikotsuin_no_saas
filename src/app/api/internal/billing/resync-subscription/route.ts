import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import { writeBillingAuditLog } from '@/lib/billing/audit';
import { syncStripeSubscription } from '@/lib/billing/stripe-events';
import { getStripeClient } from '@/lib/stripe/server';

const INTERNAL_ACTOR = 'api/internal/billing/resync-subscription';

const ResyncRequestSchema = z
  .object({
    stripe_subscription_id: z.string().min(1).optional(),
    org_root_clinic_id: z.string().uuid().optional(),
  })
  .refine(
    value =>
      Boolean(value.stripe_subscription_id) ||
      Boolean(value.org_root_clinic_id),
    {
      message: 'stripe_subscription_id or org_root_clinic_id is required',
    }
  );

async function resolveStripeSubscriptionId(input: {
  client: ReturnType<typeof createAdminClient>;
  orgRootClinicId?: string;
  stripeSubscriptionId?: string;
}) {
  if (input.stripeSubscriptionId) {
    return input.stripeSubscriptionId;
  }

  const { data, error } = await input.client
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('org_root_clinic_id', input.orgRootClinicId ?? '')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.stripe_subscription_id ?? null;
}

export async function POST(request: NextRequest) {
  const auth = requireBillingInternalRequest(request, {
    internalActor: INTERNAL_ACTOR,
  });
  if (auth.success === false) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = ResyncRequestSchema.safeParse(body);
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
  await writeBillingAuditLog({
    client,
    audit: {
      orgRootClinicId: parsed.data.org_root_clinic_id ?? null,
      actorType: 'internal',
      internalActor: auth.actor.internalActor,
      eventType: 'billing.internal_resync_started',
      requestId: auth.actor.requestId,
      metadata: parsed.data,
    },
  });

  const stripeSubscriptionId = await resolveStripeSubscriptionId({
    client,
    orgRootClinicId: parsed.data.org_root_clinic_id,
    stripeSubscriptionId: parsed.data.stripe_subscription_id,
  });

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { success: false, error: 'Stripe subscription not found' },
      { status: 404 }
    );
  }

  const subscription = await getStripeClient().subscriptions.retrieve(
    stripeSubscriptionId,
    {
      expand: ['items.data.price'],
    }
  );
  const result = await syncStripeSubscription({
    client,
    subscription,
    stripeEventId: null,
    stripeEventCreatedAt: null,
    source: 'internal_resync',
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
  });

  await writeBillingAuditLog({
    client,
    audit: {
      orgRootClinicId: result.orgRootClinicId,
      actorType: 'internal',
      internalActor: auth.actor.internalActor,
      eventType: 'billing.internal_resync_completed',
      requestId: auth.actor.requestId,
      metadata: {
        stripe_subscription_id: result.snapshot.stripeSubscriptionId,
        billing_state: result.billingState,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      org_root_clinic_id: result.orgRootClinicId,
      stripe_subscription_id: result.snapshot.stripeSubscriptionId,
      billing_state: result.billingState,
    },
  });
}
