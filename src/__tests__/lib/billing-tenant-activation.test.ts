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
    const retrieveSubscription = jest.fn(async () => ({
      id: 'sub_123',
      metadata: { org_root_clinic_id: 'root-clinic-1' },
    }));
    const retrieveItem = jest.fn(async () => ({
      id: 'si_store_existing',
      subscription: 'sub_123',
      price: { id: 'price_store_addon' },
    }));
    const list = jest.fn(async () => ({
      data: [
        {
          id: 'si_store_existing',
          subscription: 'sub_123',
          price: { id: 'price_store_addon' },
        },
      ],
      has_more: false,
    }));
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    const result = await ensureStripeStoreAddOnQuantity({
      orgRootClinicId: 'root-clinic-1',
      subscription: buildSubscription({
        stripe_store_subscription_item_id: 'si_store_existing',
        paid_extra_store_quantity: 1,
      }),
      targetPaidExtraStoreQuantity: 2,
      stripe: {
        subscriptions: { retrieve: retrieveSubscription },
        subscriptionItems: { retrieve: retrieveItem, list, update, create },
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
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_123');
    expect(retrieveItem).toHaveBeenCalledWith('si_store_existing');
    expect(list).toHaveBeenCalledWith({ subscription: 'sub_123', limit: 100 });
    expect(create).not.toHaveBeenCalled();
  });

  test('creates Stripe store add-on item only with paid extra quantity', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const retrieveSubscription = jest.fn(async () => ({
      id: 'sub_123',
      metadata: { org_root_clinic_id: 'root-clinic-1' },
    }));
    const retrieveItem = jest.fn(async () => ({
      id: 'unused',
      subscription: 'sub_123',
      price: { id: 'price_store_addon' },
    }));
    const list = jest.fn(async () => ({ data: [], has_more: false }));
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    const result = await ensureStripeStoreAddOnQuantity({
      orgRootClinicId: 'root-clinic-1',
      subscription: buildSubscription({
        stripe_store_subscription_item_id: null,
        paid_extra_store_quantity: 0,
      }),
      targetPaidExtraStoreQuantity: 1,
      stripe: {
        subscriptions: { retrieve: retrieveSubscription },
        subscriptionItems: { retrieve: retrieveItem, list, update, create },
      },
    });

    expect(result).toEqual({
      status: 'created',
      subscriptionItemId: 'si_store_new',
    });
    expect(create).toHaveBeenCalledWith(
      {
        subscription: 'sub_123',
        price: 'price_store_addon',
        quantity: 1,
        proration_behavior: 'none',
      },
      { idempotencyKey: 'store-addon:sub_123:1' }
    );
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_123');
    expect(retrieveItem).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith({ subscription: 'sub_123', limit: 100 });
    expect(update).not.toHaveBeenCalled();
  });

  test('reuses an existing Stripe add-on item when the database item ID is missing', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    const result = await ensureStripeStoreAddOnQuantity({
      orgRootClinicId: 'root-clinic-1',
      subscription: buildSubscription({
        stripe_store_subscription_item_id: null,
        paid_extra_store_quantity: 0,
      }),
      targetPaidExtraStoreQuantity: 1,
      stripe: {
        subscriptions: {
          retrieve: jest.fn(async () => ({
            id: 'sub_123',
            metadata: { org_root_clinic_id: 'root-clinic-1' },
          })),
        },
        subscriptionItems: {
          retrieve: jest.fn(async () => ({
            id: 'unused',
            subscription: 'sub_123',
            price: { id: 'price_store_addon' },
          })),
          list: jest.fn(async () => ({
            data: [
              {
                id: 'si_store_existing',
                subscription: 'sub_123',
                price: { id: 'price_store_addon' },
              },
            ],
            has_more: false,
          })),
          update,
          create,
        },
      },
    });

    expect(result).toEqual({
      status: 'updated',
      subscriptionItemId: 'si_store_existing',
    });
    expect(update).toHaveBeenCalledWith('si_store_existing', {
      quantity: 1,
      proration_behavior: 'none',
    });
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects duplicate Stripe add-on items before mutating quantity', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    await expect(
      ensureStripeStoreAddOnQuantity({
        orgRootClinicId: 'root-clinic-1',
        subscription: buildSubscription({
          stripe_store_subscription_item_id: null,
          paid_extra_store_quantity: 0,
        }),
        targetPaidExtraStoreQuantity: 1,
        stripe: {
          subscriptions: {
            retrieve: jest.fn(async () => ({
              id: 'sub_123',
              metadata: { org_root_clinic_id: 'root-clinic-1' },
            })),
          },
          subscriptionItems: {
            retrieve: jest.fn(async () => ({
              id: 'unused',
              subscription: 'sub_123',
              price: { id: 'price_store_addon' },
            })),
            list: jest.fn(async () => ({
              data: ['first', 'second'].map(id => ({
                id,
                subscription: 'sub_123',
                price: { id: 'price_store_addon' },
              })),
              has_more: false,
            })),
            update,
            create,
          },
        },
      })
    ).rejects.toThrow('Multiple Stripe store add-on items found');

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects duplicate Stripe add-on items even when the database item ID is set', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const retrieveItem = jest.fn(async () => ({
      id: 'si_store_existing',
      subscription: 'sub_123',
      price: { id: 'price_store_addon' },
    }));
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    await expect(
      ensureStripeStoreAddOnQuantity({
        orgRootClinicId: 'root-clinic-1',
        subscription: buildSubscription({
          stripe_store_subscription_item_id: 'si_store_existing',
          paid_extra_store_quantity: 1,
        }),
        targetPaidExtraStoreQuantity: 2,
        stripe: {
          subscriptions: {
            retrieve: jest.fn(async () => ({
              id: 'sub_123',
              metadata: { org_root_clinic_id: 'root-clinic-1' },
            })),
          },
          subscriptionItems: {
            retrieve: retrieveItem,
            list: jest.fn(async () => ({
              data: ['si_store_existing', 'si_store_duplicate'].map(id => ({
                id,
                subscription: 'sub_123',
                price: { id: 'price_store_addon' },
              })),
              has_more: false,
            })),
            update,
            create,
          },
        },
      })
    ).rejects.toThrow('Multiple Stripe store add-on items found');

    expect(retrieveItem).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects a Stripe subscription that is not owned by the tenant', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const update = jest.fn(async () => ({ id: 'si_store_existing' }));
    const create = jest.fn(async () => ({ id: 'si_store_new' }));

    await expect(
      ensureStripeStoreAddOnQuantity({
        orgRootClinicId: 'root-clinic-1',
        subscription: buildSubscription({
          stripe_store_subscription_item_id: null,
          paid_extra_store_quantity: 0,
        }),
        targetPaidExtraStoreQuantity: 1,
        stripe: {
          subscriptions: {
            retrieve: jest.fn(async () => ({
              id: 'sub_123',
              metadata: { org_root_clinic_id: 'another-root' },
            })),
          },
          subscriptionItems: {
            retrieve: jest.fn(async () => ({
              id: 'unused',
              subscription: 'sub_123',
              price: { id: 'price_store_addon' },
            })),
            list: jest.fn(async () => ({ data: [], has_more: false })),
            update,
            create,
          },
        },
      })
    ).rejects.toThrow('Stripe subscription ownership check failed');

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects a database subscription outside the guarded organization root', async () => {
    const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
    const retrieveSubscription = jest.fn();
    const update = jest.fn();
    const create = jest.fn();

    await expect(
      ensureStripeStoreAddOnQuantity({
        orgRootClinicId: 'root-clinic-1',
        subscription: buildSubscription({
          org_root_clinic_id: 'another-root',
          stripe_store_subscription_item_id: 'si_store_existing',
          paid_extra_store_quantity: 1,
        }),
        targetPaidExtraStoreQuantity: 2,
        stripe: {
          subscriptions: { retrieve: retrieveSubscription },
          subscriptionItems: {
            retrieve: jest.fn(),
            list: jest.fn(),
            update,
            create,
          },
        },
      })
    ).rejects.toThrow('Stripe store add-on clinic scope mismatch');

    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: '別のサブスクリプション',
      itemSubscriptionId: 'sub_other',
      itemPriceId: 'price_store_addon',
    },
    {
      label: '別のPrice',
      itemSubscriptionId: 'sub_123',
      itemPriceId: 'price_other',
    },
  ])(
    'rejects an existing add-on item linked to $label',
    async ({ itemSubscriptionId, itemPriceId }) => {
      const { ensureStripeStoreAddOnQuantity } = await loadTenantActivation();
      const update = jest.fn(async () => ({ id: 'si_store_existing' }));
      const create = jest.fn(async () => ({ id: 'si_store_new' }));

      await expect(
        ensureStripeStoreAddOnQuantity({
          orgRootClinicId: 'root-clinic-1',
          subscription: buildSubscription({
            stripe_store_subscription_item_id: 'si_store_existing',
            paid_extra_store_quantity: 1,
          }),
          targetPaidExtraStoreQuantity: 2,
          stripe: {
            subscriptions: {
              retrieve: jest.fn(async () => ({
                id: 'sub_123',
                metadata: { org_root_clinic_id: 'root-clinic-1' },
              })),
            },
            subscriptionItems: {
              retrieve: jest.fn(async () => ({
                id: 'si_store_existing',
                subscription: itemSubscriptionId,
                price: { id: itemPriceId },
              })),
              list: jest.fn(async () => ({ data: [], has_more: false })),
              update,
              create,
            },
          },
        })
      ).rejects.toThrow('Stripe store add-on ownership check failed');

      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    }
  );
});
