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
  getLineSetupState,
  LineSetupConflictError,
  prepareLineSetup,
  revokeLineSetup,
  updateLineFeatureSettings,
} from '@/lib/line/setup-admin-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-setup';
const ALLOWED_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const ClinicSchema = z.object({
  clinic_id: z.string().uuid('clinic_idの形式が不正です'),
});
const FeatureSchema = ClinicSchema.extend({
  enable_booking: z.boolean(),
  enable_notifications: z.boolean(),
});
const RevokeSchema = ClinicSchema.extend({
  setup_session_id: z.string().uuid('setup_session_idの形式が不正です'),
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
    return createSuccessResponse(
      await getLineSetupState({
        client: context.client,
        clinicId: query.data.clinic_id,
      })
    );
  } catch (error) {
    const scopeResponse = toScopeResponse(error);
    if (scopeResponse) return scopeResponse;
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE連携設定の取得に失敗しました', 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = ClinicSchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(body.data.clinic_id);
    const state = await prepareLineSetup({
      client: context.client,
      clinicId: body.data.clinic_id,
      userId: authResult.auth.id,
    });
    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_setup_prepared',
      body.data.clinic_id,
      { setup_session_id: state.setup?.id ?? null }
    );
    return createSuccessResponse(state, 201, 'LINE接続の準備ができました');
  } catch (error) {
    const scopeResponse = toScopeResponse(error);
    if (scopeResponse) return scopeResponse;
    if (error instanceof LineSetupConflictError) {
      return createErrorResponse(error.message, 409);
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'POST',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE接続の準備に失敗しました', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = FeatureSchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(body.data.clinic_id);
    const state = await updateLineFeatureSettings({
      client: context.client,
      clinicId: body.data.clinic_id,
      enableBooking: body.data.enable_booking,
      enableNotifications: body.data.enable_notifications,
      userId: authResult.auth.id,
    });
    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_feature_settings_updated',
      body.data.clinic_id,
      {
        line_booking_enabled: body.data.enable_booking,
        line_notification_enabled: body.data.enable_notifications,
      }
    );
    return createSuccessResponse(state, 200, 'LINE機能設定を保存しました');
  } catch (error) {
    const scopeResponse = toScopeResponse(error);
    if (scopeResponse) return scopeResponse;
    if (hasMessage(error, 'LINE_BOOKING_IDENTITY_NOT_VERIFIED')) {
      return createErrorResponse(
        'LINE予約を有効にするにはProvider同一性の確認が必要です',
        409
      );
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'PATCH',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE機能設定の保存に失敗しました', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = RevokeSchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(body.data.clinic_id);
    const state = await revokeLineSetup({
      client: context.client,
      clinicId: body.data.clinic_id,
      setupSessionId: body.data.setup_session_id,
    });
    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_setup_revoked',
      body.data.clinic_id,
      { setup_session_id: body.data.setup_session_id }
    );
    return createSuccessResponse(
      state,
      200,
      '接続確認を破棄しました。新しく準備できます'
    );
  } catch (error) {
    const scopeResponse = toScopeResponse(error);
    if (scopeResponse) return scopeResponse;
    logError(error, {
      endpoint: ENDPOINT,
      method: 'DELETE',
      userId: authResult.auth.id,
    });
    return createErrorResponse('接続確認の破棄に失敗しました', 500);
  }
}

function toScopeResponse(error: unknown) {
  return error instanceof ScopeAccessError ||
    error instanceof ScopeNotConfiguredError
    ? createErrorResponse(error.message, 403)
    : null;
}

function hasMessage(error: unknown, marker: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes(marker)
  );
}
