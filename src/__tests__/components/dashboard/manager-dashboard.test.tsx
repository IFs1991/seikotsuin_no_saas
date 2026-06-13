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

function getRenderedHrefs(): string[] {
  return screen
    .getAllByRole('link')
    .map(link => link.getAttribute('href'))
    .filter((href): href is string => href !== null);
}

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

  it('renders daily report status panel grouped by status', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        clinics: [
          { id: 'clinic-a', name: '池袋院' },
          { id: 'clinic-b', name: '渋谷院' },
          { id: 'clinic-c', name: '新宿院' },
        ],
        summary: {
          ...data.summary,
          assignedClinicCount: 3,
          submittedDailyReportCount: 1,
          missingDailyReportCount: 1,
          needsReviewCount: 1,
        },
        clinicCards: [
          data.clinicCards[0],
          {
            ...data.clinicCards[0],
            clinicId: 'clinic-b',
            clinicName: '渋谷院',
            dailyReportStatus: 'missing',
            links: {
              dailyReports: '/daily-reports?clinic_id=clinic-b',
              reservations: '/reservations?view=timeline&clinic_id=clinic-b',
              patients: '/patients?clinic_id=clinic-b',
              revenue: '/revenue?clinic_id=clinic-b',
            },
          },
          {
            ...data.clinicCards[0],
            clinicId: 'clinic-c',
            clinicName: '新宿院',
            dailyReportStatus: 'submitted',
            links: {
              dailyReports: '/daily-reports?clinic_id=clinic-c',
              reservations: '/reservations?view=timeline&clinic_id=clinic-c',
              patients: '/patients?clinic_id=clinic-c',
              revenue: '/revenue?clinic_id=clinic-c',
            },
          },
        ],
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(
      screen.getByRole('heading', { name: '日報提出状況' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '未提出院' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '要確認院' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '渋谷院' })).toHaveAttribute(
      'href',
      '/daily-reports?clinic_id=clinic-b'
    );
    expect(screen.getAllByRole('link', { name: '池袋院' })[0]).toHaveAttribute(
      'href',
      '/daily-reports?clinic_id=clinic-a'
    );
  });

  it('renders daily report panel empty states', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        summary: {
          ...data.summary,
          submittedDailyReportCount: 1,
          missingDailyReportCount: 0,
          needsReviewCount: 0,
        },
        attentionItems: [],
        clinicCards: [
          {
            ...data.clinicCards[0],
            dailyReportStatus: 'submitted',
          },
        ],
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(screen.getByText('未提出の日報はありません')).toBeInTheDocument();
    expect(screen.getByText('要確認の日報はありません')).toBeInTheDocument();
  });

  it('renders clinic health badges from attention severity', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        clinics: [
          { id: 'clinic-a', name: '池袋院' },
          { id: 'clinic-b', name: '渋谷院' },
          { id: 'clinic-c', name: '新宿院' },
        ],
        attentionItems: [
          data.attentionItems[0],
          {
            ...data.attentionItems[1],
            clinicId: 'clinic-b',
            clinicName: '渋谷院',
          },
        ],
        clinicCards: [
          data.clinicCards[0],
          {
            ...data.clinicCards[0],
            clinicId: 'clinic-b',
            clinicName: '渋谷院',
            links: {
              dailyReports: '/daily-reports?clinic_id=clinic-b',
              reservations: '/reservations?view=timeline&clinic_id=clinic-b',
              patients: '/patients?clinic_id=clinic-b',
              revenue: '/revenue?clinic_id=clinic-b',
            },
          },
          {
            ...data.clinicCards[0],
            clinicId: 'clinic-c',
            clinicName: '新宿院',
            links: {
              dailyReports: '/daily-reports?clinic_id=clinic-c',
              reservations: '/reservations?view=timeline&clinic_id=clinic-c',
              patients: '/patients?clinic_id=clinic-c',
              revenue: '/revenue?clinic_id=clinic-c',
            },
          },
        ],
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(screen.getAllByText('緊急')).not.toHaveLength(0);
    expect(screen.getAllByText('注意')).not.toHaveLength(0);
    expect(screen.getByText('正常')).toBeInTheDocument();
  });

  it('renders manager shortcuts without admin users link', () => {
    render(<ManagerDashboard />);

    const hrefs = getRenderedHrefs();
    expect(hrefs).not.toContain('/admin/users');
    expect(hrefs).toContain('/manager/staff');
    expect(hrefs).toContain('/multi-store');
    expect(
      screen.getByRole('link', { name: /担当院スタッフ/ })
    ).toHaveAttribute('href', '/manager/staff');
  });

  it('renders comparison null copy separately from actual rate null copy', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        clinicCards: [
          {
            ...data.clinicCards[0],
            revenueChangeRateFromPreviousDay: null,
            reservationChangeRateFromPreviousWeekday: 0.123,
            cancellationRate: null,
          },
        ],
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(screen.getByText(/前日比 比較データなし/)).toBeInTheDocument();
    expect(screen.getByText(/前週同曜日比 \+12.3%/)).toBeInTheDocument();
    expect(screen.getByText('実績なし')).toBeInTheDocument();
  });

  it('shows remaining timeline count and expands timeline on demand', () => {
    useManagerDashboardMock.mockReturnValue({
      data: {
        ...data,
        timeline: Array.from({ length: 6 }, (_, index) => ({
          id: `timeline-${index + 1}`,
          occurredAt: `2026-06-12T03:0${index}:00.000Z`,
          clinicId: 'clinic-a',
          clinicName: '池袋院',
          type: 'needs_review',
          label: `タイムライン${index + 1}`,
          detail: `タイムライン詳細${index + 1}`,
          href: '/daily-reports?clinic_id=clinic-a',
        })),
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerDashboard />);

    expect(screen.getByText('タイムライン5')).toBeInTheDocument();
    expect(screen.queryByText('タイムライン6')).not.toBeInTheDocument();
    expect(
      screen.getByText('他に1件のタイムラインがあります')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'すべて表示' }));

    expect(screen.getByText('タイムライン6')).toBeInTheDocument();
    expect(
      screen.getByText('すべてのタイムラインを表示しています')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '折りたたむ' })
    ).toBeInTheDocument();
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
