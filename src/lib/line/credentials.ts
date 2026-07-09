import {
  decryptLineCredential,
  encryptLineCredential,
  getLineCredentialsEncryptionStatus,
  maskLineCredentialSecret,
} from '@/lib/line/crypto';
import type { Database } from '@/types/supabase';

type ClinicLineCredentialsRow =
  Database['public']['Tables']['clinic_line_credentials']['Row'];
type ClinicLineCredentialsInsert =
  Database['public']['Tables']['clinic_line_credentials']['Insert'];

export class LineCredentialsSecretRequiredError extends Error {
  constructor(public readonly fieldName: string) {
    super(`${fieldName} is required for new LINE credentials`);
    this.name = 'LineCredentialsSecretRequiredError';
  }
}

export type AdminLineCredentialSecretMask = {
  configured: boolean;
  masked: string | null;
};

export type AdminLineCredentialsResponse = {
  clinic_id: string;
  liff_id: string | null;
  login_channel_id: string | null;
  messaging_channel_id: string;
  assertion_kid: string;
  token_expires_at: string | null;
  oa_basic_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  encryption_status: ReturnType<typeof getLineCredentialsEncryptionStatus>;
  secrets: {
    channel_secret: AdminLineCredentialSecretMask;
    assertion_private_key: AdminLineCredentialSecretMask;
    access_token: AdminLineCredentialSecretMask;
  };
};

export type LineCredentialsUpsertInput = {
  clinic_id: string;
  liff_id: string | null;
  login_channel_id: string | null;
  messaging_channel_id: string;
  channel_secret?: string;
  assertion_private_key?: string;
  assertion_kid: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  oa_basic_id: string | null;
  is_active: boolean;
};

export function buildLineCredentialsUpsertPayload(params: {
  input: LineCredentialsUpsertInput;
  existing: ClinicLineCredentialsRow | null;
  userId: string;
}): ClinicLineCredentialsInsert {
  const channelSecretEncrypted = resolveEncryptedRequiredSecret({
    plaintext: params.input.channel_secret,
    existingEncrypted: params.existing?.channel_secret_encrypted ?? null,
    fieldName: 'channel_secret',
  });
  const assertionPrivateKeyEncrypted = resolveEncryptedRequiredSecret({
    plaintext: params.input.assertion_private_key,
    existingEncrypted: params.existing?.assertion_private_key_encrypted ?? null,
    fieldName: 'assertion_private_key',
  });

  return {
    clinic_id: params.input.clinic_id,
    liff_id: params.input.liff_id,
    login_channel_id: params.input.login_channel_id,
    messaging_channel_id: params.input.messaging_channel_id,
    channel_secret_encrypted: channelSecretEncrypted,
    assertion_private_key_encrypted: assertionPrivateKeyEncrypted,
    assertion_kid: params.input.assertion_kid,
    access_token_encrypted: resolveOptionalEncryptedSecret(
      params.input.access_token,
      params.existing?.access_token_encrypted ?? null
    ),
    token_expires_at: resolveTokenExpiresAt(
      params.input.access_token,
      params.input.token_expires_at,
      params.existing?.token_expires_at ?? null
    ),
    oa_basic_id: params.input.oa_basic_id,
    is_active: params.input.is_active,
    updated_by: params.userId,
  };
}

export function sanitizeLineCredentialsForAdmin(
  row: ClinicLineCredentialsRow
): AdminLineCredentialsResponse {
  const encryptionStatus = getLineCredentialsEncryptionStatus();

  return {
    clinic_id: row.clinic_id,
    liff_id: row.liff_id,
    login_channel_id: row.login_channel_id,
    messaging_channel_id: row.messaging_channel_id,
    assertion_kid: row.assertion_kid,
    token_expires_at: row.token_expires_at,
    oa_basic_id: row.oa_basic_id,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    encryption_status: encryptionStatus,
    secrets: {
      channel_secret: maskEncryptedSecret(
        row.channel_secret_encrypted,
        encryptionStatus
      ),
      assertion_private_key: maskEncryptedSecret(
        row.assertion_private_key_encrypted,
        encryptionStatus
      ),
      access_token: maskEncryptedSecret(
        row.access_token_encrypted,
        encryptionStatus
      ),
    },
  };
}

function resolveEncryptedRequiredSecret(params: {
  plaintext: string | undefined;
  existingEncrypted: string | null;
  fieldName: string;
}): string {
  if (params.plaintext !== undefined) {
    return encryptLineCredential(params.plaintext);
  }

  if (params.existingEncrypted) {
    return params.existingEncrypted;
  }

  throw new LineCredentialsSecretRequiredError(params.fieldName);
}

function resolveOptionalEncryptedSecret(
  plaintext: string | null | undefined,
  existingEncrypted: string | null
): string | null {
  if (plaintext === undefined) {
    return existingEncrypted;
  }
  if (plaintext === null) {
    return null;
  }
  return encryptLineCredential(plaintext);
}

function resolveTokenExpiresAt(
  accessToken: string | null | undefined,
  tokenExpiresAt: string | null | undefined,
  existingTokenExpiresAt: string | null
): string | null {
  if (accessToken === undefined && tokenExpiresAt === undefined) {
    return existingTokenExpiresAt;
  }
  if (accessToken === null || tokenExpiresAt === null) {
    return null;
  }
  return tokenExpiresAt ?? existingTokenExpiresAt;
}

function maskEncryptedSecret(
  encryptedValue: string | null,
  encryptionStatus: ReturnType<typeof getLineCredentialsEncryptionStatus>
): AdminLineCredentialSecretMask {
  if (!encryptedValue) {
    return { configured: false, masked: null };
  }
  if (encryptionStatus !== 'ready') {
    return { configured: true, masked: null };
  }

  try {
    return {
      configured: true,
      masked: maskLineCredentialSecret(decryptLineCredential(encryptedValue)),
    };
  } catch {
    return { configured: true, masked: null };
  }
}
