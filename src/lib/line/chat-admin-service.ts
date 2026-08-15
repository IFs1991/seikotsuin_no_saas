import 'server-only';

import type { LineIntegrationClient } from '@/lib/line/integration-db';
import { isRole, normalizeRole, type Role } from '@/lib/constants/roles';

const LINE_CHAT_PRIVILEGED_ROLES: ReadonlySet<Role> = new Set([
  'clinic_admin',
  'manager',
]);

export type LineChatConversationSummary = {
  assignedMembershipId: string | null;
  assignedStaffName: string | null;
  contactName: string;
  id: string;
  lastMessageAt: string | null;
  status: 'open' | 'closed';
  unreadCount: number;
};

export type LineChatMessageView = {
  direction: 'inbound' | 'outbound' | 'system';
  id: string;
  messageType: 'text' | 'unsupported';
  occurredAt: string;
  status: 'received' | 'queued' | 'sent' | 'failed' | 'unsent';
  text: string | null;
};

export type LineChatAssignee = {
  displayName: string;
  membershipId: string;
};

export class LineChatAccessError extends Error {
  constructor(message = 'このLINE会話へアクセスできません') {
    super(message);
    this.name = 'LineChatAccessError';
  }
}

type ChatAccess = {
  membershipId: string | null;
  privileged: boolean;
};

export function parseConversationStatus(value: string): 'open' | 'closed' {
  if (value === 'open' || value === 'closed') return value;
  throw new Error('Unexpected LINE conversation status');
}

export function parseMessageDirection(
  value: string
): LineChatMessageView['direction'] {
  if (value === 'inbound' || value === 'outbound' || value === 'system') {
    return value;
  }
  throw new Error('Unexpected LINE message direction');
}

export function parseMessageType(
  value: string
): LineChatMessageView['messageType'] {
  if (value === 'text' || value === 'unsupported') return value;
  throw new Error('Unexpected LINE message type');
}

export function parseMessageStatus(
  value: string
): LineChatMessageView['status'] {
  if (
    value === 'received' ||
    value === 'queued' ||
    value === 'sent' ||
    value === 'failed' ||
    value === 'unsent'
  ) {
    return value;
  }
  throw new Error('Unexpected LINE message status');
}

export async function listLineChatConversations(params: {
  client: LineIntegrationClient;
  clinicId: string;
  role: string;
  userId: string;
}): Promise<{
  assignees: LineChatAssignee[];
  conversations: LineChatConversationSummary[];
}> {
  const access = await resolveChatAccess(params);
  if (!access.privileged && !access.membershipId) {
    return { assignees: [], conversations: [] };
  }

  let query = params.client
    .from('line_conversations')
    .select('*')
    .eq('clinic_id', params.clinicId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (!access.privileged && access.membershipId) {
    query = query.eq('assigned_membership_id', access.membershipId);
  }
  const { data: conversations, error } = await query;
  if (error) throw error;
  if (!conversations || conversations.length === 0) {
    return {
      assignees: access.privileged
        ? await listLineChatAssignees(params.client, params.clinicId)
        : [],
      conversations: [],
    };
  }

  const contacts = await fetchContacts(
    params.client,
    params.clinicId,
    conversations.map(conversation => conversation.contact_id)
  );
  const customerNames = await fetchCustomerNames(
    params.client,
    params.clinicId,
    contacts
      .map(contact => contact.customer_id)
      .filter((id): id is string => typeof id === 'string')
  );
  const assignees = await listLineChatAssignees(params.client, params.clinicId);
  const contactById = new Map(contacts.map(contact => [contact.id, contact]));
  const customerNameById = new Map(
    customerNames.map(customer => [customer.id, customer.name])
  );
  const assigneeNameById = new Map(
    assignees.map(assignee => [assignee.membershipId, assignee.displayName])
  );

  return {
    assignees: access.privileged ? assignees : [],
    conversations: conversations.map(conversation => {
      const contact = contactById.get(conversation.contact_id);
      const customerName = contact?.customer_id
        ? customerNameById.get(contact.customer_id)
        : null;
      return {
        assignedMembershipId: conversation.assigned_membership_id,
        assignedStaffName: conversation.assigned_membership_id
          ? (assigneeNameById.get(conversation.assigned_membership_id) ?? null)
          : null,
        contactName:
          customerName || contact?.display_name?.trim() || 'LINE利用者',
        id: conversation.id,
        lastMessageAt: conversation.last_message_at,
        status: parseConversationStatus(conversation.status),
        unreadCount: conversation.unread_count,
      };
    }),
  };
}

export async function listLineChatMessages(params: {
  client: LineIntegrationClient;
  clinicId: string;
  conversationId: string;
  role: string;
  userId: string;
}): Promise<LineChatMessageView[]> {
  const { data, error } = await params.client.rpc(
    'list_authorized_line_chat_messages',
    {
      p_actor_user_id: params.userId,
      p_clinic_id: params.clinicId,
      p_conversation_id: params.conversationId,
    }
  );
  if (error) {
    if (error.message.includes('LINE_CHAT_')) throw new LineChatAccessError();
    throw error;
  }
  return (data ?? []).map(message => ({
    direction: parseMessageDirection(message.direction),
    id: message.id,
    messageType: parseMessageType(message.message_type),
    occurredAt: message.occurred_at,
    status: parseMessageStatus(message.status),
    text: message.text_content,
  }));
}

export async function enqueueLineChatReply(params: {
  client: LineIntegrationClient;
  clinicId: string;
  conversationId: string;
  role: string;
  text: string;
  userId: string;
}): Promise<string> {
  const { data, error } = await params.client.rpc('enqueue_line_chat_message', {
    p_clinic_id: params.clinicId,
    p_conversation_id: params.conversationId,
    p_sent_by: params.userId,
    p_text: params.text,
  });
  if (error) {
    if (error.message.includes('LINE_CHAT_')) throw new LineChatAccessError();
    throw error;
  }
  if (typeof data !== 'string') {
    throw new Error('LINE reply enqueue did not return a message ID');
  }
  return data;
}

export async function assignLineChatConversation(params: {
  assignedMembershipId: string | null;
  client: LineIntegrationClient;
  clinicId: string;
  conversationId: string;
  role: string;
  userId: string;
}): Promise<void> {
  const { error } = await params.client.rpc('assign_line_chat_conversation', {
    p_actor_user_id: params.userId,
    p_assigned_membership_id: params.assignedMembershipId ?? undefined,
    p_clinic_id: params.clinicId,
    p_conversation_id: params.conversationId,
  });
  if (error) {
    if (error.message.includes('LINE_CHAT_')) throw new LineChatAccessError();
    throw error;
  }
}

async function resolveChatAccess(params: {
  client: LineIntegrationClient;
  clinicId: string;
  role: string;
  userId: string;
}): Promise<ChatAccess> {
  const normalizedRole = normalizeRole(params.role);
  const privileged =
    isRole(normalizedRole) && LINE_CHAT_PRIVILEGED_ROLES.has(normalizedRole);
  const { data: profile, error: profileError } = await params.client
    .from('staff_profiles')
    .select('id')
    .eq('user_id', params.userId)
    .eq('is_active', true)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { membershipId: null, privileged };

  const { data: membership, error: membershipError } = await params.client
    .from('staff_clinic_memberships')
    .select('id')
    .eq('staff_profile_id', profile.id)
    .eq('clinic_id', params.clinicId)
    .neq('membership_type', 'blocked')
    .maybeSingle();
  if (membershipError) throw membershipError;
  return { membershipId: membership?.id ?? null, privileged };
}

async function listLineChatAssignees(
  client: LineIntegrationClient,
  clinicId: string
): Promise<LineChatAssignee[]> {
  const { data: memberships, error } = await client
    .from('staff_clinic_memberships')
    .select('id, staff_profile_id')
    .eq('clinic_id', clinicId)
    .neq('membership_type', 'blocked')
    .order('priority', { ascending: true });
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from('staff_profiles')
    .select('display_name, id')
    .eq('is_active', true)
    .in(
      'id',
      memberships.map(membership => membership.staff_profile_id)
    );
  if (profileError) throw profileError;
  const profileById = new Map(
    (profiles ?? []).map(profile => [profile.id, profile.display_name])
  );
  return memberships.flatMap(membership => {
    const displayName = profileById.get(membership.staff_profile_id);
    return displayName ? [{ displayName, membershipId: membership.id }] : [];
  });
}

async function fetchContacts(
  client: LineIntegrationClient,
  clinicId: string,
  contactIds: string[]
) {
  const { data, error } = await client
    .from('line_contacts')
    .select('customer_id, display_name, id')
    .eq('clinic_id', clinicId)
    .in('id', contactIds);
  if (error) throw error;
  return data ?? [];
}

async function fetchCustomerNames(
  client: LineIntegrationClient,
  clinicId: string,
  customerIds: string[]
) {
  if (customerIds.length === 0) return [];
  const { data, error } = await client
    .from('customers')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .in('id', customerIds);
  if (error) throw error;
  return data ?? [];
}
