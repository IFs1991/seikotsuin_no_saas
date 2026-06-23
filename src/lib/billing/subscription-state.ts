import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import { deriveBillingState } from '@/lib/billing/state';
import { fetchActiveBillingOverride } from '@/lib/billing/overrides';
import {
  writeBillingAuditLog,
  type BillingAuditEventType,
} from '@/lib/billing/audit';
import type { BillingState } from '@/lib/billing/config';

type SubscriptionStateRow = {
  org_root_clinic_id: string;
  stripe_status: string;
  billing_state: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
  grace_until: string | null;
};

function parseOptionalDate(value: string | null) {
  return value === null ? null : new Date(value);
}

export async function refreshSubscriptionBillingState(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
  now?: Date;
  eventType?: BillingAuditEventType;
  internalActor?: string | null;
  requestId?: string | null;
}): Promise<BillingState | null> {
  const now = input.now ?? new Date();
  const { data, error } = await input.client
    .from('subscriptions')
    .select(
      'org_root_clinic_id, stripe_status, billing_state, current_period_end, cancel_at_period_end, past_due_since, grace_until'
    )
    .eq('org_root_clinic_id', input.orgRootClinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row: SubscriptionStateRow = data;
  const activeOverride = await fetchActiveBillingOverride({
    client: input.client,
    orgRootClinicId: input.orgRootClinicId,
    now,
  });
  const nextState = deriveBillingState({
    stripeStatus: row.stripe_status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: parseOptionalDate(row.current_period_end),
    pastDueSince: parseOptionalDate(row.past_due_since),
    graceUntil: parseOptionalDate(row.grace_until),
    activeOverride,
    now,
  });

  if (row.billing_state === nextState) {
    return nextState;
  }

  const beforeState = { billing_state: row.billing_state };
  const afterState = { billing_state: nextState };
  const update = await input.client
    .from('subscriptions')
    .update({ billing_state: nextState })
    .eq('org_root_clinic_id', input.orgRootClinicId);

  if (update.error) {
    throw update.error;
  }

  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId: input.orgRootClinicId,
      actorType: input.internalActor ? 'internal' : 'system',
      internalActor: input.internalActor ?? null,
      eventType: input.eventType ?? 'billing.subscription_synced',
      beforeState,
      afterState,
      requestId: input.requestId ?? null,
      metadata: { source: 'refresh_subscription_billing_state' },
    },
  });

  return nextState;
}
