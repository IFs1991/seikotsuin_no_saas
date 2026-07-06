/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientsPage from '@/app/(app)/patients/page';
import { usePatientAnalysis } from '@/hooks/usePatientAnalysis';
import { useManagerPatientAnalysis } from '@/hooks/useManagerPatientAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';

// Mock the custom hook
jest.mock('@/hooks/usePatientAnalysis');
const mockUsePatientAnalysis = usePatientAnalysis as jest.MockedFunction<
  typeof usePatientAnalysis
>;

jest.mock('@/hooks/useManagerPatientAnalysis');
const mockUseManagerPatientAnalysis =
  useManagerPatientAnalysis as jest.MockedFunction<
    typeof useManagerPatientAnalysis
  >;

jest.mock('@/providers/user-profile-context');
const mockUseUserProfileContext = useUserProfileContext as jest.MockedFunction<
  typeof useUserProfileContext
>;

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='line-chart'>{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  Tooltip: () => <div data-testid='tooltip' />,
  Line: () => <div data-testid='line' />,
  Bar: () => <div data-testid='bar' />,
}));

// Mock data
const mockPatientData = {
  conversionData: {
    stages: [
      { name: '新患', value: 100, percentage: 100 },
      { name: '2回目来院', value: 80, percentage: 80 },
      { name: '継続治療', value: 60, percentage: 60 },
      { name: 'リピーター', value: 40, percentage: 40 },
    ],
  },
  visitCounts: {
    average: 5.2,
    monthlyChange: 12,
  },
  riskScores: [
    {
      id: 1,
      name: '田中太郎',
      lastVisit: '2024-08-01',
      riskLevel: 'high' as const,
      score: 85,
    },
    {
      id: 2,
      name: '山田花子',
      lastVisit: '2024-08-05',
      riskLevel: 'medium' as const,
      score: 65,
    },
  ],
  ltvRanking: [
    { name: '佐藤次郎', ltv: 150000 },
    { name: '鈴木三郎', ltv: 120000 },
    { name: '高橋四郎', ltv: 95000 },
  ],
  segmentData: {
    visit: [
      { label: '軽度リピート', value: 35 },
      { label: '中度リピート', value: 45 },
      { label: '高度リピート', value: 20 },
    ],
    age: [],
    symptom: [],
    area: [],
  },
  reservations: [],
  satisfactionCorrelation: {},
  followUpList: [
    {
      id: 1,
      name: '田中太郎',
      reason: '最終来院から2週間経過',
    },
    {
      id: 2,
      name: '山田花子',
      reason: '治療完了後のフォローアップ',
    },
  ],
};

describe('PatientsPage', () => {
  beforeEach(() => {
    mockUsePatientAnalysis.mockReturnValue({
      data: mockPatientData,
      loading: false,
      error: null,
    });
    mockUseManagerPatientAnalysis.mockReturnValue({
      data: {
        summary: {
          assignedClinicCount: 2,
          totalPatients: 120,
          activePatients: 90,
          newPatients: 80,
          returnPatients: 60,
          conversionRate: 75,
          visitCount: 300,
          averageVisitCount: 3.4,
          totalRevenue: 2400000,
          averageRevenuePerPatient: 20000,
          highRiskPatientCount: 5,
        },
        clinics: [
          {
            clinicId: 'clinic-1',
            clinicName: '池袋院',
            totalPatients: 70,
            activePatients: 50,
            newPatients: 45,
            returnPatients: 30,
            conversionRate: 66.67,
            visitCount: 180,
            averageVisitCount: 3,
            totalRevenue: 1400000,
            averageRevenuePerPatient: 20000,
            highRiskPatientCount: 3,
          },
          {
            clinicId: 'clinic-2',
            clinicName: '渋谷院',
            totalPatients: 50,
            activePatients: 40,
            newPatients: 35,
            returnPatients: 30,
            conversionRate: 85.71,
            visitCount: 120,
            averageVisitCount: 4,
            totalRevenue: 1000000,
            averageRevenuePerPatient: 20000,
            highRiskPatientCount: 2,
          },
        ],
        selectedClinic: {
          clinicId: 'clinic-1',
          clinicName: '池袋院',
          totalPatients: 70,
          activePatients: 50,
          newPatients: 45,
          returnPatients: 30,
          conversionRate: 66.67,
          visitCount: 180,
          averageVisitCount: 3,
          totalRevenue: 1400000,
          averageRevenuePerPatient: 20000,
          highRiskPatientCount: 3,
          segmentData: {
            visit: [{ label: '軽度リピート', value: 30 }],
          },
          riskScores: [
            {
              patient_id: 'patient-1',
              name: '選択院 太郎',
              riskScore: 80,
              lastVisit: '2026-05-01',
              category: 'high',
            },
          ],
          ltvRanking: [],
          followUpList: [
            {
              patient_id: 'patient-1',
              name: '選択院 太郎',
              reason: '80%の離脱リスク',
              lastVisit: '2026-05-01',
              action: '電話フォロー推奨',
            },
          ],
        },
        target: 'total',
        period: {
          type: 'month',
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          bucket: 'daily',
        },
        charts: {
          revenue: [
            {
              bucketStart: '2026-06-01',
              bucketEnd: '2026-06-01',
              label: '6/1',
              value: 100000,
            },
          ],
          patients: [
            {
              bucketStart: '2026-06-01',
              bucketEnd: '2026-06-01',
              label: '6/1',
              value: 20,
            },
          ],
          newPatients: [],
          repeatPatients: [],
          visits: [],
          conversionRate: [],
          clinicRevenueComparison: [],
          clinicPatientComparison: [],
        },
      },
      loading: false,
      error: null,
      selectedClinicId: 'clinic-1',
      setSelectedClinicId: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseUserProfileContext.mockReturnValue({
      profile: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'staff',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      },
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render patients page with all sections', async () => {
    render(<PatientsPage />);

    // Check for main headings
    expect(screen.getByText('患者フロー分析')).toBeInTheDocument();
    expect(screen.getByText('平均通院回数')).toBeInTheDocument();
    expect(screen.getByText('患者LTV')).toBeInTheDocument();
    expect(screen.getByText('離脱リスク分析')).toBeInTheDocument();
    expect(screen.getByText('セグメント分析')).toBeInTheDocument();
    expect(screen.getByText('フォローアップ対象')).toBeInTheDocument();
  });

  test('should display average visit count correctly', () => {
    render(<PatientsPage />);

    expect(screen.getByText('5.2回')).toBeInTheDocument();
    expect(screen.getByText('前月比: 12%')).toBeInTheDocument();
  });

  test('should display LTV ranking', () => {
    // UI uses toLocaleString() without yen prefix
    // @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 4
    render(<PatientsPage />);

    expect(screen.getByText('佐藤次郎')).toBeInTheDocument();
    expect(screen.getByText('150,000')).toBeInTheDocument();
    expect(screen.getByText('鈴木三郎')).toBeInTheDocument();
    expect(screen.getByText('120,000')).toBeInTheDocument();
    expect(screen.getByText('高橋四郎')).toBeInTheDocument();
    expect(screen.getByText('95,000')).toBeInTheDocument();
  });

  test('should display follow-up list', () => {
    render(<PatientsPage />);

    expect(screen.getAllByText('田中太郎')).toHaveLength(2); // リスク分析とフォローアップに表示
    expect(screen.getByText('最終来院から2週間経過')).toBeInTheDocument();
    expect(screen.getAllByText('山田花子')).toHaveLength(2); // リスク分析とフォローアップに表示
    expect(screen.getByText('治療完了後のフォローアップ')).toBeInTheDocument();
  });

  test('should have contact buttons for follow-up patients', () => {
    render(<PatientsPage />);

    const contactButtons = screen.getAllByText('連絡する');
    expect(contactButtons).toHaveLength(2);
  });

  test('should display segment analysis tabs', () => {
    render(<PatientsPage />);

    expect(screen.getByText('来院区分')).toBeInTheDocument();
    expect(screen.getByText('軽度リピート')).toBeInTheDocument();
    expect(screen.getByText('35人')).toBeInTheDocument();
  });

  test('manager should render assigned clinic analysis without calling single-clinic analysis hook', async () => {
    mockUseUserProfileContext.mockReturnValue({
      profile: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
        clinicId: 'legacy-clinic',
        isActive: true,
        isAdmin: false,
      },
      loading: false,
      error: null,
    });

    render(<PatientsPage />);

    expect(mockUsePatientAnalysis).not.toHaveBeenCalled();
    expect(mockUseManagerPatientAnalysis).toHaveBeenCalled();
    expect(screen.getByText('担当院合計')).toBeInTheDocument();
    expect(screen.getByText('担当院別分析')).toBeInTheDocument();
    expect(await screen.findByText('売上推移')).toBeInTheDocument();
    expect(
      screen.getByText(/担当院の患者動向を期間別に確認できます。/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('池袋院').length).toBeGreaterThan(0);
    expect(screen.getByText('再来促進')).toBeInTheDocument();
    expect(screen.queryByText('患者一覧')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '連絡する' })).toBeNull();
  });

  test('manager without assignments should show assignment empty state', () => {
    mockUseUserProfileContext.mockReturnValue({
      profile: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
        clinicId: null,
        isActive: true,
        isAdmin: false,
      },
      loading: false,
      error: null,
    });
    mockUseManagerPatientAnalysis.mockReturnValue({
      data: {
        summary: {
          assignedClinicCount: 0,
          totalPatients: 0,
          activePatients: 0,
          newPatients: 0,
          returnPatients: 0,
          conversionRate: 0,
          visitCount: 0,
          averageVisitCount: 0,
          totalRevenue: 0,
          averageRevenuePerPatient: 0,
          highRiskPatientCount: 0,
        },
        clinics: [],
        selectedClinic: null,
        target: 'total',
        period: {
          type: 'all',
          startDate: null,
          endDate: null,
          bucket: 'monthly',
        },
        charts: {
          revenue: [],
          patients: [],
          newPatients: [],
          repeatPatients: [],
          visits: [],
          conversionRate: [],
          clinicRevenueComparison: [],
          clinicPatientComparison: [],
        },
      },
      loading: false,
      error: null,
      selectedClinicId: null,
      setSelectedClinicId: jest.fn(),
      refetch: jest.fn(),
    });

    render(<PatientsPage />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
    expect(
      screen.getByText('管理者に担当店舗の設定を依頼してください。')
    ).toBeInTheDocument();
  });
});
