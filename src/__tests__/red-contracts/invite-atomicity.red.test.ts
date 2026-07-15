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
    userAgent: 'commercial-green-contract',
  })),
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

import { acceptInvite } from '@/app/(public)/invite/actions';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = 'f1d3b85e-a52f-4215-b569-802cbbf0dd11';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const GREEN_MARKER = 'GREEN COMM-INVITE-003';

describe('staff invite acceptance atomicity boundary', () => {
  it('delegates every acceptance write to one atomic RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        success: true,
        clinic_id: CLINIC_ID,
        role: 'staff',
        idempotent: false,
      },
      error: null,
    });
    getServerClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: USER_ID, email: 'invited@example.com' },
          },
          error: null,
        }),
      },
    });
    createAdminClientMock.mockReturnValue({ rpc });

    await expect(acceptInvite(TOKEN)).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('accept_staff_invite_atomic', {
      p_token: TOKEN,
      p_user_id: USER_ID,
      p_account_email: 'invited@example.com',
    });
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);

    console.log(GREEN_MARKER);
  });
});
