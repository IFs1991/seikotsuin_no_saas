/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import AdminDashboard from '@/components/dashboard/admin-dashboard';
import useAdminDashboard from '@/hooks/useAdminDashboard';
import { ADMIN_DASHBOARD_COPY } from '@/components/dashboard/admin-dashboard.utils';

jest.mock('@/hooks/useAdminDashboard', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseAdminDashboard = jest.mocked(useAdminDashboard);

describe('AdminDashboard', () => {
  const refreshData = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the loading state while the dashboard query is pending', () => {
    mockedUseAdminDashboard.mockReturnValue({
      clinicsData: [],
      overallKpis: null,
      loading: true,
      error: null,
      setSort: jest.fn(),
      setClinicFilter: jest.fn(),
      refreshData,
      isRefreshing: false,
    });

    render(<AdminDashboard />);

    expect(screen.getByText(ADMIN_DASHBOARD_COPY.loading)).toBeInTheDocument();
  });

  it('renders Supabase-backed admin home metrics and management actions', () => {
    mockedUseAdminDashboard.mockReturnValue({
      clinicsData: [
        {
          id: 'clinic-1',
          name: '本町院',
          totalRevenue: 1250000,
          totalPatientCount: 200,
          averagePerformanceScore: 4.2,
        },
        {
          id: 'clinic-2',
          name: '梅田院',
          totalRevenue: 640000,
          totalPatientCount: 82,
          averagePerformanceScore: 2.8,
        },
      ],
      overallKpis: {
        totalGroupRevenue: 1890000,
        totalGroupPatientCount: 282,
        averageGroupPerformance: 3.5,
      },
      loading: false,
      error: null,
      setSort: jest.fn(),
      setClinicFilter: jest.fn(),
      refreshData,
      isRefreshing: false,
    });

    render(<AdminDashboard />);

    expect(screen.getByText(ADMIN_DASHBOARD_COPY.title)).toBeInTheDocument();
    expect(screen.getByText('¥1,890,000')).toBeInTheDocument();
    expect(screen.getByText('282人')).toBeInTheDocument();
    expect(screen.getByText('3.5 / 5.0')).toBeInTheDocument();
    expect(
      screen.getByText(ADMIN_DASHBOARD_COPY.signalTitle)
    ).toBeInTheDocument();
    expect(screen.getByText('注意店舗')).toBeInTheDocument();
    expect(screen.getByText('梅田院')).toBeInTheDocument();
    expect(screen.getByText('クリニック管理')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(
      screen.getByText(ADMIN_DASHBOARD_COPY.alertTitle)
    ).toBeInTheDocument();
    expect(screen.getAllByText('店舗比較分析')).not.toHaveLength(0);
  });

  it('shows an error state and retries loading on demand', () => {
    mockedUseAdminDashboard.mockReturnValue({
      clinicsData: [],
      overallKpis: null,
      loading: false,
      error: 'network failure',
      setSort: jest.fn(),
      setClinicFilter: jest.fn(),
      refreshData,
      isRefreshing: false,
    });

    render(<AdminDashboard />);

    expect(
      screen.getByText(ADMIN_DASHBOARD_COPY.errorTitle)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: ADMIN_DASHBOARD_COPY.retryButton })
    );
    expect(refreshData).toHaveBeenCalledTimes(1);
  });
});
