import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ADMIN_UI_ROLES, normalizeRole } from '@/lib/constants/roles';
import {
  buildLineCredentialsUpsertPayload,
  LineCredentialsSecretRequiredError,
  sanitizeLineCredentialsForAdmin,
  type LineCredentialsUpsertInput,
} from '@/lib/line/credentials';
import {
  getLineCredentialsEncryptionStatus,
  LineCredentialCryptoError,
} from '@/lib/line/crypto';
import {
  evaluateLineBookingGate,
  isLineBookingGlobalKillSwitchEnabled,
} from '@/lib/line/gate';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import type { Database } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-credentials';
const ADMIN_ALLOWED_ROLES = Array.from(ADMIN_UI_ROLES);

const LINE_CREDENTIAL_COLUMNS = [
  'clinic_id',
  'liff_id',
  'login_channel_id',
  'messaging_channel_id',
  'channel_secret_encrypted',
  'assertion_private_key_encrypted',
  'assertion_kid',
  'access_token_encrypted',
  'token_expires_at',
  'oa_basic_id',
  'is_active',
  'created_at',
  'updated_at',
  'updated_by',
].join(', ');

type ClinicLineCredentialsRow =
  Database['public']['Tables']['clinic_line_credentials']['Row'];
type ClinicFeatureFlagsInsert =
  Database['public']['Tables']['clinic_feature_flags']['Insert'];
type ScopedAdminContext = ReturnType<typeof createScopedAdminContext>;

const QuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_idの形式が不正です'),
});

const NullableTextSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(255).nullable()
);

const OptionalSecretSchema = z.string().trim().min(1).max(20000).optional();

const LineCredentialsUpsertSchema = z.object({
  clinic_id: z.string().uuid('clinic_idの形式が不正です'),
  liff_id: NullableTextSchema,
  login_channel_id: NullableTextSchema,
  messaging_channel_id: z.string().trim().min(1).max(128),
  channel_secret: OptionalSecretSchema,
  assertion_private_key: OptionalSecretSchema,
  assertion_kid: z.string().trim().min(1).max(256),
  access_token: z
    .union([z.string().trim().min(1).max(20000), z.null()])
    .optional(),
  token_expires_at: z
    .union([z.string().datetime({ offset: true }), z.null()])
    .optional(),
  oa_basic_id: NullableTextSchema,
  is_active: z.boolean(),
  line_booking_enabled: z.boolean().optional(),
});

function toScopeErrorResponse(error: unknown) {
  if (
    error instanceof ScopeNotConfiguredError ||
    error instanceof ScopeAccessError
  ) {
    return createErrorResponse(error.message, 403);
  }

  return null;
}

function validateAdminOnly(role: string) {
  return normalizeRole(role) === 'admin';
}

function toUpsertInput(
  parsed: z.infer<typeof LineCredentialsUpsertSchema>
): LineCredentialsUpsertInput {
  return {
    clinic_id: parsed.clinic_id,
    liff_id: parsed.liff_id,
    login_channel_id: parsed.login_channel_id,
    messaging_channel_id: parsed.messaging_channel_id,
    channel_secret: parsed.channel_secret,
    assertion_private_key: parsed.assertion_private_key,
    assertion_kid: parsed.assertion_kid,
    access_token: parsed.access_token,
    token_expires_at: parsed.token_expires_at,
    oa_basic_id: parsed.oa_basic_id,
    is_active: parsed.is_active,
  };
}

function buildAuditDetails(params: {
  row: ClinicLineCredentialsRow;
  lineBookingEnabled: boolean;
}): Record<string, unknown> {
  return {
    action_target: 'line_credentials',
    clinic_id: params.row.clinic_id,
    liff_id: params.row.liff_id,
    login_channel_id: params.row.login_channel_id,
    messaging_channel_id: params.row.messaging_channel_id,
    assertion_kid: params.row.assertion_kid,
    token_expires_at: params.row.token_expires_at,
    oa_basic_id: params.row.oa_basic_id,
    is_active: params.row.is_active,
    line_booking_enabled: params.lineBookingEnabled,
  };
}

function isLineBookingFlagRow(
  value: unknown
): value is { line_booking_enabled: boolean } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { line_booking_enabled?: unknown };
  return typeof candidate.line_booking_enabled === 'boolean';
}

async function fetchLineCredentials(
  client: ScopedAdminContext['client'],
  clinicId: string
): Promise<ClinicLineCredentialsRow | null> {
  const { data, error } = await client
    .from('clinic_line_credentials')
    .select(LINE_CREDENTIAL_COLUMNS)
    .eq('clinic_id', clinicId)
    .returns<ClinicLineCredentialsRow>()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function fetchLineBookingEnabled(
  client: ScopedAdminContext['client'],
  clinicId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('clinic_feature_flags')
    .select('line_booking_enabled')
    .eq('clinic_id', clinicId)
    .returns<{ line_booking_enabled: boolean }>()
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row: unknown = data;
  return isLineBookingFlagRow(row) && row.line_booking_enabled === true;
}

async function upsertLineBookingFlag(params: {
  client: ScopedAdminContext['client'];
  clinicId: string;
  enabled: boolean;
  userId: string;
}): Promise<void> {
  const payload: ClinicFeatureFlagsInsert = {
    clinic_id: params.clinicId,
    line_booking_enabled: params.enabled,
    updated_by: params.userId,
  };
  const { error } = await params.client
    .from('clinic_feature_flags')
    .upsert(payload, { onConflict: 'clinic_id' });

  if (error) {
    throw error;
  }
}

function buildResponsePayload(params: {
  row: ClinicLineCredentialsRow | null;
  lineBookingEnabled: boolean;
}) {
  const credentials = params.row
    ? sanitizeLineCredentialsForAdmin(params.row)
    : null;
  const encryptionReady = getLineCredentialsEncryptionStatus() === 'ready';

  return {
    credentials,
    line_booking_enabled: params.lineBookingEnabled,
    gate: evaluateLineBookingGate({
      globalKillSwitchEnabled: isLineBookingGlobalKillSwitchEnabled(),
      lineBookingEnabled: params.lineBookingEnabled,
      credentialsActive: params.row?.is_active === true,
      encryptionReady,
    }),
  };
}

export async function GET(request: NextRequest) {
  const parsedQuery = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsedQuery.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedQuery.error.flatten()
    );
  }

  const authResult = await processApiRequest(request, {
    allowedRoles: ADMIN_ALLOWED_ROLES,
    clinicId: parsedQuery.data.clinic_id,
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  let adminCtx: ScopedAdminContext;
  try {
    adminCtx = createScopedAdminContext(authResult.permissions);
    adminCtx.assertClinicInScope(parsedQuery.data.clinic_id);
  } catch (error) {
    const scopeResponse = toScopeErrorResponse(error);
    if (scopeResponse) {
      return scopeResponse;
    }
    throw error;
  }

  try {
    const [row, lineBookingEnabled] = await Promise.all([
      fetchLineCredentials(adminCtx.client, parsedQuery.data.clinic_id),
      fetchLineBookingEnabled(adminCtx.client, parsedQuery.data.clinic_id),
    ]);

    return createSuccessResponse(
      buildResponsePayload({ row, lineBookingEnabled })
    );
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: authResult.auth.id,
      params: { clinic_id: parsedQuery.data.clinic_id },
    });
    return createErrorResponse('LINE credentialの取得に失敗しました', 500);
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: ADMIN_ALLOWED_ROLES,
    requireClinicMatch: false,
    sanitizeInputValues: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  const parsedBody = LineCredentialsUpsertSchema.safeParse(authResult.body);
  if (!parsedBody.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedBody.error.flatten()
    );
  }

  if (
    parsedBody.data.line_booking_enabled !== undefined &&
    !validateAdminOnly(authResult.permissions.role)
  ) {
    return createErrorResponse(
      'LINE予約のロールアウト制御はadminのみ実行できます',
      403
    );
  }

  let adminCtx: ScopedAdminContext;
  try {
    adminCtx = createScopedAdminContext(authResult.permissions);
    adminCtx.assertClinicInScope(parsedBody.data.clinic_id);
  } catch (error) {
    const scopeResponse = toScopeErrorResponse(error);
    if (scopeResponse) {
      return scopeResponse;
    }
    throw error;
  }

  try {
    const existing = await fetchLineCredentials(
      adminCtx.client,
      parsedBody.data.clinic_id
    );
    const upsertPayload = buildLineCredentialsUpsertPayload({
      input: toUpsertInput(parsedBody.data),
      existing,
      userId: authResult.auth.id,
    });

    const { error } = await adminCtx.client
      .from('clinic_line_credentials')
      .upsert(upsertPayload, { onConflict: 'clinic_id' });

    if (error) {
      throw error;
    }

    if (parsedBody.data.line_booking_enabled !== undefined) {
      await upsertLineBookingFlag({
        client: adminCtx.client,
        clinicId: parsedBody.data.clinic_id,
        enabled: parsedBody.data.line_booking_enabled,
        userId: authResult.auth.id,
      });
    }

    const [row, lineBookingEnabled] = await Promise.all([
      fetchLineCredentials(adminCtx.client, parsedBody.data.clinic_id),
      fetchLineBookingEnabled(adminCtx.client, parsedBody.data.clinic_id),
    ]);
    if (!row) {
      throw new Error('clinic_line_credentials upsert returned no row');
    }

    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_credentials_upsert',
      row.clinic_id,
      buildAuditDetails({ row, lineBookingEnabled })
    );

    return createSuccessResponse(
      buildResponsePayload({ row, lineBookingEnabled })
    );
  } catch (error) {
    if (error instanceof LineCredentialsSecretRequiredError) {
      return createErrorResponse(`${error.fieldName}を入力してください`, 400);
    }

    if (error instanceof LineCredentialCryptoError) {
      return createErrorResponse(
        'LINE credential暗号化キーが未設定または不正です',
        503
      );
    }

    logError(error, {
      endpoint: ENDPOINT,
      method: 'PUT',
      userId: authResult.auth.id,
      params: { clinic_id: parsedBody.data.clinic_id },
    });
    return createErrorResponse('LINE credentialの保存に失敗しました', 500);
  }
}
