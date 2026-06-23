import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import { revokeBillingOverride } from '@/lib/billing/overrides';
import { refreshSubscriptionBillingState } from '@/lib/billing/subscription-state';

const INTERNAL_ACTOR = 'api/internal/billing/revoke-override';

const RevokeOverrideRequestSchema = z.object({
  override_id: z.string().uuid(),
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
  const parsed = RevokeOverrideRequestSchema.safeParse(body);
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
  const override = await revokeBillingOverride({
    client,
    overrideId: parsed.data.override_id,
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
  });
  const billingState = await refreshSubscriptionBillingState({
    client,
    orgRootClinicId: override.org_root_clinic_id,
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
    eventType: 'billing.override_revoked',
  });

  return NextResponse.json({
    success: true,
    data: {
      override,
      billing_state: billingState,
    },
  });
}
