import { validateProductionEnvironment } from '@/lib/env';

function productionEnvironment(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-key',
    TURNSTILE_SECRET_KEY: 'turnstile-secret-key',
    RESEND_API_KEY: 'resend-key',
    RESEND_FROM_DEFAULT: 'App <no-reply@example.com>',
    RESEND_WEBHOOK_SECRET: 'resend-webhook-secret',
    CRON_SECRET: 'cron-secret',
    ENABLE_BILLING: 'false',
    NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'false',
    TURNSTILE_BYPASS_NON_PRODUCTION: 'false',
    ...overrides,
  };
}

describe('validateProductionEnvironment', () => {
  it('does not require production services for local or E2E environments', () => {
    expect(
      validateProductionEnvironment({
        NODE_ENV: 'development',
        TURNSTILE_BYPASS_NON_PRODUCTION: 'true',
      })
    ).toEqual({ ok: true, missing: [], invalid: [] });
  });

  it('requires the production platform service configuration', () => {
    const result = validateProductionEnvironment(
      productionEnvironment({
        UPSTASH_REDIS_REST_TOKEN: '',
        TURNSTILE_SECRET_KEY: '',
        RESEND_API_KEY: '',
        CRON_SECRET: '',
      })
    );

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        'UPSTASH_REDIS_REST_TOKEN',
        'TURNSTILE_SECRET_KEY',
        'RESEND_API_KEY',
        'CRON_SECRET',
      ])
    );
  });

  it('requires Stripe variables only when a billing feature is enabled', () => {
    const disabled = validateProductionEnvironment(productionEnvironment());
    const enabled = validateProductionEnvironment(
      productionEnvironment({ ENABLE_BILLING: 'true' })
    );

    expect(disabled.ok).toBe(true);
    expect(enabled.missing).toEqual(
      expect.arrayContaining([
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_SINGLE_CLINIC_ID',
        'STRIPE_PRICE_GROUP_BASE_ID',
        'STRIPE_PRICE_STORE_ADDON_ID',
      ])
    );
  });

  it('requires a valid LINE encryption key only when LIFF booking is enabled', () => {
    const disabled = validateProductionEnvironment(productionEnvironment());
    const enabled = validateProductionEnvironment(
      productionEnvironment({
        NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'true',
        LINE_CREDENTIALS_ENCRYPTION_KEY: 'invalid',
      })
    );

    expect(disabled.ok).toBe(true);
    expect(enabled.invalid).toContain('LINE_CREDENTIALS_ENCRYPTION_KEY');
  });

  it('rejects the non-production Turnstile bypass in production', () => {
    const result = validateProductionEnvironment(
      productionEnvironment({ TURNSTILE_BYPASS_NON_PRODUCTION: 'true' })
    );

    expect(result.invalid).toContain('TURNSTILE_BYPASS_NON_PRODUCTION');
  });
});
