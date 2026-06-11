export const MANAGER_ANALYSIS_PERIOD_TYPES = [
  'all',
  'month',
  'previous_month',
  'last_3_months',
  'year',
  'custom',
] as const;

export const MANAGER_ANALYSIS_BUCKETS = ['daily', 'weekly', 'monthly'] as const;

export type ManagerAnalysisPeriodType =
  (typeof MANAGER_ANALYSIS_PERIOD_TYPES)[number];
export type ManagerAnalysisBucket = (typeof MANAGER_ANALYSIS_BUCKETS)[number];

export type ManagerAnalysisPeriodRequest = {
  type: ManagerAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
};

export type ManagerAnalysisPeriod = ManagerAnalysisPeriodRequest & {
  bucket: ManagerAnalysisBucket;
};

export type TimeSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  value: number;
};

export type ClinicComparisonPoint = {
  clinicId: string;
  clinicName: string;
  value: number;
};

export type ParsedManagerAnalysisPeriodRequest =
  | {
      success: true;
      period: ManagerAnalysisPeriodRequest;
    }
  | {
      success: false;
      message: string;
    };

export const MAX_CUSTOM_PERIOD_DAYS = 1095;
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export function isManagerAnalysisPeriodType(
  value: string
): value is ManagerAnalysisPeriodType {
  return MANAGER_ANALYSIS_PERIOD_TYPES.some(type => type === value);
}

export function parseIsoDate(value: string): Date | null {
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

export function addDaysToDateString(value: string, days: number): string {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }

  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function dateOnlyToUtcTime(value: string): number {
  const parsed = parseIsoDate(value);
  return parsed ? parsed.getTime() : 0;
}

export function dateRangeDays(startDate: string, endDate: string): number {
  return (
    Math.floor(
      (dateOnlyToUtcTime(endDate) - dateOnlyToUtcTime(startDate)) / DAY_MS
    ) + 1
  );
}

export function chooseManagerAnalysisBucket(
  startDate: string | null,
  endDate: string | null
): ManagerAnalysisBucket {
  if (!startDate || !endDate) {
    return 'monthly';
  }

  const days = dateRangeDays(startDate, endDate);
  if (days <= 31) return 'daily';
  if (days <= 180) return 'weekly';
  return 'monthly';
}

export function parseManagerAnalysisPeriodRequest(
  searchParams: URLSearchParams,
  defaultPeriodType: ManagerAnalysisPeriodType = 'month'
): ParsedManagerAnalysisPeriodRequest {
  const periodText = searchParams.get('period') ?? defaultPeriodType;
  if (!isManagerAnalysisPeriodType(periodText)) {
    return {
      success: false,
      message: 'period の値が正しくありません',
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
    period: {
      type: periodText,
      startDate: periodText === 'custom' ? startDateText : null,
      endDate: periodText === 'custom' ? endDateText : null,
    },
  };
}

export function resolveManagerAnalysisPeriod(
  request: ManagerAnalysisPeriodRequest,
  options: {
    now?: Date;
    clampPresetEndToToday?: boolean;
  } = {}
): ManagerAnalysisPeriod {
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
      bucket: chooseManagerAnalysisBucket(request.startDate, request.endDate),
    };
  }

  const today = getJstDateParts(options.now ?? new Date());
  const endForCurrentPeriod = options.clampPresetEndToToday
    ? today
    : endOfMonth(today);

  if (request.type === 'previous_month') {
    const previousMonth = addMonths(today, -1);
    const startDate = formatDateParts(startOfMonth(previousMonth));
    const endDate = formatDateParts(endOfMonth(previousMonth));
    return {
      type: 'previous_month',
      startDate,
      endDate,
      bucket: chooseManagerAnalysisBucket(startDate, endDate),
    };
  }

  if (request.type === 'last_3_months') {
    const firstMonth = addMonths(today, -2);
    const startDate = formatDateParts(startOfMonth(firstMonth));
    const endDate = formatDateParts(endForCurrentPeriod);
    return {
      type: 'last_3_months',
      startDate,
      endDate,
      bucket: chooseManagerAnalysisBucket(startDate, endDate),
    };
  }

  if (request.type === 'year') {
    const startDate = formatDateParts({
      year: today.year,
      month: 1,
      day: 1,
    });
    const endDate = options.clampPresetEndToToday
      ? formatDateParts(today)
      : formatDateParts({
          year: today.year,
          month: 12,
          day: 31,
        });
    return {
      type: 'year',
      startDate,
      endDate,
      bucket: chooseManagerAnalysisBucket(startDate, endDate),
    };
  }

  const startDate = formatDateParts(startOfMonth(today));
  const endDate = formatDateParts(endForCurrentPeriod);
  return {
    type: 'month',
    startDate,
    endDate,
    bucket: chooseManagerAnalysisBucket(startDate, endDate),
  };
}

export function resolveManagerAnalysisRpcTimestampBounds(
  period: ManagerAnalysisPeriod
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

export function formatManagerAnalysisSeriesLabel(
  bucketStart: string,
  bucket: ManagerAnalysisBucket
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
