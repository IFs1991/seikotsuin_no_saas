/** @jest-environment node */

import { afterEach, describe, expect, test } from '@jest/globals';
import Stripe from 'stripe';

const ORIGINAL_ENV = process.env;

async function loadStripeServer(overrides: NodeJS.ProcessEnv = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_default',
    ...overrides,
  };

  return await import('@/lib/stripe/server');
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.resetModules();
});

describe('Stripe server wrapper', () => {
  test('pins the installed SDK API version', async () => {
    const stripeServer = await loadStripeServer();

    expect(stripeServer.STRIPE_API_VERSION).toBe('2026-05-27.dahlia');
  });

  test('constructs webhook events from raw payload and signature', async () => {
    const stripeServer = await loadStripeServer();
    const webhookSecret = 'whsec_test_override';
    const payload = JSON.stringify({
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      created: 1782086400,
      data: {
        object: {
          id: 'cs_test_example',
          object: 'checkout.session',
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const event = stripeServer.constructStripeWebhookEvent({
      payload,
      signature,
      webhookSecret,
    });

    expect(event.id).toBe('evt_test_webhook');
    expect(event.type).toBe('checkout.session.completed');
  });
});
