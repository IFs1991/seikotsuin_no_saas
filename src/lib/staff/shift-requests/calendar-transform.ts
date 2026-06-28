import type { ShiftRequestType } from './types';
import {
  buildUpsertDraft,
  enumeratePeriodDates,
  getEffectiveRequestFromServer,
  getWeekday,
  toJstDateStringFromIso,
  toJstTimeStringFromIso,
  type BuildDraftInput,
  type ShiftRequestCalendarDay,
  type ShiftRequestCalendarPeriod,
  type ShiftRequestCalendarRequest,
  type ShiftRequestDraftDay,
} from './calendar-model';
import type { ShiftRequestTimePreset } from './time-presets';

export interface WeekdayBulkInput {
  weekday: number;
  request_type: ShiftRequestType;
  time_preset: ShiftRequestTimePreset;
  note?: string;
}

export interface BulkDraftResult {
  drafts: ShiftRequestDraftDay[];
  targetDates: string[];
  overwriteDates: string[];
}

function weekdayOccurrenceInRange(date: string, periodStart: string): number {
  const weekday = getWeekday(date);
  let current = periodStart;
  let occurrence = 0;

  while (current <= date) {
    if (getWeekday(current) === weekday) {
      occurrence += 1;
    }
    const next = new Date(`${current}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    current = next.toISOString().slice(0, 10);
  }

  return occurrence;
}

export function buildWeekdayBulkDrafts({
  days,
  input,
}: {
  days: readonly ShiftRequestCalendarDay[];
  input: WeekdayBulkInput;
}): BulkDraftResult {
  const targetDays = days.filter(
    day => day.weekday === input.weekday && day.isEditable
  );

  return {
    targetDates: targetDays.map(day => day.date),
    overwriteDates: targetDays
      .filter(day => Boolean(day.effectiveRequest))
      .map(day => day.date),
    drafts: targetDays.map(day =>
      buildUpsertDraft({
        date: day.date,
        requestId: day.serverRequest?.id,
        request_type: input.request_type,
        time_preset: input.time_preset,
        note: input.note,
      })
    ),
  };
}

export function copyPreviousRequestsByWeekday({
  currentPeriod,
  currentDays,
  previousPeriod,
  previousRequests,
}: {
  currentPeriod: ShiftRequestCalendarPeriod;
  currentDays: readonly ShiftRequestCalendarDay[];
  previousPeriod: ShiftRequestCalendarPeriod;
  previousRequests: readonly ShiftRequestCalendarRequest[];
}): BulkDraftResult {
  const previousByWeekdayOccurrence = new Map<
    string,
    ShiftRequestCalendarRequest
  >();

  for (const request of previousRequests) {
    const effective = getEffectiveRequestFromServer(request);
    if (!effective) continue;

    const date = toJstDateStringFromIso(request.start_time);
    const weekday = getWeekday(date);
    const occurrence = weekdayOccurrenceInRange(
      date,
      previousPeriod.period_start
    );
    const key = `${weekday}:${occurrence}`;

    if (!previousByWeekdayOccurrence.has(key)) {
      previousByWeekdayOccurrence.set(key, request);
    }
  }

  const currentDates = enumeratePeriodDates(
    currentPeriod.period_start,
    currentPeriod.period_end
  );
  const currentDayByDate = new Map(currentDays.map(day => [day.date, day]));
  const drafts: ShiftRequestDraftDay[] = [];
  const targetDates: string[] = [];
  const overwriteDates: string[] = [];

  for (const date of currentDates) {
    const day = currentDayByDate.get(date);
    if (!day?.isEditable) continue;

    const weekday = getWeekday(date);
    const occurrence = weekdayOccurrenceInRange(
      date,
      currentPeriod.period_start
    );
    const previous = previousByWeekdayOccurrence.get(
      `${weekday}:${occurrence}`
    );
    const effective = previous
      ? getEffectiveRequestFromServer(previous)
      : undefined;

    if (!effective) continue;

    const input: BuildDraftInput = {
      date,
      requestId: day.serverRequest?.id,
      request_type: effective.request_type,
      time_preset: effective.time_preset,
      note: effective.note,
      priority: effective.priority,
    };

    if (effective.time_preset === 'custom') {
      input.customStart = toJstTimeStringFromIso(effective.start_time);
      input.customEnd = toJstTimeStringFromIso(effective.end_time);
    }

    targetDates.push(date);
    if (day.effectiveRequest) overwriteDates.push(date);
    drafts.push(buildUpsertDraft(input));
  }

  return { drafts, targetDates, overwriteDates };
}

export function findPreviousShiftRequestPeriod(
  periods: readonly ShiftRequestCalendarPeriod[],
  selectedPeriod: ShiftRequestCalendarPeriod | null
): ShiftRequestCalendarPeriod | null {
  if (!selectedPeriod) {
    return null;
  }

  const candidates = periods
    .filter(period => period.period_end < selectedPeriod.period_start)
    .sort((left, right) => right.period_start.localeCompare(left.period_start));

  return candidates[0] ?? null;
}
