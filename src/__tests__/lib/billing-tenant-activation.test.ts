/** @jest-environment node */

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type { BillingTenantSubscriptionRow } from '@/lib/billing/tenant-activation';

const ORIGINAL_ENV = process.env;

function buildSubscription(
  overrides: Partial<BillingTenantSubscriptionRow> = {}
): BillingTenantSubscriptionRow {
  return {
    org_root_clinic_id: 'root-clinic-1',
    plan_code: 'group',
    billing_state: 'active',
    stripe_subscription_id: 'sub_123',
    stripe_store_subscription_item_id: null,
    included_store_quantity: 5,
    paid_extra_store_quantity: 0,
    ...overrides,
  };
}

async function loadTenantActivation() {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    ENABLE_BILLING: 'true',
    ENABLE_BILLING_TENANT_GUARD: 'true',
    BILLING_ENABLED_PLANS: 'group',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_GROUP_BASE_ID: 'price_group_base',
    STRIPE_PRICE_STORE_ADDON_ID: 'price_store_addon',
  };

  return await import('@/lib/billing/tenant-activation');
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.resetModules();
});

describe('billing tenant activation helpers', () => {
  test('activates within included Group allowance without Stripe quantity increase', async () => {
    const { buildStoreActivationPlan } = await loadTenantActivation();

    const plan = buildStoreActivationPlan({
      subscription: buildSubscription(),
      activeBillableStoreCount: 4,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        success: true,
        targetActiveBillableStoreCount: 5,
        targetPaidExtraStoreQuantity: 0,
        requiresStripeQuantityIncrease: false,
        canActivateImmediately: true,
      })
    );
  });

  test('requires Stripe add-on quantity only beyond included stores', async () => {
    const { buildStoreActivationPlan } = await loadTenantActivation();

    const plan = buildStoreActivationPlan({
      subscription: buildSubscription(),
      activeBillableStoreCount: 5,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        success: true,
        targetActiveBillableStoreCount: 6,
        targetPaidExtraStoreQuantity: 1,
        currentPaidExtraStoreQuantity: 0,
        requiresStripeQuantityIncrease: true,
        canActivateImmediately: false,
      })
    );
  });

  test('uses already paid extra capacity before touching Stripe again', async () => {
    const { buildStoreActivationPlan } = await loadTenantActivation();

    const plan = buildStoreActivationPlan({
      subscription: buildSubscription({ paid_extra_store_quantity: 2 }),
      activeBillableStoreCount: 6,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        success: true,
        targetActiveBillableStoreCount: 7,
        targetPaidExtraStoreQuantity: 2,
        currentPaidExtraStoreQuantity: 2,
        requiresStripeQuantityIncrease: false,
        canActivateImmediately: true,
      })
    );
  });

  test('rejects missing, non-Group, and non-writable subscriptions', async () => {
    const { buildStoreActivationPlan } = await loadTenantActivation();

    expect(
      buildStoreActivationPlan({
        subscription: null,
        activeBillableStoreCount: 0,
      })
    ).toEqual({ success: false, errorCode: 'subscription_not_found' });
    expect(
      buildStoreActivationPlan({
        subscription: buildSubscription({ plan_code: 'single_clinic' }),
        activeBillableStoreCount: 0,
      })
    ).toEqual({ success: false, errorCode: 'subscription_not_group' });
    expect(
      buildStoreActivationPlan({
        subscription: buildSubscription({ billing_state: 'past_due_locked' }),
        activeBillableStoreCount: 0,
      })
    ).toEqual({ success: false, errorCode: 'subscription_not_writable' });
  });

  test('updates existing Stripe store add-on item with no proration', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    const result = await ensureStripeStoreAddOnQuantity({
      subscription: buildSubscription({
        stripe_store_subscription_item_id: 'si_store_existing',
        paid_extra_store_quantity: 1,
      }),
      targetPaidExtraStoreQuantity: 2,
      stripe: {
        subscriptionItems: { update, create },
      },
    });

    expect(result).toEqual({
      status: 'updated',
      subscriptionItemId: 'si_store_existing',
    });
    expect(update).toHaveBeenCalledWith('si_store_existing', {
      quantity: 2,
      proration_behavior: 'none',
    });
    expect(create).not.toHaveBeenCalled();
  });

  test('creates Stripe store add-on item only with paid extra quantity', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    const result = await ensureStripeStoreAddOnQuantity({
      subscription: buildSubscription({
        stripe_store_subscription_item_id: null,
        paid_extra_store_quantity: 0,
      }),
      targetPaidExtraStoreQuantity: 1,
      stripe: {
        subscriptionItems: { update, create },
      },
    });

    expect(result).toEqual({
      status: 'created',
      subscriptionItemId: 'si_store_new',
    });
    expect(create).toHaveBeenCalledWith({
      subscription: 'sub_123',
      price: 'price_store_addon',
      quantity: 1,
      proration_behavior: 'none',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
