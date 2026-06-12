import {
  addDaysToDateString,
  dateOnlyToUtcTime,
  dateRangeDays,
  JST_OFFSET_MS,
  parseManagerAnalysisPeriodRequest,
  resolveManagerAnalysisPeriod,
  type ManagerAnalysisPeriodRequest,
} from '@/lib/manager-analysis-period';
import type {
  DailyReportItemMetricRecord,
  ManagerStaffAnalysisAttentionItem,
  ManagerStaffAnalysisAttentionSeverity,
  ManagerStaffAnalysisAttentionType,
  ManagerStaffAnalysisClinic,
  ManagerStaffAnalysisClinicComparisonRow,
  ManagerStaffAnalysisCompareMode,
  ManagerStaffAnalysisPeriod,
  ManagerStaffAnalysisResponse,
  ManagerStaffAnalysisStaffRow,
  ManagerStaffAnalysisStaffStatus,
  ManagerStaffAnalysisSummary,
  ManagerStaffAnalysisTarget,
  ManagerStaffAnalysisTrendPoint,
  ReservationMetricRecord,
  StaffResourceRecord,
  StaffShiftMetricRecord,
} from '@/types/manager-staff-analysis';

export const DEFAULT_MANAGER_STAFF_ANALYSIS_DISCLAIMERS = [
  'この画面は人事評価・給与査定・勤怠承認用ではありません。担当院の支援・状況把握を目的とした read-only 分析画面です。',
  'スタッフ別売上は daily_report_items.staff_resource_id に紐づく明細のみを集計しています。',
  'staff_resource_id が未設定の売上明細はスタッフ別ランキングには含まれません。',
  '予約件数と日報明細売上の件数・金額は一致しない場合があります。',
  '日報確認件数は v0.2 ではスタッフ別提出状態として扱わず、初期実装では0件として表示します。',
  '患者個人情報、スタッフの個人連絡先、権限情報はこの画面では表示しません。',
] as const;

export type ParsedManagerStaffAnalysisQuery =
  | {
      success: true;
      query: {
        target: ManagerStaffAnalysisTarget;
        clinicId: string | null;
        period: ManagerAnalysisPeriodRequest;
        compare: ManagerStaffAnalysisCompareMode;
      };
    }
  | {
      success: false;
      message: string;
    };

export type ManagerStaffAnalysisComparisonPeriod = {
  active: boolean;
  previousStartDate: string | null;
  previousEndDate: string | null;
};

export type BuildManagerStaffAnalysisInput = {
  generatedAt: string;
  period: ManagerStaffAnalysisPeriod;
  target: ManagerStaffAnalysisTarget;
  requestedClinicId: string | null;
  assignedClinics: ManagerStaffAnalysisClinic[];
  staffResources: StaffResourceRecord[];
  reservations: ReservationMetricRecord[];
  shifts: StaffShiftMetricRecord[];
  dailyReportItems: DailyReportItemMetricRecord[];
  previousReservations: ReservationMetricRecord[];
  previousDailyReportItems: DailyReportItemMetricRecord[];
};

type StaffAggregate = {
  reservationCount: number;
  completedReservationCount: number;
  canceledReservationCount: number;
  totalRevenue: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMPLETED_STATUSES = new Set(['completed', 'arrived']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled', 'no_show']);
const DEFAULT_COMPARE_MODE: ManagerStaffAnalysisCompareMode = 'previous_period';

const ZERO_SUMMARY: ManagerStaffAnalysisSummary = {
  staffCount: 0,
  workingStaffCount: 0,
  reservationCount: 0,
  completedReservationCount: 0,
  totalRevenue: 0,
  averageUnitPrice: 0,
  cancellationRate: 0,
  dailyReportIssueCount: 0,
  revenueChangeRate: null,
  reservationChangeRate: null,
};

function isTarget(value: string): value is ManagerStaffAnalysisTarget {
  return value === 'total' || value === 'clinic';
}

function isCompareMode(
  value: string
): value is ManagerStaffAnalysisCompareMode {
  return value === 'previous_period' || value === 'none';
}

function createEmptyAggregate(): StaffAggregate {
  return {
    reservationCount: 0,
    completedReservationCount: 0,
    canceledReservationCount: 0,
    totalRevenue: 0,
  };
}

function roundToFour(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function calculateManagerStaffChangeRate(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return null;
  }

  return roundToFour((current - previous) / previous);
}

function average(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

function cancellationRate(canceled: number, total: number): number {
  return total > 0 ? roundToFour(canceled / total) : 0;
}

function isCompletedReservation(status: string): boolean {
  return COMPLETED_STATUSES.has(status);
}

function isCanceledReservation(status: string): boolean {
  return CANCELED_STATUSES.has(status);
}

// date-only 文字列はそのまま、タイムスタンプはJST日付に変換する
// （DBクエリ境界が resolveManagerAnalysisRpcTimestampBounds でJST基準のため揃える）
function getDateKey(value: string): string {
  if (value.length <= 10) {
    return value;
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return value.slice(0, 10);
  }

  return new Date(time + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function getBucketDateKey(
  value: string,
  bucket: ManagerStaffAnalysisPeriod['bucket']
) {
  const dateKey = getDateKey(value);
  if (bucket === 'daily') {
    return dateKey;
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  if (bucket === 'monthly') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function compareNullableName(
  left: string | null,
  right: string | null
): number {
  return (left ?? '').localeCompare(right ?? '', 'ja');
}

function severityRank(severity: ManagerStaffAnalysisAttentionSeverity): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'warning':
      return 1;
    case 'info':
      return 2;
  }
}

function scopeClinicIds(params: {
  target: ManagerStaffAnalysisTarget;
  requestedClinicId: string | null;
  assignedClinics: readonly ManagerStaffAnalysisClinic[];
}) {
  if (params.target === 'clinic' && params.requestedClinicId) {
    return [params.requestedClinicId];
  }

  return params.assignedClinics.map(clinic => clinic.id);
}

function aggregateMetrics(params: {
  staffIds: ReadonlySet<string>;
  reservations: readonly ReservationMetricRecord[];
  dailyReportItems: readonly DailyReportItemMetricRecord[];
}): Map<string, StaffAggregate> {
  const aggregates = new Map<string, StaffAggregate>();
  const ensure = (staffId: string) => {
    const existing = aggregates.get(staffId);
    if (existing) {
      return existing;
    }

    const created = createEmptyAggregate();
    aggregates.set(staffId, created);
    return created;
  };

  for (const reservation of params.reservations) {
    if (!params.staffIds.has(reservation.staffId)) {
      continue;
    }

    const aggregate = ensure(reservation.staffId);
    aggregate.reservationCount += 1;
    if (isCompletedReservation(reservation.status)) {
      aggregate.completedReservationCount += 1;
    }
    if (isCanceledReservation(reservation.status)) {
      aggregate.canceledReservationCount += 1;
    }
  }

  for (const item of params.dailyReportItems) {
    if (!item.staffResourceId || !params.staffIds.has(item.staffResourceId)) {
      continue;
    }

    ensure(item.staffResourceId).totalRevenue += item.fee;
  }

  return aggregates;
}

function getWorkingStaffIds(params: {
  staffIds: ReadonlySet<string>;
  reservations: readonly ReservationMetricRecord[];
  shifts: readonly StaffShiftMetricRecord[];
  dailyReportItems: readonly DailyReportItemMetricRecord[];
}): Set<string> {
  const working = new Set<string>();

  for (const reservation of params.reservations) {
    if (params.staffIds.has(reservation.staffId)) {
      working.add(reservation.staffId);
    }
  }
  for (const shift of params.shifts) {
    if (params.staffIds.has(shift.staffId)) {
      working.add(shift.staffId);
    }
  }
  for (const item of params.dailyReportItems) {
    if (item.staffResourceId && params.staffIds.has(item.staffResourceId)) {
      working.add(item.staffResourceId);
    }
  }

  return working;
}

function sumStaffAggregates(
  staffIds: Iterable<string>,
  aggregates: ReadonlyMap<string, StaffAggregate>
): StaffAggregate {
  const totals = createEmptyAggregate();
  for (const staffId of staffIds) {
    const aggregate = aggregates.get(staffId);
    if (!aggregate) {
      continue;
    }

    totals.reservationCount += aggregate.reservationCount;
    totals.completedReservationCount += aggregate.completedReservationCount;
    totals.canceledReservationCount += aggregate.canceledReservationCount;
    totals.totalRevenue += aggregate.totalRevenue;
  }

  return totals;
}

function createAttentionItem(params: {
  type: ManagerStaffAnalysisAttentionType;
  severity: ManagerStaffAnalysisAttentionSeverity;
  staff: StaffResourceRecord;
  title: string;
  description: string;
  metricValue: number | null;
}): ManagerStaffAnalysisAttentionItem {
  return {
    id: `${params.type}:${params.staff.clinicId}:${params.staff.id}`,
    type: params.type,
    severity: params.severity,
    clinicId: params.staff.clinicId,
    clinicName: params.staff.clinicName,
    staffId: params.staff.id,
    staffName: params.staff.name,
    title: params.title,
    description: params.description,
    metricValue: params.metricValue,
  };
}

function buildStaffAttentionItems(params: {
  staff: StaffResourceRecord;
  row: Omit<
    ManagerStaffAnalysisStaffRow,
    'status' | 'revenueChangeRate' | 'reservationChangeRate'
  > & {
    revenueChangeRate: number | null;
    reservationChangeRate: number | null;
  };
  working: boolean;
}): ManagerStaffAnalysisAttentionItem[] {
  const items: ManagerStaffAnalysisAttentionItem[] = [];

  if (params.row.cancellationRate >= 0.3 && params.row.reservationCount >= 5) {
    items.push(
      createAttentionItem({
        type: 'high_cancellation_rate',
        severity: 'critical',
        staff: params.staff,
        title: 'キャンセル率が高いスタッフです',
        description: '予約件数5件以上でキャンセル率が30%以上です。',
        metricValue: params.row.cancellationRate,
      })
    );
  } else if (params.row.cancellationRate >= 0.2) {
    items.push(
      createAttentionItem({
        type: 'high_cancellation_rate',
        severity: 'warning',
        staff: params.staff,
        title: 'キャンセル率の確認が必要です',
        description: 'キャンセル率が20%以上です。',
        metricValue: params.row.cancellationRate,
      })
    );
  }

  if (
    params.row.reservationChangeRate !== null &&
    params.row.reservationChangeRate <= -0.3
  ) {
    items.push(
      createAttentionItem({
        type: 'reservation_drop',
        severity: 'warning',
        staff: params.staff,
        title: '予約対応数が低下しています',
        description: '前期間比で予約対応数が30%以上低下しています。',
        metricValue: params.row.reservationChangeRate,
      })
    );
  }

  if (
    params.row.revenueChangeRate !== null &&
    params.row.revenueChangeRate <= -0.3
  ) {
    items.push(
      createAttentionItem({
        type: 'revenue_drop',
        severity: 'warning',
        staff: params.staff,
        title: 'スタッフ帰属売上が低下しています',
        description: '前期間比でスタッフ帰属売上が30%以上低下しています。',
        metricValue: params.row.revenueChangeRate,
      })
    );
  }

  if (params.staff.isActive && !params.working) {
    items.push(
      createAttentionItem({
        type: 'low_activity',
        severity: 'info',
        staff: params.staff,
        title: '対象期間の稼働データがありません',
        description: '予約、シフト、スタッフ帰属売上明細がすべて0件です。',
        metricValue: 0,
      })
    );
  }

  return items;
}

function sortAttentionItems(
  items: readonly ManagerStaffAnalysisAttentionItem[]
): ManagerStaffAnalysisAttentionItem[] {
  return [...items].sort(
    (left, right) =>
      severityRank(left.severity) - severityRank(right.severity) ||
      left.clinicName.localeCompare(right.clinicName, 'ja') ||
      compareNullableName(left.staffName, right.staffName) ||
      left.type.localeCompare(right.type)
  );
}

function buildTrends(params: {
  period: ManagerStaffAnalysisPeriod;
  reservations: readonly ReservationMetricRecord[];
  dailyReportItems: readonly DailyReportItemMetricRecord[];
  staffById: ReadonlyMap<string, StaffResourceRecord>;
  targetClinicIds: ReadonlySet<string>;
}): ManagerStaffAnalysisTrendPoint[] {
  const byDate = new Map<
    string,
    {
      reservationCount: number;
      completedReservationCount: number;
      canceledReservationCount: number;
      totalRevenue: number;
    }
  >();
  const ensure = (date: string) => {
    const existing = byDate.get(date);
    if (existing) {
      return existing;
    }

    const created = {
      reservationCount: 0,
      completedReservationCount: 0,
      canceledReservationCount: 0,
      totalRevenue: 0,
    };
    byDate.set(date, created);
    return created;
  };

  for (const reservation of params.reservations) {
    if (!params.targetClinicIds.has(reservation.clinicId)) {
      continue;
    }

    const bucket = ensure(
      getBucketDateKey(reservation.startsAt, params.period.bucket)
    );
    bucket.reservationCount += 1;
    if (isCompletedReservation(reservation.status)) {
      bucket.completedReservationCount += 1;
    }
    if (isCanceledReservation(reservation.status)) {
      bucket.canceledReservationCount += 1;
    }
  }

  for (const item of params.dailyReportItems) {
    if (
      !item.staffResourceId ||
      !params.targetClinicIds.has(item.clinicId) ||
      !params.staffById.has(item.staffResourceId)
    ) {
      continue;
    }

    ensure(
      getBucketDateKey(item.reportDate, params.period.bucket)
    ).totalRevenue += item.fee;
  }

  return [...byDate.entries()]
    .map(([date, aggregate]) => ({
      date,
      clinicId: null,
      clinicName: null,
      staffId: null,
      staffName: null,
      reservationCount: aggregate.reservationCount,
      completedReservationCount: aggregate.completedReservationCount,
      totalRevenue: aggregate.totalRevenue,
      cancellationRate: cancellationRate(
        aggregate.canceledReservationCount,
        aggregate.reservationCount
      ),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function parseManagerStaffAnalysisQuery(
  searchParams: URLSearchParams
): ParsedManagerStaffAnalysisQuery {
  const parsedPeriod = parseManagerAnalysisPeriodRequest(searchParams, 'month');
  if (parsedPeriod.success === false) {
    return parsedPeriod;
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
      target: targetText,
      clinicId,
      period: parsedPeriod.period,
      compare: compareText,
    },
  };
}

export function resolveManagerStaffAnalysisPeriod(
  request: ManagerAnalysisPeriodRequest,
  compare: ManagerStaffAnalysisCompareMode,
  now: Date = new Date()
): ManagerStaffAnalysisPeriod {
  const period = resolveManagerAnalysisPeriod(request, {
    now,
    clampPresetEndToToday: true,
  });

  return {
    preset: period.type,
    startDate: period.startDate,
    endDate: period.endDate,
    bucket: period.bucket,
    compare,
  };
}

export function resolveManagerStaffAnalysisComparisonPeriod(
  period: ManagerStaffAnalysisPeriod
): ManagerStaffAnalysisComparisonPeriod {
  if (
    period.compare === 'none' ||
    period.preset === 'all' ||
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

export function dateIsWithinManagerStaffPeriod(
  value: string,
  period: Pick<ManagerStaffAnalysisPeriod, 'startDate' | 'endDate'>
): boolean {
  if (!period.startDate || !period.endDate) {
    return true;
  }

  const dateKey = getDateKey(value);
  const time = dateOnlyToUtcTime(dateKey);
  return (
    time >= dateOnlyToUtcTime(period.startDate) &&
    time <= dateOnlyToUtcTime(period.endDate)
  );
}

export function buildManagerStaffAnalysis(
  params: BuildManagerStaffAnalysisInput
): ManagerStaffAnalysisResponse {
  const assignedClinics = [...params.assignedClinics].sort((left, right) =>
    left.name.localeCompare(right.name, 'ja')
  );
  const assignedClinicIds = new Set(assignedClinics.map(clinic => clinic.id));
  const selectedClinicIds = new Set(
    scopeClinicIds({
      target: params.target,
      requestedClinicId: params.requestedClinicId,
      assignedClinics,
    }).filter(clinicId => assignedClinicIds.has(clinicId))
  );
  const clinicById = new Map(
    assignedClinics.map(clinic => [clinic.id, clinic])
  );
  const scopedStaff = params.staffResources.filter(
    staff =>
      selectedClinicIds.has(staff.clinicId) &&
      assignedClinicIds.has(staff.clinicId) &&
      !staff.isDeleted
  );
  const staffById = new Map(scopedStaff.map(staff => [staff.id, staff]));
  const staffIds = new Set(staffById.keys());
  const reservations = params.reservations.filter(
    reservation =>
      selectedClinicIds.has(reservation.clinicId) &&
      staffIds.has(reservation.staffId)
  );
  const shifts = params.shifts.filter(
    shift =>
      selectedClinicIds.has(shift.clinicId) && staffIds.has(shift.staffId)
  );
  const dailyReportItems = params.dailyReportItems.filter(item =>
    selectedClinicIds.has(item.clinicId)
  );
  const previousReservations = params.previousReservations.filter(
    reservation =>
      selectedClinicIds.has(reservation.clinicId) &&
      staffIds.has(reservation.staffId)
  );
  const previousDailyReportItems = params.previousDailyReportItems.filter(
    item => selectedClinicIds.has(item.clinicId)
  );
  const currentAggregates = aggregateMetrics({
    staffIds,
    reservations,
    dailyReportItems,
  });
  const previousAggregates = aggregateMetrics({
    staffIds,
    reservations: previousReservations,
    dailyReportItems: previousDailyReportItems,
  });
  const workingStaffIds = getWorkingStaffIds({
    staffIds,
    reservations,
    shifts,
    dailyReportItems,
  });
  const allAttentionItems: ManagerStaffAnalysisAttentionItem[] = [];

  const staffRows = scopedStaff
    .map(staff => {
      const current = currentAggregates.get(staff.id) ?? createEmptyAggregate();
      const previous =
        previousAggregates.get(staff.id) ?? createEmptyAggregate();
      const rowWithoutStatus = {
        staffId: staff.id,
        staffName: staff.name,
        clinicId: staff.clinicId,
        clinicName: staff.clinicName,
        isActive: staff.isActive,
        isBookable: staff.isBookable,
        reservationCount: current.reservationCount,
        completedReservationCount: current.completedReservationCount,
        totalRevenue: Math.round(current.totalRevenue),
        averageUnitPrice: average(
          current.totalRevenue,
          current.completedReservationCount
        ),
        cancellationRate: cancellationRate(
          current.canceledReservationCount,
          current.reservationCount
        ),
        revenueChangeRate: calculateManagerStaffChangeRate(
          current.totalRevenue,
          previous.totalRevenue
        ),
        reservationChangeRate: calculateManagerStaffChangeRate(
          current.reservationCount,
          previous.reservationCount
        ),
      };
      const attentionItems = buildStaffAttentionItems({
        staff,
        row: rowWithoutStatus,
        working: workingStaffIds.has(staff.id),
      });
      allAttentionItems.push(...attentionItems);
      const hasWarning = attentionItems.some(
        item => item.severity === 'critical' || item.severity === 'warning'
      );
      const status: ManagerStaffAnalysisStaffStatus =
        rowWithoutStatus.reservationCount < 3 &&
        rowWithoutStatus.totalRevenue === 0
          ? 'insufficient_data'
          : hasWarning
            ? 'needs_attention'
            : 'stable';

      return {
        ...rowWithoutStatus,
        status,
      };
    })
    .sort(
      (left, right) =>
        right.totalRevenue - left.totalRevenue ||
        right.reservationCount - left.reservationCount ||
        left.staffName.localeCompare(right.staffName, 'ja')
    );

  const compareActive = params.period.compare === 'previous_period';
  const currentTotals = sumStaffAggregates(staffIds, currentAggregates);
  const previousTotals = sumStaffAggregates(staffIds, previousAggregates);
  const summary: ManagerStaffAnalysisSummary = {
    ...ZERO_SUMMARY,
    staffCount: scopedStaff.filter(staff => staff.isActive).length,
    workingStaffCount: workingStaffIds.size,
    reservationCount: currentTotals.reservationCount,
    completedReservationCount: currentTotals.completedReservationCount,
    totalRevenue: Math.round(currentTotals.totalRevenue),
    averageUnitPrice: average(
      currentTotals.totalRevenue,
      currentTotals.completedReservationCount
    ),
    cancellationRate: cancellationRate(
      currentTotals.canceledReservationCount,
      currentTotals.reservationCount
    ),
    revenueChangeRate: compareActive
      ? calculateManagerStaffChangeRate(
          currentTotals.totalRevenue,
          previousTotals.totalRevenue
        )
      : null,
    reservationChangeRate: compareActive
      ? calculateManagerStaffChangeRate(
          currentTotals.reservationCount,
          previousTotals.reservationCount
        )
      : null,
  };

  const attentionItems = sortAttentionItems(allAttentionItems);
  const attentionStaffIds = new Set(
    attentionItems.flatMap(item =>
      item.staffId && item.severity !== 'info' ? [item.staffId] : []
    )
  );
  const clinicComparison: ManagerStaffAnalysisClinicComparisonRow[] =
    assignedClinics
      .filter(clinic => selectedClinicIds.has(clinic.id))
      .map(clinic => {
        const clinicStaff = scopedStaff.filter(
          staff => staff.clinicId === clinic.id
        );
        const totals = sumStaffAggregates(
          clinicStaff.map(staff => staff.id),
          currentAggregates
        );
        const workingStaffCount = clinicStaff.filter(staff =>
          workingStaffIds.has(staff.id)
        ).length;

        return {
          clinicId: clinic.id,
          clinicName: clinic.name,
          staffCount: clinicStaff.filter(staff => staff.isActive).length,
          workingStaffCount,
          reservationCount: totals.reservationCount,
          completedReservationCount: totals.completedReservationCount,
          totalRevenue: Math.round(totals.totalRevenue),
          averageRevenuePerStaff: average(
            totals.totalRevenue,
            workingStaffCount
          ),
          cancellationRate: cancellationRate(
            totals.canceledReservationCount,
            totals.reservationCount
          ),
          attentionStaffCount: clinicStaff.filter(staff =>
            attentionStaffIds.has(staff.id)
          ).length,
        };
      })
      .sort(
        (left, right) =>
          right.totalRevenue - left.totalRevenue ||
          left.clinicName.localeCompare(right.clinicName, 'ja')
      );

  const trends: ManagerStaffAnalysisTrendPoint[] = buildTrends({
    period: params.period,
    reservations,
    dailyReportItems,
    staffById,
    targetClinicIds: selectedClinicIds,
  });

  return {
    generatedAt: params.generatedAt,
    period: params.period,
    scope: {
      target: params.target,
      clinicId: params.target === 'clinic' ? params.requestedClinicId : null,
      clinics: assignedClinics,
    },
    summary,
    staff: staffRows,
    clinicComparison,
    trends,
    attentionItems,
    disclaimers: [...DEFAULT_MANAGER_STAFF_ANALYSIS_DISCLAIMERS],
  };
}
