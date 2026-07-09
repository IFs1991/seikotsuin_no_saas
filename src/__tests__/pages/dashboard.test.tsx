/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '@/app/(app)/dashboard/page';
import useDashboard from '@/hooks/useDashboard';
import { UserProfileProvider } from '@/providers/user-profile-context';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import type { UserProfile } from '@/types/user-profile';

jest.mock('@/hooks/useDashboard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/components/dashboard/manager-dashboard', () => ({
  __esModule: true,
  default: function ManagerDashboardMock() {
    return <div>担当エリアダッシュボード</div>;
  },
}));

jest.mock('@/components/dashboard/revenue-chart', () => ({
  __esModule: true,
  default: function RevenueChartMock() {
    return <div>収益推移チャート</div>;
  },
}));

jest.mock('@/components/dashboard/patient-flow-heatmap', () => ({
  __esModule: true,
  default: function PatientFlowHeatmapMock() {
    return <div>時間帯別の混雑状況ヒートマップ</div>;
  },
}));

const mockedUseDashboard = jest.mocked(useDashboard);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const selectedClinicId = '123e4567-e89b-12d3-a456-426614174099';

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    email: 'user@example.com',
    role: 'clinic_admin',
    clinicId,
    clinicName: '本町院',
    isActive: true,
    isAdmin: false,
    ...overrides,
  };
}

function renderDashboard(
  profile: UserProfile | null,
  selectedClinic?: string | null
) {
  const content = <DashboardPage />;
  const wrappedContent =
    selectedClinic === undefined ? (
      content
    ) : (
      <SelectedClinicProvider
        initialClinicId={selectedClinic}
        currentClinicId={clinicId}
        clinics={[
          { id: clinicId, name: '本町院' },
          { id: selectedClinicId, name: '分院' },
        ]}
      >
        {content}
      </SelectedClinicProvider>
    );

  return render(
    <UserProfileProvider value={{ profile, loading: false, error: null }}>
      {wrappedContent}
    </UserProfileProvider>
  );
}

function mockClinicDashboardData() {
  mockedUseDashboard.mockReturnValue({
    dashboardData: {
      dailyData: { revenue: 150000, patients: 12 },
      aiComment: { summary: '本日のデータを分析中です...' },
      alerts: [],
      revenueChartData: [],
      heatmapData: [],
    },
    loading: false,
    error: null,
    handleQuickAction: jest.fn(),
    refetch: jest.fn().mockResolvedValue(undefined),
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClinicDashboardData();
  });

  it('manager without primary clinic renders the manager dashboard', async () => {
    renderDashboard(
      createProfile({
        role: 'manager',
        clinicId: null,
        clinicName: null,
      })
    );

    expect(
      await screen.findByText('担当エリアダッシュボード')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('クリニック情報が見つかりません')
    ).not.toBeInTheDocument();
    expect(mockedUseDashboard).not.toHaveBeenCalled();
  });

  it('non-manager without clinic keeps the existing missing clinic state', () => {
    renderDashboard(
      createProfile({
        role: 'clinic_admin',
        clinicId: null,
        clinicName: null,
      })
    );

    expect(
      screen.getByText('クリニック情報が見つかりません')
    ).toBeInTheDocument();
    expect(mockedUseDashboard).toHaveBeenCalledWith(null);
  });

  it('non-manager with clinic keeps the existing single clinic dashboard', () => {
    renderDashboard(createProfile({ role: 'staff' }));

    expect(screen.getByText('メインダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('本日のリアルタイムデータ')).toBeInTheDocument();
    expect(mockedUseDashboard).toHaveBeenCalledWith(clinicId);
  });

  it('uses the selected active clinic instead of profile clinic', () => {
    renderDashboard(createProfile({ role: 'staff' }), selectedClinicId);

    expect(mockedUseDashboard).toHaveBeenCalledWith(selectedClinicId);
  });
});
