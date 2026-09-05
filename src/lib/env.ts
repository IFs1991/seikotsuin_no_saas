import { REQUIRED_ENV_VARS } from '@/lib/billing/configuration-policy';
export {
  validateProductionEnvironment,
  type EnvironmentValidationResult,
} from '@/lib/billing/configuration-policy';

const missing = REQUIRED_ENV_VARS.filter(name => !process.env[name]?.trim());

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  // eslint-disable-next-line no-restricted-syntax
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '',
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV ?? '',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
  LINE_CREDENTIALS_ENCRYPTION_KEY:
    process.env.LINE_CREDENTIALS_ENCRYPTION_KEY ?? '',
  NEXT_PUBLIC_ENABLE_LIFF_BOOKING:
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING ?? 'false',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY:
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY ?? '',
  TURNSTILE_BYPASS_NON_PRODUCTION:
    process.env.TURNSTILE_BYPASS_NON_PRODUCTION ?? 'false',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM_DEFAULT: process.env.RESEND_FROM_DEFAULT ?? '',
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET ?? '',
  ENABLE_BILLING: process.env.ENABLE_BILLING ?? 'false',
  NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING ?? 'false',
  BILLING_ENABLED_PLANS:
    process.env.BILLING_ENABLED_PLANS ?? 'single_clinic,group',
  ENABLE_BILLING_TENANT_GUARD:
    process.env.ENABLE_BILLING_TENANT_GUARD ?? 'false',
  ENABLE_BILLING_OVERRIDES: process.env.ENABLE_BILLING_OVERRIDES ?? 'false',
  ENABLE_BILLING_INTERNAL_ROUTES:
    process.env.ENABLE_BILLING_INTERNAL_ROUTES ?? 'false',
  ENABLE_BILLING_UPGRADE: process.env.ENABLE_BILLING_UPGRADE ?? 'false',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  STRIPE_PRICE_SINGLE_CLINIC_ID:
    process.env.STRIPE_PRICE_SINGLE_CLINIC_ID ?? '',
  STRIPE_PRICE_GROUP_BASE_ID: process.env.STRIPE_PRICE_GROUP_BASE_ID ?? '',
  STRIPE_PRICE_STORE_ADDON_ID: process.env.STRIPE_PRICE_STORE_ADDON_ID ?? '',
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET ?? '',
  CRON_SECRET: process.env.CRON_SECRET ?? '',
} as const;

export function assertEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}
