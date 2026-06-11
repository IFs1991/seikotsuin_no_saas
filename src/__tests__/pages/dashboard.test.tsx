/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '@/app/(app)/dashboard/page';
import useAdminDashboard from '@/hooks/useAdminDashboard';
import useDashboard from '@/hooks/useDashboard';
import {
  ADMIN_DASHBOARD_COPY,
  AREA_MANAGER_ADMIN_DASHBOARD_COPY,
} from '@/components/dashboard/admin-dashboard.utils';
import { UserProfileProvider } from '@/providers/user-profile-context';
import type { UserProfile } from '@/types/user-profile';

jest.mock('@/hooks/useAdminDashboard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/hooks/useDashboard', () => ({
  __esModule: true,
  default: jest.fn(),
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

const mockedUseAdminDashboard = jest.mocked(useAdminDashboard);
const mockedUseDashboard = jest.mocked(useDashboard);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';

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

function renderDashboard(profile: UserProfile | null) {
  return render(
    <UserProfileProvider value={{ profile, loading: false, error: null }}>
      <DashboardPage />
    </UserProfileProvider>
  );
}

function mockAdminDashboardData() {
  mockedUseAdminDashboard.mockReturnValue({
    clinicsData: [
      {
        id: clinicId,
        name: '本町院',
        totalRevenue: 1250000,
        totalPatientCount: 200,
        averagePerformanceScore: 4.2,
      },
    ],
    overallKpis: {
      totalGroupRevenue: 1250000,
      totalGroupPatientCount: 200,
      averageGroupPerformance: 4.2,
    },
    loading: false,
    error: null,
    setSort: jest.fn(),
    setClinicFilter: jest.fn(),
    refreshData: jest.fn().mockResolvedValue(undefined),
    isRefreshing: false,
  });
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
    mockAdminDashboardData();
    mockClinicDashboardData();
  });

  it('manager without primary clinic renders the area manager dashboard', () => {
    renderDashboard(
      createProfile({
        role: 'manager',
        clinicId: null,
        clinicName: null,
      })
    );

    expect(
      screen.getByText(AREA_MANAGER_ADMIN_DASHBOARD_COPY.title)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(ADMIN_DASHBOARD_COPY.title)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('クリニック情報が見つかりません')
    ).not.toBeInTheDocument();
    expect(mockedUseAdminDashboard).toHaveBeenCalledTimes(1);
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
    expect(mockedUseAdminDashboard).not.toHaveBeenCalled();
  });

  it('non-manager with clinic keeps the existing single clinic dashboard', () => {
    renderDashboard(createProfile({ role: 'staff' }));

    expect(screen.getByText('メインダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('本日のリアルタイムデータ')).toBeInTheDocument();
    expect(mockedUseDashboard).toHaveBeenCalledWith(clinicId);
    expect(mockedUseAdminDashboard).not.toHaveBeenCalled();
  });
});
