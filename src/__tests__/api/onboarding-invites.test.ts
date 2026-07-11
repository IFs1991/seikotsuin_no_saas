import { NextRequest } from 'next/server';

const getServerClientMock = jest.fn();
const getCurrentUserMock = jest.fn();
const createAdminClientMock = jest.fn();
const createStaffInviteTokenMock = jest.fn();
const sendStaffInviteEmailMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getServerClient: () => getServerClientMock(),
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  createAdminClient: () => createAdminClientMock(),
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

jest.mock('@/lib/auth/staff-invite', () => {
  const actual = jest.requireActual('@/lib/auth/staff-invite');
  return {
    ...actual,
    createStaffInviteToken: () => createStaffInviteTokenMock(),
    sendStaffInviteEmail: (...args: unknown[]) =>
      sendStaffInviteEmailMock(...args),
  };
});

import { POST } from '@/app/api/onboarding/invites/route';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = '550e8400-e29b-41d4-a716-446655440000';

function createUserClient() {
  const stateSingle = jest.fn().mockResolvedValue({
    data: { clinic_id: CLINIC_ID },
    error: null,
  });
  const stateSelectEq = jest.fn().mockReturnValue({ single: stateSingle });
  const stateSelect = jest.fn().mockReturnValue({ eq: stateSelectEq });
  const stateUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const stateUpdate = jest.fn().mockReturnValue({ eq: stateUpdateEq });

  const inviteSingle = jest.fn().mockResolvedValue({
    data: { id: INVITE_ID },
    error: null,
  });
  const inviteSelect = jest.fn().mockReturnValue({ single: inviteSingle });
  const inviteInsert = jest.fn().mockReturnValue({ select: inviteSelect });

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'onboarding_states') {
        return { select: stateSelect, update: stateUpdate };
      }

      if (table === 'staff_invites') {
        return { insert: inviteInsert };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, inviteInsert };
}

function createAdminClientWithCleanup() {
  const acceptedAtIs = jest.fn().mockResolvedValue({ error: null });
  const createdByEq = jest.fn().mockReturnValue({ is: acceptedAtIs });
  const clinicEq = jest.fn().mockReturnValue({ eq: createdByEq });
  const idEq = jest.fn().mockReturnValue({ eq: clinicEq });
  const deleteInvite = jest.fn().mockReturnValue({ eq: idEq });

  return {
    client: {
      from: jest.fn(() => ({ delete: deleteInvite })),
    },
    deleteInvite,
  };
}

function createRequest() {
  return new NextRequest('https://app.example.com/api/onboarding/invites', {
    method: 'POST',
    body: JSON.stringify({
      invites: [{ email: ' Staff@Example.com ', role: 'staff' }],
    }),
  });
}

describe('POST /api/onboarding/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createStaffInviteTokenMock.mockReturnValue(TOKEN);
    getCurrentUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
    });
  });

  it('stores and delivers the same normalized invite and token', async () => {
    const { client, inviteInsert } = createUserClient();
    const adminClient = createAdminClientWithCleanup().client;
    getServerClientMock.mockResolvedValue(client);
    createAdminClientMock.mockReturnValue(adminClient);
    sendStaffInviteEmailMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.results).toEqual([
      { email: 'staff@example.com', success: true },
    ]);
    expect(inviteInsert).toHaveBeenCalledWith({
      clinic_id: CLINIC_ID,
      email: 'staff@example.com',
      role: 'staff',
      created_by: 'user-1',
      token: TOKEN,
    });
    expect(sendStaffInviteEmailMock).toHaveBeenCalledWith({
      adminClient,
      appUrl: 'https://app.example.com',
      email: 'staff@example.com',
      token: TOKEN,
    });
  });

  it('removes the pending record without exposing provider errors', async () => {
    const { client } = createUserClient();
    const cleanup = createAdminClientWithCleanup();
    getServerClientMock.mockResolvedValue(client);
    createAdminClientMock.mockReturnValue(cleanup.client);
    sendStaffInviteEmailMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'provider details' },
    });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.results).toEqual([
      {
        email: 'staff@example.com',
        success: false,
        error: '招待メールを送信できませんでした',
      },
    ]);
    expect(cleanup.deleteInvite).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain('provider details');
  });
});
