import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { listLineChatConversations } from '@/lib/line/chat-admin-service';
import { toLineIntegrationClient } from '@/lib/line/integration-db';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-chat/conversations';
const ALLOWED_ROLES = [
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
] as const;
const QuerySchema = z.object({ clinic_id: z.string().uuid() });

export async function GET(request: NextRequest) {
  const query = QuerySchema.safeParse(
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
      await listLineChatConversations({
        client: toLineIntegrationClient(context.client),
        clinicId: query.data.clinic_id,
        role: authResult.permissions.role,
        userId: authResult.auth.id,
      })
    );
  } catch (error) {
    if (
      error instanceof ScopeAccessError ||
      error instanceof ScopeNotConfiguredError
    ) {
      return createErrorResponse(error.message, 403);
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE会話一覧の取得に失敗しました', 500);
  }
}
