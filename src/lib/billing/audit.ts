import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import { toJsonObject } from '@/lib/billing/json';
import type { Database, Json } from '@/types/supabase';

export const BILLING_AUDIT_EVENT_TYPES = [
  'billing.checkout_started',
  'billing.checkout_completed',
  'billing.portal_opened',
  'billing.subscription_synced',
  'billing.subscription_canceled',
  'billing.cancel_scheduled',
  'billing.payment_failed',
  'billing.payment_recovered',
  'billing.trial_started',
  'billing.trial_will_end',
  'billing.plan_upgraded',
  'billing.tenant_add_requested',
  'billing.tenant_pending_created',
  'billing.tenant_activated',
  'billing.tenant_activation_failed',
  'billing.override_created',
  'billing.override_expired',
  'billing.override_revoked',
  'billing.internal_resync_started',
  'billing.internal_resync_completed',
  'billing.webhook_replayed',
] as const;

export type BillingAuditEventType = (typeof BILLING_AUDIT_EVENT_TYPES)[number];

export type BillingAuditActorType = 'user' | 'stripe' | 'system' | 'internal';

export type BillingAuditInput = {
  orgRootClinicId?: string | null;
  actorType: BillingAuditActorType;
  actorUserId?: string | null;
  internalActor?: string | null;
  eventType: BillingAuditEventType;
  beforeState?: unknown;
  afterState?: unknown;
  stripeEventId?: string | null;
  requestId?: string | null;
  metadata?: unknown;
};

type BillingAuditInsert =
  Database['public']['Tables']['billing_audit_logs']['Insert'];

function optionalObject(value: unknown): Json | null {
  return value === undefined || value === null ? null : toJsonObject(value);
}

export async function writeBillingAuditLog(input: {
  client: SupabaseServerClient;
  audit: BillingAuditInput;
}) {
  const metadata =
    input.audit.metadata === undefined
      ? ({} satisfies Json)
      : toJsonObject(input.audit.metadata);

  const insert: BillingAuditInsert = {
    org_root_clinic_id: input.audit.orgRootClinicId ?? null,
    actor_type: input.audit.actorType,
    actor_user_id: input.audit.actorUserId ?? null,
    internal_actor: input.audit.internalActor ?? null,
    event_type: input.audit.eventType,
    before_state: optionalObject(input.audit.beforeState),
    after_state: optionalObject(input.audit.afterState),
    stripe_event_id: input.audit.stripeEventId ?? null,
    request_id: input.audit.requestId ?? null,
    metadata,
  };

  const { error } = await input.client
    .from('billing_audit_logs')
    .insert(insert);

  if (error) {
    throw error;
  }
}
