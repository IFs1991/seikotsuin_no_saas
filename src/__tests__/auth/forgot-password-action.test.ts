import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('next/headers', () => ({
  headers: jest.fn(() => new Map()),
}));

const mockResetPasswordForEmail = jest.fn();
const mockSupabaseClient = {
  auth: {
    resetPasswordForEmail: mockResetPasswordForEmail,
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

jest.mock('@/lib/env', () => ({
  assertEnv: (name: string) => {
    const vars: Record<string, string> = {
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    };
    if (!vars[name]) throw new Error(`${name} is not set`);
    return vars[name];
  },
  env: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));

const {
  requestPasswordReset,
} = require('@/app/(public)/forgot-password/actions');

const GENERIC_PASSWORD_RESET_MESSAGE =
  'メールアドレスが登録されている場合、パスワード再設定用のメールを送信しました。受信トレイと迷惑メールフォルダをご確認ください。';

function makeFormData(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

describe('requestPasswordReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogAdminAction.mockResolvedValue(undefined);
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  test('正常系: source=admin の redirectTo で resetPasswordForEmail を呼ぶ', async () => {
    const result = await requestPasswordReset(
      { success: true },
      makeFormData({
        email: 'admin@clinic.com',
        source: 'admin',
      })
    );

    expect(result).toEqual({
      success: true,
      message: GENERIC_PASSWORD_RESET_MESSAGE,
    });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'admin@clinic.com',
      {
        redirectTo:
          'http://localhost:3000/admin/callback?next=/reset-password/admin',
      }
    );
  });

  test('正常系: 不正な source は clinic に正規化する', async () => {
    await requestPasswordReset(
      { success: true },
      makeFormData({
        email: 'staff@clinic.com',
        source: 'invalid',
      })
    );

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'staff@clinic.com',
      {
        redirectTo:
          'http://localhost:3000/admin/callback?next=/reset-password/clinic',
      }
    );
  });

  test('バリデーションエラー: 不正なメールアドレスなら field error を返す', async () => {
    const result = await requestPasswordReset(
      { success: true },
      makeFormData({
        email: 'invalid-email',
        source: 'clinic',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.email).toBeDefined();
    }
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  test('Supabase エラー時も同一の成功文言を返す', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'User not found', status: 404 },
    });

    const result = await requestPasswordReset(
      { success: true },
      makeFormData({
        email: 'missing@clinic.com',
        source: 'clinic',
      })
    );

    expect(result).toEqual({
      success: true,
      message: GENERIC_PASSWORD_RESET_MESSAGE,
    });
  });

  test('監査ログに password_reset_requested を記録する', async () => {
    await requestPasswordReset(
      { success: true },
      makeFormData({
        email: 'staff@clinic.com',
        source: 'clinic',
      })
    );

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'anonymous',
      'staff@clinic.com',
      'password_reset_requested',
      undefined,
      expect.objectContaining({
        source: 'clinic',
        email: 'staff@clinic.com',
        userAgent: 'jest-test',
      }),
      '127.0.0.1'
    );
  });
});
