import {
  buildManagerPatientAnalysis,
  parseManagerPatientAnalysisQuery,
  resolveManagerPatientAnalysisPeriod,
  resolveManagerPatientAnalysisRpcBounds,
  type ManagerPatientAssignedClinic,
  type ManagerPatientPeriodSeriesRow,
  type ManagerPatientPeriodTotalsRow,
} from '@/lib/manager-patient-analysis';
import type { PatientVisitSummaryRow } from '@/lib/services/patient-analysis-service';

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

const assignedClinics: ManagerPatientAssignedClinic[] = [
  { clinicId: clinicB, clinicName: '渋谷院' },
  { clinicId: clinicA, clinicName: '池袋院' },
];

function buildPatientRow(params: {
  clinicId: string;
  patientId: string;
  patientName: string;
  visitCount: number;
  totalRevenue: number;
  lastVisitDate: string | null;
  visitCategory: string;
}): PatientVisitSummaryRow {
  return {
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    patient_name: params.patientName,
    first_visit_date: params.lastVisitDate,
    last_visit_date: params.lastVisitDate,
    visit_count: params.visitCount,
    total_revenue: params.totalRevenue,
    average_revenue_per_visit:
      params.visitCount > 0 ? params.totalRevenue / params.visitCount : 0,
    treatment_period_days: params.visitCount > 1 ? 14 : 0,
    visit_category: params.visitCategory,
  };
}

describe('parseManagerPatientAnalysisQuery', () => {
  it('accepts v0.2 period presets and rejects removed week period', () => {
    expect(
      parseManagerPatientAnalysisQuery(new URLSearchParams('period=all'))
    ).toMatchObject({ success: true });
    expect(
      parseManagerPatientAnalysisQuery(
        new URLSearchParams('period=previous_month')
      )
    ).toMatchObject({ success: true });
    expect(
      parseManagerPatientAnalysisQuery(
        new URLSearchParams('period=last_3_months')
      )
    ).toMatchObject({ success: true });
    expect(
      parseManagerPatientAnalysisQuery(new URLSearchParams('period=year'))
    ).toMatchObject({ success: true });
    expect(
      parseManagerPatientAnalysisQuery(new URLSearchParams('period=week'))
    ).toEqual({
      success: false,
      message: 'period の値が正しくありません',
    });
  });

  it('validates custom date range and clinic target rules', () => {
    expect(
      parseManagerPatientAnalysisQuery(
        new URLSearchParams(
          'period=custom&start_date=2026-01-01&end_date=2026-04-30'
        )
      )
    ).toMatchObject({
      success: true,
      query: {
        period: {
          type: 'custom',
          startDate: '2026-01-01',
          endDate: '2026-04-30',
        },
      },
    });
    expect(
      parseManagerPatientAnalysisQuery(
        new URLSearchParams(
          'period=custom&start_date=2026-04-30&end_date=2026-01-01'
        )
      )
    ).toMatchObject({ success: false });
    expect(
      parseManagerPatientAnalysisQuery(
        new URLSearchParams(
          'period=custom&start_date=2020-01-01&end_date=2026-01-01'
        )
      )
    ).toMatchObject({ success: false });
    expect(
      parseManagerPatientAnalysisQuery(new URLSearchParams('target=clinic'))
    ).toEqual({
      success: false,
      message: 'target=clinic では clinic_id が必須です',
    });
  });
});

describe('resolveManagerPatientAnalysisPeriod', () => {
  const now = new Date('2026-06-11T03:00:00.000Z');

  it('resolves default month, previous month, last 3 months, and year in JST', () => {
    expect(
      resolveManagerPatientAnalysisPeriod(
        { type: 'month', startDate: null, endDate: null },
        now
      )
    ).toEqual({
      type: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      bucket: 'daily',
    });
    expect(
      resolveManagerPatientAnalysisPeriod(
        { type: 'previous_month', startDate: null, endDate: null },
        now
      )
    ).toMatchObject({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      bucket: 'daily',
    });
    expect(
      resolveManagerPatientAnalysisPeriod(
        { type: 'last_3_months', startDate: null, endDate: null },
        now
      )
    ).toMatchObject({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      bucket: 'weekly',
    });
    expect(
      resolveManagerPatientAnalysisPeriod(
        { type: 'year', startDate: null, endDate: null },
        now
      )
    ).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      bucket: 'monthly',
    });
  });

  it('uses null bounds for all period and converts JST date bounds for RPC', () => {
    const allPeriod = resolveManagerPatientAnalysisPeriod(
      { type: 'all', startDate: null, endDate: null },
      now
    );
    expect(allPeriod).toEqual({
      type: 'all',
      startDate: null,
      endDate: null,
      bucket: 'monthly',
    });
    expect(resolveManagerPatientAnalysisRpcBounds(allPeriod)).toEqual({
      startIso: null,
      endIso: null,
    });

    expect(
      resolveManagerPatientAnalysisRpcBounds({
        type: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        bucket: 'daily',
      })
    ).toEqual({
      startIso: '2025-12-31T15:00:00.000Z',
      endIso: '2026-01-31T14:59:59.999Z',
    });
  });
});

describe('buildManagerPatientAnalysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses RPC period totals for summaries and keeps patient names out of charts', () => {
    const periodTotals: ManagerPatientPeriodTotalsRow[] = [
      {
        clinic_id: clinicA,
        patient_count: 2,
        new_patients: 1,
        repeat_patients: 1,
        converted_new_patients: 1,
        visit_count: 3,
        total_revenue: 18000,
      },
      {
        clinic_id: clinicB,
        patient_count: 1,
        new_patients: 1,
        repeat_patients: 0,
        converted_new_patients: 0,
        visit_count: 1,
        total_revenue: 7000,
      },
    ];
    const periodSeries: ManagerPatientPeriodSeriesRow[] = [
      {
        bucket_start: '2026-06-01',
        bucket_end: '2026-06-07',
        patient_count: 2,
        new_patients: 1,
        repeat_patients: 1,
        converted_new_patients: 1,
        visit_count: 3,
        total_revenue: 18000,
      },
    ];
    const result = buildManagerPatientAnalysis({
      assignedClinics,
      patientRows: [
        buildPatientRow({
          clinicId: clinicA,
          patientId: '11111111-1111-4111-8111-000000000001',
          patientName: '池袋 高リスク',
          visitCount: 4,
          totalRevenue: 9000,
          lastVisitDate: '2026-01-01',
          visitCategory: '軽度リピート',
        }),
      ],
      periodTotals,
      periodSeries,
      selectedClinicId: clinicA,
      target: 'total',
      period: {
        type: 'last_3_months',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        bucket: 'weekly',
      },
    });

    expect(result.clinics.map(clinic => clinic.clinicName)).toEqual([
      '渋谷院',
      '池袋院',
    ]);
    expect(result.summary).toMatchObject({
      assignedClinicCount: 2,
      totalPatients: 3,
      newPatients: 2,
      returnPatients: 1,
      visitCount: 4,
      totalRevenue: 25000,
      averageRevenuePerPatient: 8333,
    });
    expect(result.summary.conversionRate).toBe(50);
    expect(result.selectedClinic?.clinicId).toBe(clinicA);
    expect(result.charts.revenue).toEqual([
      {
        bucketStart: '2026-06-01',
        bucketEnd: '2026-06-07',
        label: '6/1週',
        value: 18000,
      },
    ]);
    expect(result.charts.clinicPatientComparison).toEqual([
      { clinicId: clinicB, clinicName: '渋谷院', value: 1 },
      { clinicId: clinicA, clinicName: '池袋院', value: 2 },
    ]);
    expect(JSON.stringify(result.charts)).not.toContain('池袋 高リスク');
  });

  it('returns an empty valid response when manager has no assignments', () => {
    const result = buildManagerPatientAnalysis({
      assignedClinics: [],
      patientRows: [],
      periodTotals: [],
      periodSeries: [],
      selectedClinicId: null,
      target: 'total',
      period: {
        type: 'all',
        startDate: null,
        endDate: null,
        bucket: 'monthly',
      },
    });

    expect(result).toEqual({
      target: 'total',
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
    });
  });
});
