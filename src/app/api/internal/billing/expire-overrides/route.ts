import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import { expireBillingOverrides } from '@/lib/billing/overrides';
import { refreshSubscriptionBillingState } from '@/lib/billing/subscription-state';

const INTERNAL_ACTOR = 'api/internal/billing/expire-overrides';

export async function POST(request: NextRequest) {
  const auth = requireBillingInternalRequest(request, {
    internalActor: INTERNAL_ACTOR,
    requireOverrides: true,
  });
  if (auth.success === false) {
    return auth.response;
  }

  const client = createAdminClient();
  const expired = await expireBillingOverrides({
    client,
    now: new Date(),
    internalActor: auth.actor.internalActor,
    requestId: auth.actor.requestId,
  });
  const refreshedOrgIds = new Set<string>();

  for (const override of expired) {
    if (refreshedOrgIds.has(override.org_root_clinic_id)) {
      continue;
    }

    refreshedOrgIds.add(override.org_root_clinic_id);
    await refreshSubscriptionBillingState({
      client,
      orgRootClinicId: override.org_root_clinic_id,
      internalActor: auth.actor.internalActor,
      requestId: auth.actor.requestId,
      eventType: 'billing.override_expired',
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      expired_count: expired.length,
      refreshed_org_count: refreshedOrgIds.size,
    },
  });
}
