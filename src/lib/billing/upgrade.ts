import 'server-only';

import Stripe from 'stripe';
import type { SupabaseServerClient } from '@/lib/supabase';
import {
  assertBillingServerEnv,
  type BillingServerEnv,
  type BillingState,
} from '@/lib/billing/config';
import type { BillingSubscriptionRow } from '@/lib/billing/admin';
import { writeBillingAuditLog } from '@/lib/billing/audit';
import {
  calculatePaidExtraStoreQuantity,
  INCLUDED_GROUP_STORE_QUANTITY,
} from '@/lib/billing/plans';
import { syncStripeSubscription } from '@/lib/billing/stripe-events';
import { env } from '@/lib/env';
import { getStripeClient } from '@/lib/stripe/server';

export type BillingUpgradeErrorCode =
  | 'subscription_not_found'
  | 'subscription_not_single'
  | 'subscription_not_upgradeable'
  | 'missing_stripe_subscription'
  | 'missing_single_subscription_item'
  | 'group_subscription_item_already_present'
  | 'group_plan_disabled';

export class BillingUpgradeError extends Error {
  constructor(readonly code: BillingUpgradeErrorCode) {
    super(code);
    this.name = 'BillingUpgradeError';
  }
}

export type SingleToGroupUpgradeEligibility =
  | { eligible: true }
  | {
      eligible: false;
      errorCode: BillingUpgradeErrorCode;
    };

export type StripeSubscriptionUpgradeClient = {
  subscriptions: {
    update: (
      id: string,
      params: Stripe.SubscriptionUpdateParams
    ) => Promise<Stripe.Subscription>;
  };
};

type UpgradeableSingleSubscription = BillingSubscriptionRow & {
  stripe_subscription_id: string;
  stripe_single_subscription_item_id: string;
};

const UPGRADEABLE_SINGLE_STATES = [
  'trialing',
  'active',
  'cancel_scheduled',
] satisfies BillingState[];

function isUpgradeableSingleBillingState(state: BillingState) {
  return UPGRADEABLE_SINGLE_STATES.some(
    upgradeableState => upgradeableState === state
  );
}

function assertPriceId(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function appEnvironment() {
  return env.NEXT_PUBLIC_APP_ENV || 'unknown';
}

export function evaluateSingleToGroupUpgrade(input: {
  subscription: BillingSubscriptionRow | null;
}): SingleToGroupUpgradeEligibility {
  const { subscription } = input;
  if (subscription === null) {
    return { eligible: false, errorCode: 'subscription_not_found' };
  }

  if (subscription.plan_code !== 'single_clinic') {
    return { eligible: false, errorCode: 'subscription_not_single' };
  }

  if (!isUpgradeableSingleBillingState(subscription.billing_state)) {
    return { eligible: false, errorCode: 'subscription_not_upgradeable' };
  }

  if (!subscription.stripe_subscription_id) {
    return { eligible: false, errorCode: 'missing_stripe_subscription' };
  }

  if (!subscription.stripe_single_subscription_item_id) {
    return {
      eligible: false,
      errorCode: 'missing_single_subscription_item',
    };
  }

  if (
    subscription.stripe_group_base_subscription_item_id ||
    subscription.stripe_store_subscription_item_id
  ) {
    return {
      eligible: false,
      errorCode: 'group_subscription_item_already_present',
    };
  }

  return { eligible: true };
}

function requireUpgradeableSingleSubscription(
  subscription: BillingSubscriptionRow | null
): asserts subscription is UpgradeableSingleSubscription {
  const eligibility = evaluateSingleToGroupUpgrade({ subscription });
  if (eligibility.eligible === false) {
    throw new BillingUpgradeError(eligibility.errorCode);
  }
}

export function buildSingleToGroupUpgradeItems(input: {
  singleSubscriptionItemId: string;
  activeBillableStoreCount: number;
  priceIds: BillingServerEnv['priceIds'];
  includedStoreQuantity?: number;
}): Stripe.SubscriptionUpdateParams.Item[] {
  if (!input.singleSubscriptionItemId) {
    throw new Error('Single subscription item ID is required');
  }

  const groupBasePriceId = assertPriceId(
    'STRIPE_PRICE_GROUP_BASE_ID',
    input.priceIds.groupBase
  );
  const paidExtraStoreQuantity = calculatePaidExtraStoreQuantity(
    input.activeBillableStoreCount,
    input.includedStoreQuantity ?? INCLUDED_GROUP_STORE_QUANTITY
  );
  const items: Stripe.SubscriptionUpdateParams.Item[] = [
    {
      id: input.singleSubscriptionItemId,
      deleted: true,
    },
    {
      price: groupBasePriceId,
      quantity: 1,
    },
  ];

  if (paidExtraStoreQuantity > 0) {
    items.push({
      price: assertPriceId(
        'STRIPE_PRICE_STORE_ADDON_ID',
        input.priceIds.storeAddon
      ),
      quantity: paidExtraStoreQuantity,
    });
  }

  return items;
}

export function buildSingleToGroupUpgradeParams(input: {
  orgRootClinicId: string;
  singleSubscriptionItemId: string;
  activeBillableStoreCount: number;
  priceIds: BillingServerEnv['priceIds'];
  includedStoreQuantity?: number;
  appEnvironment?: string;
}): Stripe.SubscriptionUpdateParams {
  return {
    items: buildSingleToGroupUpgradeItems({
      singleSubscriptionItemId: input.singleSubscriptionItemId,
      activeBillableStoreCount: input.activeBillableStoreCount,
      priceIds: input.priceIds,
      includedStoreQuantity: input.includedStoreQuantity,
    }),
    billing_cycle_anchor: 'unchanged',
    cancel_at_period_end: false,
    proration_behavior: 'none',
    metadata: {
      org_root_clinic_id: input.orgRootClinicId,
      plan_code: 'group',
      upgraded_from: 'single_clinic',
      app_environment: input.appEnvironment ?? appEnvironment(),
    },
    expand: ['items.data.price'],
  };
}

export async function upgradeSingleToGroupSubscription(input: {
  client: SupabaseServerClient;
  subscription: BillingSubscriptionRow | null;
  activeBillableStoreCount: number;
  actorUserId?: string | null;
  requestId?: string | null;
  stripe?: StripeSubscriptionUpgradeClient;
}) {
  requireUpgradeableSingleSubscription(input.subscription);

  const billingEnv = assertBillingServerEnv();
  if (!billingEnv.enabledPlans.includes('group')) {
    throw new BillingUpgradeError('group_plan_disabled');
  }

  const params = buildSingleToGroupUpgradeParams({
    orgRootClinicId: input.subscription.org_root_clinic_id,
    singleSubscriptionItemId:
      input.subscription.stripe_single_subscription_item_id,
    activeBillableStoreCount: input.activeBillableStoreCount,
    priceIds: billingEnv.priceIds,
    includedStoreQuantity: input.subscription.included_store_quantity,
  });
  const stripe = input.stripe ?? getStripeClient();
  const updatedSubscription = await stripe.subscriptions.update(
    input.subscription.stripe_subscription_id,
    params
  );
  const syncResult = await syncStripeSubscription({
    client: input.client,
    subscription: updatedSubscription,
    stripeEventId: null,
    stripeEventCreatedAt: null,
    source: 'plan_upgrade',
    internalActor: 'api/admin/billing/upgrade',
    requestId: input.requestId ?? null,
  });

  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId: input.subscription.org_root_clinic_id,
      actorType: 'user',
      actorUserId: input.actorUserId ?? null,
      internalActor: 'api/admin/billing/upgrade',
      eventType: 'billing.plan_upgraded',
      beforeState: input.subscription,
      afterState: {
        orgRootClinicId: syncResult.orgRootClinicId,
        planCode: syncResult.snapshot.planCode,
        billingState: syncResult.billingState,
        stripeSubscriptionId: syncResult.snapshot.stripeSubscriptionId,
        stripeCustomerId: syncResult.snapshot.stripeCustomerId,
        itemIds: syncResult.snapshot.itemIds,
        includedStoreQuantity: syncResult.snapshot.includedStoreQuantity,
        paidExtraStoreQuantity: syncResult.snapshot.paidExtraStoreQuantity,
      },
      requestId: input.requestId ?? null,
      metadata: {
        active_billable_store_count: input.activeBillableStoreCount,
        stripe_subscription_id: syncResult.snapshot.stripeSubscriptionId,
        source: 'plan_upgrade',
      },
    },
  });

  return syncResult;
}
