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
  'week',
  'month',
  'custom',
] as const;

export type ManagerPatientAnalysisPeriodType =
  (typeof MANAGER_PATIENT_ANALYSIS_PERIOD_TYPES)[number];

export type ManagerPatientAnalysisPeriod = {
  type: ManagerPatientAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
  periodApplied: boolean;
};

export type ManagerPatientAssignedClinic = {
  clinicId: string;
  clinicName: string;
};

export type ManagerPatientAnalysisSummary = {
  assignedClinicCount: number;
  totalPatients: number;
  activePatients: number;
  newPatients: number;
  returnPatients: number;
  conversionRate: number;
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

export type ManagerPatientAnalysisResponse = {
  summary: ManagerPatientAnalysisSummary;
  clinics: ManagerPatientClinicSummary[];
  selectedClinic: ManagerPatientClinicDetail | null;
  period: ManagerPatientAnalysisPeriod;
};

export type ParsedManagerPatientAnalysisQuery =
  | {
      success: true;
      query: {
        clinicId: string | null;
        period: ManagerPatientAnalysisPeriod;
      };
    }
  | {
      success: false;
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_PERIOD: ManagerPatientAnalysisPeriod = {
  type: 'all',
  startDate: null,
  endDate: null,
  periodApplied: false,
};
const EMPTY_SUMMARY: ManagerPatientAnalysisSummary = {
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
};

function isPeriodType(
  value: string
): value is ManagerPatientAnalysisPeriodType {
  return MANAGER_PATIENT_ANALYSIS_PERIOD_TYPES.some(type => type === value);
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

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateRate(numerator: number, denominator: number): number {
  return denominator > 0 ? roundToTwo((numerator / denominator) * 100) : 0;
}

function calculateAverage(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

function compareClinicName(
  left: ManagerPatientAssignedClinic,
  right: ManagerPatientAssignedClinic
): number {
  return left.clinicName.localeCompare(right.clinicName, 'ja');
}

function toClinicSummary(params: {
  clinic: ManagerPatientAssignedClinic;
  analysis: PatientAnalysisData;
  totalRevenue: number;
  highRiskPatientCount: number;
}): ManagerPatientClinicSummary {
  return {
    clinicId: params.clinic.clinicId,
    clinicName: params.clinic.clinicName,
    totalPatients: params.analysis.totalPatients,
    activePatients: params.analysis.activePatients,
    newPatients: params.analysis.conversionData.newPatients,
    returnPatients: params.analysis.conversionData.returnPatients,
    conversionRate: params.analysis.conversionData.conversionRate,
    averageVisitCount: params.analysis.visitCounts.average,
    totalRevenue: params.totalRevenue,
    averageRevenuePerPatient: Math.round(
      calculateAverage(params.totalRevenue, params.analysis.totalPatients)
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

export function parseManagerPatientAnalysisQuery(
  searchParams: URLSearchParams
): ParsedManagerPatientAnalysisQuery {
  const periodText = searchParams.get('period') ?? 'all';
  if (!isPeriodType(periodText)) {
    return {
      success: false,
      message: 'period の値が正しくありません',
    };
  }

  const clinicId = searchParams.get('clinic_id');
  if (clinicId && !UUID_PATTERN.test(clinicId)) {
    return {
      success: false,
      message: 'clinic_id はUUID形式で指定してください',
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

  return {
    success: true,
    query: {
      clinicId,
      period: {
        type: periodText,
        startDate: startDateText,
        endDate: endDateText,
        periodApplied: false,
      },
    },
  };
}

export function buildManagerPatientAnalysis(params: {
  assignedClinics: readonly ManagerPatientAssignedClinic[];
  rows: readonly PatientVisitSummaryRow[];
  selectedClinicId: string | null;
  period: ManagerPatientAnalysisPeriod;
}): ManagerPatientAnalysisResponse {
  if (params.assignedClinics.length === 0) {
    return {
      summary: EMPTY_SUMMARY,
      clinics: [],
      selectedClinic: null,
      period: params.period,
    };
  }

  const assignedClinics = [...params.assignedClinics].sort(compareClinicName);
  const assignedClinicIds = new Set(
    assignedClinics.map(clinic => clinic.clinicId)
  );
  const selectedClinicId =
    params.selectedClinicId && assignedClinicIds.has(params.selectedClinicId)
      ? params.selectedClinicId
      : (assignedClinics[0]?.clinicId ?? null);
  const rowsByClinicId = groupRowsByClinicId(params.rows);
  const clinics: ManagerPatientClinicSummary[] = [];
  let selectedClinic: ManagerPatientClinicDetail | null = null;
  const analysisDate = new Date();

  let totalPatients = 0;
  let activePatients = 0;
  let newPatients = 0;
  let returnPatients = 0;
  let totalVisitCount = 0;
  let totalRevenue = 0;
  let highRiskPatientCount = 0;

  for (const clinic of assignedClinics) {
    const clinicRows = rowsByClinicId.get(clinic.clinicId) ?? [];
    const includePatientLists = clinic.clinicId === selectedClinicId;
    const analysisWithMetrics = buildPatientAnalysisFromRows(clinicRows, {
      now: analysisDate,
      includePatientLists,
    });
    const summary = toClinicSummary({
      clinic,
      analysis: analysisWithMetrics.data,
      totalRevenue: analysisWithMetrics.totalRevenue,
      highRiskPatientCount: analysisWithMetrics.highRiskPatientCount,
    });

    clinics.push(summary);

    if (includePatientLists) {
      selectedClinic = toClinicDetail({
        summary,
        analysis: analysisWithMetrics.data,
      });
    }

    totalPatients += summary.totalPatients;
    activePatients += summary.activePatients;
    newPatients += summary.newPatients;
    returnPatients += summary.returnPatients;
    totalVisitCount += analysisWithMetrics.totalVisitCount;
    totalRevenue += summary.totalRevenue;
    highRiskPatientCount += summary.highRiskPatientCount;
  }

  return {
    summary: {
      assignedClinicCount: assignedClinics.length,
      totalPatients,
      activePatients,
      newPatients,
      returnPatients,
      conversionRate: calculateRate(returnPatients, newPatients),
      averageVisitCount: roundToTwo(
        calculateAverage(totalVisitCount, totalPatients)
      ),
      totalRevenue,
      averageRevenuePerPatient: Math.round(
        calculateAverage(totalRevenue, totalPatients)
      ),
      highRiskPatientCount,
    },
    clinics,
    selectedClinic,
    period: params.period,
  };
}

export { EMPTY_PERIOD as MANAGER_PATIENT_ANALYSIS_DEFAULT_PERIOD };
