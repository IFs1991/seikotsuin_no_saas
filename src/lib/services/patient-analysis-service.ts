import { SupabaseClient } from '@supabase/supabase-js';
import { PatientAnalysisData, PatientRiskScore } from '@/types/api';

interface PatientVisitSummaryRow {
  patient_id: string;
  patient_name: string;
  first_visit_date: string | null;
  visit_count: number | string | null;
  total_revenue: number | string | null;
  average_revenue_per_visit: number | string | null;
  treatment_period_days: number | string | null;
  last_visit_date: string | null;
  visit_category: string | null;
}

interface NormalizedPatientSummary {
  patientId: string;
  name: string;
  visitCount: number;
  totalRevenue: number;
  treatmentPeriodDays: number;
  lastVisitDate: string | null;
  visitCategory: VisitCategoryLabel;
}

const PATIENT_VISIT_SUMMARY_COLUMNS = [
  'patient_id',
  'patient_name',
  'clinic_id',
  'first_visit_date',
  'last_visit_date',
  'visit_count',
  'total_revenue',
  'average_revenue_per_visit',
  'treatment_period_days',
  'visit_category',
].join(', ');

const VISIT_CATEGORY_LABELS = [
  '来院なし',
  '初診のみ',
  '軽度リピート',
  '中度リピート',
  '高度リピート',
] as const;
type VisitCategoryLabel = (typeof VISIT_CATEGORY_LABELS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EXPECTED_VISIT_GAP_DAYS = 14;
const DEFAULT_EXPECTED_VISIT_GAP_DAYS = 30;
const FOLLOW_UP_RISK_THRESHOLD = 60;
const TOP_ANALYSIS_ROWS_LIMIT = 20;
const DEFAULT_VISIT_CATEGORY: VisitCategoryLabel = '来院なし';

const EMPTY_VISIT_SEGMENT_COUNTS: Record<VisitCategoryLabel, number> = {
  来院なし: 0,
  初診のみ: 0,
  軽度リピート: 0,
  中度リピート: 0,
  高度リピート: 0,
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function daysSinceDate(dateValue: string | null, todayUtcTime: number): number {
  const date = parseDateOnly(dateValue);
  if (!date) return 0;

  return Math.max(0, Math.floor((todayUtcTime - date.getTime()) / DAY_MS));
}

function getExpectedVisitGapDays({
  treatmentPeriodDays,
  visitCount,
}: Pick<
  NormalizedPatientSummary,
  'treatmentPeriodDays' | 'visitCount'
>): number {
  if (visitCount > 1 && treatmentPeriodDays > 0) {
    return Math.max(
      MIN_EXPECTED_VISIT_GAP_DAYS,
      Math.round(treatmentPeriodDays / (visitCount - 1))
    );
  }

  return DEFAULT_EXPECTED_VISIT_GAP_DAYS;
}

function calculateChurnRiskScore(
  patient: NormalizedPatientSummary,
  todayUtcTime: number
): number {
  if (patient.visitCount === 0 || !patient.lastVisitDate) return 0;

  const daysSinceLastVisit = daysSinceDate(patient.lastVisitDate, todayUtcTime);
  const expectedGapDays = getExpectedVisitGapDays(patient);
  const gapRatio = daysSinceLastVisit / expectedGapDays;

  let riskScore = 10;
  if (gapRatio > 4) {
    riskScore = 95;
  } else if (gapRatio > 3) {
    riskScore = 80;
  } else if (gapRatio > 2) {
    riskScore = 60;
  } else if (gapRatio > 1) {
    riskScore = 35;
  }

  if (
    patient.visitCount === 1 &&
    daysSinceLastVisit > MIN_EXPECTED_VISIT_GAP_DAYS
  ) {
    riskScore = Math.max(riskScore, 55);
  }

  return riskScore;
}

function getRiskCategory(riskScore: number): PatientRiskScore['category'] {
  if (riskScore >= 75) return 'high';
  if (riskScore >= 50) return 'medium';
  return 'low';
}

function normalizeVisitCategory(
  value: string | null | undefined
): VisitCategoryLabel {
  return VISIT_CATEGORY_LABELS.includes(value as VisitCategoryLabel)
    ? (value as VisitCategoryLabel)
    : DEFAULT_VISIT_CATEGORY;
}

function normalizePatientSummary(
  patient: PatientVisitSummaryRow
): NormalizedPatientSummary {
  return {
    patientId: patient.patient_id,
    name: patient.patient_name,
    visitCount: toNumber(patient.visit_count),
    totalRevenue: Math.round(toNumber(patient.total_revenue)),
    treatmentPeriodDays: toNumber(patient.treatment_period_days),
    lastVisitDate: patient.last_visit_date,
    visitCategory: normalizeVisitCategory(patient.visit_category),
  };
}

function createVisitSegmentCounts(): Record<VisitCategoryLabel, number> {
  return { ...EMPTY_VISIT_SEGMENT_COUNTS };
}

/**
 * 患者分析データを生成する共有ヘルパー関数
 *
 * /api/patients と /api/customers/analysis の両方で使用され、
 * 同一のペイロードを保証します。
 *
 * @param supabase - Supabaseクライアント
 * @param clinicId - クリニックID
 * @returns 患者分析データ
 */
export async function generatePatientAnalysis(
  supabase: SupabaseClient,
  clinicId: string
): Promise<PatientAnalysisData> {
  // patient_visit_summary ビューからデータ取得
  const { data: patients, error: patientsError } = await supabase
    .from('patient_visit_summary')
    .select(PATIENT_VISIT_SUMMARY_COLUMNS)
    .eq('clinic_id', clinicId);

  if (patientsError) {
    throw patientsError;
  }

  const typedPatients = (patients as unknown as PatientVisitSummaryRow[]) ?? [];
  const todayUtcTime = startOfUtcDay(new Date()).getTime();
  const visitSegmentCounts = createVisitSegmentCounts();
  const riskScores: PatientRiskScore[] = [];
  const ltvRanking: PatientAnalysisData['ltvRanking'] = [];
  let initialVisitPatientCount = 0;
  let returnPatientCount = 0;
  let continuingPatientCount = 0;
  let activePatientCount = 0;
  let totalVisitCount = 0;

  for (const row of typedPatients) {
    const patient = normalizePatientSummary(row);
    totalVisitCount += patient.visitCount;
    visitSegmentCounts[patient.visitCategory] += 1;

    if (patient.visitCount >= 1) initialVisitPatientCount += 1;
    if (patient.visitCount >= 2) {
      returnPatientCount += 1;
      activePatientCount += 1;
    }
    if (patient.visitCount >= 5) continuingPatientCount += 1;

    ltvRanking.push({
      patient_id: patient.patientId,
      name: patient.name,
      ltv: patient.totalRevenue,
      visit_count: patient.visitCount,
      total_revenue: patient.totalRevenue,
    });

    const score = calculateChurnRiskScore(patient, todayUtcTime);

    riskScores.push({
      patient_id: patient.patientId,
      name: patient.name,
      riskScore: score,
      lastVisit: patient.lastVisitDate,
      category: getRiskCategory(score),
    });
  }

  const conversionRate =
    initialVisitPatientCount > 0
      ? Math.round(
          (returnPatientCount / initialVisitPatientCount) * 100 * 100
        ) / 100
      : 0;
  const conversionData = {
    newPatients: initialVisitPatientCount,
    returnPatients: returnPatientCount,
    conversionRate,
    stages: [
      { name: '初回来院', value: initialVisitPatientCount },
      { name: '2回目来院', value: returnPatientCount },
      { name: '継続通院', value: continuingPatientCount },
    ],
  };

  const sortedRiskScores = riskScores.sort((a, b) => b.riskScore - a.riskScore);

  // フォローアップリスト
  const followUpList = sortedRiskScores
    .filter(patient => patient.riskScore > FOLLOW_UP_RISK_THRESHOLD)
    .slice(0, 10)
    .map(patient => ({
      patient_id: patient.patient_id,
      name: patient.name,
      reason: `${patient.riskScore}%の離脱リスク`,
      lastVisit: patient.lastVisit,
      action: '電話フォロー推奨',
    }));

  // 訪問回数
  const visitCounts = {
    average:
      typedPatients.length > 0
        ? Math.round((totalVisitCount / typedPatients.length) * 100) / 100
        : 0,
    monthlyChange: 5.2,
  };

  // 分析データを組み立てて返す
  return {
    conversionData,
    visitCounts,
    riskScores: sortedRiskScores.slice(0, TOP_ANALYSIS_ROWS_LIMIT),
    ltvRanking: ltvRanking
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, TOP_ANALYSIS_ROWS_LIMIT),
    segmentData: {
      visit: VISIT_CATEGORY_LABELS.map(label => ({
        label,
        value: visitSegmentCounts[label],
      })),
    },
    followUpList,
    totalPatients: typedPatients.length,
    activePatients: activePatientCount,
  };
}
