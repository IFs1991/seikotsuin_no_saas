/**
 * @file admin-login-regression.test.tsx
 * @description /admin/login ページの回帰テスト
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 5 (AC-04)
 *
 * TDD: 🔴 → 🟢
 * AC-04: /admin/login はログイン専用で /register への導線を持つ
 * AC-06: /invite の既存テストが回帰しない（signup/login受諾フロー）
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// ================================================================
// モック
// ================================================================
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: jest.fn(() => ({ get: jest.fn(() => null) })),
}));

jest.mock('@/app/admin/actions', () => ({
  login: jest.fn().mockResolvedValue({ success: true }),
  signup: jest.fn().mockResolvedValue({ success: true }),
  logout: jest.fn(),
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
describe('/admin/login ページ (signup トグル削除後)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // AC-04: ログイン専用化
  // ----------------------------------------------------------------
  describe('AC-04: ログイン専用', () => {
    test('ログインフォームが表示される', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);
      expect(screen.getByRole('button', { name: /ログイン/i })).toBeTruthy();
    });

    test('/register への導線（リンクまたはボタン）が存在する', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);

      // /register へのリンクを探す
      const registerLink =
        document.querySelector('a[href*="/register"]') ||
        screen.queryByText(/新規登録/i) ||
        screen.queryByText(/アカウント作成/i) ||
        screen.queryByText(/無料で始める/i);
      expect(registerLink).toBeTruthy();
    });

    test('signup トグルボタン（サインアップ/ログイン切り替え）が存在しない', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);

      // 旧実装では "アカウントをお持ちでない場合は？新規作成" が button タグだった。
      // 新実装では /register への <a> リンクに変わっている。
      // 切り替えボタン（button タグ）が存在しないことを確認する。
      const signupToggleButton = screen.queryByRole('button', {
        name: /アカウントをお持ちでない場合/i,
      });
      expect(signupToggleButton).toBeNull();
    });

    test('ページタイトルまたは見出しに「ログイン」が含まれる', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);
      const title =
        screen.queryByRole('heading', { name: /ログイン/i }) ||
        screen.queryByText(/管理者ログイン/i);
      expect(title).toBeTruthy();
    });
  });

  // ----------------------------------------------------------------
  // メールアドレス・パスワード入力欄の存在確認
  // ----------------------------------------------------------------
  describe('フォーム要素', () => {
    test('メールアドレス入力欄が存在する', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);
      const emailInput =
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[name="email"]');
      expect(emailInput).toBeTruthy();
    });

    test('パスワード入力欄が存在する', async () => {
      const { default: AdminLogin } = await import('@/app/admin/login/page');
      render(<AdminLogin />);
      const passwordInput =
        document.querySelector('input[type="password"]') ||
        document.querySelector('input[name="password"]');
      expect(passwordInput).toBeTruthy();
    });
  });
});
