import { env } from '@/lib/env';
import { getLineCredentialsEncryptionStatus } from '@/lib/line/crypto';
import { createLogger } from '@/lib/logger';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

type ClinicFeatureFlagsRow =
  Database['public']['Tables']['clinic_feature_flags']['Row'];
type ClinicLineCredentialsRow =
  Database['public']['Tables']['clinic_line_credentials']['Row'];

type LineFeatureFlagRow = Pick<ClinicFeatureFlagsRow, 'line_booking_enabled'>;
type LineCredentialGateRow = Pick<ClinicLineCredentialsRow, 'is_active'> & {
  liff_id: string | null;
  login_channel_id: string | null;
  provider_identity_verified_at: string | null;
};

export type LineBookingDisabledReason =
  | 'global_kill_switch_off'
  | 'clinic_flag_disabled'
  | 'credentials_inactive'
  | 'provider_identity_unverified'
  | 'booking_runtime_metadata_missing'
  | 'encryption_key_unavailable';

export type LineBookingGateDecision = {
  enabled: boolean;
  disabledReasons: LineBookingDisabledReason[];
};

export type LineBookingGateInput = {
  globalKillSwitchEnabled: boolean;
  lineBookingEnabled: boolean;
  credentialsActive: boolean;
  providerIdentityVerified: boolean;
  runtimeMetadataReady: boolean;
  encryptionReady: boolean;
};

const log = createLogger('LineBookingGate');

export function isLineBookingGlobalKillSwitchEnabled(
  value = getLineBookingGlobalKillSwitchValue()
): boolean {
  return value === 'true';
}

export function evaluateLineBookingGate(
  input: LineBookingGateInput
): LineBookingGateDecision {
  const disabledReasons: LineBookingDisabledReason[] = [];

  if (!input.globalKillSwitchEnabled) {
    disabledReasons.push('global_kill_switch_off');
  }
  if (!input.lineBookingEnabled) {
    disabledReasons.push('clinic_flag_disabled');
  }
  if (!input.credentialsActive) {
    disabledReasons.push('credentials_inactive');
  }
  if (!input.providerIdentityVerified) {
    disabledReasons.push('provider_identity_unverified');
  }
  if (!input.runtimeMetadataReady) {
    disabledReasons.push('booking_runtime_metadata_missing');
  }
  if (!input.encryptionReady) {
    disabledReasons.push('encryption_key_unavailable');
  }

  return {
    enabled: disabledReasons.length === 0,
    disabledReasons,
  };
}

export async function resolveLineBookingGate(params: {
  supabase: Pick<SupabaseServerClient, 'from'>;
  clinicId: string;
}): Promise<LineBookingGateDecision> {
  const [flagResult, credentialResult] = await Promise.all([
    params.supabase
      .from('clinic_feature_flags')
      .select('line_booking_enabled')
      .eq('clinic_id', params.clinicId)
      .returns<LineFeatureFlagRow>()
      .maybeSingle(),
    params.supabase
      .from('clinic_line_credentials')
      .select(
        'is_active, liff_id, login_channel_id, provider_identity_verified_at'
      )
      .eq('clinic_id', params.clinicId)
      .returns<LineCredentialGateRow>()
      .maybeSingle(),
  ]);

  if (flagResult.error) {
    log.warn('Failed to read LINE booking feature flag', {
      table: 'clinic_feature_flags',
      clinicId: params.clinicId,
      errorCode: flagResult.error.code,
    });
  }

  if (credentialResult.error) {
    log.warn('Failed to read LINE credential gate state', {
      table: 'clinic_line_credentials',
      clinicId: params.clinicId,
      errorCode: credentialResult.error.code,
    });
  }

  const flagData: unknown = flagResult.data;
  const credentialData: unknown = credentialResult.data;
  const lineBookingEnabled =
    isLineFeatureFlagRow(flagData) && flagData.line_booking_enabled === true;
  const credentialsActive =
    isLineCredentialGateRow(credentialData) &&
    credentialData.is_active === true;
  const providerIdentityVerified =
    isLineCredentialGateRow(credentialData) &&
    typeof credentialData.provider_identity_verified_at === 'string';
  const runtimeMetadataReady =
    isLineCredentialGateRow(credentialData) &&
    Boolean(credentialData.liff_id?.trim()) &&
    Boolean(credentialData.login_channel_id?.trim());

  return evaluateLineBookingGate({
    globalKillSwitchEnabled: isLineBookingGlobalKillSwitchEnabled(),
    lineBookingEnabled,
    credentialsActive,
    providerIdentityVerified,
    runtimeMetadataReady,
    encryptionReady: getLineCredentialsEncryptionStatus() === 'ready',
  });
}

function isLineFeatureFlagRow(value: unknown): value is LineFeatureFlagRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { line_booking_enabled?: unknown };
  return typeof candidate.line_booking_enabled === 'boolean';
}

function isLineCredentialGateRow(
  value: unknown
): value is LineCredentialGateRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    is_active?: unknown;
    liff_id?: unknown;
    login_channel_id?: unknown;
    provider_identity_verified_at?: unknown;
  };
  return (
    typeof candidate.is_active === 'boolean' &&
    (candidate.liff_id === null || typeof candidate.liff_id === 'string') &&
    (candidate.login_channel_id === null ||
      typeof candidate.login_channel_id === 'string') &&
    (candidate.provider_identity_verified_at === null ||
      typeof candidate.provider_identity_verified_at === 'string')
  );
}

function getLineBookingGlobalKillSwitchValue(): string {
  return (
    process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING ??
    env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING
  );
}
