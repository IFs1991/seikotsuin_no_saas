import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  enqueueLineChatReply,
  LineChatAccessError,
  listLineChatMessages,
} from '@/lib/line/chat-admin-service';
import { toLineIntegrationClient } from '@/lib/line/integration-db';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/line-chat/conversations/[id]/messages';
const ALLOWED_ROLES = [
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
] as const;
const IdSchema = z.string().uuid();
const QuerySchema = z.object({ clinic_id: z.string().uuid() });
const ReplySchema = QuerySchema.extend({
  text: z.string().trim().min(1).max(5000),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params;
  const id = IdSchema.safeParse(rawId);
  const query = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!id.success || !query.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    clinicId: query.data.clinic_id,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;

  try {
    const scoped = createScopedAdminContext(authResult.permissions);
    scoped.assertClinicInScope(query.data.clinic_id);
    return createSuccessResponse(
      await listLineChatMessages({
        client: toLineIntegrationClient(scoped.client),
        clinicId: query.data.clinic_id,
        conversationId: id.data,
        role: authResult.permissions.role,
        userId: authResult.auth.id,
      })
    );
  } catch (error) {
    return handleError(error, 'GET', authResult.auth.id);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await context.params;
  const id = IdSchema.safeParse(rawId);
  if (!id.success) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  const authResult = await processApiRequest(request, {
    allowedRoles: ALLOWED_ROLES,
    requireBody: true,
    requireClinicMatch: false,
  });
  if (!authResult.success) return authResult.error;
  const body = ReplySchema.safeParse(authResult.body);
  if (!body.success) {
    return createErrorResponse('本文は1〜5000文字で入力してください', 400);
  }

  try {
    const scoped = createScopedAdminContext(authResult.permissions);
    scoped.assertClinicInScope(body.data.clinic_id);
    const messageId = await enqueueLineChatReply({
      client: toLineIntegrationClient(scoped.client),
      clinicId: body.data.clinic_id,
      conversationId: id.data,
      role: authResult.permissions.role,
      text: body.data.text,
      userId: authResult.auth.id,
    });
    return createSuccessResponse({ message_id: messageId }, 201);
  } catch (error) {
    if (hasMessage(error, 'LINE_CHAT_DISABLED')) {
      return createErrorResponse('LINEチャットが無効です', 409);
    }
    return handleError(error, 'POST', authResult.auth.id);
  }
}

function handleError(error: unknown, method: string, userId: string) {
  if (
    error instanceof ScopeAccessError ||
    error instanceof ScopeNotConfiguredError ||
    error instanceof LineChatAccessError
  ) {
    return createErrorResponse(error.message, 403);
  }
  logError(error, { endpoint: ENDPOINT, method, userId });
  return createErrorResponse('LINEメッセージの処理に失敗しました', 500);
}

function hasMessage(error: unknown, value: string): boolean {
  return error instanceof Error && error.message.includes(value);
}
