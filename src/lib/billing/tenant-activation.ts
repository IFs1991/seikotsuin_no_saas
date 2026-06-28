import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import {
  assertBillingPriceEnv,
  isBillingEnabled,
  isTenantBillingGuardEnabled,
  type BillingPlanCode,
  type BillingState,
} from '@/lib/billing/config';
import {
  calculateAllowedBillableStoreCount,
  calculatePaidExtraStoreQuantity,
} from '@/lib/billing/plans';
import { canUseBusinessWriteAccess } from '@/lib/billing/state';
import { getStripeClient } from '@/lib/stripe/server';

export type BillingActivationStatus =
  | 'active'
  | 'pending_billing'
  | 'billing_failed';

export type BillingTenantSubscriptionRow = {
  org_root_clinic_id: string;
  plan_code: BillingPlanCode;
  billing_state: BillingState;
  stripe_subscription_id: string | null;
  stripe_store_subscription_item_id: string | null;
  included_store_quantity: number;
  paid_extra_store_quantity: number;
};

export type StoreActivationPlan =
  | {
      success: true;
      activeBillableStoreCount: number;
      targetActiveBillableStoreCount: number;
      allowedBillableStoreCount: number;
      targetPaidExtraStoreQuantity: number;
      currentPaidExtraStoreQuantity: number;
      requiresStripeQuantityIncrease: boolean;
      canActivateImmediately: boolean;
    }
  | {
      success: false;
      errorCode:
        | 'subscription_not_found'
        | 'subscription_not_group'
        | 'subscription_not_writable';
    };

export type StoreAddOnQuantitySyncResult =
  | {
      status: 'not_required';
      subscriptionItemId: string | null;
    }
  | {
      status: 'updated' | 'created';
      subscriptionItemId: string;
    };

type StoreAddOnSubscription = Pick<
  BillingTenantSubscriptionRow,
  | 'stripe_subscription_id'
  | 'stripe_store_subscription_item_id'
  | 'paid_extra_store_quantity'
>;

type StripeStoreAddOnClient = {
  subscriptionItems: {
    update: (
      id: string,
      params: {
        quantity: number;
        proration_behavior: 'none';
      }
    ) => Promise<{ id: string }>;
    create: (params: {
      subscription: string;
      price: string;
      quantity: number;
      proration_behavior: 'none';
    }) => Promise<{ id: string }>;
  };
};

export type ActivationRpcResult = {
  success: boolean;
  error_code: string | null;
  active_billable_store_count: number;
  allowed_billable_store_count: number;
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

function assertBillingTenantSubscriptionRow(
  row: {
    org_root_clinic_id: string;
    plan_code: string;
    billing_state: string;
    stripe_subscription_id: string | null;
    stripe_store_subscription_item_id: string | null;
    included_store_quantity: number;
    paid_extra_store_quantity: number;
  } | null
): BillingTenantSubscriptionRow | null {
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

export function isTenantBillingGuardActive() {
  return isBillingEnabled() && isTenantBillingGuardEnabled();
}

export async function fetchTenantBillingSubscription(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
}) {
  const { data, error } = await input.client
    .from('subscriptions')
    .select(
      'org_root_clinic_id, plan_code, billing_state, stripe_subscription_id, stripe_store_subscription_item_id, included_store_quantity, paid_extra_store_quantity'
    )
    .eq('org_root_clinic_id', input.orgRootClinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return assertBillingTenantSubscriptionRow(data);
}

export function buildStoreActivationPlan(input: {
  subscription: BillingTenantSubscriptionRow | null;
  activeBillableStoreCount: number;
}): StoreActivationPlan {
  if (input.subscription === null) {
    return { success: false, errorCode: 'subscription_not_found' };
  }

  if (input.subscription.plan_code !== 'group') {
    return { success: false, errorCode: 'subscription_not_group' };
  }

  if (!canUseBusinessWriteAccess(input.subscription.billing_state)) {
    return { success: false, errorCode: 'subscription_not_writable' };
  }

  const targetActiveBillableStoreCount = input.activeBillableStoreCount + 1;
  const currentPaidExtraStoreQuantity =
    input.subscription.paid_extra_store_quantity;
  const targetPaidExtraStoreQuantity = calculatePaidExtraStoreQuantity(
    targetActiveBillableStoreCount,
    input.subscription.included_store_quantity
  );
  const allowedBillableStoreCount = calculateAllowedBillableStoreCount({
    includedStoreQuantity: input.subscription.included_store_quantity,
    paidExtraStoreQuantity: currentPaidExtraStoreQuantity,
  });

  return {
    success: true,
    activeBillableStoreCount: input.activeBillableStoreCount,
    targetActiveBillableStoreCount,
    allowedBillableStoreCount,
    targetPaidExtraStoreQuantity,
    currentPaidExtraStoreQuantity,
    requiresStripeQuantityIncrease:
      targetPaidExtraStoreQuantity > currentPaidExtraStoreQuantity,
    canActivateImmediately:
      targetActiveBillableStoreCount <= allowedBillableStoreCount,
  };
}

export async function ensureStripeStoreAddOnQuantity(input: {
  subscription: StoreAddOnSubscription;
  targetPaidExtraStoreQuantity: number;
  stripe?: StripeStoreAddOnClient;
}): Promise<StoreAddOnQuantitySyncResult> {
  if (
    input.targetPaidExtraStoreQuantity <=
    input.subscription.paid_extra_store_quantity
  ) {
    return {
      status: 'not_required',
      subscriptionItemId: input.subscription.stripe_store_subscription_item_id,
    };
  }

  if (!input.subscription.stripe_subscription_id) {
    throw new Error('Stripe subscription ID is required for store add-on sync');
  }

  const { priceIds } = assertBillingPriceEnv();
  if (!priceIds.storeAddon) {
    throw new Error('STRIPE_PRICE_STORE_ADDON_ID is required');
  }

  const stripe = input.stripe ?? getStripeClient();
  if (input.subscription.stripe_store_subscription_item_id) {
    const updated = await stripe.subscriptionItems.update(
      input.subscription.stripe_store_subscription_item_id,
      {
        quantity: input.targetPaidExtraStoreQuantity,
        proration_behavior: 'none',
      }
    );

    return {
      status: 'updated',
      subscriptionItemId: updated.id,
    };
  }

  const created = await stripe.subscriptionItems.create({
    subscription: input.subscription.stripe_subscription_id,
    price: priceIds.storeAddon,
    quantity: input.targetPaidExtraStoreQuantity,
    proration_behavior: 'none',
  });

  return {
    status: 'created',
    subscriptionItemId: created.id,
  };
}

export async function markClinicBillingActivationFailed(input: {
  client: SupabaseServerClient;
  clinicId: string;
  errorMessage: string;
}) {
  const { error } = await input.client
    .from('clinics')
    .update({
      billing_activation_status: 'billing_failed',
      billing_activation_failed_at: new Date().toISOString(),
      billing_activation_error: input.errorMessage,
    })
    .eq('id', input.clinicId);

  if (error) {
    throw error;
  }
}

export async function activateBillableStoreIfCapacity(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
  clinicId: string;
}): Promise<ActivationRpcResult> {
  const { data, error } = await input.client.rpc(
    'activate_billable_store_if_capacity',
    {
      p_org_root_clinic_id: input.orgRootClinicId,
      p_clinic_id: input.clinicId,
    }
  );

  if (error) {
    throw error;
  }

  const firstResult = data[0] ?? null;
  if (!firstResult) {
    throw new Error('Billing activation RPC returned no result');
  }

  return firstResult;
}
