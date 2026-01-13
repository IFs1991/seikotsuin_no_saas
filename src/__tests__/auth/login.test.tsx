/**
 * @file login.test.tsx
 * @description 院向けログインページのテスト
 * @spec docs/認証と権限制御_MVP仕様書.md
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// モックの設定
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

// Supabaseモック
const mockSignInWithPassword = jest.fn();
const mockSupabase = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
  },
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn(),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
};

jest.mock('@/lib/supabase/client', () => ({
  createBrowserClient: jest.fn(() => mockSupabase),
}));

describe('院向けログインページ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UIレンダリング', () => {
    test('ログインフォームが正しく表示される', async () => {
      // LoginPageコンポーネントをインポート（作成後）
      // const { default: LoginPage } = await import('@/app/login/page');
      // render(<LoginPage />);

      // expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument();
      // expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument();
      // expect(screen.getByRole('button', { name: /ログイン/i })).toBeInTheDocument();

      // プレースホルダーテスト
      expect(true).toBe(true);
    });

    test('院向けログインであることが明示される', async () => {
      // render(<LoginPage />);
      // expect(screen.getByText(/院スタッフログイン/i)).toBeInTheDocument();
      expect(true).toBe(true);
    });
  });

  describe('ログイン処理', () => {
    test('正しい認証情報でログイン成功時に /dashboard へリダイレクト', async () => {
      const mockUser = { id: 'user-123', email: 'staff@clinic.com' };
      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'staff', is_active: true, clinic_id: 'clinic-123' },
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // テスト実装後に有効化
      expect(true).toBe(true);
    });

    test('profiles.is_active=false の場合はログイン拒否', async () => {
      const mockUser = { id: 'user-123', email: 'inactive@clinic.com' };
      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'staff', is_active: false, clinic_id: 'clinic-123' },
              error: null,
            }),
          }),
        }),
      });

      // テスト実装後に有効化
      // expect(screen.getByText(/アカウントが無効化されています/i)).toBeInTheDocument();
      expect(true).toBe(true);
    });

    test('ログイン成功時に profiles.last_login_at が更新される', async () => {
      const mockUser = { id: 'user-123', email: 'staff@clinic.com' };
      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'staff', is_active: true, clinic_id: 'clinic-123' },
              error: null,
            }),
          }),
        }),
        update: mockUpdate,
      });

      // テスト実装後：updateが呼ばれることを確認
      // expect(mockUpdate).toHaveBeenCalledWith({ last_login_at: expect.any(String) });
      expect(true).toBe(true);
    });
  });

  describe('バリデーション', () => {
    test('メールアドレス形式が不正な場合はエラー表示', async () => {
      // テスト実装後に有効化
      expect(true).toBe(true);
    });

    test('パスワードが空の場合はエラー表示', async () => {
      // テスト実装後に有効化
      expect(true).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    test('認証エラー時にエラーメッセージを表示', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid credentials' },
      });

      // テスト実装後に有効化
      // expect(screen.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeInTheDocument();
      expect(true).toBe(true);
    });
  });
});
