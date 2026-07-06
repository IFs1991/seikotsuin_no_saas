/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RevenuePage from '@/app/(app)/revenue/page';
import { useManagerRevenueAnalysis } from '@/hooks/useManagerRevenueAnalysis';
import { useRevenue } from '@/hooks/useRevenue';
import { useRevenueEstimateDetails } from '@/hooks/useRevenueEstimateDetails';
import { useUserProfile } from '@/hooks/useUserProfile';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import type { ManagerRevenueAnalysisResponse } from '@/lib/manager-revenue-analysis';

// Mock the custom hooks
jest.mock('@/hooks/useRevenue');
jest.mock('@/hooks/useRevenueEstimateDetails');
jest.mock('@/hooks/useUserProfile');
jest.mock('@/hooks/useManagerRevenueAnalysis');

const mockUseRevenue = useRevenue as jest.MockedFunction<typeof useRevenue>;
const mockUseRevenueEstimateDetails =
  useRevenueEstimateDetails as jest.MockedFunction<
    typeof useRevenueEstimateDetails
  >;
const mockUseUserProfile = useUserProfile as jest.MockedFunction<
  typeof useUserProfile
>;
const mockUseManagerRevenueAnalysis =
  useManagerRevenueAnalysis as jest.MockedFunction<
    typeof useManagerRevenueAnalysis
  >;

// Mock data
const mockClinicId = '123e4567-e89b-12d3-a456-426614174000';
const selectedClinicId = '123e4567-e89b-12d3-a456-426614174099';
const resolvedRefetch = (): Promise<void> => Promise.resolve();

function renderRevenuePageWithSelectedClinic() {
  return render(
    <SelectedClinicProvider
      initialClinicId={selectedClinicId}
      currentClinicId={mockClinicId}
      clinics={[
        { id: mockClinicId, name: '池袋院' },
        { id: selectedClinicId, name: '新宿院' },
      ]}
    >
      <RevenuePage />
    </SelectedClinicProvider>
  );
}

const mockRevenueData = {
  dailyRevenue: 150000,
  weeklyRevenue: 980000,
  monthlyRevenue: 4200000,
  insuranceRevenue: 2520000,
  selfPayRevenue: 1680000,
  trafficAccidentRevenue: 90000,
  workersCompRevenue: 50000,
  productRevenue: 120000,
  ticketRevenue: 300000,
  patientCopayEstimated: 72000,
  insurerReceivableEstimated: 168000,
  privateRevenueEstimated: 45000,
  trafficAccidentEstimated: 90000,
  workersCompEstimated: 50000,
  needsReviewCount: 2,
  blockedCount: 1,
  careEpisodeMetrics: {
    totalEpisodes: 8,
    secondVisitReachedCount: 6,
    fifthVisitReachedCount: 3,
    secondVisitReachRate: 75,
    fifthVisitReachRate: 37.5,
    episodeContinuationRate: 75,
    averageRevenuePerEpisode: 52000,
    averageVisitsPerEpisode: 3.2,
  },
  revenueEstimateSummary: {
    estimatedTotal: 240000,
    estimateCount: 6,
    calculatedCount: 4,
    needsReviewCount: 2,
    blockedCount: 0,
    overriddenCount: 1,
    warningCount: 2,
    disclaimer: '経営分析用の概算です。請求確定額ではありません。',
  },
  revenueContextSummary: [
    {
      code: 'traffic_accident',
      name: '交通事故',
      rollupCategory: 'traffic_accident',
      totalRevenue: 90000,
      itemCount: 3,
      needsReviewCount: 1,
      blockedCount: 0,
    },
    {
      code: 'workers_comp',
      name: '労災',
      rollupCategory: 'workers_comp',
      totalRevenue: 50000,
      itemCount: 2,
      needsReviewCount: 1,
      blockedCount: 1,
    },
  ],
  revenueBreakdownSummary: [
    {
      amountRole: 'patient_copay_estimated',
      lineCount: 12,
      estimatedAmount: 72000,
    },
    {
      amountRole: 'insurer_receivable_estimated',
      lineCount: 12,
      estimatedAmount: 168000,
    },
    {
      amountRole: 'private_revenue_estimated',
      lineCount: 3,
      estimatedAmount: 45000,
    },
    {
      amountRole: 'traffic_accident_receivable_estimated',
      lineCount: 2,
      estimatedAmount: 90000,
    },
    {
      amountRole: 'workers_comp_receivable_estimated',
      lineCount: 1,
      estimatedAmount: 50000,
    },
  ],
  menuRanking: [
    { menu: '整体', revenue: 1200000, count: 120 },
    { menu: 'マッサージ', revenue: 800000, count: 160 },
    { menu: '鍼灸', revenue: 600000, count: 60 },
  ],
  hourlyRevenue: 'ピーク: 14:00-16:00',
  dailyRevenueByDayOfWeek: 'ピーク: 金曜日',
  lastYearRevenue: 3800000,
  growthRate: '+10.5%',
  revenueForecast: 4500000,
  costAnalysis: '35%',
  staffRevenueContribution: '田中: 28%, 佐藤: 25%',
  loading: false,
  error: null,
};

const mockUserProfile = {
  profile: {
    id: 'user-1',
    email: 'test@example.com',
    role: 'clinic_admin',
    clinicId: mockClinicId,
    isActive: true,
    isAdmin: true,
  },
  loading: false,
  error: null,
};

const mockRevenueEstimateDetails = {
  details: [
    {
      dailyReportItemId: 'item-traffic',
      reportDate: '2026-06-02',
      patientName: '佐藤 花子',
      treatmentName: '交通事故施術',
      manualFee: 9000,
      revenueContextCode: 'traffic_accident',
      visitStageCode: null,
      estimateId: 'estimate-traffic',
      estimateStatus: 'needs_review',
      estimatedTotal: 9000,
      disclaimer: '経営分析用の概算です。請求確定額ではありません。',
      calculatedAt: '2026-06-02T00:00:00.000Z',
      calculationVersion: 'v1',
      usedScheduleCode: 'JUDO_TRAFFIC_202606',
      sourceSnapshotHash: 'snapshot-traffic-202606',
      lines: [
        {
          id: 'line-traffic',
          lineType: 'manual_fee',
          label: '交通事故 手入力概算',
          quantity: 1,
          unitAmount: 9000,
          totalAmount: 9000,
          sortOrder: 1,
          amountRole: 'traffic_accident_receivable_estimated',
          insuranceFeeItemId: null,
          scheduleCode: null,
          feeItemCode: null,
          sourceSnapshotHash: null,
        },
      ],
      warnings: [
        {
          id: 'warning-traffic',
          warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
          severity: 'needs_review',
          message:
            '交通事故・自賠責関連の概算です。請求確定前に確認してください。',
        },
      ],
    },
  ],
  loading: false,
  error: null,
};

const mockManagerRevenueAnalysisData: ManagerRevenueAnalysisResponse = {
  period: {
    type: 'month' as const,
    startDate: '2026-06-01',
    endDate: '2026-06-11',
    bucket: 'daily' as const,
    label: '今月（2026-06-01 - 2026-06-11）',
  },
  target: {
    type: 'total' as const,
    clinicId: null,
  },
  assignedClinics: [{ id: mockClinicId, name: '池袋院' }],
  summary: {
    clinicCount: 1,
    operatingRevenue: 300000,
    insuranceRevenue: 120000,
    privateRevenue: 180000,
    productRevenue: 0,
    ticketRevenue: 0,
    trafficAccidentRevenue: 0,
    workersCompRevenue: 0,
    patientCopayEstimated: 0,
    insurerReceivableEstimated: 0,
    privateRevenueEstimated: 0,
    visitCount: 30,
    averageRevenuePerVisit: 10000,
    reportDays: 10,
    missingReportDays: 0,
    needsReviewCount: 1,
    blockedCount: 0,
  },
  comparison: {
    active: true,
    previousStartDate: '2026-05-21',
    previousEndDate: '2026-05-31',
    previousOperatingRevenue: 200000,
    operatingRevenueChangeRate: 50,
    previousVisitCount: 20,
    visitCountChangeRate: 50,
    previousAverageRevenuePerVisit: 10000,
    averageRevenuePerVisitChangeRate: 0,
  },
  charts: {
    revenue: [
      {
        bucketStart: '2026-06-01',
        bucketEnd: '2026-06-11',
        label: '6/1',
        value: 300000,
      },
    ],
    visits: [
      {
        bucketStart: '2026-06-01',
        bucketEnd: '2026-06-11',
        label: '6/1',
        value: 30,
      },
    ],
    averageRevenuePerVisit: [
      {
        bucketStart: '2026-06-01',
        bucketEnd: '2026-06-11',
        label: '6/1',
        value: 10000,
      },
    ],
    insurancePrivateBreakdown: [
      {
        bucketStart: '2026-06-01',
        bucketEnd: '2026-06-11',
        label: '6/1',
        insuranceRevenue: 120000,
        privateRevenue: 180000,
      },
    ],
    contextBreakdown: [],
    clinicRevenueComparison: [
      { clinicId: mockClinicId, clinicName: '池袋院', value: 300000 },
    ],
    clinicAverageRevenueComparison: [
      { clinicId: mockClinicId, clinicName: '池袋院', value: 10000 },
    ],
  },
  clinicComparison: [
    {
      clinicId: mockClinicId,
      clinicName: '池袋院',
      operatingRevenue: 300000,
      revenueShare: 100,
      visitCount: 30,
      averageRevenuePerVisit: 10000,
      reportDays: 10,
      missingReportDays: 0,
      needsReviewCount: 1,
      operatingRevenueChangeRate: 50,
    },
  ],
  disclaimers: [
    'この画面の売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。',
    '患者分析の売上（予約ベース）とは集計方法が異なるため、数値は一致しません。',
  ],
};

describe('RevenuePage', () => {
  beforeEach(() => {
    mockUseUserProfile.mockReturnValue(mockUserProfile);
    mockUseRevenue.mockReturnValue(mockRevenueData);
    mockUseRevenueEstimateDetails.mockReturnValue(mockRevenueEstimateDetails);
    mockUseManagerRevenueAnalysis.mockReturnValue({
      data: mockManagerRevenueAnalysisData,
      loading: false,
      error: null,
      selectedClinicId: mockClinicId,
      setSelectedClinicId: jest.fn(),
      refetch: resolvedRefetch,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    test('should render revenue page with all sections', () => {
      render(<RevenuePage />);

      expect(screen.getByText('収益トレンド')).toBeInTheDocument();
      expect(screen.getByText('保険診療 vs 自費診療')).toBeInTheDocument();
      expect(
        screen.getByText('施術メニュー別収益ランキング')
      ).toBeInTheDocument();
      expect(
        screen.getByText('時間帯別・曜日別収益パターン')
      ).toBeInTheDocument();
      expect(screen.getByText('売上文脈')).toBeInTheDocument();
      expect(screen.getByText('売上区分別サマリ')).toBeInTheDocument();
      expect(screen.getByText('来院状況')).toBeInTheDocument();
      expect(screen.getByText('療養費・売上見込み')).toBeInTheDocument();
      expect(screen.getByText('前年同期比較と成長率')).toBeInTheDocument();
      expect(
        screen.getByText('収益予測とシミュレーション')
      ).toBeInTheDocument();
      expect(screen.getByText('コスト分析')).toBeInTheDocument();
      expect(screen.getByText('施術者別収益貢献度')).toBeInTheDocument();
    });

    test('should display insurance and self-pay revenue', () => {
      render(<RevenuePage />);

      expect(screen.getByText('保険診療:')).toBeInTheDocument();
      expect(screen.getByText('2,520,000')).toBeInTheDocument();
      expect(screen.getByText('自費診療:')).toBeInTheDocument();
      expect(screen.getByText('1,680,000')).toBeInTheDocument();
    });

    test('should display menu ranking', () => {
      render(<RevenuePage />);

      expect(screen.getByText('整体')).toBeInTheDocument();
      expect(screen.getByText('1,200,000')).toBeInTheDocument();
      expect(screen.getByText('マッサージ')).toBeInTheDocument();
      expect(screen.getByText('800,000')).toBeInTheDocument();
      expect(screen.getByText('鍼灸')).toBeInTheDocument();
      expect(screen.getByText('600,000')).toBeInTheDocument();
    });

    test('should display revenue context summary', () => {
      render(<RevenuePage />);

      expect(screen.getAllByText('交通事故').length).toBeGreaterThan(0);
      expect(screen.getAllByText('90,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('労災').length).toBeGreaterThan(0);
      expect(screen.getAllByText('50,000').length).toBeGreaterThan(0);
      expect(screen.getByText('物販')).toBeInTheDocument();
      expect(screen.getByText('120,000')).toBeInTheDocument();
      expect(screen.getByText('回数券')).toBeInTheDocument();
      expect(screen.getByText('300,000')).toBeInTheDocument();
    });

    test('should display care episode metrics', () => {
      render(<RevenuePage />);

      expect(screen.getByText('通院回数')).toBeInTheDocument();
      expect(screen.getByText('初診2回目到達率')).toBeInTheDocument();
      expect(screen.getByText('初診5回目到達率')).toBeInTheDocument();
      expect(screen.getByText('通院あたり平均売上')).toBeInTheDocument();
      expect(screen.getByText('52,000')).toBeInTheDocument();
      expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    });

    test('should display revenue estimate summary with disclaimer', () => {
      render(<RevenuePage />);

      expect(screen.getByText('療養費・売上見込み')).toBeInTheDocument();
      expect(
        screen.getByText('経営分析用の概算です。請求確定額ではありません。')
      ).toBeInTheDocument();
      expect(screen.getByText('見込み合計')).toBeInTheDocument();
      expect(screen.getByText('240,000')).toBeInTheDocument();
      expect(screen.getByText('計算済み')).toBeInTheDocument();
      expect(screen.getByText('見込み件数')).toBeInTheDocument();
      expect(screen.getAllByText('警告').length).toBeGreaterThan(0);
      expect(screen.getByText('上書き')).toBeInTheDocument();
    });

    test('should display revenue breakdown summary by amount role', () => {
      render(<RevenuePage />);

      expect(screen.getByText('売上見込み内訳')).toBeInTheDocument();
      expect(screen.getAllByText('患者負担見込み').length).toBeGreaterThan(0);
      expect(screen.getAllByText('72,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('保険者請求見込み').length).toBeGreaterThan(0);
      expect(screen.getAllByText('168,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('交通事故概算').length).toBeGreaterThan(0);
      expect(screen.getAllByText('90,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('12件').length).toBeGreaterThan(0);
    });

    test('admin should display revenue estimate amount details', () => {
      mockUseUserProfile.mockReturnValue({
        profile: {
          ...mockUserProfile.profile,
          role: 'admin',
          isAdmin: true,
        },
        loading: false,
        error: null,
      });

      render(<RevenuePage />);

      expect(screen.getByText('療養費・売上見込み詳細')).toBeInTheDocument();
      expect(screen.getByText('佐藤 花子')).toBeInTheDocument();
      expect(screen.getByText('交通事故施術')).toBeInTheDocument();
      expect(
        screen.getByText('交通事故: 手入力概算・要確認')
      ).toBeInTheDocument();
      expect(
        screen.getByText('手入力概算 / 公式マスタ自動単価ではありません')
      ).toBeInTheDocument();
      expect(screen.getByText('交通事故概算: 9,000')).toBeInTheDocument();
      expect(screen.queryByText('JUDO_TRAFFIC_202606')).not.toBeInTheDocument();
      expect(screen.queryByText('請求確定額')).not.toBeInTheDocument();
    });

    test('clinic_admin should display revenue estimate amount details', () => {
      mockUseUserProfile.mockReturnValue({
        profile: {
          ...mockUserProfile.profile,
          role: 'clinic_admin',
          isAdmin: true,
        },
        loading: false,
        error: null,
      });

      render(<RevenuePage />);

      expect(screen.getByText('療養費・売上見込み詳細')).toBeInTheDocument();
    });

    test('manager should not display revenue estimate amount details even when isAdmin is true', async () => {
      mockUseUserProfile.mockReturnValue({
        profile: {
          ...mockUserProfile.profile,
          role: 'manager',
          isAdmin: true,
        },
        loading: false,
        error: null,
      });

      render(<RevenuePage />);

      expect(
        screen.queryByText('療養費・売上見込み詳細')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('佐藤 花子')).not.toBeInTheDocument();
      expect(
        await screen.findByText('担当院の売上推移と収益構造を確認できます。')
      ).toBeInTheDocument();
    });

    test('manager without primary clinic should render manager revenue analysis', async () => {
      jest.clearAllMocks();
      mockUseUserProfile.mockReturnValue({
        profile: {
          ...mockUserProfile.profile,
          role: 'manager',
          clinicId: null,
          isAdmin: true,
        },
        loading: false,
        error: null,
      });
      mockUseManagerRevenueAnalysis.mockReturnValue({
        data: mockManagerRevenueAnalysisData,
        loading: false,
        error: null,
        selectedClinicId: mockClinicId,
        setSelectedClinicId: jest.fn(),
        refetch: resolvedRefetch,
      });

      render(<RevenuePage />);

      expect(
        await screen.findByText('担当院の売上推移と収益構造を確認できます。')
      ).toBeInTheDocument();
      expect(screen.getByText('担当院数')).toBeInTheDocument();
      expect(
        screen.getByText('前期間 2026-05-21 - 2026-05-31')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('店舗情報が設定されていません')
      ).not.toBeInTheDocument();
      expect(mockUseRevenue).not.toHaveBeenCalled();
    });

    test('should display hourly and daily patterns', () => {
      render(<RevenuePage />);

      expect(screen.getByText('時間帯別収益:')).toBeInTheDocument();
      expect(screen.getByText('ピーク: 14:00-16:00')).toBeInTheDocument();
      expect(screen.getByText('曜日別収益:')).toBeInTheDocument();
      expect(screen.getByText('ピーク: 金曜日')).toBeInTheDocument();
    });

    test('should display year-over-year comparison', () => {
      render(<RevenuePage />);

      expect(screen.getByText('前年同期売上:')).toBeInTheDocument();
      expect(screen.getByText('3,800,000')).toBeInTheDocument();
      expect(screen.getByText('成長率:')).toBeInTheDocument();
      expect(screen.getByText('+10.5%')).toBeInTheDocument();
    });

    test('should display revenue forecast', () => {
      render(<RevenuePage />);

      expect(screen.getByText('予測収益:')).toBeInTheDocument();
      expect(screen.getByText('4,500,000')).toBeInTheDocument();
    });

    test('should display cost analysis', () => {
      render(<RevenuePage />);

      expect(screen.getByText('人件費率:')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });

    test('should display staff revenue contribution', () => {
      render(<RevenuePage />);

      expect(screen.getByText('貢献度:')).toBeInTheDocument();
      expect(screen.getByText('田中: 28%, 佐藤: 25%')).toBeInTheDocument();
    });

    test('should call useRevenue with clinicId from profile', () => {
      render(<RevenuePage />);

      expect(mockUseRevenue).toHaveBeenCalledWith(mockClinicId, {
        enabled: true,
      });
    });

    test('should call useRevenue with selected active clinic when selected', () => {
      renderRevenuePageWithSelectedClinic();

      expect(mockUseRevenue).toHaveBeenCalledWith(selectedClinicId, {
        enabled: true,
      });
      expect(mockUseRevenueEstimateDetails).toHaveBeenCalledWith(
        selectedClinicId,
        'clinic_admin',
        { enabled: true }
      );
    });
  });

  describe('ローディング状態', () => {
    test('should display loading state when profile is loading', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        loading: true,
        error: null,
      });

      render(<RevenuePage />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    test('should display loading state when revenue data is loading', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        loading: true,
      });

      render(<RevenuePage />);

      expect(screen.getByText('収益データを読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    test('should display error when profile fetch fails', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        loading: false,
        error: '認証が必要です',
      });

      render(<RevenuePage />);

      expect(screen.getByText('エラー: 認証が必要です')).toBeInTheDocument();
    });

    test('should display error when revenue fetch fails', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        loading: false,
        error: '収益データの取得に失敗しました',
      });

      render(<RevenuePage />);

      expect(
        screen.getByText('エラー: 収益データの取得に失敗しました')
      ).toBeInTheDocument();
    });

    test('should display message when clinicId is not set', () => {
      mockUseUserProfile.mockReturnValue({
        profile: {
          id: 'user-1',
          email: 'test@example.com',
          role: 'clinic_admin',
          clinicId: null,
          isActive: true,
          isAdmin: false,
        },
        loading: false,
        error: null,
      });

      render(<RevenuePage />);

      expect(
        screen.getByText('店舗情報が設定されていません')
      ).toBeInTheDocument();
    });
  });

  describe('空データの表示', () => {
    test('should display empty state for menu ranking', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        menuRanking: [],
      });

      render(<RevenuePage />);

      expect(screen.getByText('データがありません')).toBeInTheDocument();
    });
  });
});
