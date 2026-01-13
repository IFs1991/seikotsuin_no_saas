/** @jest-environment jsdom */

/**
 * MFA Setup Page Tests - TDD for 認証コンテキスト連携 MVP
 *
 * 仕様:
 * - src/app/admin/(protected)/mfa-setup/page.tsx をプロフィールから userId/clinicId/role を取得
 * - role が admin / clinic_admin 以外の場合は unauthorized へ誘導
 *   (ADMIN_UI_ROLES には admin, clinic_admin のみ。clinic_manager は含まれない)
 * - isAdmin は ADMIN_UI_ROLES.has(role) で決定
 *
 * 受け入れ基準:
 * - admin / clinic_admin: MFAダッシュボードが表示
 * - non-admin (staff, etc.): unauthorized 表示
 * - ハードコードされた userId/clinicId/isAdmin が削除されている
 *
 * @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 4
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// MFADashboardコンポーネントをモック
jest.mock('@/components/mfa/MFADashboard', () => ({
  MFADashboard: ({ userId, clinicId, isAdmin }: { userId: string; clinicId: string; isAdmin: boolean }) => (
    <div data-testid="mfa-dashboard">
      <span data-testid="mfa-user-id">{userId}</span>
      <span data-testid="mfa-clinic-id">{clinicId}</span>
      <span data-testid="mfa-is-admin">{isAdmin ? 'true' : 'false'}</span>
    </div>
  ),
}));

// useUserProfileContextをモック
const mockProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'admin',
  clinicId: 'test-clinic-id',
  isActive: true,
  isAdmin: true,
};

const mockUseUserProfileContext = jest.fn(() => ({
  profile: mockProfile,
  loading: false,
  error: null,
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => mockUseUserProfileContext(),
}));

// useRouterをモック
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

import MFASetupPage from '@/app/admin/(protected)/mfa-setup/page';

describe('MFASetupPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUserProfileContext.mockReturnValue({
      profile: mockProfile,
      loading: false,
      error: null,
    });
  });

  describe('基本レンダリング', () => {
    it('MFA設定ページがレンダリングされる', () => {
      render(<MFASetupPage />);

      expect(screen.getByText(/多要素認証（MFA）設定/i)).toBeInTheDocument();
    });

    it('MFAについての説明が表示される', () => {
      render(<MFASetupPage />);

      expect(screen.getByText(/不正アクセスのリスクを99.9%削減/i)).toBeInTheDocument();
    });
  });

  /**
   * 認証コンテキスト連携テスト
   * - userId / clinicId / isAdmin がプロフィールから取得される
   * - ハードコードされた値が使われていない
   */
  describe('認証コンテキスト連携', () => {
    it('ハードコードされた userId が使われていない（profile.id を使用）', () => {
      const testUserId = 'profile-user-id-12345';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, id: testUserId },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      const userIdElement = screen.getByTestId('mfa-user-id');
      expect(userIdElement).toHaveTextContent(testUserId);
      expect(userIdElement).not.toHaveTextContent('current-user-id');
    });

    it('ハードコードされた clinicId が使われていない（profile.clinicId を使用）', () => {
      const testClinicId = 'profile-clinic-id-67890';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: testClinicId },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      const clinicIdElement = screen.getByTestId('mfa-clinic-id');
      expect(clinicIdElement).toHaveTextContent(testClinicId);
      expect(clinicIdElement).not.toHaveTextContent('current-clinic-id');
    });

    it('isAdmin が profile.role に基づいて決定される（admin の場合）', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'admin' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      const isAdminElement = screen.getByTestId('mfa-is-admin');
      expect(isAdminElement).toHaveTextContent('true');
    });

    it('isAdmin が profile.role に基づいて決定される（clinic_admin の場合）', () => {
      // clinic_manager は ADMIN_UI_ROLES に含まれないため clinic_admin を使用
      // @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 4
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'clinic_admin' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      const isAdminElement = screen.getByTestId('mfa-is-admin');
      expect(isAdminElement).toHaveTextContent('true');
    });

    it('isAdmin が profile.role に基づいて決定される（staff の場合は false）', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'staff' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      expect(screen.queryByTestId('mfa-dashboard')).not.toBeInTheDocument();
    });
  });

  /**
   * 権限チェックテスト
   * - admin: MFAダッシュボードが表示
   * - clinic_admin: MFAダッシュボードが表示
   * - staff / その他: unauthorized 表示
   */
  describe('権限チェック', () => {
    it('role=admin の場合、MFAダッシュボードが表示される', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'admin' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      expect(screen.getByTestId('mfa-dashboard')).toBeInTheDocument();
    });

    it('role=clinic_admin の場合、MFAダッシュボードが表示される', () => {
      // clinic_manager は ADMIN_UI_ROLES に含まれないため clinic_admin を使用
      // @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 4
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'clinic_admin' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      expect(screen.getByTestId('mfa-dashboard')).toBeInTheDocument();
    });

    it('role=staff の場合、unauthorized ページへ遷移する', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'staff' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/unauthorized');
      });
    });

    it('role が不明な場合、unauthorized ページへ遷移する', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, role: 'unknown_role' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/unauthorized');
      });
    });
  });

  /**
   * ローディング・エラー状態テスト
   */
  describe('ローディング・エラー状態', () => {
    it('プロフィール読み込み中はローディング表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: true,
        error: null,
      });

      render(<MFASetupPage />);

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('プロフィール取得エラー時はエラー表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: false,
        error: 'プロフィール取得に失敗しました',
      });

      render(<MFASetupPage />);

      expect(screen.getByText(/プロフィール取得に失敗しました/i)).toBeInTheDocument();
    });

    it('プロフィールが null の場合、unauthorized ページへ遷移する', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/unauthorized');
      });
    });
  });

  /**
   * clinicId 未割当テスト
   */
  describe('clinicId 未割当', () => {
    it('clinicId が null の場合、権限割当の案内が表示される', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null, role: 'admin' },
        loading: false,
        error: null,
      });

      render(<MFASetupPage />);

      expect(screen.getByText(/管理者に権限割当を依頼してください/i)).toBeInTheDocument();
    });
  });
});
