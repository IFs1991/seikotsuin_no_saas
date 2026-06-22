import {
  isBillingPlanCode,
  type BillingPlanCode,
  type BillingServerEnv,
} from '@/lib/billing/config';
import {
  calculateAllowedBillableStoreCount,
  INCLUDED_GROUP_STORE_QUANTITY,
} from '@/lib/billing/plans';

export type StripeSubscriptionItemForBilling = {
  id: string;
  price: {
    id: string;
  };
  quantity?: number;
  current_period_start: number;
  current_period_end: number;
};

export type StripeSubscriptionForBilling = {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata: Record<string, string>;
  items: {
    data: StripeSubscriptionItemForBilling[];
  };
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  trial_end: number | null;
};

export type BillingSnapshot = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeStatus: string;
  planCode: BillingPlanCode;
  itemIds: {
    single?: string;
    groupBase?: string;
    storeAddOn?: string;
  };
  includedStoreQuantity: number;
  paidExtraStoreQuantity: number;
  allowedBillableStoreCount: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
};

function fromUnixSeconds(value: number | null) {
  return value === null ? null : new Date(value * 1000);
}

function resolveCustomerId(customer: StripeSubscriptionForBilling['customer']) {
  return typeof customer === 'string' ? customer : customer.id;
}

function findItemByPriceId(
  items: StripeSubscriptionItemForBilling[],
  priceId: string | undefined
) {
  return priceId
    ? (items.find(item => item.price.id === priceId) ?? null)
    : null;
}

function resolvePlanCode(input: {
  metadataPlanCode: string | undefined;
  singleItem: StripeSubscriptionItemForBilling | null;
  groupBaseItem: StripeSubscriptionItemForBilling | null;
}) {
  if (
    input.metadataPlanCode !== undefined &&
    isBillingPlanCode(input.metadataPlanCode)
  ) {
    return input.metadataPlanCode;
  }

  if (input.groupBaseItem) {
    return 'group';
  }

  if (input.singleItem) {
    return 'single_clinic';
  }

  throw new Error('Unable to resolve billing plan from Stripe subscription');
}

function resolveCurrentPeriod(items: StripeSubscriptionItemForBilling[]) {
  if (items.length === 0) {
    return {
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
  }

  const currentPeriodStart = Math.min(
    ...items.map(item => item.current_period_start)
  );
  const currentPeriodEnd = Math.max(
    ...items.map(item => item.current_period_end)
  );

  return {
    currentPeriodStart: fromUnixSeconds(currentPeriodStart),
    currentPeriodEnd: fromUnixSeconds(currentPeriodEnd),
  };
}

export function mapStripeSubscriptionToBillingSnapshot(input: {
  subscription: StripeSubscriptionForBilling;
  priceIds: BillingServerEnv['priceIds'];
  includedStoreQuantity?: number;
}): BillingSnapshot {
  const includedStoreQuantity =
    input.includedStoreQuantity ?? INCLUDED_GROUP_STORE_QUANTITY;
  const items = input.subscription.items.data;
  const singleItem = findItemByPriceId(items, input.priceIds.singleClinic);
  const groupBaseItem = findItemByPriceId(items, input.priceIds.groupBase);
  const storeAddOnItem = findItemByPriceId(items, input.priceIds.storeAddon);
  const planCode = resolvePlanCode({
    metadataPlanCode: input.subscription.metadata.plan_code,
    singleItem,
    groupBaseItem,
  });
  const paidExtraStoreQuantity = storeAddOnItem?.quantity ?? 0;
  const { currentPeriodStart, currentPeriodEnd } = resolveCurrentPeriod(items);

  return {
    stripeCustomerId: resolveCustomerId(input.subscription.customer),
    stripeSubscriptionId: input.subscription.id,
    stripeStatus: input.subscription.status,
    planCode,
    itemIds: {
      ...(singleItem ? { single: singleItem.id } : {}),
      ...(groupBaseItem ? { groupBase: groupBaseItem.id } : {}),
      ...(storeAddOnItem ? { storeAddOn: storeAddOnItem.id } : {}),
    },
    includedStoreQuantity,
    paidExtraStoreQuantity,
    allowedBillableStoreCount: calculateAllowedBillableStoreCount({
      includedStoreQuantity,
      paidExtraStoreQuantity,
    }),
    currentPeriodStart,
    currentPeriodEnd,
    trialEnd: fromUnixSeconds(input.subscription.trial_end),
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
    canceledAt: fromUnixSeconds(input.subscription.canceled_at),
    endedAt: fromUnixSeconds(input.subscription.ended_at),
  };
}
