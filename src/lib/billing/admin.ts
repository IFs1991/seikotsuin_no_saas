import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import type { BillingPlanCode, BillingState } from '@/lib/billing/config';

export type BillingRootClinic = {
  id: string;
  name: string;
};

export type BillingSubscriptionRow = {
  id: string;
  org_root_clinic_id: string;
  plan_code: BillingPlanCode;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_single_subscription_item_id: string | null;
  stripe_group_base_subscription_item_id: string | null;
  stripe_store_subscription_item_id: string | null;
  stripe_checkout_session_id: string | null;
  checkout_expires_at: string | null;
  billing_state: BillingState;
  stripe_status: string;
  trial_consumed: boolean;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  included_store_quantity: number;
  paid_extra_store_quantity: number;
};

function isBillingPlanCodeValue(value: string): value is BillingPlanCode {
  return value === 'single_clinic' || value === 'group';
}

function isBillingStateValue(value: string): value is BillingState {
  return [
    'none',
    'checkout_pending',
    'trialing',
    'active',
    'cancel_scheduled',
    'past_due_grace',
    'past_due_locked',
    'canceled',
    'expired',
    'override_active',
  ].includes(value);
}

function assertBillingSubscriptionRow(
  row: {
    id: string;
    org_root_clinic_id: string;
    plan_code: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_single_subscription_item_id: string | null;
    stripe_group_base_subscription_item_id: string | null;
    stripe_store_subscription_item_id: string | null;
    stripe_checkout_session_id: string | null;
    checkout_expires_at: string | null;
    billing_state: string;
    stripe_status: string;
    trial_consumed: boolean;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at_period_end: boolean;
    included_store_quantity: number;
    paid_extra_store_quantity: number;
  } | null
): BillingSubscriptionRow | null {
  if (row === null) {
    return null;
  }

  if (!isBillingPlanCodeValue(row.plan_code)) {
    throw new Error('Unsupported subscription plan_code');
  }

  if (!isBillingStateValue(row.billing_state)) {
    throw new Error('Unsupported subscription billing_state');
  }

  return {
    ...row,
    plan_code: row.plan_code,
    billing_state: row.billing_state,
  };
}

export async function resolveOrgRootClinicForBilling(input: {
  client: SupabaseServerClient;
  scopedClinicIds: string[];
}): Promise<BillingRootClinic> {
  const { data, error } = await input.client
    .from('clinics')
    .select('id, name, parent_id')
    .in('id', input.scopedClinicIds);

  if (error) {
    throw error;
  }

  const rootClinics = (data ?? []).filter(clinic => clinic.parent_id === null);

  if (rootClinics.length !== 1) {
    throw new Error('Unable to resolve a unique org root clinic for billing');
  }

  return {
    id: rootClinics[0].id,
    name: rootClinics[0].name,
  };
}

export async function fetchBillingSubscription(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
}) {
  const { data, error } = await input.client
    .from('subscriptions')
    .select(
      'id, org_root_clinic_id, plan_code, stripe_customer_id, stripe_subscription_id, stripe_single_subscription_item_id, stripe_group_base_subscription_item_id, stripe_store_subscription_item_id, stripe_checkout_session_id, checkout_expires_at, billing_state, stripe_status, trial_consumed, current_period_end, trial_end, cancel_at_period_end, included_store_quantity, paid_extra_store_quantity'
    )
    .eq('org_root_clinic_id', input.orgRootClinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return assertBillingSubscriptionRow(data);
}

export async function countActiveChildClinics(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
}) {
  const { count, error } = await input.client
    .from('clinics')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', input.orgRootClinicId)
    .eq('is_active', true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function isCheckoutPendingExpired(input: {
  subscription: Pick<
    BillingSubscriptionRow,
    'billing_state' | 'checkout_expires_at'
  >;
  now: Date;
}) {
  if (input.subscription.billing_state !== 'checkout_pending') {
    return false;
  }

  if (input.subscription.checkout_expires_at === null) {
    return false;
  }

  return new Date(input.subscription.checkout_expires_at) <= input.now;
}

export function hasBlockingBillingState(input: {
  subscription: BillingSubscriptionRow | null;
  now: Date;
}) {
  if (input.subscription === null) {
    return false;
  }

  if (
    input.subscription.billing_state === 'checkout_pending' &&
    isCheckoutPendingExpired({
      subscription: input.subscription,
      now: input.now,
    })
  ) {
    return false;
  }

  return [
    'checkout_pending',
    'trialing',
    'active',
    'cancel_scheduled',
    'past_due_grace',
    'past_due_locked',
    'override_active',
  ].includes(input.subscription.billing_state);
}
