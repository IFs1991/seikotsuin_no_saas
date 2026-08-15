import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  encryptLineCredential,
  getLineCredentialsEncryptionStatus,
} from '@/lib/line/crypto';
import {
  toLineIntegrationClient,
  type LineAppType,
  type LineIntegrationClient,
  type LineSetupStatus,
  type LineSetupSessionRow,
} from '@/lib/line/integration-db';
import {
  buildLineSetupUrls,
  decryptLineSetupVerificationDraft,
  encryptLineSetupVerificationDraft,
  generateLineSetupKeyMaterial,
  verifyLineSetupInput,
  type LineSetupInput,
} from '@/lib/line/setup-service';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

type SafeSetupSession = Pick<
  LineSetupSessionRow,
  | 'clinic_id'
  | 'created_at'
  | 'credential_fingerprint'
  | 'expires_at'
  | 'id'
  | 'public_jwk'
  | 'public_key_kid'
  | 'provider_identity_verified'
  | 'status'
  | 'verified_at'
>;

export type LineSetupState = {
  credentials: {
    app_endpoint_id: string | null;
    app_type: 'mini_app' | 'liff';
    bot_display_name: string | null;
    bot_picture_url: string | null;
    credentials_verified_at: string | null;
    is_active: boolean;
    messaging_channel_id: string;
    oa_basic_id: string | null;
    provider_identity_verified_at: string | null;
    setup_completed_at: string | null;
    webhook_verified_at: string | null;
  } | null;
  encryption_ready: boolean;
  features: {
    line_booking_enabled: boolean;
    line_chat_enabled: boolean;
    line_notification_enabled: boolean;
  };
  setup: (SafeSetupSession & ReturnType<typeof buildLineSetupUrls>) | null;
};

export class LineSetupConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineSetupConflictError';
  }
}

export class LineSetupVerificationError extends Error {
  constructor(
    public readonly reason:
      | 'bot_info_failed'
      | 'provider_identity_failed'
      | 'push_test_failed'
      | 'token_issue_failed'
  ) {
    super(reason);
    this.name = 'LineSetupVerificationError';
  }
}

class LineSetupVerificationCleanupError extends Error {
  constructor(
    public readonly operationError: unknown,
    public readonly cleanupError: unknown
  ) {
    super('LINE setup verification and claim release both failed');
    this.name = 'LineSetupVerificationCleanupError';
  }
}

export function parseLineAppType(value: string): LineAppType {
  if (value === 'mini_app' || value === 'liff') return value;
  throw new Error('Unexpected LINE app type');
}

export function parseLineSetupStatus(value: string): LineSetupStatus {
  if (
    value === 'prepared' ||
    value === 'verified' ||
    value === 'consumed' ||
    value === 'expired' ||
    value === 'revoked'
  ) {
    return value;
  }
  throw new Error('Unexpected LINE setup status');
}

export async function getLineSetupState(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
}): Promise<LineSetupState> {
  const client = toIntegrationClient(params.client);
  const [setupResult, credentialsResult, featureResult] = await Promise.all([
    client
      .from('clinic_line_setup_sessions')
      .select('*')
      .eq('clinic_id', params.clinicId)
      .in('status', ['prepared', 'verified'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('clinic_line_credentials')
      .select('*')
      .eq('clinic_id', params.clinicId)
      .maybeSingle(),
    client
      .from('clinic_feature_flags')
      .select('*')
      .eq('clinic_id', params.clinicId)
      .maybeSingle(),
  ]);

  if (setupResult.error || credentialsResult.error || featureResult.error) {
    throw setupResult.error ?? credentialsResult.error ?? featureResult.error;
  }

  const setup = setupResult.data
    ? {
        clinic_id: setupResult.data.clinic_id,
        created_at: setupResult.data.created_at,
        credential_fingerprint: setupResult.data.credential_fingerprint,
        expires_at: setupResult.data.expires_at,
        id: setupResult.data.id,
        public_jwk: setupResult.data.public_jwk,
        public_key_kid: setupResult.data.public_key_kid,
        provider_identity_verified: setupResult.data.provider_identity_verified,
        status: parseLineSetupStatus(setupResult.data.status),
        verified_at: setupResult.data.verified_at,
        ...buildLineSetupUrls(params.clinicId),
      }
    : null;

  const credentials = credentialsResult.data
    ? {
        app_endpoint_id: credentialsResult.data.app_endpoint_id,
        app_type: parseLineAppType(credentialsResult.data.app_type),
        bot_display_name: credentialsResult.data.bot_display_name,
        bot_picture_url: credentialsResult.data.bot_picture_url,
        credentials_verified_at: credentialsResult.data.credentials_verified_at,
        is_active: credentialsResult.data.is_active,
        messaging_channel_id: credentialsResult.data.messaging_channel_id,
        oa_basic_id: credentialsResult.data.oa_basic_id,
        provider_identity_verified_at:
          credentialsResult.data.provider_identity_verified_at,
        setup_completed_at: credentialsResult.data.setup_completed_at,
        webhook_verified_at: credentialsResult.data.webhook_verified_at,
      }
    : null;

  return {
    credentials,
    encryption_ready: getLineCredentialsEncryptionStatus() === 'ready',
    features: {
      line_booking_enabled: featureResult.data?.line_booking_enabled === true,
      line_chat_enabled: featureResult.data?.line_chat_enabled === true,
      line_notification_enabled:
        featureResult.data?.line_notification_enabled === true,
    },
    setup,
  };
}

export async function prepareLineSetup(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
  userId: string;
}): Promise<LineSetupState> {
  if (getLineCredentialsEncryptionStatus() !== 'ready') {
    throw new LineSetupConflictError(
      'LINE credential暗号化キーが設定されていません'
    );
  }

  const client = toIntegrationClient(params.client);
  const { error: expiryError } = await client.rpc(
    'expire_line_setup_sessions',
    { p_clinic_id: params.clinicId }
  );
  if (expiryError) {
    throw expiryError;
  }

  const current = await getLineSetupState({
    client,
    clinicId: params.clinicId,
  });
  if (current.setup) {
    return current;
  }

  const material = generateLineSetupKeyMaterial();
  const { error } = await client.from('clinic_line_setup_sessions').insert({
    clinic_id: params.clinicId,
    created_by: params.userId,
    credential_fingerprint: material.fingerprint,
    encrypted_private_jwk: material.encryptedPrivateJwk,
    public_jwk: material.publicJwk as Json,
  });
  if (error && error.code !== '23505') {
    throw error;
  }

  return getLineSetupState({ client, clinicId: params.clinicId });
}

export async function verifyPreparedLineSetup(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
  input: LineSetupInput;
  setupSessionId: string;
}): Promise<{ pushTestSent: boolean; state: LineSetupState }> {
  const client = toIntegrationClient(params.client);
  const { data: claim, error: claimError } = await client
    .rpc('claim_line_setup_verification', {
      p_clinic_id: params.clinicId,
      p_setup_session_id: params.setupSessionId,
    })
    .single();
  if (claimError || !claim) {
    throw claimError ?? new LineSetupConflictError('接続確認を開始できません');
  }

  try {
    const verification = await verifyLineSetupInput({
      encryptedPrivateJwk: claim.encrypted_private_jwk,
      input: params.input,
      pushTestRetryKey: claim.push_test_retry_key,
      beforePushTest: async requestDigest => {
        const { error: bindError } = await client.rpc(
          'bind_line_setup_push_request',
          {
            p_claim_token: claim.claim_token,
            p_clinic_id: params.clinicId,
            p_setup_session_id: params.setupSessionId,
            p_verification_request_digest: requestDigest,
          }
        );
        if (bindError) throw bindError;
      },
    });
    if (verification.ok === false) {
      throw new LineSetupVerificationError(verification.reason);
    }

    const encryptedDraft = encryptLineSetupVerificationDraft(
      verification.draft
    );
    const { error: finalizeError } = await client.rpc(
      'finalize_line_setup_verification',
      {
        p_claim_token: claim.claim_token,
        p_clinic_id: params.clinicId,
        p_encrypted_verification_payload: encryptedDraft,
        p_provider_identity_verified:
          verification.draft.providerIdentityVerified,
        p_public_key_kid: params.input.publicKeyKid,
        p_setup_session_id: params.setupSessionId,
      }
    );
    if (finalizeError) throw finalizeError;

    return {
      pushTestSent: verification.pushTestSent,
      state: await getLineSetupState({ client, clinicId: params.clinicId }),
    };
  } catch (operationError) {
    const { error: releaseError } = await client.rpc(
      'release_line_setup_verification_claim',
      {
        p_claim_token: claim.claim_token,
        p_clinic_id: params.clinicId,
        p_setup_session_id: params.setupSessionId,
      }
    );
    if (releaseError) {
      throw new LineSetupVerificationCleanupError(operationError, releaseError);
    }
    throw operationError;
  }
}

export async function completeVerifiedLineSetup(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
  enableBooking: boolean;
  enableNotifications: boolean;
  setupSessionId: string;
  userId: string;
}): Promise<LineSetupState> {
  const client = toIntegrationClient(params.client);
  const { data: setup, error } = await client
    .from('clinic_line_setup_sessions')
    .select('*')
    .eq('id', params.setupSessionId)
    .eq('clinic_id', params.clinicId)
    .eq('status', 'verified')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!setup?.encrypted_verification_payload) {
    throw new LineSetupConflictError(
      '検証済みセットアップが見つからないか期限切れです'
    );
  }

  const draft = decryptLineSetupVerificationDraft(
    setup.encrypted_verification_payload
  );
  if (params.enableBooking && !draft.providerIdentityVerified) {
    throw new LineSetupConflictError(
      'LINE予約を有効にするにはProvider同一性の確認が必要です'
    );
  }
  const credentials: Json = {
    access_token_encrypted: encryptLineCredential(draft.accessToken),
    access_token_key_id: draft.accessTokenKeyId,
    app_endpoint_id: draft.appEndpointId,
    app_type: draft.appType,
    bot_display_name: draft.botDisplayName,
    bot_picture_url: draft.botPictureUrl,
    bot_user_id: draft.botUserId,
    channel_secret_encrypted: encryptLineCredential(draft.channelSecret),
    liff_id: draft.liffId,
    login_channel_id: draft.loginChannelId,
    messaging_channel_id: draft.messagingChannelId,
    oa_basic_id: draft.oaBasicId,
    token_expires_at: draft.tokenExpiresAt,
  };

  const { error: completeError } = await client.rpc(
    'complete_line_self_serve_setup',
    {
      p_clinic_id: params.clinicId,
      p_credentials: credentials,
      p_enable_booking: params.enableBooking,
      p_enable_notifications: params.enableNotifications,
      p_new_generation_id: randomUUID(),
      p_setup_session_id: params.setupSessionId,
      p_updated_by: params.userId,
    }
  );
  if (completeError) {
    throw completeError;
  }

  return getLineSetupState({ client, clinicId: params.clinicId });
}

export async function revokeLineSetup(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
  setupSessionId: string;
}): Promise<LineSetupState> {
  const client = toIntegrationClient(params.client);
  const { error } = await client.rpc('close_line_setup_session', {
    p_clinic_id: params.clinicId,
    p_setup_session_id: params.setupSessionId,
    p_status: 'revoked',
  });
  if (error) throw error;
  return getLineSetupState({ client, clinicId: params.clinicId });
}

export async function updateLineFeatureSettings(params: {
  client: SupabaseServerClient | LineIntegrationClient;
  clinicId: string;
  enableBooking: boolean;
  enableNotifications: boolean;
  userId: string;
}): Promise<LineSetupState> {
  const client = toIntegrationClient(params.client);
  const { error } = await client.rpc('update_line_feature_settings', {
    p_clinic_id: params.clinicId,
    p_enable_booking: params.enableBooking,
    p_enable_notifications: params.enableNotifications,
    p_updated_by: params.userId,
  });
  if (error) throw error;
  return getLineSetupState({ client, clinicId: params.clinicId });
}

function toIntegrationClient(
  client: SupabaseServerClient | LineIntegrationClient
): LineIntegrationClient {
  return toLineIntegrationClient(client as SupabaseServerClient);
}
