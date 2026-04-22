import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import {
  AdminChatPostSchema,
  buildAdminChatContextData,
  generateAdminChatFallbackResponse,
  normalizeAdminChatInput,
  type AdminChatContextData,
} from '@/lib/admin/chat';
import type { Json } from '@/types/supabase';

const ENDPOINT = '/api/admin/chat';
const CHAT_SESSION_SELECT = '*, chat_messages(*)';
const ADMIN_ALLOWED_ROLES = Array.from(ADMIN_UI_ROLES);
const GetQuerySchema = z.object({
  clinic_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
});

const toJson = (value: unknown): Json => value as Json;

type ChatSessionRow = {
  id: string;
  user_id: string | null;
  clinic_id: string | null;
  is_admin_session: boolean;
  context_data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function resolveSessionContextData(
  session: ChatSessionRow,
  fallbackContextData: AdminChatContextData
): AdminChatContextData {
  if (isRecord(session.context_data)) {
    const contextData = session.context_data;
    const scopedClinicIds = contextData.scoped_clinic_ids;
    const clinicId = contextData.clinic_id;
    const periodDays = contextData.period_days;

    if (
      (contextData.mode === 'clinic' || contextData.mode === 'multi_clinic') &&
      isStringArray(scopedClinicIds) &&
      (typeof clinicId === 'string' || clinicId === null) &&
      typeof periodDays === 'number' &&
      Number.isInteger(periodDays) &&
      periodDays >= 1 &&
      periodDays <= 365
    ) {
      const normalizedClinicId = typeof clinicId === 'string' ? clinicId : null;
      return {
        mode: contextData.mode,
        clinic_id: normalizedClinicId,
        scoped_clinic_ids: scopedClinicIds,
        period_days: periodDays,
      };
    }
  }

  if (session.clinic_id) {
    return {
      mode: 'clinic',
      clinic_id: session.clinic_id,
      scoped_clinic_ids: [session.clinic_id],
      period_days: fallbackContextData.period_days,
    };
  }

  return fallbackContextData;
}

function toScopeError(error: unknown) {
  if (
    error instanceof ScopeNotConfiguredError ||
    error instanceof ScopeAccessError
  ) {
    return createErrorResponse(error.message, 403);
  }

  return null;
}

function assertSessionInScope(
  session: ChatSessionRow,
  authUserId: string,
  requestedClinicId: string | null,
  scopedClinicIds: string[]
) {
  if (session.user_id !== authUserId || session.is_admin_session !== true) {
    throw new ScopeAccessError('対象セッションへのアクセス権がありません');
  }

  if (requestedClinicId !== null) {
    if (session.clinic_id !== requestedClinicId) {
      throw new ScopeAccessError('対象セッションへのアクセス権がありません');
    }
    return;
  }

  if (session.clinic_id !== null) {
    throw new ScopeAccessError('対象セッションへのアクセス権がありません');
  }

  const contextData = session.context_data as
    | { scoped_clinic_ids?: unknown }
    | undefined;
  if (!Array.isArray(contextData?.scoped_clinic_ids)) {
    throw new ScopeAccessError('対象セッションへのアクセス権がありません');
  }

  const isSubset = contextData.scoped_clinic_ids.every(
    clinicId =>
      typeof clinicId === 'string' && scopedClinicIds.includes(clinicId)
  );
  if (!isSubset) {
    throw new ScopeAccessError('対象セッションへのアクセス権がありません');
  }
}

async function fetchSessionById(params: {
  client: ReturnType<typeof createScopedAdminContext>['client'];
  sessionId: string;
}): Promise<ChatSessionRow | null> {
  const { data, error } = await params.client
    .from('chat_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .single();

  if (error) {
    throw error;
  }

  return (data as ChatSessionRow | null) ?? null;
}

async function createSession(params: {
  client: ReturnType<typeof createScopedAdminContext>['client'];
  authUserId: string;
  clinicId: string | null;
  contextData: AdminChatContextData;
}): Promise<ChatSessionRow> {
  const { data, error } = await params.client
    .from('chat_sessions')
    .insert({
      user_id: params.authUserId,
      clinic_id: params.clinicId,
      context_data: toJson(params.contextData),
      is_admin_session: true,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as ChatSessionRow;
}

export async function GET(request: NextRequest) {
  const parsedQuery = GetQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsedQuery.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedQuery.error.flatten()
    );
  }

  const clinicId = parsedQuery.data.clinic_id ?? null;
  const sessionId = parsedQuery.data.session_id ?? null;

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ADMIN_ALLOWED_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions } = processResult;
    const adminCtx = createScopedAdminContext(permissions);

    if (clinicId) {
      adminCtx.assertClinicInScope(clinicId);
    }

    let query = adminCtx.client
      .from('chat_sessions')
      .select(CHAT_SESSION_SELECT)
      .eq('user_id', auth.id)
      .eq('is_admin_session', true);

    query =
      clinicId === null
        ? query.is('clinic_id', null)
        : query.eq('clinic_id', clinicId);

    if (sessionId) {
      query = query.eq('id', sessionId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return createSuccessResponse(data ?? []);
  } catch (error) {
    const scopeError = toScopeError(error);
    if (scopeError) {
      return scopeError;
    }

    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: 'unknown',
      params: { clinic_id: clinicId, session_id: sessionId },
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ADMIN_ALLOWED_ROLES,
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const parsed = AdminChatPostSchema.safeParse(processResult.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const input = normalizeAdminChatInput(parsed.data);
    const { auth, permissions } = processResult;
    const adminCtx = createScopedAdminContext(permissions);

    if (input.clinic_id) {
      adminCtx.assertClinicInScope(input.clinic_id);
    }

    const requestedContextData = buildAdminChatContextData({
      clinicId: input.clinic_id,
      scopedClinicIds: adminCtx.scopedClinicIds,
      periodDays: input.period_days,
    });

    const session = input.session_id
      ? await fetchSessionById({
          client: adminCtx.client,
          sessionId: input.session_id,
        })
      : await createSession({
          client: adminCtx.client,
          authUserId: auth.id,
          clinicId: input.clinic_id,
          contextData: requestedContextData,
        });

    if (!session) {
      return createErrorResponse('チャットセッションが見つかりません', 404);
    }

    assertSessionInScope(
      session,
      auth.id,
      input.clinic_id,
      adminCtx.scopedClinicIds
    );

    const contextData = input.session_id
      ? resolveSessionContextData(session, requestedContextData)
      : requestedContextData;

    const { data: userMessage, error: userMessageError } = await adminCtx.client
      .from('chat_messages')
      .insert({
        session_id: session.id,
        sender: 'user',
        message_text: input.message,
      })
      .select('*')
      .single();

    if (userMessageError) {
      throw userMessageError;
    }

    let kpiMap;
    try {
      const analyticsService = new AnalyticsReadService(adminCtx.client);
      kpiMap = await analyticsService.fetchMultiClinicKPI(
        contextData.scoped_clinic_ids
      );
    } catch (error) {
      logError(error, {
        endpoint: ENDPOINT,
        method: 'POST',
        userId: auth.id,
        params: { stage: 'fetchMultiClinicKPI' },
      });
    }

    const aiResponse = generateAdminChatFallbackResponse({
      message: input.message,
      contextData,
      kpiMap,
    });

    const { data: aiMessage, error: aiMessageError } = await adminCtx.client
      .from('chat_messages')
      .insert({
        session_id: session.id,
        sender: 'ai',
        message_text: aiResponse.message,
        response_data: toJson(aiResponse.data),
      })
      .select('*')
      .single();

    if (aiMessageError) {
      throw aiMessageError;
    }

    return createSuccessResponse({
      session_id: session.id,
      context_data: contextData,
      user_message: userMessage,
      ai_message: aiMessage,
    });
  } catch (error) {
    const scopeError = toScopeError(error);
    if (scopeError) {
      return scopeError;
    }

    logError(error, {
      endpoint: ENDPOINT,
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
