import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import {
  BILLING_OVERRIDE_STATES,
  createBillingOverride,
} from '@/lib/billing/overrides';
import { refreshSubscriptionBillingState } from '@/lib/billing/subscription-state';

const INTERNAL_ACTOR = 'api/internal/billing/create-override';

const CreateOverrideRequestSchema = z.object({
  org_root_clinic_id: z.string().uuid(),
  override_state: z.enum(BILLING_OVERRIDE_STATES),
  reason: z.string().min(1),
  starts_at: z.string().datetime().optional(),
  expires_at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = requireBillingInternalRequest(request, {
    internalActor: INTERNAL_ACTOR,
    requireOverrides: true,
  });
  if (auth.success === false) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = CreateOverrideRequestSchema.safeParse(body);
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
  const override = await createBillingOverride({
    client,
    orgRootClinicId: parsed.data.org_root_clinic_id,
    overrideState: parsed.data.override_state,
    reason: parsed.data.reason,
    startsAt: parsed.data.starts_at
      ? new Date(parsed.data.starts_at)
      : undefined,
    expiresAt: new Date(parsed.data.expires_at),
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
    metadata: parsed.data.metadata,
  });
  const billingState = await refreshSubscriptionBillingState({
    client,
    orgRootClinicId: parsed.data.org_root_clinic_id,
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
    eventType: 'billing.override_created',
  });

  return NextResponse.json({
    success: true,
    data: {
      override,
      billing_state: billingState,
    },
  });
}
