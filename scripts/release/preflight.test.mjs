import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releasePreflight } from './preflight.mjs';

const configured = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_PILOT_MODE: 'false',
  ENABLE_BILLING: 'true',
  NEXT_PUBLIC_ENABLE_BILLING: 'true',
  ENABLE_BILLING_TENANT_GUARD: 'true',
  BILLING_ENABLED_PLANS: 'group',
  STRIPE_SECRET_KEY: 'sk_test_fixture_only',
  STRIPE_WEBHOOK_SECRET: 'webhook_fixture_only',
  STRIPE_PRICE_GROUP_BASE_ID: 'price_group_fixture',
  STRIPE_PRICE_STORE_ADDON_ID: 'price_store_fixture',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon_fixture_only',
  SUPABASE_SERVICE_ROLE_KEY: 'service_fixture_only',
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
  UPSTASH_REDIS_REST_URL: 'https://redis.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'redis_fixture_only',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site_fixture_only',
  TURNSTILE_SECRET_KEY: 'turnstile_fixture_only',
  RESEND_API_KEY: 'resend_fixture_only',
  RESEND_FROM_DEFAULT: 'noreply@example.invalid',
  RESEND_WEBHOOK_SECRET: 'resend_webhook_fixture_only',
  CRON_SECRET: 'cron_fixture_only',
  TRUSTED_PROXY_COUNT: '1',
};

test('valid group-only configuration needs no unused price, but does not authorize release', () => {
  const result = releasePreflight(configured);
  assert.equal(result.configuration_status, 'PASS');
  assert.equal(result.billing_mode, 'enforce');
  assert.equal(result.stripe_mode, 'test');
  assert.equal(result.deployment.status, 'BLOCKED');
  assert.equal(result.notifications.scope, 'BLOCKED');
  assert.equal(result.release_decision, 'NO_GO');
});

test('reports configuration faults using names without exposing secrets or endpoints', () => {
  const result = releasePreflight({ ...configured, STRIPE_WEBHOOK_SECRET: '' });
  assert.deepEqual(result.missing, ['STRIPE_WEBHOOK_SECRET']);
  assert.equal(result.configuration_status, 'BLOCKED');
  const serialized = JSON.stringify(result);
  for (const value of Object.values(configured).filter(
    value => value.includes('fixture') || value.includes('://')
  )) {
    assert.equal(serialized.includes(value), false);
  }
});

test('pilot bypass and missing trusted proxy cannot pass core-100 preflight', () => {
  const result = releasePreflight({
    ...configured,
    NEXT_PUBLIC_PILOT_MODE: 'true',
    TRUSTED_PROXY_COUNT: '',
  });
  assert.equal(result.configuration_status, 'BLOCKED');
  assert.ok(result.invalid.includes('NEXT_PUBLIC_PILOT_MODE'));
  assert.ok(result.invalid.includes('TRUSTED_PROXY_COUNT'));
});

test('health platform faults and empty plan sets remain configuration blockers', () => {
  const result = releasePreflight({
    ...configured,
    UPSTASH_REDIS_REST_TOKEN: '',
    BILLING_ENABLED_PLANS: '',
  });
  assert.equal(result.configuration_status, 'BLOCKED');
  assert.ok(result.missing.includes('UPSTASH_REDIS_REST_TOKEN'));
  assert.ok(result.invalid.includes('BILLING_ENABLED_PLANS'));
});
