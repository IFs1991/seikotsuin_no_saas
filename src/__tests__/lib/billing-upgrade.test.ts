/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import type { BillingSubscriptionRow } from '@/lib/billing/admin';
import {
  buildSingleToGroupUpgradeItems,
  buildSingleToGroupUpgradeParams,
  evaluateSingleToGroupUpgrade,
} from '@/lib/billing/upgrade';

function buildSubscription(
  overrides: Partial<BillingSubscriptionRow> = {}
): BillingSubscriptionRow {
  return {
    id: 'subscription-row-1',
    org_root_clinic_id: 'root-clinic-1',
    plan_code: 'single_clinic',
    stripe_customer_id: 'cus_existing',
    stripe_subscription_id: 'sub_existing',
    stripe_single_subscription_item_id: 'si_single_existing',
    stripe_group_base_subscription_item_id: null,
    stripe_store_subscription_item_id: null,
    stripe_checkout_session_id: null,
    checkout_expires_at: null,
    billing_state: 'active',
    stripe_status: 'active',
    trial_consumed: true,
    current_period_end: '2026-07-22T00:00:00.000Z',
    trial_end: null,
    cancel_at_period_end: false,
    included_store_quantity: 5,
    paid_extra_store_quantity: 0,
    ...overrides,
  };
}

describe('Single to Group billing upgrade helpers', () => {
  test('builds an in-place subscription item swap without a second trial', () => {
    const params = buildSingleToGroupUpgradeParams({
      orgRootClinicId: 'root-clinic-1',
      singleSubscriptionItemId: 'si_single_existing',
      activeBillableStoreCount: 0,
      priceIds: {
        groupBase: 'price_group_base',
        storeAddon: 'price_store_addon',
      },
      appEnvironment: 'test',
    });

    expect(params).toMatchObject({
      billing_cycle_anchor: 'unchanged',
      cancel_at_period_end: false,
      proration_behavior: 'none',
      metadata: {
        org_root_clinic_id: 'root-clinic-1',
        plan_code: 'group',
        upgraded_from: 'single_clinic',
        app_environment: 'test',
      },
      expand: ['items.data.price'],
      items: [
        {
          id: 'si_single_existing',
          deleted: true,
        },
        {
          price: 'price_group_base',
          quantity: 1,
        },
      ],
    });
    expect('trial_period_days' in params).toBe(false);
    expect('trial_end' in params).toBe(false);
  });

  test('adds only paid extra store quantity beyond the included Group allowance', () => {
    expect(
      buildSingleToGroupUpgradeItems({
        singleSubscriptionItemId: 'si_single_existing',
        activeBillableStoreCount: 7,
        priceIds: {
          groupBase: 'price_group_base',
          storeAddon: 'price_store_addon',
        },
      })
    ).toEqual([
      {
        id: 'si_single_existing',
        deleted: true,
      },
      {
        price: 'price_group_base',
        quantity: 1,
      },
      {
        price: 'price_store_addon',
        quantity: 2,
      },
    ]);
  });

  test('keeps upgrade eligibility to existing active Single subscriptions', () => {
    expect(
      evaluateSingleToGroupUpgrade({
        subscription: buildSubscription(),
      })
    ).toEqual({ eligible: true });
    expect(
      evaluateSingleToGroupUpgrade({
        subscription: buildSubscription({ plan_code: 'group' }),
      })
    ).toEqual({
      eligible: false,
      errorCode: 'subscription_not_single',
    });
    expect(
      evaluateSingleToGroupUpgrade({
        subscription: buildSubscription({ billing_state: 'checkout_pending' }),
      })
    ).toEqual({
      eligible: false,
      errorCode: 'subscription_not_upgradeable',
    });
  });

  test('rejects missing or already-present Stripe item ids to avoid duplicate active items', () => {
    expect(
      evaluateSingleToGroupUpgrade({
        subscription: buildSubscription({
          stripe_single_subscription_item_id: null,
        }),
      })
    ).toEqual({
      eligible: false,
      errorCode: 'missing_single_subscription_item',
    });
    expect(
      evaluateSingleToGroupUpgrade({
        subscription: buildSubscription({
          stripe_group_base_subscription_item_id: 'si_group_existing',
        }),
      })
    ).toEqual({
      eligible: false,
      errorCode: 'group_subscription_item_already_present',
    });
  });

  test('requires Group price ids before mutating Stripe items', () => {
    expect(() =>
      buildSingleToGroupUpgradeItems({
        singleSubscriptionItemId: 'si_single_existing',
        activeBillableStoreCount: 0,
        priceIds: {},
      })
    ).toThrow('STRIPE_PRICE_GROUP_BASE_ID is required');
    expect(() =>
      buildSingleToGroupUpgradeItems({
        singleSubscriptionItemId: 'si_single_existing',
        activeBillableStoreCount: 6,
        priceIds: {
          groupBase: 'price_group_base',
        },
      })
    ).toThrow('STRIPE_PRICE_STORE_ADDON_ID is required');
  });
});
