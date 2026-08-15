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
  completeVerifiedLineSetup,
  LineSetupConflictError,
} from '@/lib/line/setup-admin-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-setup/complete';
const ALLOWED_ROLES = Array.from(CLINIC_ADMIN_ROLES);
const CompleteSchema = z.object({
  clinic_id: z.string().uuid(),
  enable_booking: z.boolean().default(false),
  enable_notifications: z.boolean().default(false),
  setup_session_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;

  const body = CompleteSchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  try {
    const context = createScopedAdminContext(authResult.permissions);
    context.assertClinicInScope(body.data.clinic_id);
    const state = await completeVerifiedLineSetup({
      client: context.client,
      clinicId: body.data.clinic_id,
      enableBooking: body.data.enable_booking,
      enableNotifications: body.data.enable_notifications,
      setupSessionId: body.data.setup_session_id,
      userId: authResult.auth.id,
    });
    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'line_setup_completed',
      body.data.clinic_id,
      {
        line_booking_enabled: body.data.enable_booking,
        line_notification_enabled: body.data.enable_notifications,
        setup_session_id: body.data.setup_session_id,
      }
    );
    return createSuccessResponse(state, 200, 'LINE連携を有効化しました');
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
    if (hasMessage(error, 'LINE_BOOKING_IDENTITY_NOT_VERIFIED')) {
      return createErrorResponse(
        'LINE予約を有効にするにはProvider同一性の確認が必要です',
        409
      );
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'POST',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE連携の有効化に失敗しました', 500);
  }
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
