import type { BillingPlanCode, BillingServerEnv } from '@/lib/billing/config';

export const INCLUDED_GROUP_STORE_QUANTITY = 5;

export type BillingLineItem = {
  price: string;
  quantity: number;
};

export type BuildBillingLineItemsInput = {
  planCode: BillingPlanCode;
  activeBillableStoreCount: number;
  priceIds: BillingServerEnv['priceIds'];
  includedStoreQuantity?: number;
};

function assertNonNegativeInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertPriceId(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function calculatePaidExtraStoreQuantity(
  activeBillableStoreCount: number,
  includedStoreQuantity = INCLUDED_GROUP_STORE_QUANTITY
) {
  assertNonNegativeInteger(
    'activeBillableStoreCount',
    activeBillableStoreCount
  );
  assertNonNegativeInteger('includedStoreQuantity', includedStoreQuantity);

  return Math.max(activeBillableStoreCount - includedStoreQuantity, 0);
}

export function calculateAllowedBillableStoreCount(input: {
  includedStoreQuantity?: number;
  paidExtraStoreQuantity: number;
}) {
  const includedStoreQuantity =
    input.includedStoreQuantity ?? INCLUDED_GROUP_STORE_QUANTITY;

  assertNonNegativeInteger('includedStoreQuantity', includedStoreQuantity);
  assertNonNegativeInteger(
    'paidExtraStoreQuantity',
    input.paidExtraStoreQuantity
  );

  return includedStoreQuantity + input.paidExtraStoreQuantity;
}

export function buildBillingLineItems({
  planCode,
  activeBillableStoreCount,
  priceIds,
  includedStoreQuantity = INCLUDED_GROUP_STORE_QUANTITY,
}: BuildBillingLineItemsInput): BillingLineItem[] {
  if (planCode === 'single_clinic') {
    if (activeBillableStoreCount > 0) {
      throw new Error('Single Clinic plan cannot include child stores');
    }

    return [
      {
        price: assertPriceId(
          'STRIPE_PRICE_SINGLE_CLINIC_ID',
          priceIds.singleClinic
        ),
        quantity: 1,
      },
    ];
  }

  const groupBasePriceId = assertPriceId(
    'STRIPE_PRICE_GROUP_BASE_ID',
    priceIds.groupBase
  );
  const paidExtraStoreQuantity = calculatePaidExtraStoreQuantity(
    activeBillableStoreCount,
    includedStoreQuantity
  );

  if (paidExtraStoreQuantity === 0) {
    return [{ price: groupBasePriceId, quantity: 1 }];
  }

  return [
    { price: groupBasePriceId, quantity: 1 },
    {
      price: assertPriceId('STRIPE_PRICE_STORE_ADDON_ID', priceIds.storeAddon),
      quantity: paidExtraStoreQuantity,
    },
  ];
}
