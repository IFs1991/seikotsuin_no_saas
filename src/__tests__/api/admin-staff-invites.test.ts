import { NextRequest } from 'next/server';

const processApiRequestMock = jest.fn();
const auditLogMock = jest.fn();
const logErrorMock = jest.fn();
const createAdminClientMock = jest.fn();
const createStaffInviteTokenMock = jest.fn();
const sendStaffInviteEmailMock = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: (...args: unknown[]) => processApiRequestMock(...args),
    logError: (...args: unknown[]) => logErrorMock(...args),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: (...args: unknown[]) => auditLogMock(...args),
  },
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

jest.mock('@/lib/supabase', () => ({
  ...jest.requireActual('@/lib/supabase'),
  createAdminClient: () => createAdminClientMock(),
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

import { POST } from '@/app/api/admin/staff/invites/route';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = '550e8400-e29b-41d4-a716-446655440000';

function createUserClient() {
  const duplicateMaybeSingle = jest.fn().mockResolvedValue({
    data: null,
    error: null,
  });
  const duplicateEmailEq = jest
    .fn()
    .mockReturnValue({ maybeSingle: duplicateMaybeSingle });
  const duplicateClinicEq = jest.fn().mockReturnValue({ eq: duplicateEmailEq });
  const selectExisting = jest.fn().mockReturnValue({ eq: duplicateClinicEq });

  const insertSingle = jest.fn().mockResolvedValue({
    data: {
      id: INVITE_ID,
      email: 'staff@example.com',
      role: 'staff',
      created_at: '2026-07-10T00:00:00.000Z',
    },
    error: null,
  });
  const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  return {
    client: {
      from: jest.fn(() => ({ select: selectExisting, insert })),
    },
    insert,
  };
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

describe('POST /api/admin/staff/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createStaffInviteTokenMock.mockReturnValue(TOKEN);
  });

  it('stores and delivers the same acceptance token', async () => {
    const { client, insert } = createUserClient();
    const adminClient = createAdminClientWithCleanup().client;
    createAdminClientMock.mockReturnValue(adminClient);
    sendStaffInviteEmailMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: { role: 'clinic_admin', clinic_id: CLINIC_ID },
      body: {
        email: ' Staff@Example.com ',
        role: 'staff',
        full_name: 'Test Staff',
      },
      supabase: client,
    });

    const response = await POST(
      new NextRequest('https://app.example.com/api/admin/staff/invites', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
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
      metadata: { full_name: 'Test Staff' },
    });
  });

  it('removes the pending record and returns a stable error when delivery fails', async () => {
    const { client } = createUserClient();
    const cleanup = createAdminClientWithCleanup();
    createAdminClientMock.mockReturnValue(cleanup.client);
    sendStaffInviteEmailMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'provider details' },
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: { role: 'clinic_admin', clinic_id: CLINIC_ID },
      body: { email: 'staff@example.com', role: 'staff' },
      supabase: client,
    });

    const response = await POST(
      new NextRequest('https://app.example.com/api/admin/staff/invites', {
        method: 'POST',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: 'INVITE_DELIVERY_FAILED',
    });
    expect(cleanup.deleteInvite).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain('provider details');
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(
      'provider details'
    );
  });
});
