/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManagerPage from '@/app/(app)/manager/page';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/components/manager/manager-home', () => ({
  ManagerHome: () => <div>manager home content</div>,
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: jest.fn(),
}));

const useUserProfileContextMock = jest.mocked(useUserProfileContext);

function mockProfile(role: string) {
  useUserProfileContextMock.mockReturnValue({
    profile: {
      id: `${role}-user`,
      email: `${role}@example.com`,
      role,
      clinicId: role === 'manager' ? null : 'clinic-a',
      clinicName: role === 'manager' ? null : '池袋院',
      isActive: true,
      isAdmin: role === 'admin',
    },
    loading: false,
    error: null,
  });
}

describe('ManagerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile('manager');
  });

  it('renders manager home for manager users', () => {
    render(<ManagerPage />);

    expect(screen.getByText('manager home content')).toBeInTheDocument();
  });

  it('shows unauthorized state for non-manager users', () => {
    mockProfile('clinic_admin');

    render(<ManagerPage />);

    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
    expect(
      screen.getByText('この画面はマネージャー向けの管理ホームです。')
    ).toBeInTheDocument();
    expect(screen.queryByText('manager home content')).not.toBeInTheDocument();
  });

  it('shows loading and profile error states', () => {
    useUserProfileContextMock.mockReturnValue({
      profile: null,
      loading: true,
      error: null,
    });

    const { rerender } = render(<ManagerPage />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();

    useUserProfileContextMock.mockReturnValue({
      profile: null,
      loading: false,
      error: 'プロフィールエラー',
    });
    rerender(<ManagerPage />);

    expect(
      screen.getByText('プロフィール取得に失敗しました')
    ).toBeInTheDocument();
    expect(screen.getByText('プロフィールエラー')).toBeInTheDocument();
  });
});
