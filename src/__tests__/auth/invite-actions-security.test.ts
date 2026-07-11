const getServerClientMock = jest.fn();
const createAdminClientMock = jest.fn();

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('next/headers', () => ({ headers: jest.fn() }));

jest.mock('@/lib/supabase', () => ({
  getServerClient: () => getServerClientMock(),
  createAdminClient: () => createAdminClientMock(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logFailedLogin: jest.fn(),
    logLogin: jest.fn(),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  })),
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

import { acceptInvite } from '@/app/(public)/invite/actions';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';

function createInviteLookup(inviteRole: string) {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: {
      accepted_at: null,
      accepted_by: null,
      clinic_id: '11111111-1111-4111-8111-111111111111',
      created_at: '2026-07-10T00:00:00.000Z',
      created_by: 'admin-1',
      email: 'invited@example.com',
      expires_at: '2099-07-10T00:00:00.000Z',
      id: '22222222-2222-4222-8222-222222222222',
      role: inviteRole,
      token: TOKEN,
      updated_at: '2026-07-10T00:00:00.000Z',
    },
    error: null,
  });
  const acceptedAtIs = jest.fn().mockReturnValue({ maybeSingle });
  const expiresAtGt = jest.fn().mockReturnValue({ is: acceptedAtIs });
  const tokenEq = jest.fn().mockReturnValue({ gt: expiresAtGt });
  const select = jest.fn().mockReturnValue({ eq: tokenEq });
  const from = jest.fn(() => ({ select }));

  return { client: { from }, from };
}

describe('invite acceptance security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not grant an invite to a different authenticated email', async () => {
    getServerClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'different@example.com' },
          },
          error: null,
        }),
      },
    });
    const lookup = createInviteLookup('staff');
    createAdminClientMock.mockReturnValue(lookup.client);

    await expect(acceptInvite(TOKEN)).resolves.toEqual({
      success: false,
      error: '招待先メールアドレスと現在のアカウントが一致しません',
    });
    expect(lookup.from).toHaveBeenCalledTimes(1);
    expect(lookup.from).toHaveBeenCalledWith('staff_invites');
  });

  it('rejects a privileged role even if it exists in a stored invite', async () => {
    getServerClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'invited@example.com' } },
          error: null,
        }),
      },
    });
    const lookup = createInviteLookup('admin');
    createAdminClientMock.mockReturnValue(lookup.client);

    await expect(acceptInvite(TOKEN)).resolves.toEqual({
      success: false,
      error: 'この招待は無効です',
    });
    expect(lookup.from).toHaveBeenCalledTimes(1);
  });
});
