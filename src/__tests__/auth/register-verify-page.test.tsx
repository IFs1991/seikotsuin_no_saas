/**
 * @file register-verify-page.test.tsx
 * @description /register/verify ページのコンポーネントテスト
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 5.2
 *
 * TDD: 🔴 → 🟢
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ================================================================
// モック
// ================================================================
const mockGetParam = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useSearchParams: jest.fn(() => ({
    get: (key: string) => mockGetParam(key),
  })),
  redirect: jest.fn(),
}));

const mockResend = jest.fn();
jest.mock('@/app/(public)/register/actions', () => ({
  registerOwner: jest.fn(),
  resendVerificationEmail: (...args: unknown[]) => mockResend(...args),
}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: jest.fn((action: unknown, initialState: unknown) => [
    initialState,
    action,
    false,
  ]),
}));

// ================================================================
// テスト
// ================================================================
describe('/register/verify ページ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetParam.mockImplementation((key: string) =>
      key === 'email' ? 'owner@clinic.com' : null
    );
    mockResend.mockResolvedValue({ success: true, message: '再送しました' });
  });

  // ----------------------------------------------------------------
  // レンダリング
  // ----------------------------------------------------------------
  describe('UIレンダリング', () => {
    test('「確認メールを送信しました」の見出しが表示される', async () => {
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      render(<VerifyPage />);
      // heading レベルで絞り込み（他のテキストとの衝突を避ける）
      const heading = screen.getByRole('heading', { name: /確認メール/i });
      expect(heading).toBeTruthy();
    });

    test('URL から取得したメールアドレスが表示される', async () => {
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      render(<VerifyPage />);
      expect(screen.getByText(/owner@clinic\.com/)).toBeTruthy();
    });

    test('「メールを再送する」ボタンが表示される', async () => {
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      render(<VerifyPage />);
      const resendButton =
        screen.queryByRole('button', { name: /再送/i }) ||
        screen.queryByText(/再送/i);
      expect(resendButton).toBeTruthy();
    });

    test('「管理者ログインへ戻る」リンクが表示される', async () => {
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      render(<VerifyPage />);
      const backLink =
        screen.queryByRole('link', { name: /管理者ログイン/i }) ||
        screen.queryByText(/管理者ログイン/i);
      expect(backLink).toBeTruthy();
    });

    test('/admin/login へのリンクが存在する', async () => {
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      render(<VerifyPage />);
      const links = document.querySelectorAll('a[href*="/admin/login"]');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------------------------------
  // email パラメータなしの場合
  // ----------------------------------------------------------------
  describe('email パラメータなし', () => {
    test('メールなしでも表示エラーなくレンダリングされる', async () => {
      mockGetParam.mockReturnValue(null);
      const { default: VerifyPage } =
        await import('@/app/(public)/register/verify/page');
      expect(() => render(<VerifyPage />)).not.toThrow();
    });
  });
});
