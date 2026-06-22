import { assertEnv, env } from '@/lib/env';

export const BILLING_PLAN_CODES = ['single_clinic', 'group'] as const;

export type BillingPlanCode = (typeof BILLING_PLAN_CODES)[number];

export const BILLING_STATES = [
  'none',
  'checkout_pending',
  'trialing',
  'active',
  'cancel_scheduled',
  'past_due_grace',
  'past_due_locked',
  'canceled',
  'expired',
  'override_active',
] as const;

export type BillingState = (typeof BILLING_STATES)[number];

export type BillingServerEnv = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  enabledPlans: BillingPlanCode[];
  priceIds: {
    singleClinic?: string;
    groupBase?: string;
    storeAddon?: string;
  };
};

export type StripeServerEnv = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
};

export type BillingPriceEnv = {
  enabledPlans: BillingPlanCode[];
  priceIds: BillingServerEnv['priceIds'];
};

export function isBillingPlanCode(value: string): value is BillingPlanCode {
  return BILLING_PLAN_CODES.some(planCode => planCode === value);
}

export function isBillingState(value: string): value is BillingState {
  return BILLING_STATES.some(state => state === value);
}

export function isEnabledFlag(value: string) {
  return value.trim().toLowerCase() === 'true';
}

export function isBillingEnabled() {
  return isEnabledFlag(env.ENABLE_BILLING);
}

export function isBillingUiEnabled() {
  return isEnabledFlag(env.NEXT_PUBLIC_ENABLE_BILLING);
}

export function isTenantBillingGuardEnabled() {
  return isEnabledFlag(env.ENABLE_BILLING_TENANT_GUARD);
}

export function isBillingOverridesEnabled() {
  return isEnabledFlag(env.ENABLE_BILLING_OVERRIDES);
}

export function isBillingInternalRoutesEnabled() {
  return isEnabledFlag(env.ENABLE_BILLING_INTERNAL_ROUTES);
}

export function isBillingUpgradeEnabled() {
  return isEnabledFlag(env.ENABLE_BILLING_UPGRADE);
}

export function parseBillingEnabledPlans(
  value = env.BILLING_ENABLED_PLANS
): BillingPlanCode[] {
  const rawPlans = value
    .split(',')
    .map(rawPlan => rawPlan.trim())
    .filter(rawPlan => rawPlan.length > 0);

  const enabledPlans: BillingPlanCode[] = [];

  for (const rawPlan of rawPlans) {
    if (!isBillingPlanCode(rawPlan)) {
      throw new Error(`Unsupported billing plan code: ${rawPlan}`);
    }

    if (!enabledPlans.includes(rawPlan)) {
      enabledPlans.push(rawPlan);
    }
  }

  return enabledPlans;
}

export function getEnabledBillingPlans() {
  return parseBillingEnabledPlans(env.BILLING_ENABLED_PLANS);
}

export function assertBillingServerEnv(): BillingServerEnv {
  if (!isBillingEnabled()) {
    throw new Error('Billing is disabled');
  }

  const stripeEnv = assertStripeServerEnv();
  const priceEnv = assertBillingPriceEnv();

  return {
    stripeSecretKey: stripeEnv.stripeSecretKey,
    stripeWebhookSecret: stripeEnv.stripeWebhookSecret,
    enabledPlans: priceEnv.enabledPlans,
    priceIds: priceEnv.priceIds,
  };
}

export function assertBillingPriceEnv(): BillingPriceEnv {
  const enabledPlans = getEnabledBillingPlans();
  const priceIds: BillingServerEnv['priceIds'] = {};

  if (enabledPlans.includes('single_clinic')) {
    priceIds.singleClinic = assertEnv('STRIPE_PRICE_SINGLE_CLINIC_ID');
  }

  if (enabledPlans.includes('group')) {
    priceIds.groupBase = assertEnv('STRIPE_PRICE_GROUP_BASE_ID');
    priceIds.storeAddon = assertEnv('STRIPE_PRICE_STORE_ADDON_ID');
  }

  return {
    enabledPlans,
    priceIds,
  };
}

export function assertStripeServerEnv(): StripeServerEnv {
  return {
    stripeSecretKey: assertEnv('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: assertEnv('STRIPE_WEBHOOK_SECRET'),
  };
}

export function assertInternalApiSecret() {
  return assertEnv('INTERNAL_API_SECRET');
}

export function assertCronSecret() {
  return assertEnv('CRON_SECRET');
}
