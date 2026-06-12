import {
  buildManagerClinicComparison,
  parseManagerClinicComparisonQuery,
  resolveManagerClinicComparisonPeriod,
  resolveManagerClinicComparisonPreviousPeriod,
} from '@/lib/manager-clinic-comparison';
import type { ManagerRevenuePeriodTotalsRow } from '@/lib/manager-revenue-analysis';

function revenueRow(
  clinicId: string,
  operatingRevenue: number
): ManagerRevenuePeriodTotalsRow {
  return {
    clinic_id: clinicId,
    operating_revenue: operatingRevenue,
    insurance_revenue: 0,
    private_revenue: 0,
    product_revenue: 0,
    ticket_revenue: 0,
    traffic_accident_revenue: 0,
    workers_comp_revenue: 0,
    patient_copay_estimated: 0,
    insurer_receivable_estimated: 0,
    private_revenue_estimated: 0,
    visit_count: 0,
    report_days: 0,
    missing_report_days: 0,
    needs_review_count: 0,
    blocked_count: 0,
    first_report_date: null,
  };
}

describe('manager clinic comparison builder', () => {
  it('builds assignment-scoped clinic rows with previous-period rates', () => {
    const response = buildManagerClinicComparison({
      generatedAt: '2026-06-13T00:00:00.000Z',
      period: {
        type: 'custom',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        bucket: 'daily',
        compare: 'previous_period',
      },
      clinics: [
        { id: 'clinic-b', name: '横浜院' },
        { id: 'clinic-a', name: '池袋院' },
      ],
      currentRevenueTotals: [
        revenueRow('clinic-a', 150000),
        revenueRow('clinic-b', 100000),
        revenueRow('unassigned-clinic', 999999),
      ],
      previousRevenueTotals: [
        revenueRow('clinic-a', 100000),
        revenueRow('clinic-b', 100000),
      ],
      reservations: [
        { id: 'reservation-a', clinicId: 'clinic-a', status: 'completed' },
        { id: 'reservation-b', clinicId: 'clinic-a', status: 'cancelled' },
        { id: 'reservation-c', clinicId: 'clinic-b', status: 'confirmed' },
        {
          id: 'reservation-outside',
          clinicId: 'unassigned-clinic',
          status: 'completed',
        },
      ],
      previousReservations: [
        { id: 'previous-a', clinicId: 'clinic-a', status: 'completed' },
        { id: 'previous-b', clinicId: 'clinic-b', status: 'completed' },
        { id: 'previous-c', clinicId: 'clinic-b', status: 'completed' },
      ],
    });

    expect(response.rows).toEqual([
      {
        clinicId: 'clinic-a',
        clinicName: '池袋院',
        totalRevenue: 150000,
        reservationCount: 2,
        completedReservationCount: 1,
        cancellationRate: 50,
        revenueChangeRate: 50,
        reservationChangeRate: 100,
      },
      {
        clinicId: 'clinic-b',
        clinicName: '横浜院',
        totalRevenue: 100000,
        reservationCount: 1,
        completedReservationCount: 0,
        cancellationRate: 0,
        revenueChangeRate: 0,
        reservationChangeRate: -50,
      },
    ]);
  });

  it('validates period and compare query values', () => {
    expect(
      parseManagerClinicComparisonQuery(
        new URLSearchParams('period=custom&start_date=2026-06-01')
      )
    ).toEqual({
      success: false,
      message: 'custom 期間では start_date と end_date が必須です',
    });

    expect(
      parseManagerClinicComparisonQuery(
        new URLSearchParams(
          'period=custom&start_date=2026-06-01&end_date=2026-06-30&compare=bad'
        )
      )
    ).toEqual({
      success: false,
      message: 'compare の値が正しくありません',
    });
  });

  it('resolves previous-period bounds', () => {
    const period = resolveManagerClinicComparisonPeriod(
      {
        type: 'custom',
        startDate: '2026-06-10',
        endDate: '2026-06-12',
      },
      'previous_period'
    );

    expect(resolveManagerClinicComparisonPreviousPeriod(period)).toEqual({
      active: true,
      previousStartDate: '2026-06-07',
      previousEndDate: '2026-06-09',
    });
  });
});
