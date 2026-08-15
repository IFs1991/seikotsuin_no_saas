import { NextRequest } from 'next/server';

import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import {
  assignLineChatConversation,
  enqueueLineChatReply,
  listLineChatConversations,
  listLineChatMessages,
} from '@/lib/line/chat-admin-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
} from '@/lib/supabase/scoped-admin';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...actual, logError: jest.fn(), processApiRequest: jest.fn() };
});
jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return { ...actual, createScopedAdminContext: jest.fn() };
});
jest.mock('@/lib/line/chat-admin-service', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/line/chat-admin-service')
  >('@/lib/line/chat-admin-service');
  return {
    ...actual,
    assignLineChatConversation: jest.fn(),
    enqueueLineChatReply: jest.fn(),
    listLineChatConversations: jest.fn(),
    listLineChatMessages: jest.fn(),
  };
});

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444';
const processMock = jest.mocked(processApiRequest);
const contextMock = jest.mocked(createScopedAdminContext);
const conversationsMock = jest.mocked(listLineChatConversations);
const messagesMock = jest.mocked(listLineChatMessages);
const replyMock = jest.mocked(enqueueLineChatReply);
const assignmentMock = jest.mocked(assignLineChatConversation);

function mockAuth(body?: unknown, role = 'clinic_admin') {
  processMock.mockResolvedValue({
    auth: { email: 'clinic@example.test', id: USER_ID, role },
    body,
    permissions: {
      clinic_id: CLINIC_ID,
      clinic_scope_ids: [CLINIC_ID],
      role,
    },
    success: true,
    supabase: {},
  });
  contextMock.mockReturnValue({
    assertClinicInScope: jest.fn(),
    client: {},
    scopedClinicIds: [CLINIC_ID],
  });
}

function request(path: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, {
    headers: { origin: 'http://localhost' },
    method,
  });
}

describe('clinic-scoped LINE chat APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows clinic operators but excludes HQ admin from message bodies', async () => {
    mockAuth(undefined, 'staff');
    conversationsMock.mockResolvedValue({ assignees: [], conversations: [] });
    const { GET } =
      await import('@/app/api/admin/line-chat/conversations/route');
    const response = await GET(
      request(`/api/admin/line-chat/conversations?clinic_id=${CLINIC_ID}`)
    );

    expect(response.status).toBe(200);
    const options = processMock.mock.calls[0]?.[1];
    expect(options?.allowedRoles).toEqual([
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ]);
    expect(options?.allowedRoles).not.toContain('admin');
    expect(conversationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        role: 'staff',
        userId: USER_ID,
      })
    );
  });

  it('stops before data access when authentication rejects the role', async () => {
    processMock.mockResolvedValue({
      error: createErrorResponse('この操作を実行する権限がありません', 403),
      success: false,
    });
    const { GET } =
      await import('@/app/api/admin/line-chat/conversations/route');
    const response = await GET(
      request(`/api/admin/line-chat/conversations?clinic_id=${CLINIC_ID}`)
    );

    expect(response.status).toBe(403);
    expect(contextMock).not.toHaveBeenCalled();
    expect(conversationsMock).not.toHaveBeenCalled();
  });

  it('rejects another clinic before reading any messages', async () => {
    mockAuth();
    contextMock.mockReturnValue({
      assertClinicInScope: jest.fn(() => {
        throw new ScopeAccessError();
      }),
      client: {},
      scopedClinicIds: [CLINIC_ID],
    });
    const { GET } =
      await import('@/app/api/admin/line-chat/conversations/[id]/messages/route');
    const response = await GET(
      request(
        `/api/admin/line-chat/conversations/${CONVERSATION_ID}/messages?clinic_id=${CLINIC_ID}`
      ),
      { params: Promise.resolve({ id: CONVERSATION_ID }) }
    );

    expect(response.status).toBe(403);
    expect(messagesMock).not.toHaveBeenCalled();
  });

  it('validates and queues a staff reply through the atomic RPC service', async () => {
    mockAuth({ clinic_id: CLINIC_ID, text: '返信内容' }, 'therapist');
    replyMock.mockResolvedValue('55555555-5555-4555-8555-555555555555');
    const { POST } =
      await import('@/app/api/admin/line-chat/conversations/[id]/messages/route');
    const response = await POST(
      request(
        `/api/admin/line-chat/conversations/${CONVERSATION_ID}/messages`,
        'POST'
      ),
      { params: Promise.resolve({ id: CONVERSATION_ID }) }
    );

    expect(response.status).toBe(201);
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        conversationId: CONVERSATION_ID,
        role: 'therapist',
        text: '返信内容',
      })
    );
  });

  it('limits assignment changes to clinic admins and managers', async () => {
    mockAuth(
      {
        assigned_membership_id: MEMBERSHIP_ID,
        clinic_id: CLINIC_ID,
      },
      'manager'
    );
    assignmentMock.mockResolvedValue(undefined);
    const { PATCH } =
      await import('@/app/api/admin/line-chat/conversations/[id]/assignment/route');
    const response = await PATCH(
      request(
        `/api/admin/line-chat/conversations/${CONVERSATION_ID}/assignment`,
        'PATCH'
      ),
      { params: Promise.resolve({ id: CONVERSATION_ID }) }
    );

    expect(response.status).toBe(200);
    const options = processMock.mock.calls[0]?.[1];
    expect(options?.allowedRoles).toEqual(['clinic_admin', 'manager']);
    expect(assignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedMembershipId: MEMBERSHIP_ID,
        clinicId: CLINIC_ID,
        role: 'manager',
      })
    );
  });
});
