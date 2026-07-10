import 'server-only';

import { fetchBillingSubscription } from '@/lib/billing/admin';
import {
  assertBillingServerEnv,
  isBillingEnabled,
  isBillingOverridesEnabled,
  isBillingUiEnabled,
  isEnabledFlag,
  isTenantBillingGuardEnabled,
  type BillingState,
} from '@/lib/billing/config';
import { fetchActiveBillingOverride } from '@/lib/billing/overrides';
import {
  canUseBusinessWriteAccessWithOverride,
  isActiveBillingOverride,
  type BillingOverride,
} from '@/lib/billing/state';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import type { SupabaseServerClient } from '@/lib/supabase';

export type BusinessWriteGateEnvironment = {
  nodeEnv: string;
  pilotMode: boolean;
  billingEnabled: boolean;
  billingUiEnabled: boolean;
  tenantGuardEnabled: boolean;
};

export type BusinessWriteGateMode = 'bypass' | 'enforce' | 'misconfigured';

export type BusinessWriteAccessResult =
  | {
      mode: 'bypass';
    }
  | {
      mode: 'enforce';
      orgRootClinicId: string;
      billingState: BillingState;
    };

export function resolveBusinessWriteGateMode(
  environment: BusinessWriteGateEnvironment
): BusinessWriteGateMode {
  const guardFullyEnabled =
    environment.billingEnabled && environment.tenantGuardEnabled;
  const isCommercialProduction =
    environment.nodeEnv === 'production' && !environment.pilotMode;

  if (isCommercialProduction) {
    return guardFullyEnabled && environment.billingUiEnabled
      ? 'enforce'
      : 'misconfigured';
  }

  return guardFullyEnabled ? 'enforce' : 'bypass';
}

export function getBusinessWriteGateEnvironment(): BusinessWriteGateEnvironment {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    pilotMode: isEnabledFlag(process.env.NEXT_PUBLIC_PILOT_MODE ?? 'false'),
    billingEnabled: isBillingEnabled(),
    billingUiEnabled: isBillingUiEnabled(),
    tenantGuardEnabled: isTenantBillingGuardEnabled(),
  };
}

function isCommercialProduction(environment: BusinessWriteGateEnvironment) {
  return environment.nodeEnv === 'production' && !environment.pilotMode;
}

export function assertBusinessWriteGateConfiguration(): Exclude<
  BusinessWriteGateMode,
  'misconfigured'
> {
  const environment = getBusinessWriteGateEnvironment();
  const mode = resolveBusinessWriteGateMode(environment);

  if (mode === 'misconfigured') {
    throw new AppError(
      ERROR_CODES.BILLING_CONFIGURATION_ERROR,
      '本番の課金機能またはテナント課金ガードが有効ではありません',
      503
    );
  }

  if (mode === 'enforce' && isCommercialProduction(environment)) {
    try {
      const billingEnv = assertBillingServerEnv();
      if (billingEnv.enabledPlans.length === 0) {
        throw new Error('BILLING_ENABLED_PLANS must include at least one plan');
      }
    } catch {
      throw new AppError(
        ERROR_CODES.BILLING_CONFIGURATION_ERROR,
        '本番のStripe課金設定が不足しています',
        503
      );
    }
  }

  return mode;
}

export function isSubscriptionWritable(input: {
  billingState: BillingState | null;
  activeOverride?: BillingOverride | null;
  now: Date;
}) {
  const hasActiveFullAccessOverride =
    isActiveBillingOverride(input.activeOverride, input.now) &&
    input.activeOverride?.state === 'allow_full_access';

  if (input.billingState === 'override_active') {
    return hasActiveFullAccessOverride;
  }

  return canUseBusinessWriteAccessWithOverride({
    state: input.billingState ?? 'none',
    activeOverride: input.activeOverride,
    now: input.now,
  });
}

async function resolveTargetOrgRootClinicId(input: {
  client: SupabaseServerClient;
  targetClinicId: string;
}) {
  const { data, error } = await input.client
    .from('clinics')
    .select('id, parent_id')
    .eq('id', input.targetClinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new AppError(
      ERROR_CODES.CLINIC_NOT_FOUND,
      '課金対象のクリニックが見つかりません',
      404
    );
  }

  return data.parent_id ?? data.id;
}

export async function ensureBusinessWriteAccess(input: {
  client: SupabaseServerClient;
  targetClinicId: string;
  now?: Date;
}): Promise<BusinessWriteAccessResult> {
  const mode = assertBusinessWriteGateConfiguration();
  if (mode === 'bypass') {
    return { mode: 'bypass' };
  }

  const now = input.now ?? new Date();
  const orgRootClinicId = await resolveTargetOrgRootClinicId(input);
  const [subscription, activeOverride] = await Promise.all([
    fetchBillingSubscription({
      client: input.client,
      orgRootClinicId,
    }),
    isBillingOverridesEnabled()
      ? fetchActiveBillingOverride({
          client: input.client,
          orgRootClinicId,
          now,
        })
      : Promise.resolve(null),
  ]);
  const billingState = subscription?.billing_state ?? null;

  if (
    !isSubscriptionWritable({
      billingState,
      activeOverride,
      now,
    })
  ) {
    throw new AppError(
      ERROR_CODES.SUBSCRIPTION_INACTIVE,
      '有効な契約または書き込み許可が必要です',
      402,
      {
        orgRootClinicId,
        billingState: billingState ?? 'none',
      }
    );
  }

  return {
    mode: 'enforce',
    orgRootClinicId,
    billingState: billingState ?? 'override_active',
  };
}
