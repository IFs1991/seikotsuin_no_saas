/** @jest-environment node */

import { describe, expect, jest, test } from '@jest/globals';
import {
  BillingPriceCatalogError,
  buildGroupBillingPriceCatalog,
  fetchGroupBillingPriceCatalog,
} from '@/lib/billing/price-catalog';

const validBasePrice = {
  active: true,
  currency: 'jpy',
  unit_amount: 78000,
  tax_behavior: 'unspecified',
  recurring: {
    interval: 'month',
    interval_count: 1,
  },
} as const;

const validAddonPrice = {
  active: true,
  currency: 'jpy',
  unit_amount: 8000,
  tax_behavior: 'exclusive',
  recurring: {
    interval: 'month',
    interval_count: 1,
  },
} as const;

describe('billing price catalog', () => {
  test('converts valid Group prices to a client-safe display model', () => {
    expect(
      buildGroupBillingPriceCatalog({
        groupBasePrice: validBasePrice,
        storeAddonPrice: validAddonPrice,
      })
    ).toEqual({
      groupBase: {
        currency: 'jpy',
        unitAmount: 78000,
        interval: 'month',
        intervalCount: 1,
        taxBehavior: 'unspecified',
      },
      storeAddon: {
        currency: 'jpy',
        unitAmount: 8000,
        interval: 'month',
        intervalCount: 1,
        taxBehavior: 'exclusive',
      },
    });
  });

  test.each([
    ['inactive price', { ...validBasePrice, active: false }],
    ['missing amount', { ...validBasePrice, unit_amount: null }],
    ['zero amount', { ...validBasePrice, unit_amount: 0 }],
    ['different currency', { ...validBasePrice, currency: 'usd' }],
    [
      'non-monthly interval',
      {
        ...validBasePrice,
        recurring: { interval: 'year', interval_count: 1 },
      },
    ],
    [
      'non-monthly interval count',
      {
        ...validBasePrice,
        recurring: { interval: 'month', interval_count: 2 },
      },
    ],
  ])('rejects %s', (_name, invalidBasePrice) => {
    expect(() =>
      buildGroupBillingPriceCatalog({
        groupBasePrice: invalidBasePrice,
        storeAddonPrice: validAddonPrice,
      })
    ).toThrow(BillingPriceCatalogError);
  });

  test('does not expose configured references in the returned display model', async () => {
    const retrievePrice = jest.fn(async (reference: string) =>
      reference === 'group-base-reference' ? validBasePrice : validAddonPrice
    );
    const catalog = await fetchGroupBillingPriceCatalog({
      retrievePrice,
      priceIds: {
        groupBase: 'group-base-reference',
        storeAddon: 'store-addon-reference',
      },
    });
    const serializedCatalog = JSON.stringify(catalog);

    expect(retrievePrice).toHaveBeenCalledTimes(2);
    expect(serializedCatalog).not.toContain('group-base-reference');
    expect(serializedCatalog).not.toContain('store-addon-reference');
  });

  test('replaces provider errors with a fixed message that contains no sensitive value', async () => {
    const retrievePrice = jest.fn(async () => {
      throw new Error('provider failure with sensitive-value');
    });

    await expect(
      fetchGroupBillingPriceCatalog({
        retrievePrice,
        priceIds: {
          groupBase: 'group-base-reference',
          storeAddon: 'store-addon-reference',
        },
      })
    ).rejects.toThrow('Billing price catalog is unavailable');

    try {
      await fetchGroupBillingPriceCatalog({
        retrievePrice,
        priceIds: {
          groupBase: 'group-base-reference',
          storeAddon: 'store-addon-reference',
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BillingPriceCatalogError);
      expect(error instanceof Error ? error.message : '').not.toContain(
        'sensitive-value'
      );
    }
  });
});
