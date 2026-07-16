import { ScopeAccessError } from '@/lib/auth/manager-scope';
import {
  canAccessClinicScope,
  type ScopedAdminContext,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import type { Json } from '@/types/supabase';

export type ChatSessionScopeRow = {
  id: string;
  user_id: string | null;
  clinic_id: string | null;
  is_admin_session: boolean | null;
  context_data: unknown;
};

type ChatSessionClient = Pick<SupabaseServerClient, 'from'>;

type ScopedChatAdminContext = Pick<
  ScopedAdminContext,
  'scopedClinicIds' | 'assertClinicInScope'
> & {
  client: ChatSessionClient;
};

type AdminSessionContextData = {
  mode: 'clinic' | 'multi_clinic';
  clinicId: string | null;
  scopedClinicIds: string[];
};

export async function createScopedAdminChatSession(input: {
  context: ScopedChatAdminContext;
  userId: string;
  clinicId: string | null;
  contextData: Json;
}): Promise<ChatSessionScopeRow> {
  assertAdminSessionContextInScope({
    context: input.context,
    sessionClinicId: input.clinicId,
    requestedClinicId: input.clinicId,
    contextData: input.contextData,
  });

  const { data, error } = await input.context.client
    .from('chat_sessions')
    .insert({
      user_id: input.userId,
      clinic_id: input.clinicId,
      context_data: input.contextData,
      is_admin_session: true,
    })
    .select('id, user_id, clinic_id, is_admin_session, context_data')
    .single();
  if (error) throw error;
  return data;
}

function parseAdminSessionContext(
  value: unknown
): AdminSessionContextData | null {
  if (typeof value !== 'object' || value === null) return null;

  const mode = Reflect.get(value, 'mode');
  const clinicId = Reflect.get(value, 'clinic_id');
  const scopedClinicIds = Reflect.get(value, 'scoped_clinic_ids');

  if (
    (mode !== 'clinic' && mode !== 'multi_clinic') ||
    (clinicId !== null && typeof clinicId !== 'string') ||
    !Array.isArray(scopedClinicIds) ||
    scopedClinicIds.length === 0 ||
    !scopedClinicIds.every(
      scopedClinicId =>
        typeof scopedClinicId === 'string' && scopedClinicId.length > 0
    ) ||
    new Set(scopedClinicIds).size !== scopedClinicIds.length
  ) {
    return null;
  }

  return {
    mode,
    clinicId,
    scopedClinicIds,
  };
}

function assertAdminSessionContextInScope(input: {
  context: ScopedChatAdminContext;
  sessionClinicId: string | null;
  requestedClinicId: string | null;
  contextData: unknown;
}): AdminSessionContextData {
  const sessionContext = parseAdminSessionContext(input.contextData);
  if (!sessionContext) throw new ScopeAccessError();

  for (const clinicId of sessionContext.scopedClinicIds) {
    if (!input.context.scopedClinicIds.includes(clinicId)) {
      throw new ScopeAccessError();
    }
    input.context.assertClinicInScope(clinicId);
  }

  if (input.requestedClinicId !== null) {
    input.context.assertClinicInScope(input.requestedClinicId);
    if (
      input.sessionClinicId !== input.requestedClinicId ||
      sessionContext.mode !== 'clinic' ||
      sessionContext.clinicId !== input.requestedClinicId ||
      sessionContext.scopedClinicIds.length !== 1 ||
      sessionContext.scopedClinicIds[0] !== input.requestedClinicId
    ) {
      throw new ScopeAccessError();
    }
    return sessionContext;
  }

  if (
    input.sessionClinicId !== null ||
    sessionContext.mode !== 'multi_clinic' ||
    sessionContext.clinicId !== null
  ) {
    throw new ScopeAccessError();
  }

  return sessionContext;
}

export function assertScopedAdminChatSession(input: {
  context: ScopedChatAdminContext;
  session: ChatSessionScopeRow;
  userId: string;
  requestedClinicId: string | null;
}): string {
  if (
    input.session.user_id !== input.userId ||
    input.session.is_admin_session !== true
  ) {
    throw new ScopeAccessError();
  }

  assertAdminSessionContextInScope({
    context: input.context,
    sessionClinicId: input.session.clinic_id,
    requestedClinicId: input.requestedClinicId,
    contextData: input.session.context_data,
  });
  return input.session.id;
}

async function fetchChatSession(
  client: ChatSessionClient,
  sessionId: string
): Promise<ChatSessionScopeRow> {
  const { data, error } = await client
    .from('chat_sessions')
    .select('id, user_id, clinic_id, is_admin_session, context_data')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !data) throw new ScopeAccessError();
  return data;
}

export async function resolveScopedChatSessionId(input: {
  client: ChatSessionClient;
  permissions: UserPermissions;
  sessionId: string;
  clinicId: string;
  userId: string;
}): Promise<string> {
  if (!canAccessClinicScope(input.permissions, input.clinicId)) {
    throw new ScopeAccessError();
  }

  const session = await fetchChatSession(input.client, input.sessionId);
  if (
    session.is_admin_session !== false ||
    session.clinic_id !== input.clinicId ||
    session.user_id !== input.userId
  ) {
    throw new ScopeAccessError();
  }
  return session.id;
}

export async function resolveScopedAdminChatSessionId(input: {
  context: ScopedChatAdminContext;
  sessionId: string;
  userId: string;
  requestedClinicId: string | null;
}): Promise<string> {
  const session = await fetchChatSession(input.context.client, input.sessionId);
  return assertScopedAdminChatSession({
    context: input.context,
    session,
    userId: input.userId,
    requestedClinicId: input.requestedClinicId,
  });
}
