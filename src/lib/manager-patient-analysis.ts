import type {
  PatientAnalysisData,
  PatientLTV,
  PatientRiskScore,
  FollowUpPatient,
  SegmentAnalysis,
} from '@/types/api';
import {
  buildPatientAnalysisFromRows,
  type PatientVisitSummaryRow,
} from '@/lib/services/patient-analysis-service';

export const MANAGER_PATIENT_ANALYSIS_PERIOD_TYPES = [
  'all',
  'month',
  'previous_month',
  'last_3_months',
  'year',
  'custom',
] as const;

export const MANAGER_PATIENT_ANALYSIS_TARGETS = ['total', 'clinic'] as const;

export const MANAGER_PATIENT_ANALYSIS_BUCKETS = [
  'daily',
  'weekly',
  'monthly',
] as const;

export type ManagerPatientAnalysisPeriodType =
  (typeof MANAGER_PATIENT_ANALYSIS_PERIOD_TYPES)[number];
export type ManagerPatientAnalysisTarget =
  (typeof MANAGER_PATIENT_ANALYSIS_TARGETS)[number];
export type ManagerPatientAnalysisBucket =
  (typeof MANAGER_PATIENT_ANALYSIS_BUCKETS)[number];

export type ManagerPatientAnalysisPeriodRequest = {
  type: ManagerPatientAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
};

export type ManagerPatientAnalysisPeriod =
  ManagerPatientAnalysisPeriodRequest & {
    bucket: ManagerPatientAnalysisBucket;
  };

export type ManagerPatientAssignedClinic = {
  clinicId: string;
  clinicName: string;
};

export type ManagerPatientPeriodTotalsRow = {
  clinic_id: string;
  patient_count: number;
  new_patients: number;
  repeat_patients: number;
  converted_new_patients: number;
  visit_count: number;
  total_revenue: number;
};

export type ManagerPatientPeriodSeriesRow = {
  bucket_start: string;
  bucket_end: string;
  patient_count: number;
  new_patients: number;
  repeat_patients: number;
  converted_new_patients: number;
  visit_count: number;
  total_revenue: number;
};

export type TimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  value: number;
};

export type ClinicSeriesPoint = {
  clinicId: string;
  clinicName: string;
  value: number;
};

export type ManagerPatientAnalysisSummary = {
  assignedClinicCount: number;
  totalPatients: number;
  activePatients: number;
  newPatients: number;
  returnPatients: number;
  conversionRate: number;
  visitCount: number;
  averageVisitCount: number;
  totalRevenue: number;
  averageRevenuePerPatient: number;
  highRiskPatientCount: number;
};

export type ManagerPatientClinicSummary = {
  clinicId: string;
  clinicName: string;
  totalPatients: number;
  activePatients: number;
  newPatients: number;
  returnPatients: number;
  conversionRate: number;
  visitCount: number;
  averageVisitCount: number;
  totalRevenue: number;
  averageRevenuePerPatient: number;
  highRiskPatientCount: number;
};

export type ManagerPatientClinicDetail = ManagerPatientClinicSummary & {
  segmentData: SegmentAnalysis;
  riskScores: PatientRiskScore[];
  ltvRanking: PatientLTV[];
  followUpList: FollowUpPatient[];
};

export type ManagerPatientAnalysisCharts = {
  revenue: TimeSeriesPoint[];
  patients: TimeSeriesPoint[];
  newPatients: TimeSeriesPoint[];
  repeatPatients: TimeSeriesPoint[];
  visits: TimeSeriesPoint[];
  conversionRate: TimeSeriesPoint[];
  clinicRevenueComparison: ClinicSeriesPoint[];
  clinicPatientComparison: ClinicSeriesPoint[];
};

export type ManagerPatientAnalysisResponse = {
  target: ManagerPatientAnalysisTarget;
  summary: ManagerPatientAnalysisSummary;
  clinics: ManagerPatientClinicSummary[];
  selectedClinic: ManagerPatientClinicDetail | null;
  period: ManagerPatientAnalysisPeriod;
  charts: ManagerPatientAnalysisCharts;
};

export type ParsedManagerPatientAnalysisQuery =
  | {
      success: true;
      query: {
        clinicId: string | null;
        target: ManagerPatientAnalysisTarget;
        period: ManagerPatientAnalysisPeriodRequest;
      };
    }
  | {
      success: false;
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_CUSTOM_PERIOD_DAYS = 1095;
const DEFAULT_PERIOD_TYPE: ManagerPatientAnalysisPeriodType = 'month';
const EMPTY_CHARTS: ManagerPatientAnalysisCharts = {
  revenue: [],
  patients: [],
  newPatients: [],
  repeatPatients: [],
  visits: [],
  conversionRate: [],
  clinicRevenueComparison: [],
  clinicPatientComparison: [],
};
const EMPTY_SUMMARY: ManagerPatientAnalysisSummary = {
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
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type NormalizedPeriodTotals = {
  clinicId: string;
  patientCount: number;
  newPatients: number;
  repeatPatients: number;
  convertedNewPatients: number;
  visitCount: number;
  totalRevenue: number;
};

function isPeriodType(
  value: string
): value is ManagerPatientAnalysisPeriodType {
  return MANAGER_PATIENT_ANALYSIS_PERIOD_TYPES.some(type => type === value);
}

function isTarget(value: string): value is ManagerPatientAnalysisTarget {
  return MANAGER_PATIENT_ANALYSIS_TARGETS.some(target => target === value);
}

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function getJstDateParts(date: Date): DateParts {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatDateParts(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day
  ).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(parts: DateParts, delta: number): DateParts {
  const zeroBasedMonth = parts.month - 1 + delta;
  const date = new Date(Date.UTC(parts.year, zeroBasedMonth, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: Math.min(
      parts.day,
      daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
    ),
  };
}

function startOfMonth(parts: DateParts): DateParts {
  return { year: parts.year, month: parts.month, day: 1 };
}

function endOfMonth(parts: DateParts): DateParts {
  return {
    year: parts.year,
    month: parts.month,
    day: daysInMonth(parts.year, parts.month),
  };
}

function dateOnlyToUtcTime(value: string): number {
  const parsed = parseIsoDate(value);
  return parsed ? parsed.getTime() : 0;
}

function dateRangeDays(startDate: string, endDate: string): number {
  return (
    Math.floor(
      (dateOnlyToUtcTime(endDate) - dateOnlyToUtcTime(startDate)) / DAY_MS
    ) + 1
  );
}

function chooseBucket(
  startDate: string | null,
  endDate: string | null
): ManagerPatientAnalysisBucket {
  if (!startDate || !endDate) {
    return 'monthly';
  }

  const days = dateRangeDays(startDate, endDate);
  if (days <= 31) return 'daily';
  if (days <= 180) return 'weekly';
  return 'monthly';
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateRate(numerator: number, denominator: number): number {
  return denominator > 0 ? roundToTwo((numerator / denominator) * 100) : 0;
}

function calculateAverage(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareClinicName(
  left: ManagerPatientAssignedClinic,
  right: ManagerPatientAssignedClinic
): number {
  return left.clinicName.localeCompare(right.clinicName, 'ja');
}

export function sortManagerPatientAssignedClinics(
  clinics: readonly ManagerPatientAssignedClinic[]
): ManagerPatientAssignedClinic[] {
  return [...clinics].sort(compareClinicName);
}

export function resolveManagerPatientSelectedClinicId(params: {
  assignedClinics: readonly ManagerPatientAssignedClinic[];
  requestedClinicId: string | null;
}): string | null {
  const assignedClinics = sortManagerPatientAssignedClinics(
    params.assignedClinics
  );
  const assignedClinicIds = new Set(
    assignedClinics.map(clinic => clinic.clinicId)
  );

  if (
    params.requestedClinicId &&
    assignedClinicIds.has(params.requestedClinicId)
  ) {
    return params.requestedClinicId;
  }

  return assignedClinics[0]?.clinicId ?? null;
}

function groupRowsByClinicId(rows: readonly PatientVisitSummaryRow[]) {
  const rowsByClinicId = new Map<string, PatientVisitSummaryRow[]>();

  for (const row of rows) {
    if (!row.clinic_id) {
      continue;
    }

    let clinicRows = rowsByClinicId.get(row.clinic_id);
    if (!clinicRows) {
      clinicRows = [];
      rowsByClinicId.set(row.clinic_id, clinicRows);
    }

    clinicRows.push(row);
  }

  return rowsByClinicId;
}

function normalizeTotalsRow(
  row: ManagerPatientPeriodTotalsRow
): NormalizedPeriodTotals {
  return {
    clinicId: row.clinic_id,
    patientCount: toNumber(row.patient_count),
    newPatients: toNumber(row.new_patients),
    repeatPatients: toNumber(row.repeat_patients),
    convertedNewPatients: toNumber(row.converted_new_patients),
    visitCount: toNumber(row.visit_count),
    totalRevenue: Math.round(toNumber(row.total_revenue)),
  };
}

function createZeroTotals(clinicId: string): NormalizedPeriodTotals {
  return {
    clinicId,
    patientCount: 0,
    newPatients: 0,
    repeatPatients: 0,
    convertedNewPatients: 0,
    visitCount: 0,
    totalRevenue: 0,
  };
}

function toClinicSummary(params: {
  clinic: ManagerPatientAssignedClinic;
  totals: NormalizedPeriodTotals;
  highRiskPatientCount: number;
}): ManagerPatientClinicSummary {
  return {
    clinicId: params.clinic.clinicId,
    clinicName: params.clinic.clinicName,
    totalPatients: params.totals.patientCount,
    activePatients: params.totals.patientCount,
    newPatients: params.totals.newPatients,
    returnPatients: params.totals.repeatPatients,
    conversionRate: calculateRate(
      params.totals.convertedNewPatients,
      params.totals.newPatients
    ),
    visitCount: params.totals.visitCount,
    averageVisitCount: roundToTwo(
      calculateAverage(params.totals.visitCount, params.totals.patientCount)
    ),
    totalRevenue: params.totals.totalRevenue,
    averageRevenuePerPatient: Math.round(
      calculateAverage(params.totals.totalRevenue, params.totals.patientCount)
    ),
    highRiskPatientCount: params.highRiskPatientCount,
  };
}

function toClinicDetail(params: {
  summary: ManagerPatientClinicSummary;
  analysis: PatientAnalysisData;
}): ManagerPatientClinicDetail {
  return {
    ...params.summary,
    segmentData: params.analysis.segmentData,
    riskScores: params.analysis.riskScores,
    ltvRanking: params.analysis.ltvRanking,
    followUpList: params.analysis.followUpList,
  };
}

function summarizeClinics(
  clinics: readonly ManagerPatientClinicSummary[],
  assignedClinicCount: number,
  convertedNewPatientsByClinicId: ReadonlyMap<string, number>
): ManagerPatientAnalysisSummary {
  let totalPatients = 0;
  let newPatients = 0;
  let returnPatients = 0;
  let convertedNewPatients = 0;
  let visitCount = 0;
  let totalRevenue = 0;
  let highRiskPatientCount = 0;

  for (const clinic of clinics) {
    totalPatients += clinic.totalPatients;
    newPatients += clinic.newPatients;
    returnPatients += clinic.returnPatients;
    convertedNewPatients +=
      convertedNewPatientsByClinicId.get(clinic.clinicId) ??
      Math.round((clinic.conversionRate / 100) * clinic.newPatients);
    visitCount += clinic.visitCount;
    totalRevenue += clinic.totalRevenue;
    highRiskPatientCount += clinic.highRiskPatientCount;
  }

  return {
    assignedClinicCount,
    totalPatients,
    activePatients: totalPatients,
    newPatients,
    returnPatients,
    conversionRate: calculateRate(convertedNewPatients, newPatients),
    visitCount,
    averageVisitCount: roundToTwo(calculateAverage(visitCount, totalPatients)),
    totalRevenue,
    averageRevenuePerPatient: Math.round(
      calculateAverage(totalRevenue, totalPatients)
    ),
    highRiskPatientCount,
  };
}

function formatSeriesLabel(
  bucketStart: string,
  bucket: ManagerPatientAnalysisBucket
): string {
  const [yearText, monthText, dayText] = bucketStart.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (bucket === 'monthly') {
    return `${year}/${month}`;
  }

  if (bucket === 'weekly') {
    return `${month}/${day}週`;
  }

  return `${month}/${day}`;
}

function toTimeSeries(
  rows: readonly ManagerPatientPeriodSeriesRow[],
  bucket: ManagerPatientAnalysisBucket,
  selectValue: (row: ManagerPatientPeriodSeriesRow) => number
): TimeSeriesPoint[] {
  return rows.map(row => ({
    bucketStart: row.bucket_start,
    bucketEnd: row.bucket_end,
    label: formatSeriesLabel(row.bucket_start, bucket),
    value: selectValue(row),
  }));
}

function buildCharts(params: {
  period: ManagerPatientAnalysisPeriod;
  seriesRows: readonly ManagerPatientPeriodSeriesRow[];
  clinics: readonly ManagerPatientClinicSummary[];
}): ManagerPatientAnalysisCharts {
  return {
    revenue: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      Math.round(toNumber(row.total_revenue))
    ),
    patients: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      toNumber(row.patient_count)
    ),
    newPatients: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      toNumber(row.new_patients)
    ),
    repeatPatients: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      toNumber(row.repeat_patients)
    ),
    visits: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      toNumber(row.visit_count)
    ),
    conversionRate: toTimeSeries(params.seriesRows, params.period.bucket, row =>
      calculateRate(
        toNumber(row.converted_new_patients),
        toNumber(row.new_patients)
      )
    ),
    clinicRevenueComparison: params.clinics.map(clinic => ({
      clinicId: clinic.clinicId,
      clinicName: clinic.clinicName,
      value: clinic.totalRevenue,
    })),
    clinicPatientComparison: params.clinics.map(clinic => ({
      clinicId: clinic.clinicId,
      clinicName: clinic.clinicName,
      value: clinic.totalPatients,
    })),
  };
}

export function parseManagerPatientAnalysisQuery(
  searchParams: URLSearchParams
): ParsedManagerPatientAnalysisQuery {
  const periodText = searchParams.get('period') ?? DEFAULT_PERIOD_TYPE;
  if (!isPeriodType(periodText)) {
    return {
      success: false,
      message: 'period の値が正しくありません',
    };
  }

  const targetText = searchParams.get('target') ?? 'total';
  if (!isTarget(targetText)) {
    return {
      success: false,
      message: 'target の値が正しくありません',
    };
  }

  const clinicId = searchParams.get('clinic_id');
  if (clinicId && !UUID_PATTERN.test(clinicId)) {
    return {
      success: false,
      message: 'clinic_id はUUID形式で指定してください',
    };
  }

  if (targetText === 'clinic' && !clinicId) {
    return {
      success: false,
      message: 'target=clinic では clinic_id が必須です',
    };
  }

  const startDateText = searchParams.get('start_date');
  const endDateText = searchParams.get('end_date');
  const startDate = startDateText ? parseIsoDate(startDateText) : null;
  const endDate = endDateText ? parseIsoDate(endDateText) : null;

  if ((startDateText && !startDate) || (endDateText && !endDate)) {
    return {
      success: false,
      message: '日付はYYYY-MM-DD形式で指定してください',
    };
  }

  if (periodText === 'custom' && (!startDateText || !endDateText)) {
    return {
      success: false,
      message: 'custom 期間では start_date と end_date が必須です',
    };
  }

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return {
      success: false,
      message: 'start_date は end_date 以前の日付を指定してください',
    };
  }

  if (
    periodText === 'custom' &&
    startDateText &&
    endDateText &&
    dateRangeDays(startDateText, endDateText) > MAX_CUSTOM_PERIOD_DAYS
  ) {
    return {
      success: false,
      message: '期間は最大3年（1095日）以内で指定してください',
    };
  }

  return {
    success: true,
    query: {
      clinicId,
      target: targetText,
      period: {
        type: periodText,
        startDate: periodText === 'custom' ? startDateText : null,
        endDate: periodText === 'custom' ? endDateText : null,
      },
    },
  };
}

export function resolveManagerPatientAnalysisPeriod(
  request: ManagerPatientAnalysisPeriodRequest,
  now: Date = new Date()
): ManagerPatientAnalysisPeriod {
  if (request.type === 'all') {
    return {
      type: 'all',
      startDate: null,
      endDate: null,
      bucket: 'monthly',
    };
  }

  if (request.type === 'custom') {
    return {
      type: 'custom',
      startDate: request.startDate,
      endDate: request.endDate,
      bucket: chooseBucket(request.startDate, request.endDate),
    };
  }

  const today = getJstDateParts(now);

  if (request.type === 'previous_month') {
    const previousMonth = addMonths(today, -1);
    const startDate = formatDateParts(startOfMonth(previousMonth));
    const endDate = formatDateParts(endOfMonth(previousMonth));
    return {
      type: 'previous_month',
      startDate,
      endDate,
      bucket: chooseBucket(startDate, endDate),
    };
  }

  if (request.type === 'last_3_months') {
    const firstMonth = addMonths(today, -2);
    const startDate = formatDateParts(startOfMonth(firstMonth));
    const endDate = formatDateParts(endOfMonth(today));
    return {
      type: 'last_3_months',
      startDate,
      endDate,
      bucket: chooseBucket(startDate, endDate),
    };
  }

  if (request.type === 'year') {
    const startDate = formatDateParts({
      year: today.year,
      month: 1,
      day: 1,
    });
    const endDate = formatDateParts({
      year: today.year,
      month: 12,
      day: 31,
    });
    return {
      type: 'year',
      startDate,
      endDate,
      bucket: chooseBucket(startDate, endDate),
    };
  }

  const startDate = formatDateParts(startOfMonth(today));
  const endDate = formatDateParts(endOfMonth(today));
  return {
    type: 'month',
    startDate,
    endDate,
    bucket: chooseBucket(startDate, endDate),
  };
}

export function resolveManagerPatientAnalysisRpcBounds(
  period: ManagerPatientAnalysisPeriod
): { startIso: string | null; endIso: string | null } {
  if (!period.startDate || !period.endDate) {
    return { startIso: null, endIso: null };
  }

  const [startYear, startMonth, startDay] = period.startDate
    .split('-')
    .map(Number);
  const [endYear, endMonth, endDay] = period.endDate.split('-').map(Number);
  const startUtcTime =
    Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0) - JST_OFFSET_MS;
  const endUtcTime =
    Date.UTC(endYear, endMonth - 1, endDay + 1, 0, 0, 0, 0) - JST_OFFSET_MS - 1;

  return {
    startIso: new Date(startUtcTime).toISOString(),
    endIso: new Date(endUtcTime).toISOString(),
  };
}

export function buildManagerPatientAnalysis(params: {
  assignedClinics: readonly ManagerPatientAssignedClinic[];
  patientRows: readonly PatientVisitSummaryRow[];
  periodTotals: readonly ManagerPatientPeriodTotalsRow[];
  periodSeries: readonly ManagerPatientPeriodSeriesRow[];
  selectedClinicId: string | null;
  target: ManagerPatientAnalysisTarget;
  period: ManagerPatientAnalysisPeriod;
}): ManagerPatientAnalysisResponse {
  if (params.assignedClinics.length === 0) {
    return {
      target: params.target,
      summary: EMPTY_SUMMARY,
      clinics: [],
      selectedClinic: null,
      period: params.period,
      charts: EMPTY_CHARTS,
    };
  }

  const assignedClinics = sortManagerPatientAssignedClinics(
    params.assignedClinics
  );
  const selectedClinicId = resolveManagerPatientSelectedClinicId({
    assignedClinics,
    requestedClinicId: params.selectedClinicId,
  });
  const rowsByClinicId = groupRowsByClinicId(params.patientRows);
  const totalsByClinicId = new Map(
    params.periodTotals.map(row => {
      const normalized = normalizeTotalsRow(row);
      return [normalized.clinicId, normalized] as const;
    })
  );
  const convertedNewPatientsByClinicId = new Map(
    params.periodTotals.map(row => [
      row.clinic_id,
      toNumber(row.converted_new_patients),
    ])
  );
  const clinics: ManagerPatientClinicSummary[] = [];
  let selectedClinic: ManagerPatientClinicDetail | null = null;
  const analysisDate = new Date();

  for (const clinic of assignedClinics) {
    const clinicRows = rowsByClinicId.get(clinic.clinicId) ?? [];
    const includePatientLists = clinic.clinicId === selectedClinicId;
    const analysisWithMetrics = buildPatientAnalysisFromRows(clinicRows, {
      now: analysisDate,
      includePatientLists,
    });
    const summary = toClinicSummary({
      clinic,
      totals:
        totalsByClinicId.get(clinic.clinicId) ??
        createZeroTotals(clinic.clinicId),
      highRiskPatientCount: analysisWithMetrics.highRiskPatientCount,
    });

    clinics.push(summary);

    if (includePatientLists) {
      selectedClinic = toClinicDetail({
        summary,
        analysis: analysisWithMetrics.data,
      });
    }
  }

  const summaryClinics =
    params.target === 'clinic'
      ? clinics.filter(clinic => clinic.clinicId === selectedClinicId)
      : clinics;

  return {
    target: params.target,
    summary: summarizeClinics(
      summaryClinics,
      assignedClinics.length,
      convertedNewPatientsByClinicId
    ),
    clinics,
    selectedClinic,
    period: params.period,
    charts: buildCharts({
      period: params.period,
      seriesRows: params.periodSeries,
      clinics,
    }),
  };
}

export const MANAGER_PATIENT_ANALYSIS_DEFAULT_PERIOD_TYPE = DEFAULT_PERIOD_TYPE;
