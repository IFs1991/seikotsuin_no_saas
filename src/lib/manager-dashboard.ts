import type {
  ManagerDashboardAttentionItem,
  ManagerDashboardAttentionType,
  ManagerDashboardClinic,
  ManagerDashboardClinicCard,
  ManagerDashboardDate,
  ManagerDashboardDailyReportStatus,
  ManagerDashboardResponse,
  ManagerDashboardSeverity,
  ManagerDashboardTimelineItem,
  ManagerDashboardTimelineType,
} from '@/types/manager-dashboard';

export type ManagerDashboardDailyReportRow = {
  id: string;
  clinic_id: string;
  report_date: string;
  total_patients: number | null;
  total_revenue: number | null;
  insurance_revenue: number | null;
  private_revenue: number | null;
  updated_at: string | null;
};

export type ManagerDashboardReviewSignalRow = {
  clinic_id: string;
  report_date: string;
  estimate_status: string | null;
  updated_at?: string | null;
};

export type ManagerDashboardReservationRow = {
  id?: string | null;
  clinic_id: string | null;
  start_time: string | null;
  status: string | null;
};

export type BuildManagerDashboardInput = {
  generatedAt: string;
  date?: ManagerDashboardDate;
  now?: Date;
  clinics: readonly ManagerDashboardClinic[];
  dailyReports: readonly ManagerDashboardDailyReportRow[];
  reviewSignals: readonly ManagerDashboardReviewSignalRow[];
  reservations: readonly ManagerDashboardReservationRow[];
};

export type GenerateAttentionInput = {
  clinicCards: readonly ManagerDashboardClinicCard[];
};

export type GenerateTimelineInput = {
  generatedAt: string;
  clinicCards: readonly ManagerDashboardClinicCard[];
  attentionItems: readonly ManagerDashboardAttentionItem[];
  submittedReports: readonly ManagerDashboardDailyReportRow[];
};

const JST_TIMEZONE = 'Asia/Tokyo' as const;
const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_SIGNAL_STATUSES = [
  'needs_review',
  'draft',
  'rejected',
  'blocked',
] as const;
const REVIEW_STATUSES: ReadonlySet<string> = new Set(REVIEW_SIGNAL_STATUSES);
const CANCELLATION_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
  'no_show',
]);
const SEVERITY_ORDER: Record<ManagerDashboardSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};
const TIMELINE_TYPE_BY_ATTENTION_TYPE: Record<
  ManagerDashboardAttentionType,
  ManagerDashboardTimelineType
> = {
  missing_daily_report: 'daily_report_missing',
  needs_review: 'needs_review',
  low_revenue: 'low_revenue',
  low_reservations: 'low_reservations',
  high_cancellations: 'high_cancellations',
};

// Intl.DateTimeFormat の生成は高コストなのでモジュールスコープで使い回す。
// en-CA ロケールは YYYY-MM-DD を返す。
const JST_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseDateKey(dateKey: string): Date {
  const [yearText, monthText, dayText] = dateKey.split('-');
  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))
  );
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function toJstDateKey(date: Date): string {
  return JST_DATE_KEY_FORMATTER.format(date);
}

export function getManagerDashboardDateKeys(
  now = new Date()
): ManagerDashboardDate {
  const today = toJstDateKey(now);
  return {
    today,
    previousDay: addDaysToDateKey(today, -1),
    previousWeekday: addDaysToDateKey(today, -7),
    timezone: JST_TIMEZONE,
  };
}

export function getJstDateUtcRange(dateKey: string): {
  startIso: string;
  endIso: string;
} {
  const [yearText, monthText, dayText] = dateKey.split('-');
  const start = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), -9)
  );
  return {
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + DAY_MS).toISOString(),
  };
}

export function calculateChangeRate(
  current: number,
  base: number
): number | null {
  if (base === 0) {
    return null;
  }

  return (current - base) / base;
}

export function calculateCancellationRate(
  active: number,
  cancelled: number
): number | null {
  const denominator = active + cancelled;
  return denominator > 0 ? cancelled / denominator : null;
}

export function buildClinicLinks(
  clinicId: string
): ManagerDashboardClinicCard['links'] {
  const encodedClinicId = encodeURIComponent(clinicId);
  return {
    dailyReports: `/daily-reports?clinic_id=${encodedClinicId}`,
    reservations: `/reservations?view=timeline&clinic_id=${encodedClinicId}`,
    patients: `/patients?clinic_id=${encodedClinicId}`,
    revenue: `/revenue?clinic_id=${encodedClinicId}`,
  };
}

function getReportRevenue(
  report: ManagerDashboardDailyReportRow | null
): number {
  if (!report) {
    return 0;
  }

  if (typeof report.total_revenue === 'number') {
    return report.total_revenue;
  }

  return toNumber(report.insurance_revenue) + toNumber(report.private_revenue);
}

export function resolveDailyReportStatus(params: {
  todayReport: ManagerDashboardDailyReportRow | null;
  hasReviewSignal: boolean;
}): ManagerDashboardDailyReportStatus {
  if (!params.todayReport) {
    return 'missing';
  }

  return params.hasReviewSignal ? 'needs_review' : 'submitted';
}

type ReservationDayCounts = {
  active: number;
  cancelled: number;
};

const EMPTY_RESERVATION_COUNTS: ReservationDayCounts = {
  active: 0,
  cancelled: 0,
};

// 予約配列を一度だけ走査して `clinicId:jstDateKey` 単位で集計する。
// 院ごと×日付ごとのフルスキャンと、予約1件ごとの JST 変換の重複を避ける。
function bucketReservationCounts(
  reservations: readonly ManagerDashboardReservationRow[]
): Map<string, ReservationDayCounts> {
  const counts = new Map<string, ReservationDayCounts>();

  for (const reservation of reservations) {
    if (!reservation.clinic_id || !reservation.start_time) {
      continue;
    }

    const key = `${reservation.clinic_id}:${toJstDateKey(
      new Date(reservation.start_time)
    )}`;
    let entry = counts.get(key);
    if (!entry) {
      entry = { active: 0, cancelled: 0 };
      counts.set(key, entry);
    }

    if (CANCELLATION_STATUSES.has(reservation.status ?? '')) {
      entry.cancelled += 1;
    } else {
      entry.active += 1;
    }
  }

  return counts;
}

function buildReviewSignalKeySet(
  reviewSignals: readonly ManagerDashboardReviewSignalRow[]
): Set<string> {
  const keys = new Set<string>();

  for (const signal of reviewSignals) {
    if (signal.estimate_status && REVIEW_STATUSES.has(signal.estimate_status)) {
      keys.add(`${signal.clinic_id}:${signal.report_date}`);
    }
  }

  return keys;
}

function buildClinicCards(params: {
  date: ManagerDashboardDate;
  clinics: readonly ManagerDashboardClinic[];
  dailyReports: readonly ManagerDashboardDailyReportRow[];
  reviewSignals: readonly ManagerDashboardReviewSignalRow[];
  reservations: readonly ManagerDashboardReservationRow[];
}): ManagerDashboardClinicCard[] {
  const reportsByClinicAndDate = new Map<
    string,
    ManagerDashboardDailyReportRow
  >();
  for (const report of params.dailyReports) {
    reportsByClinicAndDate.set(
      `${report.clinic_id}:${report.report_date}`,
      report
    );
  }

  const reservationCounts = bucketReservationCounts(params.reservations);
  const reviewSignalKeys = buildReviewSignalKeySet(params.reviewSignals);

  return params.clinics.map(clinic => {
    const todayReport =
      reportsByClinicAndDate.get(`${clinic.id}:${params.date.today}`) ?? null;
    const previousDayReport =
      reportsByClinicAndDate.get(`${clinic.id}:${params.date.previousDay}`) ??
      null;
    const todayRevenue = getReportRevenue(todayReport);
    const previousDayRevenue = getReportRevenue(previousDayReport);
    const todayVisitCount = toNumber(todayReport?.total_patients);
    const todayCounts =
      reservationCounts.get(`${clinic.id}:${params.date.today}`) ??
      EMPTY_RESERVATION_COUNTS;
    const previousWeekdayCounts =
      reservationCounts.get(`${clinic.id}:${params.date.previousWeekday}`) ??
      EMPTY_RESERVATION_COUNTS;
    const reviewNeeded = reviewSignalKeys.has(
      `${clinic.id}:${params.date.today}`
    );

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      todayRevenue,
      previousDayRevenue,
      todayVisitCount,
      todayReservationCount: todayCounts.active,
      previousWeekdayReservationCount: previousWeekdayCounts.active,
      todayCancellationCount: todayCounts.cancelled,
      dailyReportStatus: resolveDailyReportStatus({
        todayReport,
        hasReviewSignal: reviewNeeded,
      }),
      revenueChangeRateFromPreviousDay: calculateChangeRate(
        todayRevenue,
        previousDayRevenue
      ),
      reservationChangeRateFromPreviousWeekday: calculateChangeRate(
        todayCounts.active,
        previousWeekdayCounts.active
      ),
      cancellationRate: calculateCancellationRate(
        todayCounts.active,
        todayCounts.cancelled
      ),
      links: buildClinicLinks(clinic.id),
    };
  });
}

function getDropSeverity(
  changeRate: number | null
): ManagerDashboardSeverity | null {
  if (changeRate === null || changeRate > -0.3) {
    return null;
  }

  return changeRate <= -0.5 ? 'critical' : 'warning';
}

function getCancellationSeverity(
  cancellationRate: number | null,
  denominator: number
): ManagerDashboardSeverity | null {
  if (cancellationRate === null || denominator < 3 || cancellationRate < 0.25) {
    return null;
  }

  return cancellationRate >= 0.4 ? 'critical' : 'warning';
}

export function sortAttentionItems(
  items: readonly ManagerDashboardAttentionItem[]
): ManagerDashboardAttentionItem[] {
  return [...items].sort((a, b) => {
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    const clinicDiff = a.clinicName.localeCompare(b.clinicName, 'ja');
    if (clinicDiff !== 0) {
      return clinicDiff;
    }

    return a.type.localeCompare(b.type);
  });
}

export function generateAttentionItems(
  input: GenerateAttentionInput
): ManagerDashboardAttentionItem[] {
  const items: ManagerDashboardAttentionItem[] = [];

  for (const card of input.clinicCards) {
    if (card.dailyReportStatus === 'missing') {
      items.push({
        id: `${card.clinicId}:missing_daily_report`,
        clinicId: card.clinicId,
        clinicName: card.clinicName,
        type: 'missing_daily_report',
        severity: 'critical',
        title: '日報が未提出です',
        description: `${card.clinicName} の本日の日報がまだ提出されていません。`,
        href: card.links.dailyReports,
      });
    }

    if (card.dailyReportStatus === 'needs_review') {
      items.push({
        id: `${card.clinicId}:needs_review`,
        clinicId: card.clinicId,
        clinicName: card.clinicName,
        type: 'needs_review',
        severity: 'warning',
        title: '日報に要確認項目があります',
        description: `${card.clinicName} の日報明細に確認が必要な項目があります。`,
        href: card.links.dailyReports,
      });
    }

    const revenueSeverity = getDropSeverity(
      card.revenueChangeRateFromPreviousDay
    );
    if (revenueSeverity) {
      items.push({
        id: `${card.clinicId}:low_revenue`,
        clinicId: card.clinicId,
        clinicName: card.clinicName,
        type: 'low_revenue',
        severity: revenueSeverity,
        title: '本日売上が前日より低下しています',
        description: `${card.clinicName} の本日売上が前日比で30%以上低下しています。`,
        href: card.links.revenue,
      });
    }

    const reservationSeverity = getDropSeverity(
      card.reservationChangeRateFromPreviousWeekday
    );
    if (reservationSeverity) {
      items.push({
        id: `${card.clinicId}:low_reservations`,
        clinicId: card.clinicId,
        clinicName: card.clinicName,
        type: 'low_reservations',
        severity: reservationSeverity,
        title: '予約数が前週同曜日より低下しています',
        description: `${card.clinicName} の本日予約数が前週同曜日比で30%以上低下しています。`,
        href: card.links.reservations,
      });
    }

    const cancellationSeverity = getCancellationSeverity(
      card.cancellationRate,
      card.todayReservationCount + card.todayCancellationCount
    );
    if (cancellationSeverity) {
      items.push({
        id: `${card.clinicId}:high_cancellations`,
        clinicId: card.clinicId,
        clinicName: card.clinicName,
        type: 'high_cancellations',
        severity: cancellationSeverity,
        title: 'キャンセル率が高くなっています',
        description: `${card.clinicName} の本日キャンセル率が25%以上です。`,
        href: card.links.reservations,
      });
    }
  }

  return sortAttentionItems(items);
}

function attentionToTimeline(
  generatedAt: string,
  item: ManagerDashboardAttentionItem
): ManagerDashboardTimelineItem {
  return {
    id: `attention:${item.id}`,
    occurredAt: generatedAt,
    clinicId: item.clinicId,
    clinicName: item.clinicName,
    type: TIMELINE_TYPE_BY_ATTENTION_TYPE[item.type],
    label: item.title,
    detail: item.description,
    href: item.href,
  };
}

export function generateTimeline(
  input: GenerateTimelineInput
): ManagerDashboardTimelineItem[] {
  const cardByClinicId = new Map(
    input.clinicCards.map(card => [card.clinicId, card])
  );
  const submittedEvents = input.submittedReports.map(report => {
    const card = cardByClinicId.get(report.clinic_id);
    const clinicName = card?.clinicName ?? '';
    return {
      id: `daily_report_submitted:${report.id}`,
      occurredAt: report.updated_at ?? input.generatedAt,
      clinicId: report.clinic_id,
      clinicName,
      type: 'daily_report_submitted' as const,
      label: '日報が提出されました',
      detail: `${clinicName} の本日の日報が提出されています。`,
      href:
        card?.links.dailyReports ??
        buildClinicLinks(report.clinic_id).dailyReports,
    };
  });
  const attentionEvents = input.attentionItems.map(item =>
    attentionToTimeline(input.generatedAt, item)
  );

  // ソート比較のたびに Date を生成しないよう epoch を先に解決しておく
  return [...submittedEvents, ...attentionEvents]
    .map(event => ({ event, occurredAtMs: Date.parse(event.occurredAt) }))
    .sort(
      (a, b) =>
        b.occurredAtMs - a.occurredAtMs ||
        a.event.clinicName.localeCompare(b.event.clinicName, 'ja')
    )
    .map(entry => entry.event);
}

function buildSummary(
  clinics: readonly ManagerDashboardClinic[],
  clinicCards: readonly ManagerDashboardClinicCard[]
): ManagerDashboardResponse['summary'] {
  const summary = {
    assignedClinicCount: clinics.length,
    todayRevenue: 0,
    todayVisitCount: 0,
    todayReservationCount: 0,
    submittedDailyReportCount: 0,
    missingDailyReportCount: 0,
    needsReviewCount: 0,
    lowRevenueClinicCount: 0,
    lowReservationClinicCount: 0,
    highCancellationClinicCount: 0,
  };

  for (const card of clinicCards) {
    summary.todayRevenue += card.todayRevenue;
    summary.todayVisitCount += card.todayVisitCount;
    summary.todayReservationCount += card.todayReservationCount;

    if (card.dailyReportStatus === 'submitted') {
      summary.submittedDailyReportCount += 1;
    } else if (card.dailyReportStatus === 'missing') {
      summary.missingDailyReportCount += 1;
    } else {
      summary.needsReviewCount += 1;
    }

    if (getDropSeverity(card.revenueChangeRateFromPreviousDay)) {
      summary.lowRevenueClinicCount += 1;
    }
    if (getDropSeverity(card.reservationChangeRateFromPreviousWeekday)) {
      summary.lowReservationClinicCount += 1;
    }
    if (
      getCancellationSeverity(
        card.cancellationRate,
        card.todayReservationCount + card.todayCancellationCount
      )
    ) {
      summary.highCancellationClinicCount += 1;
    }
  }

  return summary;
}

export function buildManagerDashboardResponse(
  input: BuildManagerDashboardInput
): ManagerDashboardResponse {
  const date = input.date ?? getManagerDashboardDateKeys(input.now);
  const clinicCards = buildClinicCards({
    date,
    clinics: input.clinics,
    dailyReports: input.dailyReports,
    reviewSignals: input.reviewSignals,
    reservations: input.reservations,
  });
  const attentionItems = generateAttentionItems({ clinicCards });
  const todaySubmittedReports = input.dailyReports.filter(
    report => report.report_date === date.today
  );
  const timeline = generateTimeline({
    generatedAt: input.generatedAt,
    clinicCards,
    attentionItems,
    submittedReports: todaySubmittedReports,
  });

  return {
    generatedAt: input.generatedAt,
    date,
    clinics: [...input.clinics],
    summary: buildSummary(input.clinics, clinicCards),
    attentionItems,
    clinicCards,
    timeline,
  };
}
