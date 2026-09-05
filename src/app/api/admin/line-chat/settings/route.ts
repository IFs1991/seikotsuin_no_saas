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
import { toLineIntegrationClient } from '@/lib/line/integration-db';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-chat/settings';
const ALLOWED_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const DEFAULT_REPLY =
  'お問い合わせありがとうございます。受付時間内に担当者より返信いたします。';
const ClinicSchema = z.object({ clinic_id: z.string().uuid() });
const PatchSchema = z.object({
  auto_reply_enabled: z.boolean(),
  auto_reply_message: z.string().trim().min(1).max(1000),
  clinic_id: z.string().uuid(),
  line_chat_enabled: z.boolean(),
  retention_days: z.number().int().min(1).max(365),
});

export async function GET(request: NextRequest) {
  const query = ClinicSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!query.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    clinicId: query.data.clinic_id,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(query.data.clinic_id);
    const client = toLineIntegrationClient(context.client);
    const [settingsResult, flagsResult, credentialsResult] = await Promise.all([
      client
        .from('clinic_line_chat_settings')
        .select(
          'auto_reply_enabled, auto_reply_message, retention_days, updated_at'
        )
        .eq('clinic_id', query.data.clinic_id)
        .maybeSingle(),
      client
        .from('clinic_feature_flags')
        .select('line_chat_enabled')
        .eq('clinic_id', query.data.clinic_id)
        .maybeSingle(),
      client
        .from('clinic_line_credentials')
        .select('webhook_verified_at')
        .eq('clinic_id', query.data.clinic_id)
        .maybeSingle(),
    ]);
    if (settingsResult.error || flagsResult.error || credentialsResult.error) {
      throw (
        settingsResult.error ?? flagsResult.error ?? credentialsResult.error
      );
    }

    return createSuccessResponse({
      auto_reply_enabled: settingsResult.data?.auto_reply_enabled ?? false,
      auto_reply_message:
        settingsResult.data?.auto_reply_message ?? DEFAULT_REPLY,
      line_chat_enabled: flagsResult.data?.line_chat_enabled === true,
      retention_days: settingsResult.data?.retention_days ?? 90,
      updated_at: settingsResult.data?.updated_at ?? null,
      webhook_verified:
        credentialsResult.data?.webhook_verified_at !== null &&
        credentialsResult.data?.webhook_verified_at !== undefined,
    });
  } catch (error) {
    return handleError(error, 'GET', authResult.auth.id);
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = PatchSchema.safeParse(authResult.body);
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
    const client = toLineIntegrationClient(context.client);
    const { error } = await client.rpc('update_line_chat_settings', {
      p_auto_reply_enabled: body.data.auto_reply_enabled,
      p_auto_reply_message: body.data.auto_reply_message,
      p_clinic_id: body.data.clinic_id,
      p_line_chat_enabled: body.data.line_chat_enabled,
      p_retention_days: body.data.retention_days,
      p_updated_by: authResult.auth.id,
    });
    if (error) {
      if (error.message.includes('LINE_CHAT_WEBHOOK_NOT_VERIFIED')) {
        return createErrorResponse(
          'Webhook受信を確認するまでチャットを有効にできません',
          409
        );
      }
      throw error;
    }

    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_chat_settings_updated',
      body.data.clinic_id,
      {
        auto_reply_enabled: body.data.auto_reply_enabled,
        line_chat_enabled: body.data.line_chat_enabled,
        retention_days: body.data.retention_days,
      }
    );
    return createSuccessResponse(
      {
        auto_reply_enabled: body.data.auto_reply_enabled,
        auto_reply_message: body.data.auto_reply_message,
        line_chat_enabled: body.data.line_chat_enabled,
        retention_days: body.data.retention_days,
      },
      200,
      'LINEチャット設定を保存しました'
    );
  } catch (error) {
    return handleError(error, 'PATCH', authResult.auth.id);
  }
}

function handleError(error: unknown, method: string, userId: string) {
  if (
    error instanceof ScopeAccessError ||
    error instanceof ScopeNotConfiguredError
  ) {
    return createErrorResponse(error.message, 403);
  }
  logError(error, { endpoint: ENDPOINT, method, userId });
  return createErrorResponse('LINEチャット設定の処理に失敗しました', 500);
}
