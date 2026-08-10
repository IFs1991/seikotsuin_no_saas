import 'server-only';

import type Stripe from 'stripe';
import { assertBillingPriceEnv } from '@/lib/billing/config';
import { getStripeClient } from '@/lib/stripe/server';

export type BillingPriceTaxBehavior = 'inclusive' | 'exclusive' | 'unspecified';

export type BillingPriceDisplay = {
  currency: 'jpy';
  unitAmount: number;
  interval: 'month';
  intervalCount: 1;
  taxBehavior: BillingPriceTaxBehavior;
};

export type GroupBillingPriceCatalog = {
  groupBase: BillingPriceDisplay;
  storeAddon: BillingPriceDisplay;
};

type BillingPriceSource = Pick<
  Stripe.Price,
  'active' | 'currency' | 'unit_amount' | 'tax_behavior'
> & {
  recurring: Pick<
    NonNullable<Stripe.Price['recurring']>,
    'interval' | 'interval_count'
  > | null;
};

type RetrievePrice = (priceId: string) => Promise<BillingPriceSource>;

export class BillingPriceCatalogError extends Error {
  constructor() {
    super('Billing price catalog is unavailable');
    this.name = 'BillingPriceCatalogError';
  }
}

function toBillingPriceDisplay(price: BillingPriceSource): BillingPriceDisplay {
  if (
    !price.active ||
    price.currency !== 'jpy' ||
    price.unit_amount === null ||
    !Number.isInteger(price.unit_amount) ||
    price.unit_amount <= 0 ||
    price.recurring?.interval !== 'month' ||
    price.recurring.interval_count !== 1
  ) {
    throw new BillingPriceCatalogError();
  }

  return {
    currency: 'jpy',
    unitAmount: price.unit_amount,
    interval: 'month',
    intervalCount: 1,
    taxBehavior: price.tax_behavior ?? 'unspecified',
  };
}

export function buildGroupBillingPriceCatalog(input: {
  groupBasePrice: BillingPriceSource;
  storeAddonPrice: BillingPriceSource;
}): GroupBillingPriceCatalog {
  const groupBase = toBillingPriceDisplay(input.groupBasePrice);
  const storeAddon = toBillingPriceDisplay(input.storeAddonPrice);

  if (
    groupBase.currency !== storeAddon.currency ||
    groupBase.interval !== storeAddon.interval ||
    groupBase.intervalCount !== storeAddon.intervalCount
  ) {
    throw new BillingPriceCatalogError();
  }

  return { groupBase, storeAddon };
}

export async function fetchGroupBillingPriceCatalog(input?: {
  retrievePrice?: RetrievePrice;
  priceIds?: { groupBase: string; storeAddon: string };
}): Promise<GroupBillingPriceCatalog> {
  try {
    const configuredPriceIds =
      input?.priceIds ??
      (() => {
        const { priceIds } = assertBillingPriceEnv();

        if (!priceIds.groupBase || !priceIds.storeAddon) {
          throw new BillingPriceCatalogError();
        }

        return {
          groupBase: priceIds.groupBase,
          storeAddon: priceIds.storeAddon,
        };
      })();
    const retrievePrice =
      input?.retrievePrice ??
      ((priceId: string) => getStripeClient().prices.retrieve(priceId));
    const [groupBasePrice, storeAddonPrice] = await Promise.all([
      retrievePrice(configuredPriceIds.groupBase),
      retrievePrice(configuredPriceIds.storeAddon),
    ]);

    return buildGroupBillingPriceCatalog({
      groupBasePrice,
      storeAddonPrice,
    });
  } catch {
    throw new BillingPriceCatalogError();
  }
}
