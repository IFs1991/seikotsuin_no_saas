import {
  addDaysToDateString,
  dateRangeDays,
  formatManagerAnalysisSeriesLabel,
  parseManagerAnalysisPeriodRequest,
  resolveManagerAnalysisPeriod,
  type ClinicComparisonPoint,
  type ManagerAnalysisBucket,
  type ManagerAnalysisPeriodRequest,
  type ManagerAnalysisPeriodType,
  type TimeSeriesPoint,
} from '@/lib/manager-analysis-period';

export const MANAGER_REVENUE_ANALYSIS_TARGETS = ['total', 'clinic'] as const;
export const MANAGER_REVENUE_COMPARE_MODES = [
  'previous_period',
  'none',
] as const;

export type ManagerRevenueAnalysisTarget =
  (typeof MANAGER_REVENUE_ANALYSIS_TARGETS)[number];
export type ManagerRevenueCompareMode =
  (typeof MANAGER_REVENUE_COMPARE_MODES)[number];
export type ManagerRevenueAnalysisPeriodType = ManagerAnalysisPeriodType;
export type ManagerRevenueAnalysisBucket = ManagerAnalysisBucket;
export type ManagerRevenueAnalysisPeriodRequest = ManagerAnalysisPeriodRequest;

export type ManagerRevenueAnalysisPeriod =
  ManagerRevenueAnalysisPeriodRequest & {
    bucket: ManagerRevenueAnalysisBucket;
    label: string;
  };

export type ManagerRevenueAssignedClinic = {
  id: string;
  name: string;
};

export type ManagerRevenuePeriodTotalsRow = {
  clinic_id: string;
  operating_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  product_revenue: number;
  ticket_revenue: number;
  traffic_accident_revenue: number;
  workers_comp_revenue: number;
  patient_copay_estimated: number;
  insurer_receivable_estimated: number;
  private_revenue_estimated: number;
  visit_count: number;
  report_days: number;
  missing_report_days: number;
  needs_review_count: number;
  blocked_count: number;
  first_report_date: string | null;
};

export type ManagerRevenuePeriodSeriesRow = {
  bucket_start: string;
  bucket_end: string;
  operating_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  visit_count: number;
};

export type ManagerRevenueContextBreakdownRow = {
  revenue_context_code: string | null;
  revenue_context_name: string | null;
  total_revenue: number;
  item_count: number;
  needs_review_count: number;
  blocked_count: number;
};

export type RevenueBreakdownCode =
  | 'insurance'
  | 'private'
  | 'product'
  | 'ticket'
  | 'traffic_accident'
  | 'workers_comp'
  | 'other';

export type StackedTimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  insuranceRevenue: number;
  privateRevenue: number;
};

export type RevenueBreakdownPoint = {
  code: RevenueBreakdownCode;
  name: string;
  value: number;
  share: number;
  needsReviewCount: number;
  blockedCount: number;
};

export type ManagerRevenueClinicComparison = {
  clinicId: string;
  clinicName: string;
  operatingRevenue: number;
  revenueShare: number;
  visitCount: number;
  averageRevenuePerVisit: number;
  reportDays: number;
  missingReportDays: number;
  needsReviewCount: number;
  operatingRevenueChangeRate: number | null;
};

export type ManagerRevenueAnalysisSummary = {
  clinicCount: number;
  operatingRevenue: number;
  insuranceRevenue: number;
  privateRevenue: number;
  productRevenue: number;
  ticketRevenue: number;
  trafficAccidentRevenue: number;
  workersCompRevenue: number;
  patientCopayEstimated: number;
  insurerReceivableEstimated: number;
  privateRevenueEstimated: number;
  visitCount: number;
  averageRevenuePerVisit: number;
  reportDays: number;
  missingReportDays: number;
  needsReviewCount: number;
  blockedCount: number;
};

export type ManagerRevenueAnalysisComparison = {
  active: boolean;
  previousStartDate: string | null;
  previousEndDate: string | null;
  previousOperatingRevenue: number | null;
  operatingRevenueChangeRate: number | null;
  previousVisitCount: number | null;
  visitCountChangeRate: number | null;
  previousAverageRevenuePerVisit: number | null;
  averageRevenuePerVisitChangeRate: number | null;
};

export type ManagerRevenueAnalysisResponse = {
  period: ManagerRevenueAnalysisPeriod;
  target: {
    type: ManagerRevenueAnalysisTarget;
    clinicId: string | null;
  };
  assignedClinics: ManagerRevenueAssignedClinic[];
  summary: ManagerRevenueAnalysisSummary;
  comparison: ManagerRevenueAnalysisComparison;
  charts: {
    revenue: TimeSeriesPoint[];
    visits: TimeSeriesPoint[];
    averageRevenuePerVisit: TimeSeriesPoint[];
    insurancePrivateBreakdown: StackedTimeSeriesPoint[];
    contextBreakdown: RevenueBreakdownPoint[];
    clinicRevenueComparison: ClinicComparisonPoint[];
    clinicAverageRevenueComparison: ClinicComparisonPoint[];
  };
  clinicComparison: ManagerRevenueClinicComparison[];
  disclaimers: string[];
};

export type ParsedManagerRevenueAnalysisQuery =
  | {
      success: true;
      query: {
        clinicId: string | null;
        target: ManagerRevenueAnalysisTarget;
        period: ManagerRevenueAnalysisPeriodRequest;
        compare: ManagerRevenueCompareMode;
      };
    }
  | {
      success: false;
      message: string;
    };

export type ManagerRevenueComparisonPeriod = {
  active: boolean;
  previousStartDate: string | null;
  previousEndDate: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PERIOD_TYPE: ManagerRevenueAnalysisPeriodType = 'month';
const DEFAULT_COMPARE_MODE: ManagerRevenueCompareMode = 'previous_period';
const BASE_DISCLAIMERS = [
  'この画面の売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。',
  '患者分析の売上（予約ベース）とは集計方法が異なるため、数値は一致しません。',
] as const;

const ZERO_SUMMARY: ManagerRevenueAnalysisSummary = {
  clinicCount: 0,
  operatingRevenue: 0,
  insuranceRevenue: 0,
  privateRevenue: 0,
  productRevenue: 0,
  ticketRevenue: 0,
  trafficAccidentRevenue: 0,
  workersCompRevenue: 0,
  patientCopayEstimated: 0,
  insurerReceivableEstimated: 0,
  privateRevenueEstimated: 0,
  visitCount: 0,
  averageRevenuePerVisit: 0,
  reportDays: 0,
  missingReportDays: 0,
  needsReviewCount: 0,
  blockedCount: 0,
};

const INACTIVE_COMPARISON: ManagerRevenueAnalysisComparison = {
  active: false,
  previousStartDate: null,
  previousEndDate: null,
  previousOperatingRevenue: null,
  operatingRevenueChangeRate: null,
  previousVisitCount: null,
  visitCountChangeRate: null,
  previousAverageRevenuePerVisit: null,
  averageRevenuePerVisitChangeRate: null,
};

function isRevenueTarget(value: string): value is ManagerRevenueAnalysisTarget {
  return MANAGER_REVENUE_ANALYSIS_TARGETS.some(target => target === value);
}

function isCompareMode(value: string): value is ManagerRevenueCompareMode {
  return MANAGER_REVENUE_COMPARE_MODES.some(mode => mode === value);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

function changeRate(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  return roundToTwo(((current - previous) / previous) * 100);
}

const PERIOD_TYPE_LABELS: Record<ManagerRevenueAnalysisPeriodType, string> = {
  all: '全期間',
  month: '今月',
  previous_month: '先月',
  last_3_months: '直近3か月',
  year: '今年',
  custom: '任意期間',
};

function formatPeriodLabel(
  period: Pick<ManagerRevenueAnalysisPeriod, 'type' | 'startDate' | 'endDate'>
): string {
  if (period.type === 'all') return '全期間';
  if (!period.startDate || !period.endDate) return '期間未指定';

  return `${PERIOD_TYPE_LABELS[period.type]}（${period.startDate} - ${period.endDate}）`;
}

function normalizeTotalsRow(
  row: ManagerRevenuePeriodTotalsRow
): ManagerRevenuePeriodTotalsRow {
  return {
    clinic_id: row.clinic_id,
    operating_revenue: Math.round(toNumber(row.operating_revenue)),
    insurance_revenue: Math.round(toNumber(row.insurance_revenue)),
    private_revenue: Math.round(toNumber(row.private_revenue)),
    product_revenue: Math.round(toNumber(row.product_revenue)),
    ticket_revenue: Math.round(toNumber(row.ticket_revenue)),
    traffic_accident_revenue: Math.round(
      toNumber(row.traffic_accident_revenue)
    ),
    workers_comp_revenue: Math.round(toNumber(row.workers_comp_revenue)),
    patient_copay_estimated: Math.round(toNumber(row.patient_copay_estimated)),
    insurer_receivable_estimated: Math.round(
      toNumber(row.insurer_receivable_estimated)
    ),
    private_revenue_estimated: Math.round(
      toNumber(row.private_revenue_estimated)
    ),
    visit_count: toNumber(row.visit_count),
    report_days: toNumber(row.report_days),
    missing_report_days: toNumber(row.missing_report_days),
    needs_review_count: toNumber(row.needs_review_count),
    blocked_count: toNumber(row.blocked_count),
    first_report_date: row.first_report_date,
  };
}

function createZeroTotals(clinicId: string): ManagerRevenuePeriodTotalsRow {
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
  };
}

function summarizeTotals(
  totals: readonly ManagerRevenuePeriodTotalsRow[],
  clinicCount: number
): ManagerRevenueAnalysisSummary {
  const summary: ManagerRevenueAnalysisSummary = {
    ...ZERO_SUMMARY,
    clinicCount,
  };

  for (const row of totals) {
    summary.operatingRevenue += toNumber(row.operating_revenue);
    summary.insuranceRevenue += toNumber(row.insurance_revenue);
    summary.privateRevenue += toNumber(row.private_revenue);
    summary.productRevenue += toNumber(row.product_revenue);
    summary.ticketRevenue += toNumber(row.ticket_revenue);
    summary.trafficAccidentRevenue += toNumber(row.traffic_accident_revenue);
    summary.workersCompRevenue += toNumber(row.workers_comp_revenue);
    summary.patientCopayEstimated += toNumber(row.patient_copay_estimated);
    summary.insurerReceivableEstimated += toNumber(
      row.insurer_receivable_estimated
    );
    summary.privateRevenueEstimated += toNumber(row.private_revenue_estimated);
    summary.visitCount += toNumber(row.visit_count);
    summary.reportDays += toNumber(row.report_days);
    summary.missingReportDays += toNumber(row.missing_report_days);
    summary.needsReviewCount += toNumber(row.needs_review_count);
    summary.blockedCount += toNumber(row.blocked_count);
  }

  summary.averageRevenuePerVisit = Math.round(
    average(summary.operatingRevenue, summary.visitCount)
  );

  return summary;
}

function normalizeContextCode(value: string | null): RevenueBreakdownCode {
  switch (value) {
    case 'insurance':
    case 'private':
    case 'product':
    case 'ticket':
    case 'traffic_accident':
    case 'workers_comp':
      return value;
    default:
      return 'other';
  }
}

function contextName(code: RevenueBreakdownCode): string {
  const labels: Record<RevenueBreakdownCode, string> = {
    insurance: '保険',
    private: '自費',
    product: '物販',
    ticket: '回数券',
    traffic_accident: '交通事故',
    workers_comp: '労災',
    other: 'その他',
  };
  return labels[code];
}

function buildContextBreakdown(params: {
  summary: ManagerRevenueAnalysisSummary;
  contextRows: readonly ManagerRevenueContextBreakdownRow[];
}): RevenueBreakdownPoint[] {
  const breakdownByCode = new Map<
    RevenueBreakdownCode,
    RevenueBreakdownPoint
  >();
  const total = params.summary.operatingRevenue;

  const upsert = (point: RevenueBreakdownPoint) => {
    const existing = breakdownByCode.get(point.code);
    if (!existing) {
      breakdownByCode.set(point.code, point);
      return;
    }

    breakdownByCode.set(point.code, {
      ...existing,
      value: existing.value + point.value,
      needsReviewCount: existing.needsReviewCount + point.needsReviewCount,
      blockedCount: existing.blockedCount + point.blockedCount,
    });
  };

  upsert({
    code: 'insurance',
    name: contextName('insurance'),
    value: params.summary.insuranceRevenue,
    share: 0,
    needsReviewCount: 0,
    blockedCount: 0,
  });
  upsert({
    code: 'private',
    name: contextName('private'),
    value: params.summary.privateRevenue,
    share: 0,
    needsReviewCount: 0,
    blockedCount: 0,
  });

  for (const row of params.contextRows) {
    const code = normalizeContextCode(row.revenue_context_code);
    // 保険・自費の金額は daily_reports 由来の summary 値が正であり、
    // context summary の行はカウント（要確認/ブロック）のみ合算する（二重計上防止）。
    const isDailyReportSourced = code === 'insurance' || code === 'private';
    upsert({
      code,
      name: row.revenue_context_name ?? contextName(code),
      value: isDailyReportSourced ? 0 : Math.round(toNumber(row.total_revenue)),
      share: 0,
      needsReviewCount: toNumber(row.needs_review_count),
      blockedCount: toNumber(row.blocked_count),
    });
  }

  const order: RevenueBreakdownCode[] = [
    'insurance',
    'private',
    'product',
    'ticket',
    'traffic_accident',
    'workers_comp',
    'other',
  ];

  return order
    .map(code => breakdownByCode.get(code))
    .filter((point): point is RevenueBreakdownPoint => Boolean(point))
    .map(point => ({
      ...point,
      share: total > 0 ? roundToTwo((point.value / total) * 100) : 0,
    }));
}

function toTimeSeries(
  rows: readonly ManagerRevenuePeriodSeriesRow[],
  bucket: ManagerRevenueAnalysisBucket,
  selectValue: (row: ManagerRevenuePeriodSeriesRow) => number
): TimeSeriesPoint[] {
  return rows.map(row => ({
    bucketStart: row.bucket_start,
    bucketEnd: row.bucket_end,
    label: formatManagerAnalysisSeriesLabel(row.bucket_start, bucket),
    value: selectValue(row),
  }));
}

function toStackedSeries(
  rows: readonly ManagerRevenuePeriodSeriesRow[],
  bucket: ManagerRevenueAnalysisBucket
): StackedTimeSeriesPoint[] {
  return rows.map(row => ({
    bucketStart: row.bucket_start,
    bucketEnd: row.bucket_end,
    label: formatManagerAnalysisSeriesLabel(row.bucket_start, bucket),
    insuranceRevenue: Math.round(toNumber(row.insurance_revenue)),
    privateRevenue: Math.round(toNumber(row.private_revenue)),
  }));
}

function totalsMap(rows: readonly ManagerRevenuePeriodTotalsRow[]) {
  return new Map(
    rows.map(row => {
      const normalized = normalizeTotalsRow(row);
      return [normalized.clinic_id, normalized] as const;
    })
  );
}

function buildComparison(
  current: ManagerRevenueAnalysisSummary,
  previous: ManagerRevenueAnalysisSummary,
  period: ManagerRevenueComparisonPeriod
): ManagerRevenueAnalysisComparison {
  if (!period.active) {
    return INACTIVE_COMPARISON;
  }

  return {
    active: true,
    previousStartDate: period.previousStartDate,
    previousEndDate: period.previousEndDate,
    previousOperatingRevenue: previous.operatingRevenue,
    operatingRevenueChangeRate: changeRate(
      current.operatingRevenue,
      previous.operatingRevenue
    ),
    previousVisitCount: previous.visitCount,
    visitCountChangeRate: changeRate(current.visitCount, previous.visitCount),
    previousAverageRevenuePerVisit: previous.averageRevenuePerVisit,
    averageRevenuePerVisitChangeRate: changeRate(
      current.averageRevenuePerVisit,
      previous.averageRevenuePerVisit
    ),
  };
}

function buildClinicComparison(params: {
  assignedClinics: readonly ManagerRevenueAssignedClinic[];
  currentTotals: ReadonlyMap<string, ManagerRevenuePeriodTotalsRow>;
  previousTotals: ReadonlyMap<string, ManagerRevenuePeriodTotalsRow>;
  totalOperatingRevenue: number;
}): ManagerRevenueClinicComparison[] {
  return params.assignedClinics
    .map(clinic => {
      const current =
        params.currentTotals.get(clinic.id) ?? createZeroTotals(clinic.id);
      const previous =
        params.previousTotals.get(clinic.id) ?? createZeroTotals(clinic.id);

      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        operatingRevenue: current.operating_revenue,
        revenueShare:
          params.totalOperatingRevenue > 0
            ? roundToTwo(
                (current.operating_revenue / params.totalOperatingRevenue) * 100
              )
            : 0,
        visitCount: current.visit_count,
        averageRevenuePerVisit: Math.round(
          average(current.operating_revenue, current.visit_count)
        ),
        reportDays: current.report_days,
        missingReportDays: current.missing_report_days,
        needsReviewCount: current.needs_review_count,
        operatingRevenueChangeRate: changeRate(
          current.operating_revenue,
          previous.operating_revenue
        ),
      };
    })
    .sort(
      (left, right) =>
        right.operatingRevenue - left.operatingRevenue ||
        left.clinicName.localeCompare(right.clinicName, 'ja')
    );
}

function buildDisclaimers(
  summary: ManagerRevenueAnalysisSummary,
  contextRows: readonly ManagerRevenueContextBreakdownRow[]
): string[] {
  const disclaimers: string[] = [...BASE_DISCLAIMERS];

  if (summary.missingReportDays > 0) {
    disclaimers.push(
      '未提出の日報があるため、期間集計は暫定値です。',
      '※未提出日数には定休日も含まれます。'
    );
  }

  const hasEstimatedAmounts =
    summary.patientCopayEstimated > 0 ||
    summary.insurerReceivableEstimated > 0 ||
    summary.privateRevenueEstimated > 0 ||
    summary.trafficAccidentRevenue > 0 ||
    summary.workersCompRevenue > 0 ||
    contextRows.some(row =>
      ['traffic_accident', 'workers_comp'].includes(
        row.revenue_context_code ?? ''
      )
    );

  if (hasEstimatedAmounts) {
    disclaimers.push(
      '一部の金額は経営分析用の概算です。請求確定額ではありません。'
    );
  }

  return disclaimers;
}

export function parseManagerRevenueAnalysisQuery(
  searchParams: URLSearchParams
): ParsedManagerRevenueAnalysisQuery {
  const parsedPeriod = parseManagerAnalysisPeriodRequest(
    searchParams,
    DEFAULT_PERIOD_TYPE
  );
  if (parsedPeriod.success === false) {
    return parsedPeriod;
  }

  const targetText = searchParams.get('target') ?? 'total';
  if (!isRevenueTarget(targetText)) {
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

  const compareText = searchParams.get('compare') ?? DEFAULT_COMPARE_MODE;
  if (!isCompareMode(compareText)) {
    return {
      success: false,
      message: 'compare の値が正しくありません',
    };
  }

  return {
    success: true,
    query: {
      clinicId,
      target: targetText,
      period: parsedPeriod.period,
      compare: compareText,
    },
  };
}

export function resolveManagerRevenueAnalysisPeriod(
  request: ManagerRevenueAnalysisPeriodRequest,
  now: Date = new Date()
): ManagerRevenueAnalysisPeriod {
  const period = resolveManagerAnalysisPeriod(request, {
    now,
    clampPresetEndToToday: true,
  });

  return {
    ...period,
    label: formatPeriodLabel(period),
  };
}

export function resolveManagerRevenueComparisonPeriod(
  period: ManagerRevenueAnalysisPeriod,
  compare: ManagerRevenueCompareMode
): ManagerRevenueComparisonPeriod {
  if (
    compare === 'none' ||
    period.type === 'all' ||
    !period.startDate ||
    !period.endDate
  ) {
    return {
      active: false,
      previousStartDate: null,
      previousEndDate: null,
    };
  }

  const days = dateRangeDays(period.startDate, period.endDate);
  const previousEndDate = addDaysToDateString(period.startDate, -1);
  const previousStartDate = addDaysToDateString(previousEndDate, -(days - 1));

  return {
    active: true,
    previousStartDate,
    previousEndDate,
  };
}

export function buildManagerRevenueAnalysis(params: {
  assignedClinics: readonly ManagerRevenueAssignedClinic[];
  target: ManagerRevenueAnalysisTarget;
  selectedClinicId: string | null;
  period: ManagerRevenueAnalysisPeriod;
  comparisonPeriod: ManagerRevenueComparisonPeriod;
  allPeriodTotals: readonly ManagerRevenuePeriodTotalsRow[];
  previousPeriodTotals: readonly ManagerRevenuePeriodTotalsRow[];
  periodSeries: readonly ManagerRevenuePeriodSeriesRow[];
  contextBreakdown: readonly ManagerRevenueContextBreakdownRow[];
}): ManagerRevenueAnalysisResponse {
  const assignedClinics = [...params.assignedClinics].sort((left, right) =>
    left.name.localeCompare(right.name, 'ja')
  );
  const allTotalsByClinicId = totalsMap(params.allPeriodTotals);
  const previousTotalsByClinicId = totalsMap(params.previousPeriodTotals);
  const targetClinicIds =
    params.target === 'clinic' && params.selectedClinicId
      ? [params.selectedClinicId]
      : assignedClinics.map(clinic => clinic.id);

  const targetTotals = targetClinicIds.map(
    clinicId => allTotalsByClinicId.get(clinicId) ?? createZeroTotals(clinicId)
  );
  const previousTargetTotals = targetClinicIds.map(
    clinicId =>
      previousTotalsByClinicId.get(clinicId) ?? createZeroTotals(clinicId)
  );
  const summary = summarizeTotals(targetTotals, targetClinicIds.length);
  const previousSummary = summarizeTotals(
    previousTargetTotals,
    targetClinicIds.length
  );
  const totalOperatingRevenue =
    params.target === 'clinic'
      ? assignedClinics.reduce(
          (sum, clinic) =>
            sum + (allTotalsByClinicId.get(clinic.id)?.operating_revenue ?? 0),
          0
        )
      : summary.operatingRevenue;
  const clinicComparison = buildClinicComparison({
    assignedClinics,
    currentTotals: allTotalsByClinicId,
    previousTotals: previousTotalsByClinicId,
    totalOperatingRevenue,
  });

  return {
    period: params.period,
    target: {
      type: params.target,
      clinicId: params.target === 'clinic' ? params.selectedClinicId : null,
    },
    assignedClinics,
    summary,
    comparison: buildComparison(
      summary,
      previousSummary,
      params.comparisonPeriod
    ),
    charts: {
      revenue: toTimeSeries(params.periodSeries, params.period.bucket, row =>
        Math.round(toNumber(row.operating_revenue))
      ),
      visits: toTimeSeries(params.periodSeries, params.period.bucket, row =>
        toNumber(row.visit_count)
      ),
      averageRevenuePerVisit: toTimeSeries(
        params.periodSeries,
        params.period.bucket,
        row =>
          Math.round(
            average(toNumber(row.operating_revenue), toNumber(row.visit_count))
          )
      ),
      insurancePrivateBreakdown: toStackedSeries(
        params.periodSeries,
        params.period.bucket
      ),
      contextBreakdown: buildContextBreakdown({
        summary,
        contextRows: params.contextBreakdown,
      }),
      clinicRevenueComparison: clinicComparison.map(clinic => ({
        clinicId: clinic.clinicId,
        clinicName: clinic.clinicName,
        value: clinic.operatingRevenue,
      })),
      clinicAverageRevenueComparison: clinicComparison.map(clinic => ({
        clinicId: clinic.clinicId,
        clinicName: clinic.clinicName,
        value: clinic.averageRevenuePerVisit,
      })),
    },
    clinicComparison,
    disclaimers: buildDisclaimers(summary, params.contextBreakdown),
  };
}
