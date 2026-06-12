/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManagerStaffPage from '@/app/(app)/manager/staff/page';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/components/manager/manager-staff-list', () => ({
  ManagerStaffList: () => <div>manager staff list content</div>,
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

describe('ManagerStaffPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile('manager');
  });

  it('renders staff list for manager users', () => {
    render(<ManagerStaffPage />);

    expect(screen.getByText('manager staff list content')).toBeInTheDocument();
  });

  it('shows unauthorized state for non-manager users', () => {
    mockProfile('clinic_admin');

    render(<ManagerStaffPage />);

    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
    expect(
      screen.getByText(
        'この画面はマネージャー向けの担当院スタッフ一覧です。'
      )
    ).toBeInTheDocument();
  });
});
