/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import {
  buildBillingLineItems,
  calculateAllowedBillableStoreCount,
  calculatePaidExtraStoreQuantity,
  INCLUDED_GROUP_STORE_QUANTITY,
} from '@/lib/billing/plans';

describe('billing plan helpers', () => {
  test('keeps first five Group stores inside the base subscription', () => {
    expect(calculatePaidExtraStoreQuantity(0)).toBe(0);
    expect(calculatePaidExtraStoreQuantity(5)).toBe(0);
    expect(calculatePaidExtraStoreQuantity(6)).toBe(1);
    expect(calculatePaidExtraStoreQuantity(9)).toBe(4);
    expect(INCLUDED_GROUP_STORE_QUANTITY).toBe(5);
  });

  test('calculates allowed store count from included and paid extra stores', () => {
    expect(
      calculateAllowedBillableStoreCount({ paidExtraStoreQuantity: 0 })
    ).toBe(5);
    expect(
      calculateAllowedBillableStoreCount({ paidExtraStoreQuantity: 3 })
    ).toBe(8);
  });

  test('builds Single Clinic line item with quantity one', () => {
    expect(
      buildBillingLineItems({
        planCode: 'single_clinic',
        activeBillableStoreCount: 0,
        priceIds: {
          singleClinic: 'price_single',
        },
      })
    ).toEqual([{ price: 'price_single', quantity: 1 }]);
  });

  test('rejects child stores for Single Clinic plan', () => {
    expect(() =>
      buildBillingLineItems({
        planCode: 'single_clinic',
        activeBillableStoreCount: 1,
        priceIds: {
          singleClinic: 'price_single',
        },
      })
    ).toThrow('Single Clinic plan cannot include child stores');
  });

  test('builds Group base-only line item within included store allowance', () => {
    expect(
      buildBillingLineItems({
        planCode: 'group',
        activeBillableStoreCount: 5,
        priceIds: {
          groupBase: 'price_group_base',
          storeAddon: 'price_store_addon',
        },
      })
    ).toEqual([{ price: 'price_group_base', quantity: 1 }]);
  });

  test('builds Group add-on quantity only beyond included stores', () => {
    expect(
      buildBillingLineItems({
        planCode: 'group',
        activeBillableStoreCount: 8,
        priceIds: {
          groupBase: 'price_group_base',
          storeAddon: 'price_store_addon',
        },
      })
    ).toEqual([
      { price: 'price_group_base', quantity: 1 },
      { price: 'price_store_addon', quantity: 3 },
    ]);
  });

  test('rejects invalid counts and missing required price ids', () => {
    expect(() => calculatePaidExtraStoreQuantity(-1)).toThrow(
      'activeBillableStoreCount must be a non-negative integer'
    );
    expect(() =>
      buildBillingLineItems({
        planCode: 'group',
        activeBillableStoreCount: 6,
        priceIds: {
          groupBase: 'price_group_base',
        },
      })
    ).toThrow('STRIPE_PRICE_STORE_ADDON_ID is required');
  });
});
