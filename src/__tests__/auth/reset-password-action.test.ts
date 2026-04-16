import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Map()),
}));

const mockValidatePasswordRecoveryIntent = jest.fn();
const mockReadPasswordRecoveryIntent = jest.fn();
const mockClearPasswordRecoveryIntent = jest.fn();
jest.mock('@/lib/auth/password-recovery-intent', () => ({
  clearPasswordRecoveryIntent: (...args: unknown[]) =>
    mockClearPasswordRecoveryIntent(...args),
  getPasswordRecoveryIntentCookieOptions: jest.fn((maxAge?: number) => ({
    httpOnly: true,
    path: '/reset-password',
    maxAge: maxAge ?? 600,
  })),
  PASSWORD_RECOVERY_INTENT_COOKIE: 'password_recovery_intent',
  readPasswordRecoveryIntent: (...args: unknown[]) =>
    mockReadPasswordRecoveryIntent(...args),
  validatePasswordRecoveryIntent: (...args: unknown[]) =>
    mockValidatePasswordRecoveryIntent(...args),
}));

const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockGetUser = jest.fn();
const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
    updateUser: mockUpdateUser,
    signOut: mockSignOut,
  },
};

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

const mockLogAdminAction = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test',
  })),
}));

const {
  completePasswordRecovery,
} = require('@/app/(public)/reset-password/actions');

function makeFormData(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

describe('completePasswordRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockReadPasswordRecoveryIntent.mockResolvedValue('signed-recovery-token');
    mockClearPasswordRecoveryIntent.mockResolvedValue(undefined);
    mockValidatePasswordRecoveryIntent.mockReturnValue(true);
  });

  test('正常系: clinic は signOut 後に /login?message=password_reset_completed へ遷移する', async () => {
    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'clinic',
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      })
    );

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Secure@Pass1' });
    expect(mockSignOut).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      message: 'パスワードを更新しました。もう一度ログインしてください。',
      redirectTo: '/login?message=password_reset_completed',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test('recovery marker が無い通常セッションは拒否する', async () => {
    mockValidatePasswordRecoveryIntent.mockReturnValue(false);

    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'clinic',
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._form).toContain(
        '再設定リンクが無効か期限切れです。再度メールを送ってください。'
      );
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockClearPasswordRecoveryIntent).toHaveBeenCalled();
  });

  test('正常系: admin は /admin/login?message=password_reset_completed へ遷移する', async () => {
    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'admin',
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      })
    );

    expect(result).toEqual({
      success: true,
      message: 'パスワードを更新しました。もう一度ログインしてください。',
      redirectTo: '/admin/login?message=password_reset_completed',
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test('confirmPassword 不一致はフィールドエラーを返す', async () => {
    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'clinic',
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass2',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.confirmPassword).toContain(
        'パスワードが一致しません'
      );
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test('弱いパスワードは password フィールドエラーを返す', async () => {
    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'clinic',
        password: 'weakpass',
        confirmPassword: 'weakpass',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.password?.length).toBeGreaterThan(0);
    }
  });

  test('セッション不在相当の updateUser エラーはリンク無効メッセージを返す', async () => {
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { message: 'Auth session missing!' },
    });

    const result = await completePasswordRecovery(
      { success: true },
      makeFormData({
        source: 'clinic',
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors._form).toContain(
        '再設定リンクが無効か期限切れです。再度メールを送ってください。'
      );
    }
  });
});
