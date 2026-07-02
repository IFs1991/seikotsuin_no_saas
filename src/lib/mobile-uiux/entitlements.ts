import {
  evaluateMobileUiuxEnvRollout,
  type MobileUiuxPrincipalDecision,
} from '@/lib/mobile-uiux/access';
import type { MobileUiuxPublicFlags } from '@/lib/mobile-uiux/contracts';
import type {
  MobileUiuxEntitlementFlags,
  MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type ClinicFeatureFlagsRow =
  Database['public']['Tables']['clinic_feature_flags']['Row'];
type ClinicFeatureFlagsEntitlementRow = Pick<
  ClinicFeatureFlagsRow,
  | 'clinic_id'
  | 'mobile_uiux_enabled'
  | 'mobile_uiux_real_data_enabled'
  | 'mobile_uiux_write_enabled'
  | 'mobile_uiux_reservation_write_enabled'
  | 'mobile_uiux_daily_report_write_enabled'
  | 'mobile_uiux_settings_write_enabled'
  | 'rollout_phase'
>;

export type MobileUiuxClinicEntitlement = MobileUiuxEntitlementFlags & {
  clinicId: string;
  rolloutPhase: string;
};

export type MobileUiuxEntitlementMap = ReadonlyMap<
  string,
  MobileUiuxClinicEntitlement
>;

export type MobileUiuxRolloutWithEntitlementsDecision =
  | {
      allowed: true;
      role: Extract<MobileUiuxPrincipalDecision, { allowed: true }>['role'];
      clinicIds: string[];
      entitlements: MobileUiuxEntitlementMap;
      publicFlags: MobileUiuxPublicFlags;
    }
  | {
      allowed: false;
      status: 403;
      reason: 'clinic_denied' | 'feature_entitlement_denied';
      entitlements: MobileUiuxEntitlementMap;
      publicFlags: MobileUiuxPublicFlags;
    };

function mapEntitlementRow(
  row: ClinicFeatureFlagsEntitlementRow
): MobileUiuxClinicEntitlement {
  return {
    clinicId: row.clinic_id,
    enabled: row.mobile_uiux_enabled,
    realDataEnabled: row.mobile_uiux_real_data_enabled,
    writeEnabled: row.mobile_uiux_write_enabled,
    reservationWriteEnabled: row.mobile_uiux_reservation_write_enabled,
    dailyReportWriteEnabled: row.mobile_uiux_daily_report_write_enabled,
    settingsWriteEnabled: row.mobile_uiux_settings_write_enabled,
    rolloutPhase: row.rollout_phase,
  };
}

function toPublicEnvFlags(flags: MobileUiuxFlags): MobileUiuxPublicFlags {
  return {
    enabled: flags.enabled,
    useDbEntitlements: flags.useDbEntitlements,
    realDataEnabled: flags.realDataEnabled,
    writeEnabled: flags.writeEnabled,
    reservationWriteEnabled: flags.reservationWriteEnabled,
    dailyReportWriteEnabled: flags.dailyReportWriteEnabled,
    settingsWriteEnabled: flags.settingsWriteEnabled,
    rolloutPhase: null,
  };
}

function hasEnabledEntitlement(
  entitlement: MobileUiuxClinicEntitlement | undefined
): entitlement is MobileUiuxClinicEntitlement {
  return entitlement !== undefined && entitlement.enabled;
}

function hasEntitlementFlag(
  entitlements: readonly MobileUiuxClinicEntitlement[],
  key: keyof MobileUiuxEntitlementFlags
): boolean {
  return entitlements.some(
    entitlement => entitlement.enabled && entitlement[key]
  );
}

function resolveRolloutPhase(
  entitlements: readonly MobileUiuxClinicEntitlement[]
): string | null {
  const phases = new Set(
    entitlements.map(entitlement => entitlement.rolloutPhase)
  );

  if (phases.size === 0) {
    return null;
  }

  return phases.size === 1 ? entitlements[0].rolloutPhase : 'mixed';
}

export function buildMobileUiuxPublicFlags(params: {
  flags: MobileUiuxFlags;
  entitlements?: MobileUiuxEntitlementMap;
  clinicIds?: readonly string[];
}): MobileUiuxPublicFlags {
  const envFlags = toPublicEnvFlags(params.flags);

  if (!params.flags.useDbEntitlements) {
    return envFlags;
  }

  const entitlementValues = (params.clinicIds ?? [])
    .map(clinicId => params.entitlements?.get(clinicId))
    .filter(hasEnabledEntitlement);

  return {
    enabled: envFlags.enabled && entitlementValues.length > 0,
    useDbEntitlements: true,
    realDataEnabled:
      envFlags.realDataEnabled &&
      hasEntitlementFlag(entitlementValues, 'realDataEnabled'),
    writeEnabled:
      envFlags.writeEnabled &&
      hasEntitlementFlag(entitlementValues, 'writeEnabled'),
    reservationWriteEnabled:
      envFlags.reservationWriteEnabled &&
      hasEntitlementFlag(entitlementValues, 'reservationWriteEnabled'),
    dailyReportWriteEnabled:
      envFlags.dailyReportWriteEnabled &&
      hasEntitlementFlag(entitlementValues, 'dailyReportWriteEnabled'),
    settingsWriteEnabled:
      envFlags.settingsWriteEnabled &&
      hasEntitlementFlag(entitlementValues, 'settingsWriteEnabled'),
    rolloutPhase: resolveRolloutPhase(entitlementValues),
  };
}

export async function fetchMobileUiuxClinicEntitlements(
  supabase: SupabaseServerClient,
  clinicIds: readonly string[]
): Promise<MobileUiuxEntitlementMap> {
  if (clinicIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('clinic_feature_flags')
    .select(
      [
        'clinic_id',
        'mobile_uiux_enabled',
        'mobile_uiux_real_data_enabled',
        'mobile_uiux_write_enabled',
        'mobile_uiux_reservation_write_enabled',
        'mobile_uiux_daily_report_write_enabled',
        'mobile_uiux_settings_write_enabled',
        'rollout_phase',
      ].join(', ')
    )
    .in('clinic_id', Array.from(new Set(clinicIds)))
    .returns<ClinicFeatureFlagsEntitlementRow[]>();

  if (error) {
    return new Map();
  }

  return new Map(
    (data ?? []).map(row => [row.clinic_id, mapEntitlementRow(row)])
  );
}

export async function fetchMobileUiuxClinicEntitlement(params: {
  supabase: SupabaseServerClient;
  flags: MobileUiuxFlags;
  clinicId: string;
}): Promise<MobileUiuxClinicEntitlement | null | undefined> {
  if (!params.flags.useDbEntitlements) {
    return undefined;
  }

  const entitlements = await fetchMobileUiuxClinicEntitlements(
    params.supabase,
    [params.clinicId]
  );

  return entitlements.get(params.clinicId) ?? null;
}

export async function resolveMobileUiuxRolloutWithEntitlements(params: {
  supabase: SupabaseServerClient;
  principal: Extract<MobileUiuxPrincipalDecision, { allowed: true }>;
  flags: MobileUiuxFlags;
}): Promise<MobileUiuxRolloutWithEntitlementsDecision> {
  const envRollout = evaluateMobileUiuxEnvRollout(
    params.principal,
    params.flags
  );
  if (envRollout.allowed === false) {
    const publicFlags = buildMobileUiuxPublicFlags({
      flags: params.flags,
      clinicIds: [],
    });
    return {
      ...envRollout,
      entitlements: new Map(),
      publicFlags,
    };
  }

  if (!params.flags.useDbEntitlements) {
    const publicFlags = buildMobileUiuxPublicFlags({
      flags: params.flags,
      clinicIds: envRollout.clinicIds,
    });
    return {
      allowed: true,
      role: envRollout.role,
      clinicIds: envRollout.clinicIds,
      entitlements: new Map(),
      publicFlags,
    };
  }

  const entitlements = await fetchMobileUiuxClinicEntitlements(
    params.supabase,
    envRollout.clinicIds
  );
  const entitledClinicIds = envRollout.clinicIds.filter(clinicId =>
    hasEnabledEntitlement(entitlements.get(clinicId))
  );
  const publicFlags = buildMobileUiuxPublicFlags({
    flags: params.flags,
    entitlements,
    clinicIds: entitledClinicIds,
  });

  if (entitledClinicIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      reason: 'feature_entitlement_denied',
      entitlements,
      publicFlags,
    };
  }

  return {
    allowed: true,
    role: envRollout.role,
    clinicIds: entitledClinicIds,
    entitlements,
    publicFlags,
  };
}
