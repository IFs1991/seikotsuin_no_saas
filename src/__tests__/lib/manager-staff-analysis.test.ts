import {
  buildManagerStaffAnalysis,
  calculateManagerStaffChangeRate,
  dateIsWithinManagerStaffPeriod,
  resolveManagerStaffAnalysisPeriod,
} from '@/lib/manager-staff-analysis';
import type {
  DailyReportItemMetricRecord,
  ManagerStaffAnalysisClinic,
  ReservationMetricRecord,
  StaffResourceRecord,
  StaffShiftMetricRecord,
} from '@/types/manager-staff-analysis';

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const staffA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const staffB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const staffDeleted = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const clinics: ManagerStaffAnalysisClinic[] = [
  { id: clinicA, name: '池袋院' },
  { id: clinicB, name: '新宿院' },
];

const staffResources: StaffResourceRecord[] = [
  {
    id: staffA,
    name: '池袋 太郎',
    clinicId: clinicA,
    clinicName: '池袋院',
    isActive: true,
    isDeleted: false,
    isBookable: true,
  },
  {
    id: staffB,
    name: '新宿 花子',
    clinicId: clinicB,
    clinicName: '新宿院',
    isActive: true,
    isDeleted: false,
    isBookable: false,
  },
  {
    id: staffDeleted,
    name: '削除済み',
    clinicId: clinicA,
    clinicName: '池袋院',
    isActive: true,
    isDeleted: true,
    isBookable: true,
  },
];

const reservations: ReservationMetricRecord[] = [
  {
    id: 'reservation-a-1',
    clinicId: clinicA,
    staffId: staffA,
    status: 'completed',
    startsAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'reservation-a-2',
    clinicId: clinicA,
    staffId: staffA,
    status: 'canceled',
    startsAt: '2026-06-02T00:00:00.000Z',
  },
  {
    id: 'reservation-b-1',
    clinicId: clinicB,
    staffId: staffB,
    status: 'arrived',
    startsAt: '2026-06-03T00:00:00.000Z',
  },
];

const shifts: StaffShiftMetricRecord[] = [
  {
    id: 'shift-b',
    clinicId: clinicB,
    staffId: staffB,
    shiftDate: '2026-06-03T00:00:00.000Z',
  },
];

const dailyReportItems: DailyReportItemMetricRecord[] = [
  {
    id: 'item-a',
    clinicId: clinicA,
    staffResourceId: staffA,
    reportDate: '2026-06-01',
    fee: 10000,
  },
  {
    id: 'item-null',
    clinicId: clinicA,
    staffResourceId: null,
    reportDate: '2026-06-01',
    fee: 99999,
  },
  {
    id: 'item-b',
    clinicId: clinicB,
    staffResourceId: staffB,
    reportDate: '2026-06-03',
    fee: 5000,
  },
];

function build(
  overrides: Partial<Parameters<typeof buildManagerStaffAnalysis>[0]> = {}
) {
  const period = resolveManagerStaffAnalysisPeriod(
    { type: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' },
    'previous_period',
    new Date('2026-06-12T00:00:00.000Z')
  );

  return buildManagerStaffAnalysis({
    generatedAt: '2026-06-12T00:00:00.000Z',
    period,
    target: 'total',
    requestedClinicId: null,
    assignedClinics: clinics,
    staffResources,
    reservations,
    shifts,
    dailyReportItems,
    previousReservations: [
      {
        id: 'previous-a-1',
        clinicId: clinicA,
        staffId: staffA,
        status: 'completed',
        startsAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'previous-a-2',
        clinicId: clinicA,
        staffId: staffA,
        status: 'completed',
        startsAt: '2026-05-02T00:00:00.000Z',
      },
      {
        id: 'previous-a-3',
        clinicId: clinicA,
        staffId: staffA,
        status: 'completed',
        startsAt: '2026-05-03T00:00:00.000Z',
      },
      {
        id: 'previous-a-4',
        clinicId: clinicA,
        staffId: staffA,
        status: 'completed',
        startsAt: '2026-05-04T00:00:00.000Z',
      },
    ],
    previousDailyReportItems: [
      {
        id: 'previous-item-a',
        clinicId: clinicA,
        staffResourceId: staffA,
        reportDate: '2026-05-01',
        fee: 20000,
      },
    ],
    ...overrides,
  });
}

describe('manager staff analysis builder', () => {
  it('uses resources.id as staffId and excludes deleted staff resources', () => {
    const response = build();

    expect(response.staff.map(row => row.staffId)).toEqual([staffA, staffB]);
    expect(response.staff.map(row => row.staffId)).not.toContain(staffDeleted);
  });

  it('aggregates reservations and staff-attributed daily report item revenue', () => {
    const response = build();

    expect(response.summary).toMatchObject({
      staffCount: 2,
      workingStaffCount: 2,
      reservationCount: 3,
      completedReservationCount: 2,
      totalRevenue: 15000,
      averageUnitPrice: 7500,
    });
    expect(response.staff.find(row => row.staffId === staffA)).toMatchObject({
      reservationCount: 2,
      completedReservationCount: 1,
      totalRevenue: 10000,
      cancellationRate: 0.5,
    });
    expect(response.summary.totalRevenue).not.toBe(109999);
  });

  it('generates attention items for high cancellation and previous-period drops', () => {
    const response = build();
    const staffAttentionTypes = response.attentionItems
      .filter(item => item.staffId === staffA)
      .map(item => item.type);

    expect(staffAttentionTypes).toEqual([
      'high_cancellation_rate',
      'reservation_drop',
      'revenue_drop',
    ]);
    expect(response.staff.find(row => row.staffId === staffA)?.status).toBe(
      'needs_attention'
    );
  });

  it('does not include dailyReportStatus on staff rows', () => {
    const response = build();
    const firstStaff = response.staff[0];

    expect('dailyReportStatus' in firstStaff).toBe(false);
  });

  it('returns empty data for a manager with no active assignments', () => {
    const response = build({
      assignedClinics: [],
      staffResources: [],
      reservations: [],
      shifts: [],
      dailyReportItems: [],
      previousReservations: [],
      previousDailyReportItems: [],
    });

    expect(response.scope.clinics).toEqual([]);
    expect(response.summary.staffCount).toBe(0);
    expect(response.staff).toEqual([]);
    expect(response.disclaimers).toContain(
      'スタッフ別売上は daily_report_items.staff_resource_id に紐づく明細のみを集計しています。'
    );
  });

  it('chooses buckets using the shared manager period rule', () => {
    const daily = resolveManagerStaffAnalysisPeriod(
      { type: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' },
      'none'
    );
    const weekly = resolveManagerStaffAnalysisPeriod(
      { type: 'custom', startDate: '2026-01-01', endDate: '2026-03-31' },
      'none'
    );
    const monthly = resolveManagerStaffAnalysisPeriod(
      { type: 'custom', startDate: '2026-01-01', endDate: '2026-12-31' },
      'none'
    );

    expect(daily.bucket).toBe('daily');
    expect(weekly.bucket).toBe('weekly');
    expect(monthly.bucket).toBe('monthly');
  });

  it('returns null change rate when previous value is zero', () => {
    expect(calculateManagerStaffChangeRate(10, 0)).toBeNull();
  });

  it('treats timestamps as JST dates at period boundaries', () => {
    const period = { startDate: '2026-06-01', endDate: '2026-06-30' };

    // 2026-05-31T15:30:00Z = 2026-06-01 00:30 JST → 期間内
    expect(
      dateIsWithinManagerStaffPeriod('2026-05-31T15:30:00.000Z', period)
    ).toBe(true);
    // 2026-06-30T15:30:00Z = 2026-07-01 00:30 JST → 期間外
    expect(
      dateIsWithinManagerStaffPeriod('2026-06-30T15:30:00.000Z', period)
    ).toBe(false);
    // date-only 文字列はそのまま比較する
    expect(dateIsWithinManagerStaffPeriod('2026-06-01', period)).toBe(true);
    expect(dateIsWithinManagerStaffPeriod('2026-05-31', period)).toBe(false);
  });

  it('counts reservations in the JST early morning of the first period day', () => {
    const response = build({
      reservations: [
        {
          id: 'reservation-jst-boundary',
          clinicId: clinicA,
          staffId: staffA,
          status: 'completed',
          // 2026-06-01 00:30 JST
          startsAt: '2026-05-31T15:30:00.000Z',
        },
      ],
    });

    const trendDates = response.trends.map(point => point.date);
    expect(trendDates).toContain('2026-06-01');
    expect(trendDates).not.toContain('2026-05-31');
  });
});
