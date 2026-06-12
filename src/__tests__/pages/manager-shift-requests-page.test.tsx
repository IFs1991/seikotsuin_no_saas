/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManagerShiftRequestsPage from '@/app/(app)/manager/shift-requests/page';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/components/manager/manager-shift-requests', () => ({
  ManagerShiftRequests: () => <div>manager shift requests content</div>,
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

describe('ManagerShiftRequestsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile('manager');
  });

  it('renders shift request review for manager users', () => {
    render(<ManagerShiftRequestsPage />);

    expect(
      screen.getByText('manager shift requests content')
    ).toBeInTheDocument();
  });

  it('shows unauthorized state for non-manager users', () => {
    mockProfile('clinic_admin');

    render(<ManagerShiftRequestsPage />);

    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
    expect(
      screen.getByText('この画面はマネージャー向けの担当院希望シフトです。')
    ).toBeInTheDocument();
  });
});
