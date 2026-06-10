import {
  buildManagerPatientAnalysis,
  type ManagerPatientAssignedClinic,
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

describe('buildManagerPatientAnalysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates assigned clinics and keeps patient-level lists out of clinic summaries', () => {
    const clinicBRows = Array.from({ length: 21 }, (_, index) =>
      buildPatientRow({
        clinicId: clinicB,
        patientId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
        patientName: `患者${index + 1}`,
        visitCount: index === 0 ? 1 : 2,
        totalRevenue: 1000,
        lastVisitDate: index === 0 ? '2026-06-01' : '2026-01-01',
        visitCategory: index === 0 ? '初診のみ' : '軽度リピート',
      })
    );
    const rows: PatientVisitSummaryRow[] = [
      buildPatientRow({
        clinicId: clinicA,
        patientId: '11111111-1111-4111-8111-000000000001',
        patientName: '池袋 高リスク',
        visitCount: 4,
        totalRevenue: 9000,
        lastVisitDate: '2026-01-01',
        visitCategory: '軽度リピート',
      }),
      ...clinicBRows,
    ];

    const result = buildManagerPatientAnalysis({
      assignedClinics,
      rows,
      selectedClinicId: null,
      period: {
        type: 'all',
        startDate: null,
        endDate: null,
        periodApplied: false,
      },
    });

    expect(result.clinics.map(clinic => clinic.clinicName)).toEqual([
      '渋谷院',
      '池袋院',
    ]);
    expect(result.summary).toMatchObject({
      assignedClinicCount: 2,
      totalPatients: 22,
      newPatients: 22,
      returnPatients: 21,
      totalRevenue: 30000,
      averageRevenuePerPatient: 1364,
      highRiskPatientCount: 21,
    });
    expect(result.summary.conversionRate).toBeCloseTo(95.45, 2);
    expect(result.summary.averageVisitCount).toBeCloseTo(2.05, 2);

    const shibuya = result.clinics.find(
      clinic => clinic.clinicId === clinicB
    );
    expect(shibuya?.totalRevenue).toBe(21000);
    expect(shibuya?.averageRevenuePerPatient).toBe(1000);
    expect(shibuya && 'riskScores' in shibuya).toBe(false);
    expect(shibuya && 'ltvRanking' in shibuya).toBe(false);
    expect(result.selectedClinic?.clinicId).toBe(clinicB);
    expect(result.selectedClinic?.riskScores.length).toBeGreaterThan(0);
  });

  it('returns an empty valid response when manager has no assignments', () => {
    const result = buildManagerPatientAnalysis({
      assignedClinics: [],
      rows: [],
      selectedClinicId: null,
      period: {
        type: 'all',
        startDate: null,
        endDate: null,
        periodApplied: false,
      },
    });

    expect(result).toEqual({
      summary: {
        assignedClinicCount: 0,
        totalPatients: 0,
        activePatients: 0,
        newPatients: 0,
        returnPatients: 0,
        conversionRate: 0,
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
        periodApplied: false,
      },
    });
  });
});
