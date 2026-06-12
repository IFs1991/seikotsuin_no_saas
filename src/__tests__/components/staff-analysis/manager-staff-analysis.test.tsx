import React from 'react';
import { render, screen } from '@testing-library/react';
import { ManagerStaffAnalysis } from '@/components/staff-analysis/manager-staff-analysis';
import { useManagerStaffAnalysis } from '@/hooks/useManagerStaffAnalysis';
import type { ManagerStaffAnalysisResponse } from '@/types/manager-staff-analysis';

jest.mock('@/hooks/useManagerStaffAnalysis', () => ({
  useManagerStaffAnalysis: jest.fn(),
}));

const useManagerStaffAnalysisMock = jest.mocked(useManagerStaffAnalysis);

const baseResponse: ManagerStaffAnalysisResponse = {
  generatedAt: '2026-06-12T00:00:00.000Z',
  period: {
    preset: 'month',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    bucket: 'daily',
    compare: 'previous_period',
  },
  scope: {
    target: 'total',
    clinicId: null,
    clinics: [{ id: 'clinic-a', name: '池袋院' }],
  },
  summary: {
    staffCount: 1,
    workingStaffCount: 1,
    reservationCount: 4,
    completedReservationCount: 3,
    totalRevenue: 30000,
    averageUnitPrice: 10000,
    cancellationRate: 0.25,
    dailyReportIssueCount: 0,
    revenueChangeRate: null,
    reservationChangeRate: null,
  },
  staff: [
    {
      staffId: 'staff-a',
      staffName: '池袋 太郎',
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      isActive: true,
      isBookable: true,
      reservationCount: 4,
      completedReservationCount: 3,
      totalRevenue: 30000,
      averageUnitPrice: 10000,
      cancellationRate: 0.25,
      revenueChangeRate: null,
      reservationChangeRate: null,
      status: 'needs_attention',
    },
  ],
  clinicComparison: [
    {
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      staffCount: 1,
      workingStaffCount: 1,
      reservationCount: 4,
      completedReservationCount: 3,
      totalRevenue: 30000,
      averageRevenuePerStaff: 30000,
      cancellationRate: 0.25,
      attentionStaffCount: 1,
    },
  ],
  trends: [],
  attentionItems: [],
  disclaimers: [
    'この画面は人事評価・給与査定・勤怠承認用ではありません。担当院の支援・状況把握を目的とした read-only 分析画面です。',
    '患者個人情報、スタッフの個人連絡先、権限情報はこの画面では表示しません。',
  ],
};

describe('ManagerStaffAnalysis', () => {
  beforeEach(() => {
    useManagerStaffAnalysisMock.mockReturnValue({
      data: baseResponse,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders title, filters, KPIs, tables, and disclaimers', () => {
    render(<ManagerStaffAnalysis />);

    expect(
      screen.getByRole('heading', { name: '担当院スタッフ分析' })
    ).toBeInTheDocument();
    expect(screen.getByText('池袋 太郎')).toBeInTheDocument();
    expect(screen.getByText('担当エリア全体')).toBeInTheDocument();
    expect(screen.getByText('スタッフ帰属売上')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'スタッフランキング' })
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '院別比較' })).toBeInTheDocument();
    expect(screen.getByText(baseResponse.disclaimers[0])).toBeInTheDocument();
  });

  it('shows no assigned clinics empty state', () => {
    useManagerStaffAnalysisMock.mockReturnValue({
      data: {
        ...baseResponse,
        scope: { target: 'total', clinicId: null, clinics: [] },
        staff: [],
        clinicComparison: [],
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ManagerStaffAnalysis />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
  });

  it('does not render write actions or personal contact fields', () => {
    render(<ManagerStaffAnalysis />);

    expect(screen.queryByText('スタッフ作成')).not.toBeInTheDocument();
    expect(screen.queryByText('権限変更')).not.toBeInTheDocument();
    expect(screen.queryByText('メール')).not.toBeInTheDocument();
    expect(screen.queryByText('電話')).not.toBeInTheDocument();
  });
});
