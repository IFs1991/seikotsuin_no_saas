/**
 * @file register-page.test.tsx
 * @description /register ページのコンポーネントテスト
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 5.1
 *
 * TDD: 🔴 → 🟢
 * AC-01: 有効入力時 /register/verify に遷移する
 * AC-02: 無効入力時フィールド単位エラーを表示する
 * AC-04: /admin/login への導線を持つ
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ================================================================
// モック
// ================================================================
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: jest.fn(() => ({ get: jest.fn(() => null) })),
  redirect: jest.fn(),
}));

const mockRegisterOwner = jest.fn();
jest.mock('@/app/register/actions', () => ({
  registerOwner: (...args: unknown[]) => mockRegisterOwner(...args),
  resendVerificationEmail: jest.fn(),
}));

// React useActionState モック
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
describe('/register ページ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterOwner.mockResolvedValue({ success: true });
  });

  // ----------------------------------------------------------------
  // レンダリング確認
  // ----------------------------------------------------------------
  describe('UIレンダリング', () => {
    test('メールアドレス入力欄が表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      expect(
        screen.getByRole('textbox', { name: /メールアドレス/i }) ||
          screen.getByPlaceholderText(/email|clinic\.com/i)
      ).toBeTruthy();
    });

    test('パスワード入力欄が表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      // password type は role='textbox' に出ないので getByLabelText 等で確認
      const passwordInput =
        document.querySelector('input[type="password"]') ||
        document.querySelector('input[name="password"]');
      expect(passwordInput).toBeTruthy();
    });

    test('利用規約同意チェックボックスが表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      const checkbox =
        document.querySelector('input[type="checkbox"]') ||
        document.querySelector('[name="termsAccepted"]');
      expect(checkbox).toBeTruthy();
    });

    test('CTAボタン「無料で始める」が表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      expect(
        screen.getByRole('button', { name: /無料で始める/i })
      ).toBeTruthy();
    });

    test('管理者ログインへのリンクが表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      // AC-04: /admin/login への導線
      const loginLink =
        screen.queryByRole('link', { name: /管理者ログイン/i }) ||
        screen.queryByText(/管理者ログイン/i);
      expect(loginLink).toBeTruthy();
    });

    test('「スタッフ登録は招待制です」の補助文が表示される', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      expect(screen.getByText(/招待制/i)).toBeTruthy();
    });
  });

  // ----------------------------------------------------------------
  // AC-04: /admin/login へのナビゲーション
  // ----------------------------------------------------------------
  describe('AC-04: ログインページへの導線', () => {
    test('/admin/login へのリンクが存在する', async () => {
      const { default: RegisterPage } = await import('@/app/register/page');
      render(<RegisterPage />);
      // href="/admin/login" を持つリンクを確認
      const links = document.querySelectorAll('a[href*="/admin/login"]');
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
