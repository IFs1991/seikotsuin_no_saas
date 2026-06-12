/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManagerClinicComparisonPage from '@/app/(app)/manager/clinic-comparison/page';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/components/manager/manager-clinic-comparison', () => ({
  ManagerClinicComparison: () => <div>manager clinic comparison content</div>,
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

describe('ManagerClinicComparisonPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile('manager');
  });

  it('renders clinic comparison for manager users', () => {
    render(<ManagerClinicComparisonPage />);

    expect(
      screen.getByText('manager clinic comparison content')
    ).toBeInTheDocument();
  });

  it('shows unauthorized state for non-manager users', () => {
    mockProfile('clinic_admin');

    render(<ManagerClinicComparisonPage />);

    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
    expect(
      screen.getByText('この画面はマネージャー向けの担当院比較分析です。')
    ).toBeInTheDocument();
  });
});
