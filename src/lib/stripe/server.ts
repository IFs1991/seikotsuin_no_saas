import 'server-only';

import Stripe from 'stripe';
import { assertStripeServerEnv } from '@/lib/billing/config';

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;
type StripeApiVersion = NonNullable<StripeConfig['apiVersion']>;

export const STRIPE_API_VERSION: StripeApiVersion = '2026-05-27.dahlia';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient === null) {
    const { stripeSecretKey } = assertStripeServerEnv();
    stripeClient = new Stripe(stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      maxNetworkRetries: 2,
    });
  }

  return stripeClient;
}

export function constructStripeWebhookEvent(input: {
  payload: string | Buffer;
  signature: string;
  webhookSecret?: string;
}) {
  const { stripeWebhookSecret } = input.webhookSecret
    ? { stripeWebhookSecret: input.webhookSecret }
    : assertStripeServerEnv();

  return getStripeClient().webhooks.constructEvent(
    input.payload,
    input.signature,
    stripeWebhookSecret
  );
}
