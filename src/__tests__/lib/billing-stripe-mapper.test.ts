/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import {
  mapStripeSubscriptionToBillingSnapshot,
  type StripeSubscriptionForBilling,
} from '@/lib/billing/stripe-mapper';

function buildSubscription(
  overrides: Partial<StripeSubscriptionForBilling>
): StripeSubscriptionForBilling {
  return {
    id: 'sub_test',
    customer: 'cus_test',
    status: 'active',
    metadata: {},
    items: {
      data: [],
    },
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_end: null,
    ...overrides,
  };
}

describe('Stripe subscription billing mapper', () => {
  test('maps Single Clinic subscription from metadata and price item', () => {
    const snapshot = mapStripeSubscriptionToBillingSnapshot({
      subscription: buildSubscription({
        metadata: {
          plan_code: 'single_clinic',
        },
        trial_end: 1784678400,
        items: {
          data: [
            {
              id: 'si_single',
              price: { id: 'price_single' },
              quantity: 1,
              current_period_start: 1782086400,
              current_period_end: 1784678400,
            },
          ],
        },
      }),
      priceIds: {
        singleClinic: 'price_single',
      },
    });

    expect(snapshot).toMatchObject({
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      stripeStatus: 'active',
      planCode: 'single_clinic',
      itemIds: {
        single: 'si_single',
      },
      includedStoreQuantity: 5,
      paidExtraStoreQuantity: 0,
      allowedBillableStoreCount: 5,
    });
    expect(snapshot.currentPeriodStart?.toISOString()).toBe(
      '2026-06-22T00:00:00.000Z'
    );
    expect(snapshot.currentPeriodEnd?.toISOString()).toBe(
      '2026-07-22T00:00:00.000Z'
    );
    expect(snapshot.trialEnd?.toISOString()).toBe('2026-07-22T00:00:00.000Z');
  });

  test('maps Group subscription and add-on quantity beyond included stores', () => {
    const snapshot = mapStripeSubscriptionToBillingSnapshot({
      subscription: buildSubscription({
        customer: {
          id: 'cus_object',
        },
        metadata: {
          plan_code: 'group',
        },
        cancel_at_period_end: true,
        canceled_at: 1782172800,
        items: {
          data: [
            {
              id: 'si_group_base',
              price: { id: 'price_group_base' },
              quantity: 1,
              current_period_start: 1782086400,
              current_period_end: 1784678400,
            },
            {
              id: 'si_store_addon',
              price: { id: 'price_store_addon' },
              quantity: 3,
              current_period_start: 1782086400,
              current_period_end: 1784678400,
            },
          ],
        },
      }),
      priceIds: {
        groupBase: 'price_group_base',
        storeAddon: 'price_store_addon',
      },
    });

    expect(snapshot).toMatchObject({
      stripeCustomerId: 'cus_object',
      planCode: 'group',
      itemIds: {
        groupBase: 'si_group_base',
        storeAddOn: 'si_store_addon',
      },
      paidExtraStoreQuantity: 3,
      allowedBillableStoreCount: 8,
      cancelAtPeriodEnd: true,
    });
    expect(snapshot.canceledAt?.toISOString()).toBe('2026-06-23T00:00:00.000Z');
  });

  test('falls back to known price IDs when metadata plan is missing', () => {
    const snapshot = mapStripeSubscriptionToBillingSnapshot({
      subscription: buildSubscription({
        items: {
          data: [
            {
              id: 'si_group_base',
              price: { id: 'price_group_base' },
              quantity: 1,
              current_period_start: 1782086400,
              current_period_end: 1784678400,
            },
          ],
        },
      }),
      priceIds: {
        groupBase: 'price_group_base',
      },
    });

    expect(snapshot.planCode).toBe('group');
    expect(snapshot.paidExtraStoreQuantity).toBe(0);
  });

  test('throws when plan cannot be resolved safely', () => {
    expect(() =>
      mapStripeSubscriptionToBillingSnapshot({
        subscription: buildSubscription({
          metadata: {
            plan_code: 'enterprise',
          },
        }),
        priceIds: {},
      })
    ).toThrow('Unable to resolve billing plan from Stripe subscription');
  });
});
