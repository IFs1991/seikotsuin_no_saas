import {
  evaluateLineBookingGate,
  isLineBookingGlobalKillSwitchEnabled,
  type LineBookingDisabledReason,
} from '@/lib/line/gate';
import { getLineCredentialsEncryptionStatus } from '@/lib/line/crypto';
import { createLogger } from '@/lib/logger';
import type { SupabaseServerClient } from '@/lib/supabase';

type PublicLineBookingClient = Pick<SupabaseServerClient, 'from'>;

type LineFeatureFlagRow = {
  line_booking_enabled: boolean;
};

type LinePublicCredentialRow = {
  is_active: boolean;
  liff_id: string | null;
  login_channel_id: string | null;
  oa_basic_id: string | null;
};

export type PublicLineBookingMetadata = {
  liff_id?: string;
  oa_basic_id?: string;
};

export type LinePublicBookingContext = {
  enabled: boolean;
  disabledReasons: LineBookingDisabledReason[];
  credentials: LinePublicCredentialRow | null;
};

const log = createLogger('LinePublicBooking');

export async function resolveLinePublicBookingContext(params: {
  supabase: PublicLineBookingClient;
  clinicId: string;
}): Promise<LinePublicBookingContext> {
  const [flagResult, credentialResult] = await Promise.all([
    params.supabase
      .from('clinic_feature_flags')
      .select('line_booking_enabled')
      .eq('clinic_id', params.clinicId)
      .maybeSingle(),
    params.supabase
      .from('clinic_line_credentials')
      .select('is_active, liff_id, login_channel_id, oa_basic_id')
      .eq('clinic_id', params.clinicId)
      .maybeSingle(),
  ]);

  if (flagResult.error) {
    log.warn('Failed to read LINE booking feature flag', {
      clinicId: params.clinicId,
      errorCode: readErrorCode(flagResult.error),
    });
  }

  if (credentialResult.error) {
    log.warn('Failed to read public LINE credential metadata', {
      clinicId: params.clinicId,
      errorCode: readErrorCode(credentialResult.error),
    });
  }

  const flag = isLineFeatureFlagRow(flagResult.data) ? flagResult.data : null;
  const credentials = isLinePublicCredentialRow(credentialResult.data)
    ? credentialResult.data
    : null;

  const decision = evaluateLineBookingGate({
    globalKillSwitchEnabled: isLineBookingGlobalKillSwitchEnabled(),
    lineBookingEnabled: flag?.line_booking_enabled === true,
    credentialsActive: credentials?.is_active === true,
    encryptionReady: getLineCredentialsEncryptionStatus() === 'ready',
  });

  return {
    enabled: decision.enabled,
    disabledReasons: decision.disabledReasons,
    credentials,
  };
}

export async function getPublicLineBookingMetadata(params: {
  supabase: PublicLineBookingClient;
  clinicId: string;
}): Promise<PublicLineBookingMetadata> {
  const context = await resolveLinePublicBookingContext(params);
  if (!context.enabled || !context.credentials) {
    return {};
  }

  return {
    ...(context.credentials.liff_id
      ? { liff_id: context.credentials.liff_id }
      : {}),
    ...(context.credentials.oa_basic_id
      ? { oa_basic_id: context.credentials.oa_basic_id }
      : {}),
  };
}

function isLineFeatureFlagRow(value: unknown): value is LineFeatureFlagRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { line_booking_enabled?: unknown };
  return typeof candidate.line_booking_enabled === 'boolean';
}

function isLinePublicCredentialRow(
  value: unknown
): value is LinePublicCredentialRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    is_active?: unknown;
    liff_id?: unknown;
    login_channel_id?: unknown;
    oa_basic_id?: unknown;
  };
  return (
    typeof candidate.is_active === 'boolean' &&
    isNullableString(candidate.liff_id) &&
    isNullableString(candidate.login_channel_id) &&
    isNullableString(candidate.oa_basic_id)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}
