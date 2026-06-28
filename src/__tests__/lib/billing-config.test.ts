/** @jest-environment node */

import { afterEach, describe, expect, test } from '@jest/globals';

const ORIGINAL_ENV = process.env;

async function loadBillingConfig(overrides: NodeJS.ProcessEnv = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    ...overrides,
  };

  return await import('@/lib/billing/config');
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.resetModules();
});

describe('billing config', () => {
  test('defaults billing gates off while keeping plan names parseable', async () => {
    const config = await loadBillingConfig();

    expect(config.isBillingEnabled()).toBe(false);
    expect(config.isBillingUiEnabled()).toBe(false);
    expect(config.getEnabledBillingPlans()).toEqual(['single_clinic', 'group']);
  });

  test('parses enabled plans with trimming and de-duplication', async () => {
    const config = await loadBillingConfig({
      BILLING_ENABLED_PLANS: ' group, single_clinic,group ',
    });

    expect(config.getEnabledBillingPlans()).toEqual(['group', 'single_clinic']);
  });

  test('rejects unsupported plan codes', async () => {
    const config = await loadBillingConfig({
      BILLING_ENABLED_PLANS: 'group,enterprise',
    });

    expect(() => config.getEnabledBillingPlans()).toThrow(
      'Unsupported billing plan code: enterprise'
    );
  });

  test('does not require Stripe secrets while billing is disabled', async () => {
    const config = await loadBillingConfig({
      ENABLE_BILLING: 'false',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
    });

    expect(() => config.assertBillingServerEnv()).toThrow(
      'Billing is disabled'
    );
  });

  test('validates Stripe server secrets independently from billing gate', async () => {
    const config = await loadBillingConfig({
      ENABLE_BILLING: 'false',
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
    });

    expect(config.assertStripeServerEnv()).toEqual({
      stripeSecretKey: 'sk_test_example',
      stripeWebhookSecret: 'whsec_example',
    });
  });

  test('requires Stripe secrets and plan prices when billing is enabled', async () => {
    const config = await loadBillingConfig({
      ENABLE_BILLING: 'true',
      BILLING_ENABLED_PLANS: 'group',
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      STRIPE_PRICE_GROUP_BASE_ID: 'price_group_base',
      STRIPE_PRICE_STORE_ADDON_ID: 'price_store_addon',
    });

    expect(config.assertBillingServerEnv()).toEqual({
      stripeSecretKey: 'sk_test_example',
      stripeWebhookSecret: 'whsec_example',
      enabledPlans: ['group'],
      priceIds: {
        groupBase: 'price_group_base',
        storeAddon: 'price_store_addon',
      },
    });
  });
});
