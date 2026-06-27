import type {
  ShiftRequestPeriodStatus,
  ShiftRequestStatus,
  ShiftRequestType,
} from './types';
import {
  DEFAULT_SHIFT_PRESETS,
  SHIFT_REQUEST_TIME_PRESET_LABELS,
  resolveShiftPresetRange,
  type ShiftRequestTimePreset,
} from './time-presets';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export interface ShiftRequestCalendarPeriod {
  id: string;
  clinic_id: string;
  title: string;
  period_start: string;
  period_end: string;
  submission_deadline: string;
  status: ShiftRequestPeriodStatus;
}

export interface ShiftRequestCalendarRequest {
  id: string;
  clinic_id: string;
  period_id: string;
  staff_id: string;
  request_type: ShiftRequestType;
  start_time: string;
  end_time: string;
  priority: number;
  status: ShiftRequestStatus;
  note: string | null;
  rejection_reason: string | null;
  converted_shift_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ShiftRequestEffectiveDay {
  requestId?: string;
  request_type: ShiftRequestType;
  time_preset: ShiftRequestTimePreset;
  start_time: string;
  end_time: string;
  priority: number;
  status?: ShiftRequestStatus;
  note: string;
  rejection_reason?: string | null;
}

export interface ShiftRequestDraftDay {
  date: string;
  action: 'upsert' | 'clear';
  requestId?: string;
  request_type?: ShiftRequestType;
  time_preset?: ShiftRequestTimePreset;
  start_time?: string;
  end_time?: string;
  priority: number;
  status: 'submitted';
  note: string;
}

export interface ShiftRequestCalendarDay {
  date: string;
  dayNumber: number;
  weekday: number;
  weekdayLabel: string;
  serverRequest?: ShiftRequestCalendarRequest;
  draft?: ShiftRequestDraftDay;
  effectiveRequest?: ShiftRequestEffectiveDay;
  isDirty: boolean;
  isMissing: boolean;
  isRejected: boolean;
  isEditable: boolean;
  disabledReason: string | null;
  badgeLabel: string;
  badgeDescription: string;
  ariaLabel: string;
  hasNote: boolean;
}

export interface ShiftRequestCalendarSummary {
  totalDays: number;
  enteredDays: number;
  missingDays: number;
  dirtyDays: number;
  rejectedDays: number;
  availableDays: number;
  preferredDays: number;
  dayOffDays: number;
  unavailableDays: number;
  morningDays: number;
  afternoonDays: number;
  lateDays: number;
  customTimeDays: number;
  noteDays: number;
  readyRate: number;
}

export interface PeriodEditability {
  canEdit: boolean;
  reason: string | null;
  isDeadlineNear: boolean;
  daysUntilDeadline: number | null;
}

export interface BuildDraftInput {
  date: string;
  requestId?: string;
  request_type: ShiftRequestType;
  time_preset: ShiftRequestTimePreset;
  customStart?: string;
  customEnd?: string;
  priority?: number;
  note?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function createUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateString(dateString: string, days: number): string {
  const date = createUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function enumeratePeriodDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDaysToDateString(current, 1);
  }

  return dates;
}

export function getWeekday(dateString: string): number {
  return createUtcDate(dateString).getUTCDay();
}

export function getDayNumber(dateString: string): number {
  return Number(dateString.slice(8, 10));
}

export function formatShortDate(dateString: string): string {
  return `${Number(dateString.slice(5, 7))}/${Number(dateString.slice(8, 10))}`;
}

export function formatPeriodMonthTitle(
  period: ShiftRequestCalendarPeriod | null
): string {
  if (!period) {
    return 'シフト希望';
  }

  const year = Number(period.period_start.slice(0, 4));
  const month = Number(period.period_start.slice(5, 7));
  return `${year}年${month}月シフト希望`;
}

export function toJstDateStringFromIso(value: string): string {
  const jst = new Date(new Date(value).getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

export function toJstTimeStringFromIso(value: string): string {
  const jst = new Date(new Date(value).getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(11, 16);
}

export function toApiDateTimeFromJst(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export function isValidLocalTimeRange(start: string, end: string): boolean {
  return (
    /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && end > start
  );
}

export function resolveDayTimeRange({
  date,
  preset,
  customStart,
  customEnd,
}: {
  date: string;
  preset: ShiftRequestTimePreset;
  customStart?: string;
  customEnd?: string;
}) {
  const range = resolveShiftPresetRange(
    preset,
    customStart && customEnd
      ? { start: customStart, end: customEnd }
      : undefined
  );

  return {
    start_time: toApiDateTimeFromJst(date, range.start),
    end_time: toApiDateTimeFromJst(date, range.end),
  };
}

export function inferTimePreset(
  startTime: string,
  endTime: string
): ShiftRequestTimePreset {
  const start = toJstTimeStringFromIso(startTime);
  const end = toJstTimeStringFromIso(endTime);

  for (const [preset, range] of Object.entries(DEFAULT_SHIFT_PRESETS)) {
    if (range.start === start && range.end === end) {
      return preset as ShiftRequestTimePreset;
    }
  }

  return 'custom';
}

export function buildUpsertDraft(input: BuildDraftInput): ShiftRequestDraftDay {
  const range = resolveDayTimeRange({
    date: input.date,
    preset: input.time_preset,
    customStart: input.customStart,
    customEnd: input.customEnd,
  });

  return {
    date: input.date,
    action: 'upsert',
    requestId: input.requestId,
    request_type: input.request_type,
    time_preset: input.time_preset,
    start_time: range.start_time,
    end_time: range.end_time,
    priority: input.priority ?? 3,
    status: 'submitted',
    note: input.note?.trim() ?? '',
  };
}

export function buildClearDraft({
  date,
  requestId,
}: {
  date: string;
  requestId?: string;
}): ShiftRequestDraftDay {
  return {
    date,
    action: 'clear',
    requestId,
    priority: 3,
    status: 'submitted',
    note: '',
  };
}

export function getEffectiveRequestFromServer(
  request: ShiftRequestCalendarRequest
): ShiftRequestEffectiveDay | undefined {
  if (request.status === 'withdrawn') {
    return undefined;
  }

  return {
    requestId: request.id,
    request_type: request.request_type,
    time_preset: inferTimePreset(request.start_time, request.end_time),
    start_time: request.start_time,
    end_time: request.end_time,
    priority: request.priority,
    status: request.status,
    note: request.note ?? '',
    rejection_reason: request.rejection_reason,
  };
}

export function getEffectiveRequestFromDraft(
  draft: ShiftRequestDraftDay
): ShiftRequestEffectiveDay | undefined {
  if (
    draft.action === 'clear' ||
    !draft.request_type ||
    !draft.time_preset ||
    !draft.start_time ||
    !draft.end_time
  ) {
    return undefined;
  }

  return {
    requestId: draft.requestId,
    request_type: draft.request_type,
    time_preset: draft.time_preset,
    start_time: draft.start_time,
    end_time: draft.end_time,
    priority: draft.priority,
    status: draft.status,
    note: draft.note,
  };
}

function groupServerRequestsByDate(requests: ShiftRequestCalendarRequest[]) {
  const grouped = new Map<string, ShiftRequestCalendarRequest>();
  const sortedRequests = [...requests].sort((left, right) =>
    left.start_time.localeCompare(right.start_time)
  );

  for (const request of sortedRequests) {
    const date = toJstDateStringFromIso(request.start_time);
    if (!grouped.has(date) && request.status !== 'withdrawn') {
      grouped.set(date, request);
    }
  }

  return grouped;
}

export function getPeriodEditability(
  period: ShiftRequestCalendarPeriod | null,
  now: Date = new Date()
): PeriodEditability {
  if (!period) {
    return {
      canEdit: false,
      reason: '提出期間が選択されていません',
      isDeadlineNear: false,
      daysUntilDeadline: null,
    };
  }

  const deadlineTime = new Date(period.submission_deadline).getTime();
  const remainingMs = deadlineTime - now.getTime();
  const daysUntilDeadline = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  if (period.status !== 'open') {
    return {
      canEdit: false,
      reason: '受付中ではないため本人編集できません',
      isDeadlineNear: false,
      daysUntilDeadline,
    };
  }

  if (remainingMs < 0) {
    return {
      canEdit: false,
      reason: '提出期限を過ぎたため本人編集できません',
      isDeadlineNear: false,
      daysUntilDeadline,
    };
  }

  return {
    canEdit: true,
    reason: null,
    isDeadlineNear: daysUntilDeadline <= 2,
    daysUntilDeadline,
  };
}

function getDayDisabledReason(
  periodEditability: PeriodEditability,
  request: ShiftRequestCalendarRequest | undefined
): string | null {
  if (!periodEditability.canEdit) {
    return periodEditability.reason;
  }

  if (request?.status === 'approved') {
    return '承認済みの希望は本人編集できません';
  }

  if (request?.status === 'converted') {
    return '確定シフトへ変換済みの希望は編集できません';
  }

  return null;
}

function getBadge(effectiveRequest: ShiftRequestEffectiveDay | undefined) {
  if (!effectiveRequest) {
    return { label: '未', description: '未入力' };
  }

  if (effectiveRequest.request_type === 'preferred') {
    return { label: '◎', description: '優先希望' };
  }

  if (effectiveRequest.request_type === 'day_off') {
    return { label: '休', description: '休み希望' };
  }

  if (effectiveRequest.request_type === 'unavailable') {
    return { label: '×', description: '出勤不可' };
  }

  if (effectiveRequest.time_preset === 'morning') {
    return { label: 'AM', description: '午前のみ可' };
  }

  if (effectiveRequest.time_preset === 'afternoon') {
    return { label: 'PM', description: '午後から可' };
  }

  if (effectiveRequest.time_preset === 'late') {
    return { label: '遅', description: '遅番可' };
  }

  if (effectiveRequest.time_preset === 'custom') {
    return { label: '時', description: 'カスタム時間' };
  }

  return { label: '○', description: '出勤可能' };
}

function buildAriaLabel({
  date,
  weekdayLabel,
  badgeDescription,
  isDirty,
  isRejected,
  hasNote,
  disabledReason,
}: {
  date: string;
  weekdayLabel: string;
  badgeDescription: string;
  isDirty: boolean;
  isRejected: boolean;
  hasNote: boolean;
  disabledReason: string | null;
}): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const parts = [`${month}月${day}日 ${weekdayLabel}曜日`, badgeDescription];

  if (isRejected) parts.push('差戻し');
  if (isDirty) parts.push('未保存の変更あり');
  if (hasNote) parts.push('メモあり');
  if (disabledReason) parts.push(disabledReason);
  parts.push(disabledReason ? '編集不可' : 'タップして編集');

  return parts.join('、');
}

export function buildCalendarDays({
  period,
  requests,
  drafts,
  now,
}: {
  period: ShiftRequestCalendarPeriod | null;
  requests: ShiftRequestCalendarRequest[];
  drafts: readonly ShiftRequestDraftDay[];
  now?: Date;
}): ShiftRequestCalendarDay[] {
  if (!period) {
    return [];
  }

  const requestByDate = groupServerRequestsByDate(requests);
  const draftByDate = new Map(drafts.map(draft => [draft.date, draft]));
  const editability = getPeriodEditability(period, now);

  return enumeratePeriodDates(period.period_start, period.period_end).map(
    date => {
      const serverRequest = requestByDate.get(date);
      const draft = draftByDate.get(date);
      const effectiveRequest = draft
        ? getEffectiveRequestFromDraft(draft)
        : serverRequest
          ? getEffectiveRequestFromServer(serverRequest)
          : undefined;
      const weekday = getWeekday(date);
      const weekdayLabel = WEEKDAY_LABELS[weekday] ?? '';
      const disabledReason = getDayDisabledReason(editability, serverRequest);
      const badge =
        serverRequest?.status === 'rejected' && !draft
          ? { label: '差', description: '差戻し' }
          : getBadge(effectiveRequest);
      const hasNote = Boolean(effectiveRequest?.note.trim());
      const isDirty = Boolean(draft);
      const isRejected = serverRequest?.status === 'rejected' && !draft;

      return {
        date,
        dayNumber: getDayNumber(date),
        weekday,
        weekdayLabel,
        serverRequest,
        draft,
        effectiveRequest,
        isDirty,
        isMissing: !effectiveRequest,
        isRejected,
        isEditable: !disabledReason,
        disabledReason,
        badgeLabel: badge.label,
        badgeDescription: badge.description,
        ariaLabel: buildAriaLabel({
          date,
          weekdayLabel,
          badgeDescription: badge.description,
          isDirty,
          isRejected,
          hasNote,
          disabledReason,
        }),
        hasNote,
      };
    }
  );
}

export function summarizeCalendarDays(
  days: readonly ShiftRequestCalendarDay[]
): ShiftRequestCalendarSummary {
  const summary: ShiftRequestCalendarSummary = {
    totalDays: days.length,
    enteredDays: 0,
    missingDays: 0,
    dirtyDays: 0,
    rejectedDays: 0,
    availableDays: 0,
    preferredDays: 0,
    dayOffDays: 0,
    unavailableDays: 0,
    morningDays: 0,
    afternoonDays: 0,
    lateDays: 0,
    customTimeDays: 0,
    noteDays: 0,
    readyRate: 0,
  };

  for (const day of days) {
    if (day.isMissing) {
      summary.missingDays += 1;
    } else {
      summary.enteredDays += 1;
    }

    if (day.isDirty) summary.dirtyDays += 1;
    if (day.isRejected) summary.rejectedDays += 1;
    if (day.hasNote) summary.noteDays += 1;

    const request = day.effectiveRequest;
    if (!request) continue;

    if (request.request_type === 'available') summary.availableDays += 1;
    if (request.request_type === 'preferred') summary.preferredDays += 1;
    if (request.request_type === 'day_off') summary.dayOffDays += 1;
    if (request.request_type === 'unavailable') summary.unavailableDays += 1;
    if (request.time_preset === 'morning') summary.morningDays += 1;
    if (request.time_preset === 'afternoon') summary.afternoonDays += 1;
    if (request.time_preset === 'late') summary.lateDays += 1;
    if (request.time_preset === 'custom') summary.customTimeDays += 1;
  }

  summary.readyRate =
    summary.totalDays === 0
      ? 0
      : Math.round((summary.enteredDays / summary.totalDays) * 100);

  return summary;
}

export function getRequestTypeLabel(requestType: ShiftRequestType): string {
  switch (requestType) {
    case 'available':
      return '出勤可能';
    case 'preferred':
      return '優先希望';
    case 'unavailable':
      return '出勤不可';
    case 'day_off':
      return '休み希望';
  }
}

export function getTimePresetLabel(preset: ShiftRequestTimePreset): string {
  return SHIFT_REQUEST_TIME_PRESET_LABELS[preset];
}

export function getDraftFeedbackLabel(draft: ShiftRequestDraftDay): string {
  if (draft.action === 'clear') {
    return '未入力';
  }

  if (!draft.request_type || !draft.time_preset) {
    return '未入力';
  }

  if (draft.request_type === 'available' && draft.time_preset !== 'full_day') {
    return `${getTimePresetLabel(draft.time_preset)}可`;
  }

  return getRequestTypeLabel(draft.request_type);
}

export function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = pad2(jst.getUTCMonth() + 1);
  const day = pad2(jst.getUTCDate());
  const hour = pad2(jst.getUTCHours());
  const minute = pad2(jst.getUTCMinutes());

  return `${year}/${month}/${day} ${hour}:${minute}`;
}
