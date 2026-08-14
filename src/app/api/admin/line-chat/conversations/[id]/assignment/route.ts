import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  assignLineChatConversation,
  LineChatAccessError,
} from '@/lib/line/chat-admin-service';
import { toLineIntegrationClient } from '@/lib/line/integration-db';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-chat/conversations/[id]/assignment';
const IdSchema = z.string().uuid();
const BodySchema = z.object({
  assigned_membership_id: z.string().uuid().nullable(),
  clinic_id: z.string().uuid(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params;
  const id = IdSchema.safeParse(rawId);
  if (!id.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  const authResult = await processApiRequest(request, {
    allowedRoles: ['clinic_admin', 'manager'],
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = BodySchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  try {
    const scoped = createScopedAdminContext(authResult.permissions);
    scoped.assertClinicInScope(body.data.clinic_id);
    await assignLineChatConversation({
      assignedMembershipId: body.data.assigned_membership_id,
      client: toLineIntegrationClient(scoped.client),
      clinicId: body.data.clinic_id,
      conversationId: id.data,
      role: authResult.permissions.role,
      userId: authResult.auth.id,
    });
    return createSuccessResponse({ updated: true });
  } catch (error) {
    if (
      error instanceof ScopeAccessError ||
      error instanceof ScopeNotConfiguredError ||
      error instanceof LineChatAccessError
    ) {
      return createErrorResponse(error.message, 403);
    }
    logError(error, {
      endpoint: ENDPOINT,
      method: 'PATCH',
      userId: authResult.auth.id,
    });
    return createErrorResponse('LINE会話の担当変更に失敗しました', 500);
  }
}
