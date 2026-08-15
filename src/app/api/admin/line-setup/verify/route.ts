import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';
import {
  LineSetupConflictError,
  LineSetupVerificationError,
  verifyPreparedLineSetup,
} from '@/lib/line/setup-admin-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-setup/verify';
const ALLOWED_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const NullableText = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(255).nullable()
);
const NullableSecret = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(20000).nullable()
);
const VerifySchema = z
  .object({
    app_endpoint_id: NullableText,
    app_type: z.enum(['mini_app', 'liff']),
    channel_secret: z.string().trim().min(1).max(20000),
    clinic_id: z.string().uuid(),
    liff_id: z.string().trim().min(1).max(255),
    login_channel_id: NullableText,
    messaging_channel_id: z.string().trim().min(1).max(128),
    provider_configuration_confirmed: z.literal(true),
    public_key_kid: z.string().trim().min(1).max(256),
    setup_session_id: z.string().uuid(),
    test_id_token: NullableSecret,
    test_line_user_id: z.preprocess(
      value =>
        typeof value === 'string' && value.trim() === '' ? null : value,
      z
        .string()
        .trim()
        .regex(/^U[0-9a-f]{32}$/i)
        .nullable()
    ),
  })
  .superRefine((value, context) => {
    if (!value.login_channel_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LINE Login / MINI App Channel IDは必須です',
        path: ['login_channel_id'],
      });
    }
    if (value.app_type === 'mini_app' && !value.app_endpoint_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MINI App Endpoint IDは必須です',
        path: ['app_endpoint_id'],
      });
    }
    if (Boolean(value.test_id_token) !== Boolean(value.test_line_user_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ID tokenとテスト送信先LINE user IDは両方入力してください',
        path: ['test_id_token'],
      });
    }
  });

export async function POST(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
    sanitizeInputValues: false,
  });
  if (!authResult.success) return authResult.error;

  const body = VerifySchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      body.error.flatten()
    );
  }

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(body.data.clinic_id);
    const result = await verifyPreparedLineSetup({
      client: context.client,
      clinicId: body.data.clinic_id,
      input: {
        appEndpointId: body.data.app_endpoint_id,
        appType: body.data.app_type,
        channelSecret: body.data.channel_secret,
        liffId: body.data.liff_id,
        loginChannelId: body.data.login_channel_id,
        messagingChannelId: body.data.messaging_channel_id,
        providerConfigurationConfirmed:
          body.data.provider_configuration_confirmed,
        publicKeyKid: body.data.public_key_kid,
        testIdToken: body.data.test_id_token,
        testLineUserId: body.data.test_line_user_id,
      },
      setupSessionId: body.data.setup_session_id,
    });
    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_setup_verified',
      body.data.clinic_id,
      {
        app_type: body.data.app_type,
        push_test_sent: result.pushTestSent,
        setup_session_id: body.data.setup_session_id,
      }
    );
    return createSuccessResponse(result, 200, 'LINEとの接続を確認しました');
  } catch (error) {
    if (
      error instanceof ScopeAccessError ||
      error instanceof ScopeNotConfiguredError
    ) {
      return createErrorResponse(error.message, 403);
    }
    if (error instanceof LineSetupConflictError) {
      return createErrorResponse(error.message, 409);
    }
    if (error instanceof LineSetupVerificationError) {
      return createErrorResponse(toVerificationMessage(error.reason), 422, {
        reason: error.reason,
      });
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'POST',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE接続確認に失敗しました', 500);
  }
}

function toVerificationMessage(
  reason: LineSetupVerificationError['reason']
): string {
  if (reason === 'token_issue_failed') {
    return 'Channel ID・公開鍵KID・Providerの組み合わせを確認してください';
  }
  if (reason === 'bot_info_failed') {
    return 'LINE公式アカウント情報を取得できませんでした';
  }
  if (reason === 'provider_identity_failed') {
    return 'LINE LoginのID tokenとテスト送信先が同一Providerの利用者か確認できませんでした';
  }
  return '確認用LINEユーザーへテスト通知を送信できませんでした';
}
