const getServerClientMock = jest.fn();
const createAdminClientMock = jest.fn();
const revalidatePathMock = jest.fn();
const redirectMock = jest.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const headersMock = jest.fn(async () => new Headers());
const logFailedLoginMock = jest.fn();
const logLoginMock = jest.fn();

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));
jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));
jest.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

jest.mock('@/lib/supabase', () => ({
  getServerClient: () => getServerClientMock(),
  createAdminClient: () => createAdminClientMock(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logFailedLogin: (...args: unknown[]) => logFailedLoginMock(...args),
    logLogin: (...args: unknown[]) => logLoginMock(...args),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  })),
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

import {
  acceptInvite,
  loginAndAcceptInvite,
  signupAndAcceptInvite,
} from '@/app/(public)/invite/actions';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const VERIFIED_USER_ID = '44444444-4444-4444-8444-444444444444';
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const INVITED_EMAIL = 'invited@example.com';
const VERIFIED_EMAIL = 'verified-session@example.com';
const VALID_PASSWORD = 'S3cure!Invite';
const GENERIC_INVITE_ERROR = '招待の受諾に失敗しました';

type RpcError = {
  code: string;
  message: string;
};

type RpcResponse = {
  data: unknown;
  error: RpcError | null;
};

function makeFormData(input?: {
  email?: string;
  password?: string;
  token?: string;
}): FormData {
  const formData = new FormData();
  formData.set('email', input?.email ?? INVITED_EMAIL);
  formData.set('password', input?.password ?? VALID_PASSWORD);
  formData.set('token', input?.token ?? TOKEN);
  return formData;
}

function createOpenInviteClient(input?: { email?: string; role?: string }) {
  const maybeSingleMock = jest.fn().mockResolvedValue({
    data: {
      accepted_at: null,
      accepted_by: null,
      clinic_id: CLINIC_ID,
      created_at: '2026-07-10T00:00:00.000Z',
      created_by: 'admin-1',
      email: input?.email ?? INVITED_EMAIL,
      expires_at: '2099-07-10T00:00:00.000Z',
      id: INVITE_ID,
      role: input?.role ?? 'staff',
      token: TOKEN,
      updated_at: '2026-07-10T00:00:00.000Z',
    },
    error: null,
  });
  const acceptedAtIsMock = jest.fn().mockReturnValue({
    maybeSingle: maybeSingleMock,
  });
  const expiresAtGtMock = jest.fn().mockReturnValue({
    is: acceptedAtIsMock,
  });
  const tokenEqMock = jest.fn().mockReturnValue({ gt: expiresAtGtMock });
  const selectMock = jest.fn().mockReturnValue({ eq: tokenEqMock });
  const fromMock = jest.fn().mockReturnValue({ select: selectMock });

  return {
    client: { from: fromMock },
    fromMock,
  };
}

function createAtomicRpcClient(response: RpcResponse) {
  const rpcMock = jest.fn().mockResolvedValue(response);
  const fromMock = jest.fn();

  return {
    client: { rpc: rpcMock, from: fromMock },
    fromMock,
    rpcMock,
  };
}

function successfulAtomicResponse(idempotent = false): RpcResponse {
  return {
    data: {
      success: true,
      clinic_id: CLINIC_ID,
      role: 'staff',
      idempotent,
    },
    error: null,
  };
}

function createVerifiedGetUserMock(input?: { id?: string; email?: string }) {
  return jest.fn().mockResolvedValue({
    data: {
      user: {
        id: input?.id ?? USER_ID,
        email: input?.email ?? INVITED_EMAIL,
      },
    },
    error: null,
  });
}

function arrangeDirectAcceptance(response: RpcResponse) {
  const getUserMock = createVerifiedGetUserMock();
  const rpc = createAtomicRpcClient(response);

  getServerClientMock.mockResolvedValue({
    auth: { getUser: getUserMock },
  });
  createAdminClientMock.mockReturnValue(rpc.client);

  return { getUserMock, ...rpc };
}

describe('invite acceptance security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('acceptInvite', () => {
    it('uses only the fresh getUser UUID and email as atomic RPC authority', async () => {
      const getUserMock = createVerifiedGetUserMock({
        id: VERIFIED_USER_ID,
        email: VERIFIED_EMAIL,
      });
      const rpc = createAtomicRpcClient(successfulAtomicResponse());
      getServerClientMock.mockResolvedValue({
        auth: { getUser: getUserMock },
      });
      createAdminClientMock.mockReturnValue(rpc.client);

      await expect(acceptInvite(TOKEN)).resolves.toEqual({ success: true });

      expect(getUserMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).toHaveBeenCalledWith();
      expect(rpc.rpcMock).toHaveBeenCalledTimes(1);
      expect(rpc.rpcMock).toHaveBeenCalledWith('accept_staff_invite_atomic', {
        p_token: TOKEN,
        p_user_id: VERIFIED_USER_ID,
        p_account_email: VERIFIED_EMAIL,
      });
      expect(rpc.fromMock).not.toHaveBeenCalled();
    });

    it('treats an idempotent RPC success as success without a second write path', async () => {
      const rpc = arrangeDirectAcceptance(successfulAtomicResponse(true));

      await expect(acceptInvite(TOKEN)).resolves.toEqual({ success: true });

      expect(rpc.rpcMock).toHaveBeenCalledTimes(1);
      expect(rpc.fromMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
    });

    it.each([
      ['INVITE_NOT_FOUND', '有効な招待が見つかりません'],
      ['INVITE_EXPIRED', '有効な招待が見つかりません'],
      ['INVITE_INVALID_ROLE', 'この招待は無効です'],
      [
        'INVITE_EMAIL_MISMATCH',
        '招待先メールアドレスと現在のアカウントが一致しません',
      ],
      [
        'INVITE_ACCOUNT_EMAIL_MISMATCH',
        '招待先メールアドレスと現在のアカウントが一致しません',
      ],
      ['INVITE_ALREADY_ACCEPTED', 'この招待は既に受諾されています'],
      ['INVITE_ACCOUNT_NOT_FOUND', GENERIC_INVITE_ERROR],
      ['INVITE_STATE_INVALID', GENERIC_INVITE_ERROR],
    ] as const)(
      'maps the %s business code without falling back to table writes',
      async (errorCode, expectedMessage) => {
        const rpc = arrangeDirectAcceptance({
          data: { success: false, error_code: errorCode },
          error: null,
        });

        await expect(acceptInvite(TOKEN)).resolves.toEqual({
          success: false,
          error: expectedMessage,
        });
        expect(rpc.rpcMock).toHaveBeenCalledTimes(1);
        expect(rpc.fromMock).not.toHaveBeenCalled();
      }
    );

    it('maps lock-aware expiry SQLSTATE PVI02 to the expired invite message', async () => {
      const rpc = arrangeDirectAcceptance({
        data: null,
        error: { code: 'PVI02', message: 'INVITE_EXPIRED' },
      });

      await expect(acceptInvite(TOKEN)).resolves.toEqual({
        success: false,
        error: '有効な招待が見つかりません',
      });
      expect(rpc.fromMock).not.toHaveBeenCalled();
    });

    it('fails closed on an unexpected RPC error', async () => {
      arrangeDirectAcceptance({
        data: null,
        error: { code: 'XX000', message: 'internal database error' },
      });

      await expect(acceptInvite(TOKEN)).resolves.toEqual({
        success: false,
        error: GENERIC_INVITE_ERROR,
      });
    });

    it.each([
      null,
      [],
      {
        success: true,
        clinic_id: 'not-a-uuid',
        role: 'staff',
        idempotent: true,
      },
      { success: false, error_code: 'UNRECOGNIZED_CODE' },
    ])('fails closed on a malformed atomic RPC response', async data => {
      arrangeDirectAcceptance({ data, error: null });

      await expect(acceptInvite(TOKEN)).resolves.toEqual({
        success: false,
        error: GENERIC_INVITE_ERROR,
      });
    });

    it('does not create a privileged client when getUser is unauthenticated', async () => {
      const getUserMock = jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Auth session missing' },
      });
      getServerClientMock.mockResolvedValue({
        auth: { getUser: getUserMock },
      });

      await expect(acceptInvite(TOKEN)).resolves.toEqual({
        success: false,
        error: 'ログインが必要です',
      });
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it.each([
      { id: 'not-a-uuid', email: INVITED_EMAIL },
      { id: USER_ID, email: undefined },
    ])('does not call the RPC for an invalid verified user', async user => {
      getServerClientMock.mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user },
            error: null,
          }),
        },
      });

      await expect(acceptInvite(TOKEN)).resolves.toEqual({
        success: false,
        error: GENERIC_INVITE_ERROR,
      });
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });
  });

  describe('signupAndAcceptInvite', () => {
    it('does not call the atomic RPC when signup requires email confirmation', async () => {
      const signUpMock = jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID }, session: null },
        error: null,
      });
      const getUserMock = createVerifiedGetUserMock();
      const serverFromMock = jest.fn();
      const preflight = createOpenInviteClient();
      getServerClientMock.mockResolvedValue({
        auth: { signUp: signUpMock, getUser: getUserMock },
        from: serverFromMock,
      });
      createAdminClientMock.mockReturnValue(preflight.client);

      await expect(
        signupAndAcceptInvite({ success: false, errors: {} }, makeFormData())
      ).resolves.toEqual({
        success: true,
        message:
          '確認メールを送信しました。メールを確認してからログインしてください。',
      });

      expect(signUpMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).not.toHaveBeenCalled();
      expect(createAdminClientMock).toHaveBeenCalledTimes(1);
      expect(preflight.fromMock).toHaveBeenCalledWith('staff_invites');
      expect(serverFromMock).not.toHaveBeenCalled();
    });

    it('uses a fresh getUser identity for the RPC after session-backed signup', async () => {
      const signUpMock = jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID }, session: { access_token: 'session' } },
        error: null,
      });
      const getUserMock = createVerifiedGetUserMock({
        id: VERIFIED_USER_ID,
        email: VERIFIED_EMAIL,
      });
      const serverFromMock = jest.fn();
      const preflight = createOpenInviteClient();
      const rpc = createAtomicRpcClient(successfulAtomicResponse());
      getServerClientMock.mockResolvedValue({
        auth: { signUp: signUpMock, getUser: getUserMock },
        from: serverFromMock,
      });
      createAdminClientMock
        .mockReturnValueOnce(preflight.client)
        .mockReturnValueOnce(rpc.client);

      await expect(
        signupAndAcceptInvite({ success: false, errors: {} }, makeFormData())
      ).rejects.toThrow('REDIRECT:/dashboard');

      expect(signUpMock).toHaveBeenCalledWith({
        email: INVITED_EMAIL,
        password: VALID_PASSWORD,
        options: {
          emailRedirectTo: `${'https://app.example.com'}/invite?token=${TOKEN}`,
        },
      });
      expect(getUserMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).toHaveBeenCalledWith();
      expect(rpc.rpcMock).toHaveBeenCalledWith('accept_staff_invite_atomic', {
        p_token: TOKEN,
        p_user_id: VERIFIED_USER_ID,
        p_account_email: VERIFIED_EMAIL,
      });
      expect(serverFromMock).not.toHaveBeenCalled();
      expect(rpc.fromMock).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith('/dashboard');
    });

    it('fails closed without an RPC when fresh getUser verification fails after signup', async () => {
      const signUpMock = jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID }, session: { access_token: 'session' } },
        error: null,
      });
      const getUserMock = jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid session' },
      });
      const preflight = createOpenInviteClient();
      getServerClientMock.mockResolvedValue({
        auth: { signUp: signUpMock, getUser: getUserMock },
      });
      createAdminClientMock.mockReturnValue(preflight.client);

      await expect(
        signupAndAcceptInvite({ success: false, errors: {} }, makeFormData())
      ).resolves.toEqual({
        success: false,
        errors: { _form: [GENERIC_INVITE_ERROR] },
      });

      expect(getUserMock).toHaveBeenCalledTimes(1);
      expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('loginAndAcceptInvite', () => {
    it('calls signIn, fresh getUser, then RPC without using the form email as authority', async () => {
      const signInWithPasswordMock = jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      });
      const getUserMock = createVerifiedGetUserMock({
        id: VERIFIED_USER_ID,
        email: VERIFIED_EMAIL,
      });
      const profileEqMock = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const profileUpdateMock = jest.fn().mockReturnValue({
        eq: profileEqMock,
      });
      const serverFromMock = jest.fn().mockReturnValue({
        update: profileUpdateMock,
      });
      const preflight = createOpenInviteClient();
      const rpc = createAtomicRpcClient(successfulAtomicResponse());
      getServerClientMock.mockResolvedValue({
        auth: {
          signInWithPassword: signInWithPasswordMock,
          getUser: getUserMock,
        },
        from: serverFromMock,
      });
      createAdminClientMock
        .mockReturnValueOnce(preflight.client)
        .mockReturnValueOnce(rpc.client);

      await expect(
        loginAndAcceptInvite({ success: false, errors: {} }, makeFormData())
      ).rejects.toThrow('REDIRECT:/dashboard');

      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: INVITED_EMAIL,
        password: VALID_PASSWORD,
      });
      expect(getUserMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).toHaveBeenCalledWith();
      expect(rpc.rpcMock).toHaveBeenCalledWith('accept_staff_invite_atomic', {
        p_token: TOKEN,
        p_user_id: VERIFIED_USER_ID,
        p_account_email: VERIFIED_EMAIL,
      });
      expect(logLoginMock).toHaveBeenCalledWith(
        VERIFIED_USER_ID,
        VERIFIED_EMAIL,
        '127.0.0.1',
        'jest'
      );
      expect(profileUpdateMock).toHaveBeenCalledTimes(1);
      expect(profileEqMock).toHaveBeenCalledWith('user_id', VERIFIED_USER_ID);
      expect(rpc.fromMock).not.toHaveBeenCalled();
      expect(signInWithPasswordMock.mock.invocationCallOrder[0]).toBeLessThan(
        getUserMock.mock.invocationCallOrder[0]
      );
      expect(getUserMock.mock.invocationCallOrder[0]).toBeLessThan(
        rpc.rpcMock.mock.invocationCallOrder[0]
      );
      expect(redirectMock).toHaveBeenCalledWith('/dashboard');
    });

    it('does not call the RPC when fresh getUser verification fails after login', async () => {
      const signInWithPasswordMock = jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      });
      const getUserMock = jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid session' },
      });
      const serverFromMock = jest.fn();
      const preflight = createOpenInviteClient();
      getServerClientMock.mockResolvedValue({
        auth: {
          signInWithPassword: signInWithPasswordMock,
          getUser: getUserMock,
        },
        from: serverFromMock,
      });
      createAdminClientMock.mockReturnValue(preflight.client);

      await expect(
        loginAndAcceptInvite({ success: false, errors: {} }, makeFormData())
      ).resolves.toEqual({
        success: false,
        errors: { _form: ['ログインに失敗しました'] },
      });

      expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).toHaveBeenCalledTimes(1);
      expect(createAdminClientMock).toHaveBeenCalledTimes(1);
      expect(logLoginMock).not.toHaveBeenCalled();
      expect(serverFromMock).not.toHaveBeenCalled();
    });
  });
});
