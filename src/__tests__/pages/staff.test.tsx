/** @jest-environment jsdom */

/**
 * Staff Management Page Tests
 * @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 4
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaffManagementPage from '@/app/staff/page';
import { useStaffAnalysis } from '@/hooks/useStaffAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';

// Mock the custom hooks
jest.mock('@/hooks/useStaffAnalysis');
const mockUseStaffAnalysis = useStaffAnalysis as jest.MockedFunction<
  typeof useStaffAnalysis
>;

// Mock useUserProfileContext - required by StaffManagementPage
jest.mock('@/providers/user-profile-context');
const mockUseUserProfileContext = useUserProfileContext as jest.MockedFunction<
  typeof useUserProfileContext
>;

// Mock data - updated to match new API response
const mockStaffData = {
  staffMetrics: {
    dailyPatients: 12,
    totalRevenue: 500000,
    averageSatisfaction: 4.5,
  },
  revenueRanking: [
    { staff_id: 'staff-1', name: '田中', revenue: 120000, patients: 50, satisfaction: 4.5 },
    { staff_id: 'staff-2', name: '佐藤', revenue: 110000, patients: 45, satisfaction: 4.2 },
    { staff_id: 'staff-3', name: '山田', revenue: 95000, patients: 40, satisfaction: 4.0 },
  ],
  satisfactionCorrelation: [
    { name: '田中', satisfaction: 4.5, revenue: 120000, patients: 50 },
    { name: '佐藤', satisfaction: 4.2, revenue: 110000, patients: 45 },
  ],
  performanceTrends: {},
  shiftAnalysis: {
    hourlyReservations: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: i >= 9 && i <= 18 ? 5 : 0 })),
    utilizationRate: 65,
    recommendations: [
      'ピーク時間帯は10時、14時、16時です。この時間帯にスタッフを増員することを検討してください。',
      '稼働率は65%で適正範囲内です。現在のシフト体制を維持してください。',
    ],
  },
  totalStaff: 5,
  activeStaff: 4,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
};

describe('StaffManagementPage', () => {
  beforeEach(() => {
    mockUseStaffAnalysis.mockReturnValue(mockStaffData);
    // Mock useUserProfileContext with valid profile
    mockUseUserProfileContext.mockReturnValue({
      profile: {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'clinic_admin',
        clinicId: 'test-clinic-id',
        isActive: true,
        isAdmin: true,
      },
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render staff management page with main title', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('スタッフ分析とシフト最適化')).toBeInTheDocument();
  });

  test('should display tab navigation', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('パフォーマンス')).toBeInTheDocument();
    expect(screen.getByText('シフト分析')).toBeInTheDocument();
  });

  test('should display metrics cards', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('平均患者数/日')).toBeInTheDocument();
    expect(screen.getByText('12.0')).toBeInTheDocument();
    expect(screen.getByText('総売上')).toBeInTheDocument();
    expect(screen.getByText('¥500,000')).toBeInTheDocument();
    expect(screen.getByText('平均満足度')).toBeInTheDocument();
    // 4.50 appears multiple times (in metrics card and in ranking table)
    expect(screen.getAllByText('4.50').length).toBeGreaterThan(0);
  });

  test('should display shift analysis when shifts tab is clicked', () => {
    render(<StaffManagementPage />);

    const shiftsTab = screen.getByText('シフト分析');
    fireEvent.click(shiftsTab);

    expect(screen.getByText('稼働率:')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('時間帯別予約数（過去30日）')).toBeInTheDocument();
    expect(screen.getByText('推奨事項')).toBeInTheDocument();
  });

  test('should display loading state', () => {
    mockUseStaffAnalysis.mockReturnValue({
      ...mockStaffData,
      isLoading: true,
    });

    render(<StaffManagementPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('should display error state', () => {
    mockUseStaffAnalysis.mockReturnValue({
      ...mockStaffData,
      error: 'APIエラーが発生しました',
    });

    render(<StaffManagementPage />);

    expect(screen.getByText('APIエラーが発生しました')).toBeInTheDocument();
  });

  test('should display performance metrics when performance tab is active', () => {
    render(<StaffManagementPage />);

    // Performance tab should be active by default
    expect(screen.getByText('売上ランキング')).toBeInTheDocument();
    // 田中 appears in both revenue ranking and satisfaction correlation
    expect(screen.getAllByText('田中').length).toBeGreaterThan(0);
    // ¥120,000 appears in both sections too
    expect(screen.getAllByText('¥120,000').length).toBeGreaterThan(0);
  });

  test('should display staff count badges', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('総スタッフ: 5名')).toBeInTheDocument();
    expect(screen.getByText('稼働中: 4名')).toBeInTheDocument();
  });
});
