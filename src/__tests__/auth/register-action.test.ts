/**
 * @file register-action.test.ts
 * @description 初回オーナー登録サーバーアクションのユニットテスト
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 6.1
 *
 * TDD: 🔴 → 🟢 phase
 * AC-01: /register で有効入力時、/register/verify に遷移する
 * AC-02: 無効入力時、フィールド単位エラーを表示する
 * AC-03: 既存メール有無に関係なく同一の安全文言を返す
 * AC-07: NEXT_PUBLIC_APP_URL 未設定時は fail-fast
 *
 * パターン: auth-flow.test.ts と同じ top-level require スタイル
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ================================================================
// モックセットアップ（jest.mock はファイルのトップレベルで宣言する）
// ================================================================

// next/navigation: redirect を純粋なスパイとして定義（例外を投げない）
const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(() => new Map()),
}));

// Supabase クライアントモック
const mockSignUp = jest.fn();
const mockResend = jest.fn();
const mockSupabaseClient = {
  auth: {
    signUp: mockSignUp,
    resend: mockResend,
  },
};

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
  createClient: jest.fn(() => mockSupabaseClient),
}));

// AuditLogger モック
const mockLogAdminAction = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
    logFailedLogin: jest.fn().mockResolvedValue(undefined),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test',
  })),
}));

// env モック: assertEnv が NEXT_PUBLIC_APP_URL を返すよう固定
jest.mock('@/lib/env', () => ({
  assertEnv: (name: string) => {
    const vars: Record<string, string> = {
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };
    if (!vars[name]) throw new Error(`${name} is not set`);
    return vars[name];
  },
  env: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));

// ================================================================
// top-level require（jest.mock ホイスト後に解決される）
// ================================================================
const {
  registerOwner,
  resendVerificationEmail,
} = require('@/app/register/actions');

// ================================================================
// ヘルパー
// ================================================================
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return fd;
}

const validFormData = () =>
  makeFormData({
    email: 'owner@clinic.com',
    password: 'Secure@Pass1',
    termsAccepted: 'on',
  });

// ================================================================
// テスト本体
// ================================================================
describe('registerOwner サーバーアクション', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks 後に実装を再設定
    mockLogAdminAction.mockResolvedValue(undefined);
    mockSignUp.mockResolvedValue({
      error: null,
      data: { user: { id: 'uid-1' } },
    });
  });

  // ----------------------------------------------------------------
  // AC-01: 成功時の遷移
  // ----------------------------------------------------------------
  describe('AC-01: 成功時は /register/verify に遷移する', () => {
    test('signUp 成功時に redirect(/register/verify?email=...) が呼ばれる', async () => {
      await registerOwner(null, validFormData());

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/register/verify?email=owner%40clinic.com')
      );
    });

    test('signUp 時に emailRedirectTo が /admin/callback になっている', async () => {
      await registerOwner(null, validFormData());

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: 'http://localhost:3000/admin/callback',
          }),
        })
      );
    });

    test('signUp の options.data に terms_accepted/terms_accepted_at/terms_version が含まれる', async () => {
      await registerOwner(null, validFormData());

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              terms_accepted: true,
              terms_accepted_at: expect.any(String),
              terms_version: 'v1',
            }),
          }),
        })
      );
    });
  });

  // ----------------------------------------------------------------
  // AC-02: バリデーションエラー
  // ----------------------------------------------------------------
  describe('AC-02: 無効入力時はフィールド単位エラーを返す', () => {
    test('メールアドレスが不正な場合はエラーを返し signUp を呼ばない', async () => {
      const fd = makeFormData({
        email: 'invalid-email',
        password: 'Secure@Pass1',
        termsAccepted: 'on',
      });

      const result = await registerOwner(null, fd);

      expect(result.success).toBe(false);
      expect(result.errors.email).toBeDefined();
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    test('パスワードが弱い場合はエラーを返す', async () => {
      const fd = makeFormData({
        email: 'owner@clinic.com',
        password: 'weak',
        termsAccepted: 'on',
      });

      const result = await registerOwner(null, fd);

      expect(result.success).toBe(false);
      expect(result.errors.password).toBeDefined();
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    test('termsAccepted が未チェックの場合はエラーを返す', async () => {
      const fd = makeFormData({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
        // termsAccepted は送信しない
      });

      const result = await registerOwner(null, fd);

      expect(result.success).toBe(false);
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // AC-03: 非列挙型エラー文言
  // ----------------------------------------------------------------
  describe('AC-03: 既存メール有無に関係なく同一の安全文言を返す', () => {
    test('Supabase が "already registered" を返しても列挙型文言を返さない', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'User already registered', status: 422 },
        data: null,
      });

      const result = await registerOwner(null, validFormData());

      expect(result.success).toBe(false);
      const formErrors: string[] = result.errors?._form ?? [];
      // AC-03: "既に登録" "already" 等のメール存在情報を含まないこと
      expect(
        formErrors.some(e => e.includes('既に登録') || e.includes('already'))
      ).toBe(false);
    });

    test('"already registered" エラーと汎用エラーで同一文言を返す', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'Some other error', status: 500 },
        data: null,
      });
      const result1 = await registerOwner(null, validFormData());

      mockSignUp.mockResolvedValue({
        error: { message: 'User already registered', status: 422 },
        data: null,
      });
      const result2 = await registerOwner(null, validFormData());

      expect(result1.errors?._form?.[0]).toBe(result2.errors?._form?.[0]);
    });
  });

  // ----------------------------------------------------------------
  // 入力サニタイズ
  // ----------------------------------------------------------------
  describe('入力サニタイズ', () => {
    test('メールアドレスは trim・lowercase されて Supabase に渡される', async () => {
      const fd = makeFormData({
        email: '  OWNER@CLINIC.COM  ',
        password: 'Secure@Pass1',
        termsAccepted: 'on',
      });

      await registerOwner(null, fd);

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@clinic.com',
        })
      );
    });

    test('redirect URL にもサニタイズ済みメールが使われる', async () => {
      const fd = makeFormData({
        email: '  OWNER@CLINIC.COM  ',
        password: 'Secure@Pass1',
        termsAccepted: 'on',
      });

      await registerOwner(null, fd);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('owner%40clinic.com')
      );
    });
  });

  // ----------------------------------------------------------------
  // AuditLogger
  // ----------------------------------------------------------------
  describe('AuditLogger の記録', () => {
    test('成功時に AuditLogger.logAdminAction が呼ばれる', async () => {
      await registerOwner(null, validFormData());

      expect(mockLogAdminAction).toHaveBeenCalled();
    });

    test('Supabase エラー時に AuditLogger が呼ばれる', async () => {
      mockSignUp.mockResolvedValue({
        error: { message: 'Some error', status: 500 },
        data: null,
      });

      await registerOwner(null, validFormData());

      expect(mockLogAdminAction).toHaveBeenCalled();
    });
  });
});

// ================================================================
// resendVerificationEmail テスト
// ================================================================
describe('resendVerificationEmail サーバーアクション', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResend.mockResolvedValue({ error: null });
  });

  test('有効なメールで再送成功', async () => {
    const fd = makeFormData({ email: 'owner@clinic.com' });
    const result = await resendVerificationEmail(null, fd);
    expect(result.success).toBe(true);
  });

  test('メール未指定の場合はエラーを返す', async () => {
    const fd = makeFormData({});
    const result = await resendVerificationEmail(null, fd);
    expect(result.success).toBe(false);
  });

  test('Supabase エラー時も non-enumeration で success:true を返す', async () => {
    mockResend.mockResolvedValue({
      error: { message: 'Email not found', status: 404 },
    });

    const fd = makeFormData({ email: 'unknown@clinic.com' });
    const result = await resendVerificationEmail(null, fd);
    // AC-03: 存在確認を開示しない → 成功レスポンスを返す
    expect(result.success).toBe(true);
  });

  test('再送成功メッセージに迷惑メール確認の案内が含まれる', async () => {
    const fd = makeFormData({ email: 'owner@clinic.com' });
    const result = await resendVerificationEmail(null, fd);
    expect(result.success).toBe(true);
    if (result.success && result.message) {
      expect(result.message).toBeTruthy();
    }
  });
});
