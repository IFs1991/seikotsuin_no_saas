const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const;

const missing = REQUIRED_ENV_VARS.filter(name => {
  const value = process.env[name];
  return value === undefined || value.length === 0;
});

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
