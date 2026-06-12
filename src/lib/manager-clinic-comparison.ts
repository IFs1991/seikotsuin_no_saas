import {
  addDaysToDateString,
  dateRangeDays,
  parseManagerAnalysisPeriodRequest,
  resolveManagerAnalysisPeriod,
  type ManagerAnalysisPeriod,
  type ManagerAnalysisPeriodRequest,
} from '@/lib/manager-analysis-period';
import type { ManagerRevenuePeriodTotalsRow } from '@/lib/manager-revenue-analysis';
import type {
  ManagerClinicComparisonClinic,
  ManagerClinicComparisonCompareMode,
  ManagerClinicComparisonResponse,
} from '@/types/manager-clinic-comparison';

export const MANAGER_CLINIC_COMPARISON_COMPARE_MODES = [
  'previous_period',
  'none',
] as const;

export type ManagerClinicComparisonReservationRecord = {
  id: string;
  clinicId: string;
  status: string | null;
};

export type ParsedManagerClinicComparisonQuery =
  | {
      success: true;
      query: {
        period: ManagerAnalysisPeriodRequest;
        compare: ManagerClinicComparisonCompareMode;
      };
    }
  | {
      success: false;
      message: string;
    };

export type ManagerClinicComparisonResolvedPeriod = ManagerAnalysisPeriod & {
  compare: ManagerClinicComparisonCompareMode;
};

export type ManagerClinicComparisonPreviousPeriod = {
  active: boolean;
  previousStartDate: string | null;
  previousEndDate: string | null;
};

const DEFAULT_COMPARE_MODE: ManagerClinicComparisonCompareMode =
  'previous_period';
const COMPLETED_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'arrived',
]);
const CANCELED_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'cancelled',
  'no_show',
]);
const BASE_DISCLAIMERS = [
  '売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。',
  '予約数は予約テーブルを期間内の予約開始日時で集計しています。',
] as const;

function isCompareMode(
  value: string
): value is ManagerClinicComparisonCompareMode {
  return MANAGER_CLINIC_COMPARISON_COMPARE_MODES.some(mode => mode === value);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function changeRate(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }

  return roundToTwo(((current - previous) / previous) * 100);
}

function cancellationRate(cancelled: number, total: number): number {
  return total > 0 ? roundToTwo((cancelled / total) * 100) : 0;
}

function createRevenueByClinic(
  rows: readonly ManagerRevenuePeriodTotalsRow[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.clinic_id, Math.round(toNumber(row.operating_revenue)));
  }
  return map;
}

function createReservationCounts(
  reservations: readonly ManagerClinicComparisonReservationRecord[]
): Map<string, { total: number; completed: number; cancelled: number }> {
  const counts = new Map<
    string,
    { total: number; completed: number; cancelled: number }
  >();

  for (const reservation of reservations) {
    let entry = counts.get(reservation.clinicId);
    if (!entry) {
      entry = { total: 0, completed: 0, cancelled: 0 };
      counts.set(reservation.clinicId, entry);
    }

    entry.total += 1;
    const status = reservation.status ?? '';
    if (COMPLETED_STATUSES.has(status)) {
      entry.completed += 1;
    }
    if (CANCELED_STATUSES.has(status)) {
      entry.cancelled += 1;
    }
  }

  return counts;
}

export function parseManagerClinicComparisonQuery(
  searchParams: URLSearchParams
): ParsedManagerClinicComparisonQuery {
  const parsedPeriod = parseManagerAnalysisPeriodRequest(searchParams, 'month');
  if (parsedPeriod.success === false) {
    return parsedPeriod;
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
      period: parsedPeriod.period,
      compare: compareText,
    },
  };
}

export function resolveManagerClinicComparisonPeriod(
  request: ManagerAnalysisPeriodRequest,
  compare: ManagerClinicComparisonCompareMode,
  now: Date = new Date()
): ManagerClinicComparisonResolvedPeriod {
  return {
    ...resolveManagerAnalysisPeriod(request, {
      now,
      clampPresetEndToToday: true,
    }),
    compare,
  };
}

export function resolveManagerClinicComparisonPreviousPeriod(
  period: ManagerClinicComparisonResolvedPeriod
): ManagerClinicComparisonPreviousPeriod {
  if (
    period.compare === 'none' ||
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

export function buildManagerClinicComparison(params: {
  generatedAt: string;
  period: ManagerClinicComparisonResolvedPeriod;
  clinics: readonly ManagerClinicComparisonClinic[];
  currentRevenueTotals: readonly ManagerRevenuePeriodTotalsRow[];
  previousRevenueTotals: readonly ManagerRevenuePeriodTotalsRow[];
  reservations: readonly ManagerClinicComparisonReservationRecord[];
  previousReservations: readonly ManagerClinicComparisonReservationRecord[];
}): ManagerClinicComparisonResponse {
  const clinics = [...params.clinics].sort((left, right) =>
    left.name.localeCompare(right.name, 'ja')
  );
  const currentRevenueByClinic = createRevenueByClinic(
    params.currentRevenueTotals
  );
  const previousRevenueByClinic = createRevenueByClinic(
    params.previousRevenueTotals
  );
  const currentReservationCounts = createReservationCounts(params.reservations);
  const previousReservationCounts = createReservationCounts(
    params.previousReservations
  );

  return {
    generatedAt: params.generatedAt,
    period: {
      preset: params.period.type,
      startDate: params.period.startDate,
      endDate: params.period.endDate,
      bucket: params.period.bucket,
      compare: params.period.compare,
    },
    clinics,
    rows: clinics
      .map(clinic => {
        const currentReservations = currentReservationCounts.get(clinic.id) ?? {
          total: 0,
          completed: 0,
          cancelled: 0,
        };
        const previousReservations = previousReservationCounts.get(
          clinic.id
        ) ?? {
          total: 0,
          completed: 0,
          cancelled: 0,
        };
        const totalRevenue = currentRevenueByClinic.get(clinic.id) ?? 0;
        const previousRevenue = previousRevenueByClinic.get(clinic.id) ?? 0;

        return {
          clinicId: clinic.id,
          clinicName: clinic.name,
          totalRevenue,
          reservationCount: currentReservations.total,
          completedReservationCount: currentReservations.completed,
          cancellationRate: cancellationRate(
            currentReservations.cancelled,
            currentReservations.total
          ),
          revenueChangeRate: changeRate(totalRevenue, previousRevenue),
          reservationChangeRate: changeRate(
            currentReservations.total,
            previousReservations.total
          ),
        };
      })
      .sort(
        (left, right) =>
          right.totalRevenue - left.totalRevenue ||
          left.clinicName.localeCompare(right.clinicName, 'ja')
      ),
    disclaimers: [...BASE_DISCLAIMERS],
  };
}
