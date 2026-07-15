import { AuditLogger } from '@/lib/audit-logger';
import { getServerClient, getUserAccessContext } from '@/lib/supabase';
import { clearRejectedAuthSession } from '@/lib/auth/session-cleanup';

const mockCookieDelete = jest.fn();
const mockCookieGetAll = jest.fn(() => [
  { name: 'sb-project-auth-token', value: 'stale' },
  { name: 'unrelated-cookie', value: 'keep' },
]);

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
  cookies: jest.fn(async () => ({
    getAll: mockCookieGetAll,
    delete: mockCookieDelete,
  })),
}));

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(),
  getUserAccessContext: jest.fn(),
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

const getServerClientMock = jest.mocked(getServerClient);
const getUserAccessContextMock = jest.mocked(getUserAccessContext);
const logLoginMock = jest.mocked(AuditLogger.logLogin);

function createLoginFormData() {
  const formData = new FormData();
  formData.append('email', 'staff@example.com');
  formData.append('password', 'ValidPassword123!');
  return formData;
}

describe('clinicLogin account status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserAccessContextMock.mockResolvedValue({
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      role: 'staff',
      normalizedRole: 'staff',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });
    logLoginMock.mockResolvedValue(undefined);
  });

  it('treats a cleanly missing profile row as inactive', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    getUserAccessContextMock.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: false,
      isAdmin: false,
    });
    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(),
    };
    getServerClientMock.mockResolvedValue(supabase);

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response).toEqual({
      success: false,
      errors: {
        password: [
          'アカウントが無効化されています。管理者にお問い合わせください',
        ],
        _form: ['アカウントが無効化されています。管理者にお問い合わせください'],
      },
    });
    expect(signOut).toHaveBeenCalled();
    expect(logLoginMock).not.toHaveBeenCalled();
  });

  it('returns a generic failure and clears the session on profile query error', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    getUserAccessContextMock.mockRejectedValue(
      new Error('database unavailable')
    );
    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(),
    };
    getServerClientMock.mockResolvedValue(supabase);

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response).toEqual({
      success: false,
      errors: {
        password: ['システムエラーが発生しました'],
        _form: ['システムエラーが発生しました'],
      },
    });
    expect(signOut).toHaveBeenCalled();
    expect(logLoginMock).not.toHaveBeenCalled();
  });

  it('fails closed when the permission row is missing', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(),
    };
    getServerClientMock.mockResolvedValue(supabase);

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response?.success).toBe(false);
    expect(signOut).toHaveBeenCalled();
    expect(logLoginMock).not.toHaveBeenCalled();
  });

  it('clears the signed-in session when permission authority is unavailable', async () => {
    getUserAccessContextMock.mockRejectedValue(
      new Error('permission database unavailable')
    );
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(),
    };
    getServerClientMock.mockResolvedValue(supabase);

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response.success).toBe(false);
    expect(signOut).toHaveBeenCalled();
    expect(logLoginMock).not.toHaveBeenCalled();
  });

  it('rejects the login when signOut resolves with an error', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });
    const signOut = jest.fn().mockResolvedValue({
      error: { message: 'logout backend unavailable' },
    });
    getServerClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(),
    });

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response.success).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });

  it('force-clears only Supabase auth cookies when signOut reports an error', async () => {
    const signOut = jest.fn().mockResolvedValue({
      error: { message: 'logout backend unavailable' },
    });

    const cleanup = await clearRejectedAuthSession(
      { auth: { signOut } },
      async () => ({
        getAll: mockCookieGetAll,
        delete: mockCookieDelete,
      })
    );

    expect(cleanup.complete).toBe(true);
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-project-auth-token');
    expect(mockCookieDelete).not.toHaveBeenCalledWith('unrelated-cookie');
  });
});
