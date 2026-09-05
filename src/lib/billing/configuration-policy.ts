// Pure policy shared by the runtime gate and the offline release preflight.
// Keep this module free of server-only imports and environment side effects.
export type BusinessWriteGateEnvironment = {
  nodeEnv: string;
  pilotMode: boolean;
  billingEnabled: boolean;
  billingUiEnabled: boolean;
  tenantGuardEnabled: boolean;
};
export type BusinessWriteGateMode = 'bypass' | 'enforce' | 'misconfigured';
type Settings = Readonly<Record<string, string | undefined>>;

export function isEnabledFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function resolveBusinessWriteGateMode(
  environment: BusinessWriteGateEnvironment
): BusinessWriteGateMode {
  const guardFullyEnabled =
    environment.billingEnabled && environment.tenantGuardEnabled;
  if (environment.nodeEnv === 'production' && !environment.pilotMode) {
    return guardFullyEnabled && environment.billingUiEnabled
      ? 'enforce'
      : 'misconfigured';
  }
  return guardFullyEnabled ? 'enforce' : 'bypass';
}

export function inspectBillingConfiguration(settings: Settings) {
  const environment: BusinessWriteGateEnvironment = {
    nodeEnv: settings.NODE_ENV ?? 'development',
    pilotMode: isEnabledFlag(settings.NEXT_PUBLIC_PILOT_MODE ?? 'false'),
    billingEnabled: isEnabledFlag(settings.ENABLE_BILLING),
    billingUiEnabled: isEnabledFlag(settings.NEXT_PUBLIC_ENABLE_BILLING),
    tenantGuardEnabled: isEnabledFlag(settings.ENABLE_BILLING_TENANT_GUARD),
  };
  const mode = resolveBusinessWriteGateMode(environment);
  const missing: string[] = [];
  const invalid: string[] = [];
  if (environment.nodeEnv === 'production' && !environment.pilotMode) {
    for (const key of [
      'ENABLE_BILLING',
      'NEXT_PUBLIC_ENABLE_BILLING',
      'ENABLE_BILLING_TENANT_GUARD',
    ]) {
      if (!isEnabledFlag(settings[key])) invalid.push(key);
    }
    const plans = (settings.BILLING_ENABLED_PLANS ?? 'single_clinic,group')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (
      !plans.length ||
      plans.some(plan => plan !== 'group' && plan !== 'single_clinic')
    )
      invalid.push('BILLING_ENABLED_PLANS');
    const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
    if (plans.includes('group'))
      required.push(
        'STRIPE_PRICE_GROUP_BASE_ID',
        'STRIPE_PRICE_STORE_ADDON_ID'
      );
    if (plans.includes('single_clinic'))
      required.push('STRIPE_PRICE_SINGLE_CLINIC_ID');
    for (const key of required) if (!settings[key]?.trim()) missing.push(key);
  }
  return {
    environment,
    mode,
    missing: missing.sort(),
    invalid: invalid.sort(),
  };
}

export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const;

export const PRODUCTION_PLATFORM_ENV_VARS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_DEFAULT',
  'RESEND_WEBHOOK_SECRET',
  'CRON_SECRET',
] as const;

const BILLING_ENV_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_SINGLE_CLINIC_ID',
  'STRIPE_PRICE_GROUP_BASE_ID',
  'STRIPE_PRICE_STORE_ADDON_ID',
] as const;

const BILLING_FEATURE_FLAGS = [
  'ENABLE_BILLING',
  'NEXT_PUBLIC_ENABLE_BILLING',
  'ENABLE_BILLING_TENANT_GUARD',
  'ENABLE_BILLING_OVERRIDES',
  'ENABLE_BILLING_INTERNAL_ROUTES',
  'ENABLE_BILLING_UPGRADE',
] as const;

export type EnvironmentValidationResult = {
  ok: boolean;
  missing: string[];
  invalid: string[];
};

function isMissingEnvValue(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function collectMissing(
  names: readonly string[],
  envSource: NodeJS.ProcessEnv
): string[] {
  return names.filter(name => isMissingEnvValue(envSource[name]));
}

function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function validateProductionEnvironment(
  envSource: NodeJS.ProcessEnv = process.env
): EnvironmentValidationResult {
  if (envSource.NODE_ENV !== 'production') {
    return { ok: true, missing: [], invalid: [] };
  }

  const required: string[] = [
    ...REQUIRED_ENV_VARS,
    ...PRODUCTION_PLATFORM_ENV_VARS,
  ];
  const billingEnabled = BILLING_FEATURE_FLAGS.some(flag =>
    isEnabled(envSource[flag])
  );
  if (billingEnabled) {
    required.push(
      ...BILLING_ENV_VARS.filter(key => {
        const plans = envSource.BILLING_ENABLED_PLANS ?? 'single_clinic,group';
        const enabledPlans = plans.split(',').map(value => value.trim());
        if (key === 'STRIPE_PRICE_SINGLE_CLINIC_ID')
          return enabledPlans.includes('single_clinic');
        if (
          key === 'STRIPE_PRICE_GROUP_BASE_ID' ||
          key === 'STRIPE_PRICE_STORE_ADDON_ID'
        )
          return enabledPlans.includes('group');
        return true;
      })
    );
  }

  if (isEnabled(envSource.NEXT_PUBLIC_ENABLE_LIFF_BOOKING)) {
    required.push('LINE_CREDENTIALS_ENCRYPTION_KEY');
  }

  const missing = [...new Set(collectMissing(required, envSource))].sort();
  const invalid: string[] = [];

  if (isEnabled(envSource.TURNSTILE_BYPASS_NON_PRODUCTION)) {
    invalid.push('TURNSTILE_BYPASS_NON_PRODUCTION');
  }

  if (
    isEnabled(envSource.NEXT_PUBLIC_ENABLE_LIFF_BOOKING) &&
    !isMissingEnvValue(envSource.LINE_CREDENTIALS_ENCRYPTION_KEY) &&
    !/^[a-fA-F0-9]{64}$/.test(envSource.LINE_CREDENTIALS_ENCRYPTION_KEY ?? '')
  ) {
    invalid.push('LINE_CREDENTIALS_ENCRYPTION_KEY');
  }

  invalid.sort();
  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}
