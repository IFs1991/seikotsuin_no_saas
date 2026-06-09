export const MANAGER_DAILY_REPORT_OVERVIEW_STATUSES = [
  'all',
  'submitted',
  'missing',
  'confirmed',
  'needs_review',
] as const;

export type ManagerDailyReportsOverviewStatus =
  (typeof MANAGER_DAILY_REPORT_OVERVIEW_STATUSES)[number];

export type ManagerDailyReportStatus = Exclude<
  ManagerDailyReportsOverviewStatus,
  'all'
>;

export type ManagerDailyReportsOverviewQuery = {
  clinicId: string;
  startDate: string;
  endDate: string;
  status?: ManagerDailyReportsOverviewStatus;
};

export type ManagerDailyReportOverviewRow = {
  id: string;
  report_date: string;
  total_patients: number | null;
  total_revenue: number | null;
  insurance_revenue: number | null;
  private_revenue: number | null;
  updated_at: string | null;
  status?: string | null;
};

export type ManagerDailyReportsOverview = {
  clinic: {
    id: string;
    name: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRevenue: number;
    averageRevenue: number;
    patientCount: number;
    averageRevenuePerPatient: number;
    missingReportDays: number;
    needsReviewDays: number;
  };
  timeline: Array<{
    date: string;
    totalRevenue: number;
    insuranceRevenue: number;
    privateRevenue: number;
    patientCount: number;
    averageRevenuePerPatient: number;
  }>;
  reports: Array<{
    id: string;
    date: string;
    status: ManagerDailyReportStatus;
    totalRevenue: number;
    patientCount: number;
    averageRevenuePerPatient: number;
    updatedAt: string;
  }>;
};

export type ParsedManagerOverviewQuery =
  | {
      success: true;
      query: Required<ManagerDailyReportsOverviewQuery>;
      dateRange: string[];
    }
  | {
      success: false;
      message: string;
    };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OVERVIEW_DAYS = 93;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function differenceInCalendarDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
}

export function isManagerDailyReportsOverviewStatus(
  value: string
): value is ManagerDailyReportsOverviewStatus {
  return MANAGER_DAILY_REPORT_OVERVIEW_STATUSES.some(
    status => status === value
  );
}

export function parseManagerOverviewQuery(
  searchParams: URLSearchParams
): ParsedManagerOverviewQuery {
  const clinicId = searchParams.get('clinic_id');
  const startDateText = searchParams.get('start_date');
  const endDateText = searchParams.get('end_date');
  const statusText = searchParams.get('status') ?? 'all';

  if (!clinicId || !startDateText || !endDateText) {
    return {
      success: false,
      message: 'clinic_id, start_date, end_date は必須です',
    };
  }

  if (!isManagerDailyReportsOverviewStatus(statusText)) {
    return {
      success: false,
      message: 'status の値が正しくありません',
    };
  }

  const startDate = parseIsoDate(startDateText);
  const endDate = parseIsoDate(endDateText);
  if (!startDate || !endDate) {
    return {
      success: false,
      message: '日付はYYYY-MM-DD形式で指定してください',
    };
  }

  const diffDays = differenceInCalendarDays(startDate, endDate);
  if (diffDays < 0) {
    return {
      success: false,
      message: 'start_date は end_date 以前の日付を指定してください',
    };
  }

  if (diffDays + 1 > MAX_OVERVIEW_DAYS) {
    return {
      success: false,
      message: '日付範囲は93日以内で指定してください',
    };
  }

  const dateRange = Array.from({ length: diffDays + 1 }, (_, index) =>
    toIsoDate(addDays(startDate, index))
  );

  return {
    success: true,
    query: {
      clinicId,
      startDate: startDateText,
      endDate: endDateText,
      status: statusText,
    },
    dateRange,
  };
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getReportRevenue(row: ManagerDailyReportOverviewRow): number {
  if (typeof row.total_revenue === 'number') {
    return row.total_revenue;
  }

  return toNumber(row.insurance_revenue) + toNumber(row.private_revenue);
}

function calculateAverage(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

export function mapManagerDailyReportStatus(
  status: string | null | undefined
): ManagerDailyReportStatus {
  if (status === undefined || status === 'submitted') {
    return 'submitted';
  }

  if (status === 'approved' || status === 'confirmed') {
    return 'confirmed';
  }

  if (status === null || status === 'draft' || status === 'rejected') {
    return 'needs_review';
  }

  return 'needs_review';
}

export function buildManagerDailyReportsOverview(params: {
  clinic: { id: string; name: string };
  startDate: string;
  endDate: string;
  status: ManagerDailyReportsOverviewStatus;
  dateRange: readonly string[];
  reports: readonly ManagerDailyReportOverviewRow[];
}): ManagerDailyReportsOverview {
  const reportsByDate = new Map<string, ManagerDailyReportOverviewRow>();
  for (const report of params.reports) {
    reportsByDate.set(report.report_date, report);
  }

  let totalRevenue = 0;
  let patientCount = 0;
  let existingReportCount = 0;
  let missingReportDays = 0;
  let needsReviewDays = 0;

  const timeline: ManagerDailyReportsOverview['timeline'] = [];
  const reports: ManagerDailyReportsOverview['reports'] = [];

  for (const date of params.dateRange) {
    const report = reportsByDate.get(date) ?? null;
    const status: ManagerDailyReportStatus = report
      ? mapManagerDailyReportStatus(report.status)
      : 'missing';
    const reportRevenue = report ? getReportRevenue(report) : 0;
    const insuranceRevenue = report ? toNumber(report.insurance_revenue) : 0;
    const privateRevenue = report ? toNumber(report.private_revenue) : 0;
    const reportPatientCount = report ? toNumber(report.total_patients) : 0;

    if (report) {
      totalRevenue += reportRevenue;
      patientCount += reportPatientCount;
      existingReportCount += 1;
    } else {
      missingReportDays += 1;
    }
    if (status === 'needs_review') {
      needsReviewDays += 1;
    }

    timeline.push({
      date,
      totalRevenue: reportRevenue,
      insuranceRevenue,
      privateRevenue,
      patientCount: reportPatientCount,
      averageRevenuePerPatient: calculateAverage(
        reportRevenue,
        reportPatientCount
      ),
    });

    if (params.status !== 'all' && status !== params.status) {
      continue;
    }

    reports.push({
      id: report?.id ?? `missing-${date}`,
      date,
      status,
      totalRevenue: reportRevenue,
      patientCount: reportPatientCount,
      averageRevenuePerPatient: calculateAverage(
        reportRevenue,
        reportPatientCount
      ),
      updatedAt: report?.updated_at ?? '',
    });
  }

  return {
    clinic: params.clinic,
    period: {
      startDate: params.startDate,
      endDate: params.endDate,
    },
    summary: {
      totalRevenue,
      averageRevenue: calculateAverage(totalRevenue, existingReportCount),
      patientCount,
      averageRevenuePerPatient: calculateAverage(totalRevenue, patientCount),
      missingReportDays,
      needsReviewDays,
    },
    timeline,
    reports,
  };
}
