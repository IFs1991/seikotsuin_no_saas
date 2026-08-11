import type { BillingPriceTaxBehavior } from '@/lib/billing/price-catalog';
import {
  calculateAllowedBillableStoreCount,
  calculatePaidExtraStoreQuantity,
} from '@/lib/billing/plans';
import { canUseBusinessWriteAccess } from '@/lib/billing/state';
import type { BillingPlanCode, BillingState } from '@/lib/billing/config';

export type TenantAddPreviewReason =
  | 'subscription_missing'
  | 'group_plan_required'
  | 'billing_state_unavailable'
  | 'activation_pending'
  | 'quantity_sync_pending'
  | 'quantity_update_unavailable'
  | 'pricing_unavailable';

export type TenantAddPreviewCounts = {
  activeStoreCount: number;
  afterStoreCount: number;
  includedStoreCount: number;
  contractedExtraStoreQuantity: number;
  contractedStoreLimit: number;
};

export type TenantAddPreviewPricing = {
  currency: 'jpy';
  interval: 'month';
  taxBehavior: BillingPriceTaxBehavior;
  storeAddonUnitAmount: number;
  quantityIncrease: number;
  monthlyIncrease: number;
  standardMonthlyTotal: number;
};

type TenantAddAllowedPreviewBase = TenantAddPreviewCounts & {
  canCreate: true;
};

export type TenantAddPreview =
  | (TenantAddAllowedPreviewBase & {
      status: 'billing_disabled';
    })
  | (TenantAddAllowedPreviewBase & {
      status: 'base_capacity';
    })
  | (TenantAddAllowedPreviewBase & {
      status: 'existing_paid_capacity';
    })
  | (TenantAddAllowedPreviewBase & {
      status: 'paid_quantity_increase';
      pricing: TenantAddPreviewPricing;
    })
  | (TenantAddPreviewCounts & {
      status: 'blocked';
      canCreate: false;
      reason: TenantAddPreviewReason;
    });

export type TenantAddSubscriptionSnapshot = {
  planCode: BillingPlanCode;
  billingState: BillingState;
  includedStoreQuantity: number;
  paidExtraStoreQuantity: number;
  canIncreaseStripeQuantity: boolean;
};

export type TenantAddPriceSnapshot = {
  groupBase: {
    currency: 'jpy';
    unitAmount: number;
    interval: 'month';
    taxBehavior: BillingPriceTaxBehavior;
  };
  storeAddon: {
    currency: 'jpy';
    unitAmount: number;
    interval: 'month';
    taxBehavior: BillingPriceTaxBehavior;
  };
};

function buildCounts(input: {
  activeStoreCount: number;
  includedStoreCount: number;
  paidExtraStoreQuantity: number;
}): TenantAddPreviewCounts {
  return {
    activeStoreCount: input.activeStoreCount,
    afterStoreCount: input.activeStoreCount + 1,
    includedStoreCount: input.includedStoreCount,
    contractedExtraStoreQuantity: input.paidExtraStoreQuantity,
    contractedStoreLimit: calculateAllowedBillableStoreCount({
      includedStoreQuantity: input.includedStoreCount,
      paidExtraStoreQuantity: input.paidExtraStoreQuantity,
    }),
  };
}

function resolveTaxBehavior(
  prices: TenantAddPriceSnapshot
): BillingPriceTaxBehavior {
  return prices.groupBase.taxBehavior === prices.storeAddon.taxBehavior
    ? prices.groupBase.taxBehavior
    : 'unspecified';
}

export function buildTenantAddPreview(input: {
  billingGuardEnabled: boolean;
  activeStoreCount: number;
  unresolvedActivationCount?: number;
  subscription: TenantAddSubscriptionSnapshot | null;
  prices?: TenantAddPriceSnapshot | null;
}): TenantAddPreview {
  if (!Number.isInteger(input.activeStoreCount) || input.activeStoreCount < 0) {
    throw new Error('activeStoreCount must be a non-negative integer');
  }

  const unresolvedActivationCount = input.unresolvedActivationCount ?? 0;
  if (
    !Number.isInteger(unresolvedActivationCount) ||
    unresolvedActivationCount < 0
  ) {
    throw new Error('unresolvedActivationCount must be a non-negative integer');
  }

  if (!input.billingGuardEnabled) {
    return {
      status: 'billing_disabled',
      canCreate: true,
      ...buildCounts({
        activeStoreCount: input.activeStoreCount,
        includedStoreCount: 0,
        paidExtraStoreQuantity: 0,
      }),
    };
  }

  const subscription = input.subscription;
  if (unresolvedActivationCount > 0) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'activation_pending',
      ...buildCounts({
        activeStoreCount: input.activeStoreCount,
        includedStoreCount: subscription?.includedStoreQuantity ?? 0,
        paidExtraStoreQuantity: subscription?.paidExtraStoreQuantity ?? 0,
      }),
    };
  }

  if (subscription === null) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'subscription_missing',
      ...buildCounts({
        activeStoreCount: input.activeStoreCount,
        includedStoreCount: 0,
        paidExtraStoreQuantity: 0,
      }),
    };
  }

  const counts = buildCounts({
    activeStoreCount: input.activeStoreCount,
    includedStoreCount: subscription.includedStoreQuantity,
    paidExtraStoreQuantity: subscription.paidExtraStoreQuantity,
  });

  if (subscription.planCode !== 'group') {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'group_plan_required',
      ...counts,
    };
  }

  if (!canUseBusinessWriteAccess(subscription.billingState)) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'billing_state_unavailable',
      ...counts,
    };
  }

  const requiredCurrentExtraStoreQuantity = calculatePaidExtraStoreQuantity(
    input.activeStoreCount,
    subscription.includedStoreQuantity
  );
  if (subscription.paidExtraStoreQuantity < requiredCurrentExtraStoreQuantity) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'quantity_sync_pending',
      ...counts,
    };
  }

  if (counts.afterStoreCount <= subscription.includedStoreQuantity) {
    return {
      status: 'base_capacity',
      canCreate: true,
      ...counts,
    };
  }

  const targetPaidExtraStoreQuantity = calculatePaidExtraStoreQuantity(
    counts.afterStoreCount,
    subscription.includedStoreQuantity
  );
  if (targetPaidExtraStoreQuantity <= subscription.paidExtraStoreQuantity) {
    return {
      status: 'existing_paid_capacity',
      canCreate: true,
      ...counts,
    };
  }

  if (!subscription.canIncreaseStripeQuantity) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'quantity_update_unavailable',
      ...counts,
    };
  }

  const prices = input.prices;
  if (!prices) {
    return {
      status: 'blocked',
      canCreate: false,
      reason: 'pricing_unavailable',
      ...counts,
    };
  }

  const quantityIncrease =
    targetPaidExtraStoreQuantity - subscription.paidExtraStoreQuantity;

  return {
    status: 'paid_quantity_increase',
    canCreate: true,
    ...counts,
    pricing: {
      currency: prices.storeAddon.currency,
      interval: prices.storeAddon.interval,
      taxBehavior: resolveTaxBehavior(prices),
      storeAddonUnitAmount: prices.storeAddon.unitAmount,
      quantityIncrease,
      monthlyIncrease: prices.storeAddon.unitAmount * quantityIncrease,
      standardMonthlyTotal:
        prices.groupBase.unitAmount +
        prices.storeAddon.unitAmount * targetPaidExtraStoreQuantity,
    },
  };
}
