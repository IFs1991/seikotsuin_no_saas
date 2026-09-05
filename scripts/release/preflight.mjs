import {
  inspectBillingConfiguration,
  validateProductionEnvironment,
  REQUIRED_ENV_VARS,
  PRODUCTION_PLATFORM_ENV_VARS,
} from '../../src/lib/billing/configuration-policy.ts';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Deliberately no automatic .env discovery and no network/DB writes. The operator
// supplies the selected environment (node --env-file=... is supported on Node 24).
export function releasePreflight(source = process.env) {
  const billing = inspectBillingConfiguration(source);
  const platform = validateProductionEnvironment(source);
  const required = [...REQUIRED_ENV_VARS, ...PRODUCTION_PLATFORM_ENV_VARS];
  const missing = [
    ...new Set([
      ...billing.missing,
      ...platform.missing,
      ...required.filter(key => !source[key]?.trim()),
    ]),
  ].sort();
  const invalid = [...billing.invalid, ...platform.invalid];
  if (billing.environment.nodeEnv !== 'production') invalid.push('NODE_ENV');
  if (billing.environment.pilotMode) invalid.push('NEXT_PUBLIC_PILOT_MODE');
  if (
    source.VERCEL !== '1' &&
    source.TRUST_CF_HEADERS !== 'true' &&
    !/^[1-9]\d*$/.test(source.TRUSTED_PROXY_COUNT ?? '')
  )
    invalid.push('TRUSTED_PROXY_COUNT');
  const stripeMode = source.STRIPE_SECRET_KEY?.startsWith('sk_test_')
    ? 'test'
    : source.STRIPE_SECRET_KEY?.startsWith('sk_live_')
      ? 'live'
      : 'unverified';
  return {
    release_profile: 'core-100',
    scope: 'process-environment-only',
    read_only: true,
    configuration_status: missing.length || invalid.length ? 'BLOCKED' : 'PASS',
    billing_mode: billing.mode,
    missing,
    invalid: [...new Set(invalid)].sort(),
    stripe_mode: stripeMode,
    settings: Object.fromEntries(
      required.map(key => [key, { present: Boolean(source[key]?.trim()) }])
    ),
    deployment: {
      status: 'BLOCKED',
      built_public_flags: 'NOT_VERIFIED',
      target_plans_region_and_row_limit: 'NOT_VERIFIED',
      postgrest_aggregates: 'NOT_VERIFIED',
    },
    notifications: {
      scope: 'BLOCKED',
      reason:
        'Existing enqueue and Cron paths remain enabled; confirm the offering before disabling existing customers or qualifying TASK-07.',
    },
    release_decision: 'NO_GO',
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length > 2) {
    console.error(
      'Usage: node [--env-file=approved-file] scripts/release/preflight.mjs'
    );
    process.exit(2);
  }
  const result = releasePreflight();
  console.log(JSON.stringify(result, null, 2));
  if (result.configuration_status !== 'PASS') process.exitCode = 2;
}
