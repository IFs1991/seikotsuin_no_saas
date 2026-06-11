import {
  buildManagerRevenueAnalysis,
  parseManagerRevenueAnalysisQuery,
  resolveManagerRevenueAnalysisPeriod,
  resolveManagerRevenueComparisonPeriod,
  type ManagerRevenueAssignedClinic,
  type ManagerRevenueContextBreakdownRow,
  type ManagerRevenuePeriodSeriesRow,
  type ManagerRevenuePeriodTotalsRow,
} from '@/lib/manager-revenue-analysis';

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const clinicC = '33333333-3333-4333-8333-333333333333';

const assignedClinics: ManagerRevenueAssignedClinic[] = [
  { id: clinicB, name: '渋谷院' },
  { id: clinicA, name: '池袋院' },
];

function totals(
  clinicId: string,
  params: Partial<ManagerRevenuePeriodTotalsRow> = {}
): ManagerRevenuePeriodTotalsRow {
  return {
    clinic_id: clinicId,
    operating_revenue: 0,
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
    ...params,
  };
}

describe('parseManagerRevenueAnalysisQuery', () => {
  it('validates target, clinic, compare, and shared custom period rules', () => {
    expect(
      parseManagerRevenueAnalysisQuery(
        new URLSearchParams(`target=total&clinic_id=${clinicA}`)
      )
    ).toMatchObject({
      success: true,
      query: {
        clinicId: clinicA,
        target: 'total',
        compare: 'previous_period',
      },
    });
    expect(
      parseManagerRevenueAnalysisQuery(new URLSearchParams('target=clinic'))
    ).toEqual({
      success: false,
      message: 'target=clinic では clinic_id が必須です',
    });
    expect(
      parseManagerRevenueAnalysisQuery(new URLSearchParams('clinic_id=bad'))
    ).toEqual({
      success: false,
      message: 'clinic_id はUUID形式で指定してください',
    });
    expect(
      parseManagerRevenueAnalysisQuery(new URLSearchParams('compare=yearly'))
    ).toEqual({
      success: false,
      message: 'compare の値が正しくありません',
    });
  });
});

describe('manager revenue period and comparison', () => {
  const now = new Date('2026-06-11T03:00:00.000Z');

  it('resolves revenue presets as to-date ranges in JST', () => {
    expect(
      resolveManagerRevenueAnalysisPeriod(
        { type: 'month', startDate: null, endDate: null },
        now
      )
    ).toMatchObject({
      type: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-11',
      bucket: 'daily',
    });
    expect(
      resolveManagerRevenueAnalysisPeriod(
        { type: 'year', startDate: null, endDate: null },
        now
      )
    ).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-06-11',
      bucket: 'weekly',
    });
  });

  it('uses the same-day-count previous period and disables all-period comparison', () => {
    const custom = resolveManagerRevenueAnalysisPeriod(
      { type: 'custom', startDate: '2026-04-01', endDate: '2026-04-30' },
      now
    );
    expect(
      resolveManagerRevenueComparisonPeriod(custom, 'previous_period')
    ).toEqual({
      active: true,
      previousStartDate: '2026-03-02',
      previousEndDate: '2026-03-31',
    });

    const all = resolveManagerRevenueAnalysisPeriod(
      { type: 'all', startDate: null, endDate: null },
      now
    );
    expect(
      resolveManagerRevenueComparisonPeriod(all, 'previous_period')
    ).toEqual({
      active: false,
      previousStartDate: null,
      previousEndDate: null,
    });
  });
});

describe('buildManagerRevenueAnalysis', () => {
  const period = resolveManagerRevenueAnalysisPeriod(
    { type: 'custom', startDate: '2026-04-01', endDate: '2026-04-30' },
    new Date('2026-06-11T03:00:00.000Z')
  );
  const comparisonPeriod = resolveManagerRevenueComparisonPeriod(
    period,
    'previous_period'
  );
  const series: ManagerRevenuePeriodSeriesRow[] = [
    {
      bucket_start: '2026-04-01',
      bucket_end: '2026-04-30',
      operating_revenue: 30000,
      insurance_revenue: 12000,
      private_revenue: 18000,
      visit_count: 10,
    },
  ];
  const contextRows: ManagerRevenueContextBreakdownRow[] = [
    {
      revenue_context_code: 'product',
      revenue_context_name: '物販',
      total_revenue: 4000,
      item_count: 2,
      needs_review_count: 7,
      blocked_count: 1,
    },
  ];

  it('builds target summary, charts, clinic comparison, and disclaimers from RPC rows', () => {
    const response = buildManagerRevenueAnalysis({
      assignedClinics,
      target: 'total',
      selectedClinicId: null,
      period,
      comparisonPeriod,
      allPeriodTotals: [
        totals(clinicA, {
          operating_revenue: 30000,
          insurance_revenue: 12000,
          private_revenue: 18000,
          product_revenue: 4000,
          visit_count: 10,
          report_days: 20,
          missing_report_days: 2,
          needs_review_count: 3,
          blocked_count: 1,
        }),
        totals(clinicB, {
          operating_revenue: 10000,
          insurance_revenue: 8000,
          private_revenue: 2000,
          visit_count: 0,
          report_days: 5,
        }),
      ],
      previousPeriodTotals: [
        totals(clinicA, { operating_revenue: 20000, visit_count: 5 }),
        totals(clinicB, { operating_revenue: 0, visit_count: 0 }),
      ],
      periodSeries: series,
      contextBreakdown: contextRows,
    });

    expect(response.assignedClinics.map(clinic => clinic.name)).toEqual([
      '渋谷院',
      '池袋院',
    ]);
    expect(response.summary).toMatchObject({
      clinicCount: 2,
      operatingRevenue: 40000,
      visitCount: 10,
      averageRevenuePerVisit: 4000,
      missingReportDays: 2,
      needsReviewCount: 3,
      blockedCount: 1,
    });
    expect(response.comparison).toMatchObject({
      active: true,
      previousOperatingRevenue: 20000,
      operatingRevenueChangeRate: 100,
      previousVisitCount: 5,
      visitCountChangeRate: 100,
    });
    expect(response.charts.revenue).toEqual([
      {
        bucketStart: '2026-04-01',
        bucketEnd: '2026-04-30',
        label: '4/1',
        value: 30000,
      },
    ]);
    expect(response.charts.averageRevenuePerVisit[0]?.value).toBe(3000);
    expect(response.charts.contextBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'product',
          value: 4000,
          needsReviewCount: 7,
          blockedCount: 1,
        }),
      ])
    );
    expect(response.clinicComparison.map(clinic => clinic.clinicId)).toEqual([
      clinicA,
      clinicB,
    ]);
    expect(response.disclaimers).toEqual(
      expect.arrayContaining([
        '未提出の日報があるため、期間集計は暫定値です。',
        '※未提出日数には定休日も含まれます。',
      ])
    );
  });

  it('does not double-count insurance/private values when context rows include them', () => {
    const response = buildManagerRevenueAnalysis({
      assignedClinics,
      target: 'total',
      selectedClinicId: null,
      period,
      comparisonPeriod,
      allPeriodTotals: [
        totals(clinicA, {
          operating_revenue: 30000,
          insurance_revenue: 12000,
          private_revenue: 18000,
          visit_count: 10,
        }),
      ],
      previousPeriodTotals: [],
      periodSeries: series,
      contextBreakdown: [
        {
          revenue_context_code: 'insurance',
          revenue_context_name: '保険',
          total_revenue: 11800,
          item_count: 9,
          needs_review_count: 4,
          blocked_count: 2,
        },
        {
          revenue_context_code: 'private',
          revenue_context_name: '自費',
          total_revenue: 17500,
          item_count: 6,
          needs_review_count: 1,
          blocked_count: 0,
        },
        ...contextRows,
      ],
    });

    const insurancePoint = response.charts.contextBreakdown.find(
      point => point.code === 'insurance'
    );
    const privatePoint = response.charts.contextBreakdown.find(
      point => point.code === 'private'
    );

    expect(insurancePoint).toMatchObject({
      value: 12000,
      needsReviewCount: 4,
      blockedCount: 2,
    });
    expect(privatePoint).toMatchObject({
      value: 18000,
      needsReviewCount: 1,
      blockedCount: 0,
    });
  });

  it('limits target summary to the selected clinic and keeps comparison across all clinics', () => {
    const response = buildManagerRevenueAnalysis({
      assignedClinics,
      target: 'clinic',
      selectedClinicId: clinicB,
      period,
      comparisonPeriod,
      allPeriodTotals: [
        totals(clinicA, { operating_revenue: 30000, visit_count: 10 }),
        totals(clinicB, { operating_revenue: 10000, visit_count: 5 }),
      ],
      previousPeriodTotals: [totals(clinicB, { operating_revenue: 5000 })],
      periodSeries: [],
      contextBreakdown: [],
    });

    expect(response.target).toEqual({ type: 'clinic', clinicId: clinicB });
    expect(response.summary).toMatchObject({
      clinicCount: 1,
      operatingRevenue: 10000,
      visitCount: 5,
      averageRevenuePerVisit: 2000,
    });
    expect(response.clinicComparison.map(clinic => clinic.clinicId)).toEqual([
      clinicA,
      clinicB,
    ]);
  });

  it('returns zero average and zero share when denominators are zero', () => {
    const response = buildManagerRevenueAnalysis({
      assignedClinics: [{ id: clinicC, name: '新宿院' }],
      target: 'total',
      selectedClinicId: null,
      period,
      comparisonPeriod: {
        active: false,
        previousStartDate: null,
        previousEndDate: null,
      },
      allPeriodTotals: [totals(clinicC)],
      previousPeriodTotals: [],
      periodSeries: [
        {
          bucket_start: '2026-04-01',
          bucket_end: '2026-04-30',
          operating_revenue: 0,
          insurance_revenue: 0,
          private_revenue: 0,
          visit_count: 0,
        },
      ],
      contextBreakdown: [],
    });

    expect(response.summary.averageRevenuePerVisit).toBe(0);
    expect(response.clinicComparison[0]?.revenueShare).toBe(0);
    expect(response.charts.averageRevenuePerVisit[0]?.value).toBe(0);
    expect(response.comparison.active).toBe(false);
    expect(response.comparison.previousOperatingRevenue).toBeNull();
  });
});
