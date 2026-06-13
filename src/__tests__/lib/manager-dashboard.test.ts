import {
  buildClinicLinks,
  buildManagerDashboardResponse,
  calculateCancellationRate,
  calculateChangeRate,
  generateAttentionItems,
  getManagerDashboardDateKeys,
  resolveDailyReportStatus,
  sortAttentionItems,
} from '@/lib/manager-dashboard';
import type {
  ManagerDashboardAttentionItem,
  ManagerDashboardClinicCard,
} from '@/types/manager-dashboard';

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

function clinicCard(
  overrides: Partial<ManagerDashboardClinicCard> = {}
): ManagerDashboardClinicCard {
  const clinicId = overrides.clinicId ?? clinicA;
  const revenueChangeRateFromPreviousDay =
    'revenueChangeRateFromPreviousDay' in overrides
      ? (overrides.revenueChangeRateFromPreviousDay ?? null)
      : 0;
  const reservationChangeRateFromPreviousWeekday =
    'reservationChangeRateFromPreviousWeekday' in overrides
      ? (overrides.reservationChangeRateFromPreviousWeekday ?? null)
      : 0;
  const cancellationRate =
    'cancellationRate' in overrides ? (overrides.cancellationRate ?? null) : 0;

  return {
    clinicId,
    clinicName: overrides.clinicName ?? '池袋院',
    todayRevenue: overrides.todayRevenue ?? 100000,
    previousDayRevenue: overrides.previousDayRevenue ?? 100000,
    todayVisitCount: overrides.todayVisitCount ?? 10,
    todayReservationCount: overrides.todayReservationCount ?? 8,
    previousWeekdayReservationCount:
      overrides.previousWeekdayReservationCount ?? 8,
    todayCancellationCount: overrides.todayCancellationCount ?? 0,
    dailyReportStatus: overrides.dailyReportStatus ?? 'submitted',
    revenueChangeRateFromPreviousDay,
    reservationChangeRateFromPreviousWeekday,
    cancellationRate,
    links: overrides.links ?? buildClinicLinks(clinicId),
  };
}

describe('manager-dashboard domain', () => {
  it('calculates JST today, previous day, and previous weekday', () => {
    const date = getManagerDashboardDateKeys(
      new Date('2026-06-11T15:30:00.000Z')
    );

    expect(date).toEqual({
      today: '2026-06-12',
      previousDay: '2026-06-11',
      previousWeekday: '2026-06-05',
      timezone: 'Asia/Tokyo',
    });
  });

  it('calculates change and cancellation rates', () => {
    expect(calculateChangeRate(70, 100)).toBe(-0.3);
    expect(calculateChangeRate(0, 0)).toBeNull();
    expect(calculateCancellationRate(3, 1)).toBe(0.25);
    expect(calculateCancellationRate(0, 0)).toBeNull();
  });

  it('generates threshold based attention items', () => {
    const items = generateAttentionItems({
      clinicCards: [
        clinicCard({
          dailyReportStatus: 'missing',
          revenueChangeRateFromPreviousDay: -0.5,
          reservationChangeRateFromPreviousWeekday: -0.3,
          todayReservationCount: 2,
          todayCancellationCount: 2,
          cancellationRate: 0.5,
        }),
      ],
    });

    expect(items.map(item => item.type)).toEqual([
      'high_cancellations',
      'low_revenue',
      'missing_daily_report',
      'low_reservations',
    ]);
    expect(items[0]?.severity).toBe('critical');
  });

  it('generates critical zero reservation attention when previous weekday had reservations', () => {
    const items = generateAttentionItems({
      clinicCards: [
        clinicCard({
          todayReservationCount: 0,
          previousWeekdayReservationCount: 8,
          reservationChangeRateFromPreviousWeekday: -1,
        }),
      ],
    });

    const reservationItems = items.filter(
      item => item.type === 'low_reservations'
    );
    expect(reservationItems).toHaveLength(1);
    expect(reservationItems[0]).toMatchObject({
      severity: 'critical',
      title: '本日の予約がまだありません',
      description: '池袋院 の本日の予約がまだ登録されていません。',
    });
  });

  it('generates warning zero reservation attention without previous weekday baseline', () => {
    const items = generateAttentionItems({
      clinicCards: [
        clinicCard({
          todayReservationCount: 0,
          previousWeekdayReservationCount: 0,
          reservationChangeRateFromPreviousWeekday: null,
        }),
      ],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'low_reservations',
          severity: 'warning',
          title: '本日の予約がまだありません',
        }),
      ])
    );
  });

  it('does not generate zero reservation attention when reservations exist', () => {
    const items = generateAttentionItems({
      clinicCards: [
        clinicCard({
          todayReservationCount: 1,
          previousWeekdayReservationCount: 0,
          reservationChangeRateFromPreviousWeekday: null,
        }),
      ],
    });

    expect(items.some(item => item.type === 'low_reservations')).toBe(false);
  });

  it('sorts attention items by severity, clinic name, and type', () => {
    const items: ManagerDashboardAttentionItem[] = [
      {
        id: 'warning-b',
        clinicId: clinicB,
        clinicName: '渋谷院',
        type: 'needs_review',
        severity: 'warning',
        title: '',
        description: '',
        href: '#',
      },
      {
        id: 'critical-a',
        clinicId: clinicA,
        clinicName: '池袋院',
        type: 'missing_daily_report',
        severity: 'critical',
        title: '',
        description: '',
        href: '#',
      },
    ];

    expect(sortAttentionItems(items).map(item => item.id)).toEqual([
      'critical-a',
      'warning-b',
    ]);
  });

  it('resolves daily report status from row existence and review signal', () => {
    expect(
      resolveDailyReportStatus({ todayReport: null, hasReviewSignal: false })
    ).toBe('missing');
    expect(
      resolveDailyReportStatus({
        todayReport: {
          id: 'report-1',
          clinic_id: clinicA,
          report_date: '2026-06-12',
          total_patients: 10,
          total_revenue: 100000,
          insurance_revenue: 30000,
          private_revenue: 70000,
          updated_at: '2026-06-12T10:00:00.000Z',
        },
        hasReviewSignal: true,
      })
    ).toBe('needs_review');
  });

  it('builds summary and timeline from assigned clinic scoped rows', () => {
    const response = buildManagerDashboardResponse({
      generatedAt: '2026-06-12T03:00:00.000Z',
      date: {
        today: '2026-06-12',
        previousDay: '2026-06-11',
        previousWeekday: '2026-06-05',
        timezone: 'Asia/Tokyo',
      },
      clinics: [
        { id: clinicA, name: '池袋院' },
        { id: clinicB, name: '渋谷院' },
      ],
      dailyReports: [
        {
          id: 'today-a',
          clinic_id: clinicA,
          report_date: '2026-06-12',
          total_patients: 12,
          total_revenue: 70000,
          insurance_revenue: 30000,
          private_revenue: 40000,
          updated_at: '2026-06-12T02:00:00.000Z',
        },
        {
          id: 'previous-a',
          clinic_id: clinicA,
          report_date: '2026-06-11',
          total_patients: 10,
          total_revenue: 100000,
          insurance_revenue: 40000,
          private_revenue: 60000,
          updated_at: '2026-06-11T02:00:00.000Z',
        },
      ],
      reviewSignals: [
        {
          clinic_id: clinicA,
          report_date: '2026-06-12',
          estimate_status: 'needs_review',
          updated_at: '2026-06-12T02:30:00.000Z',
        },
      ],
      reservations: [
        {
          id: 'reservation-today',
          clinic_id: clinicA,
          start_time: '2026-06-12T01:00:00.000Z',
          status: 'confirmed',
        },
        {
          id: 'reservation-previous',
          clinic_id: clinicA,
          start_time: '2026-06-05T01:00:00.000Z',
          status: 'confirmed',
        },
      ],
    });

    expect(response.summary).toMatchObject({
      assignedClinicCount: 2,
      todayRevenue: 70000,
      todayVisitCount: 12,
      todayReservationCount: 1,
      submittedDailyReportCount: 0,
      missingDailyReportCount: 1,
      needsReviewCount: 1,
      lowRevenueClinicCount: 1,
    });
    expect(response.clinicCards[0]?.links.revenue).toBe(
      `/revenue?clinic_id=${clinicA}`
    );
    expect(response.timeline.map(item => item.type)).toEqual(
      expect.arrayContaining([
        'daily_report_submitted',
        'needs_review',
        'daily_report_missing',
      ])
    );
  });
});
