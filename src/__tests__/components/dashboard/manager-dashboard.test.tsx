/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManagerDashboard from '@/components/dashboard/manager-dashboard';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import type { ManagerDashboardResponse } from '@/types/manager-dashboard';

jest.mock('@/hooks/useManagerDashboard', () => ({
  useManagerDashboard: jest.fn(),
}));

const useManagerDashboardMock = jest.mocked(useManagerDashboard);
const refetch = jest.fn().mockResolvedValue(undefined);

const data: ManagerDashboardResponse = {
  generatedAt: '2026-06-12T03:00:00.000Z',
  date: {
    today: '2026-06-12',
    previousDay: '2026-06-11',
    previousWeekday: '2026-06-05',
    timezone: 'Asia/Tokyo',
  },
  clinics: [{ id: 'clinic-a', name: '池袋院' }],
  summary: {
    assignedClinicCount: 1,
    todayRevenue: 50000,
    todayVisitCount: 10,
    todayReservationCount: 8,
    submittedDailyReportCount: 0,
    missingDailyReportCount: 0,
    needsReviewCount: 1,
    lowRevenueClinicCount: 1,
    lowReservationClinicCount: 0,
    highCancellationClinicCount: 1,
  },
  attentionItems: [
    {
      id: 'critical',
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      type: 'high_cancellations',
      severity: 'critical',
      title: 'キャンセル率が高くなっています',
      description: '池袋院 の本日キャンセル率が25%以上です。',
      href: '/reservations?view=timeline&clinic_id=clinic-a',
    },
    {
      id: 'warning',
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      type: 'needs_review',
      severity: 'warning',
      title: '日報に要確認項目があります',
      description: '池袋院 の日報明細に確認が必要な項目があります。',
      href: '/daily-reports?clinic_id=clinic-a',
    },
  ],
  clinicCards: [
    {
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      todayRevenue: 50000,
      previousDayRevenue: 100000,
      todayVisitCount: 10,
      todayReservationCount: 8,
      previousWeekdayReservationCount: 10,
      todayCancellationCount: 4,
      dailyReportStatus: 'needs_review',
      revenueChangeRateFromPreviousDay: -0.5,
      reservationChangeRateFromPreviousWeekday: -0.2,
      cancellationRate: 0.3333333333,
      links: {
        dailyReports: '/daily-reports?clinic_id=clinic-a',
        reservations: '/reservations?view=timeline&clinic_id=clinic-a',
        patients: '/patients?clinic_id=clinic-a',
        revenue: '/revenue?clinic_id=clinic-a',
      },
    },
  ],
  timeline: [
    {
      id: 'timeline-1',
      occurredAt: '2026-06-12T03:00:00.000Z',
      clinicId: 'clinic-a',
      clinicName: '池袋院',
      type: 'needs_review',
      label: '日報に要確認項目があります',
      detail: '池袋院 の日報明細に確認が必要な項目があります。',
      href: '/daily-reports?clinic_id=clinic-a',
    },
  ],
};

describe('ManagerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useManagerDashboardMock.mockReturnValue({
      data,
      loading: false,
      error: null,
      refetch,
    });
  });

  it('renders manager dashboard title, description, KPIs, and clinic links', () => {
    render(<ManagerDashboard />);

    expect(screen.getByText('担当エリアダッシュボード')).toBeInTheDocument();
    expect(
      screen.getByText('担当院の今日の状況と確認すべき項目をまとめています。')
    ).toBeInTheDocument();
    expect(screen.getAllByText('¥50,000')).not.toHaveLength(0);
    expect(screen.getAllByText('10名')).not.toHaveLength(0);
    expect(screen.getAllByText('池袋院')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: '日報を見る' })).toHaveAttribute(
      'href',
      '/daily-reports?clinic_id=clinic-a'
    );
    expect(screen.getByRole('link', { name: '予約を見る' })).toHaveAttribute(
      'href',
      '/reservations?view=timeline&clinic_id=clinic-a'
    );
  });

  it('shows empty assignment state when clinics are empty', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        clinics: [],
        clinicCards: [],
        attentionItems: [],
        timeline: [],
        summary: {
          ...data.summary,
          assignedClinicCount: 0,
        },
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '管理者にマネージャー管理から担当店舗の設定を依頼してください。'
      )
    ).toBeInTheDocument();
  });

  it('renders attention items and calls refetch from reload button', () => {
    render(<ManagerDashboard />);

    expect(
      screen.getAllByText('キャンセル率が高くなっています')
    ).not.toHaveLength(0);
    expect(screen.getAllByText('日報に要確認項目があります')).not.toHaveLength(
      0
    );
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not render forbidden write actions', () => {
    render(<ManagerDashboard />);

    expect(screen.queryByText('日報入力')).not.toBeInTheDocument();
    expect(screen.queryByText('新規予約')).not.toBeInTheDocument();
    expect(screen.queryByText('患者作成')).not.toBeInTheDocument();
    expect(screen.queryByText('売上編集')).not.toBeInTheDocument();
    expect(screen.queryByText('担当院割当')).not.toBeInTheDocument();
  });
});
