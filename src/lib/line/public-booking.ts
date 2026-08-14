import {
  evaluateLineBookingGate,
  isLineBookingGlobalKillSwitchEnabled,
  type LineBookingDisabledReason,
} from '@/lib/line/gate';
import { getLineCredentialsEncryptionStatus } from '@/lib/line/crypto';
import { createLogger } from '@/lib/logger';
import type { LineIntegrationClient } from '@/lib/line/integration-db';

type PublicLineBookingClient = Pick<LineIntegrationClient, 'rpc'>;

type LinePublicCredentialRow = {
  credential_generation_id: string;
  is_active: boolean;
  liff_id: string | null;
  login_channel_id: string | null;
  oa_basic_id: string | null;
  provider_identity_verified_at: string | null;
};

type LinePublicContextRow = Omit<
  LinePublicCredentialRow,
  'credential_generation_id'
> & {
  credential_generation_id: string | null;
  line_booking_enabled: boolean;
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
  const { data, error } = await params.supabase
    .rpc('get_line_public_booking_context', {
      p_clinic_id: params.clinicId,
    })
    .maybeSingle();

  if (error) {
    log.warn('Failed to read atomic public LINE booking context', {
      clinicId: params.clinicId,
      errorCode: readErrorCode(error),
    });
  }

  const context = isLinePublicContextRow(data) ? data : null;
  const credentials = context?.credential_generation_id
    ? {
        credential_generation_id: context.credential_generation_id,
        is_active: context.is_active,
        liff_id: context.liff_id,
        login_channel_id: context.login_channel_id,
        oa_basic_id: context.oa_basic_id,
        provider_identity_verified_at: context.provider_identity_verified_at,
      }
    : null;

  const decision = evaluateLineBookingGate({
    globalKillSwitchEnabled: isLineBookingGlobalKillSwitchEnabled(),
    lineBookingEnabled: context?.line_booking_enabled === true,
    credentialsActive: credentials?.is_active === true,
    providerIdentityVerified:
      typeof credentials?.provider_identity_verified_at === 'string',
    runtimeMetadataReady:
      Boolean(credentials?.liff_id?.trim()) &&
      Boolean(credentials?.login_channel_id?.trim()),
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

function isLinePublicContextRow(value: unknown): value is LinePublicContextRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    credential_generation_id?: unknown;
    is_active?: unknown;
    liff_id?: unknown;
    login_channel_id?: unknown;
    oa_basic_id?: unknown;
    provider_identity_verified_at?: unknown;
    line_booking_enabled?: unknown;
  };
  return (
    isNullableString(candidate.credential_generation_id) &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.line_booking_enabled === 'boolean' &&
    isNullableString(candidate.liff_id) &&
    isNullableString(candidate.login_channel_id) &&
    isNullableString(candidate.oa_basic_id) &&
    isNullableString(candidate.provider_identity_verified_at)
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
