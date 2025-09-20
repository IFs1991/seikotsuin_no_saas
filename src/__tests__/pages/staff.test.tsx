import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaffManagementPage from '@/app/staff/page';
import { useStaffAnalysis } from '@/hooks/useStaffAnalysis';

// Mock the custom hook
jest.mock('@/hooks/useStaffAnalysis');
const mockUseStaffAnalysis = useStaffAnalysis as jest.MockedFunction<
  typeof useStaffAnalysis
>;

// Mock data
const mockStaffData = {
  staffMetrics: {
    dailyPatients: 12,
  },
  revenueRanking: [
    { name: '田中', revenue: 120000, percentage: 28 },
    { name: '佐藤', revenue: 110000, percentage: 25 },
    { name: '山田', revenue: 95000, percentage: 22 },
  ],
  satisfactionCorrelation: {
    overall: 4.2,
  },
  skillMatrix: [
    { id: 1, name: '整体技術', level: 5 },
    { id: 2, name: 'コミュニケーション', level: 4 },
    { id: 3, name: '鍼灸技術', level: 3 },
  ],
  trainingHistory: [
    { id: 1, title: '整体認定研修', date: '2024-07-15' },
    { id: 2, title: '接客マナー講習', date: '2024-06-20' },
    { id: 3, title: '鍼灸基礎コース', date: '2024-05-10' },
  ],
  performanceTrends: {
    monthly: [
      { month: '7月', patients: 280, revenue: 350000 },
      { month: '6月', patients: 260, revenue: 330000 },
    ],
  },
  isLoading: false,
};

describe('StaffManagementPage', () => {
  beforeEach(() => {
    mockUseStaffAnalysis.mockReturnValue(mockStaffData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render staff management page with main title', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('スタッフ生産性管理')).toBeInTheDocument();
    expect(
      screen.getByText('施術者のパフォーマンスと成長を追跡・管理')
    ).toBeInTheDocument();
  });

  test('should display tab navigation', () => {
    render(<StaffManagementPage />);

    expect(screen.getByText('パフォーマンス')).toBeInTheDocument();
    expect(screen.getByText('シフト最適化')).toBeInTheDocument();
    expect(screen.getByText('スキル管理')).toBeInTheDocument();
  });

  test('should display skill matrix when skills tab is clicked', () => {
    render(<StaffManagementPage />);

    const skillsTab = screen.getByText('スキル管理');
    fireEvent.click(skillsTab);

    expect(screen.getByText('スキルマトリックス')).toBeInTheDocument();
    expect(screen.getByText('整体技術')).toBeInTheDocument();
    expect(screen.getByText('コミュニケーション')).toBeInTheDocument();
    expect(screen.getByText('鍼灸技術')).toBeInTheDocument();
  });

  test('should display training history when skills tab is clicked', () => {
    render(<StaffManagementPage />);

    const skillsTab = screen.getByText('スキル管理');
    fireEvent.click(skillsTab);

    expect(screen.getByText('研修・資格履歴')).toBeInTheDocument();
    expect(screen.getByText('整体認定研修')).toBeInTheDocument();
    expect(screen.getByText('2024-07-15')).toBeInTheDocument();
    expect(screen.getByText('接客マナー講習')).toBeInTheDocument();
    expect(screen.getByText('2024-06-20')).toBeInTheDocument();
  });

  test('should display loading state', () => {
    mockUseStaffAnalysis.mockReturnValue({
      ...mockStaffData,
      isLoading: true,
    });

    render(<StaffManagementPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('should display performance metrics when performance tab is active', () => {
    render(<StaffManagementPage />);

    // Performance tab should be active by default
    expect(screen.getByText('田中')).toBeInTheDocument();
    expect(screen.getByText('120,000')).toBeInTheDocument();
    expect(screen.getByText('28%')).toBeInTheDocument();
  });
});
