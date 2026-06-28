import {
  buildCalendarDays,
  buildUpsertDraft,
  enumeratePeriodDates,
  getPeriodEditability,
  inferTimePreset,
  summarizeCalendarDays,
  toApiDateTimeFromJst,
  toJstDateStringFromIso,
  type ShiftRequestCalendarPeriod,
  type ShiftRequestCalendarRequest,
} from '@/lib/staff/shift-requests/calendar-model';
import {
  buildWeekdayBulkDrafts,
  copyPreviousRequestsByWeekday,
} from '@/lib/staff/shift-requests/calendar-transform';

const PERIOD: ShiftRequestCalendarPeriod = {
  id: 'period-current',
  clinic_id: 'clinic-1',
  title: '2026年7月シフト希望',
  period_start: '2026-07-01',
  period_end: '2026-07-07',
  submission_deadline: '2026-06-30T09:00:00.000Z',
  status: 'open',
};

const PREVIOUS_PERIOD: ShiftRequestCalendarPeriod = {
  id: 'period-previous',
  clinic_id: 'clinic-1',
  title: '2026年6月シフト希望',
  period_start: '2026-06-01',
  period_end: '2026-06-07',
  submission_deadline: '2026-05-31T09:00:00.000Z',
  status: 'open',
};

function buildRequest(
  overrides: Partial<ShiftRequestCalendarRequest>
): ShiftRequestCalendarRequest {
  return {
    id: 'request-1',
    clinic_id: 'clinic-1',
    period_id: PERIOD.id,
    staff_id: 'staff-1',
    request_type: 'available',
    start_time: toApiDateTimeFromJst('2026-07-02', '15:00'),
    end_time: toApiDateTimeFromJst('2026-07-02', '22:30'),
    priority: 3,
    status: 'submitted',
    note: null,
    rejection_reason: null,
    converted_shift_id: null,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('shift request calendar model', () => {
  it('builds inclusive period dates and JST date strings', () => {
    expect(enumeratePeriodDates('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(toJstDateStringFromIso('2026-06-30T15:30:00.000Z')).toBe(
      '2026-07-01'
    );
  });

  it('infers afternoon preset from stored start/end time', () => {
    expect(
      inferTimePreset(
        toApiDateTimeFromJst('2026-07-02', '15:00'),
        toApiDateTimeFromJst('2026-07-02', '22:30')
      )
    ).toBe('afternoon');
  });

  it('summarizes missing, rejected, dirty, and preset days', () => {
    const requests = [
      buildRequest({ id: 'pm-request' }),
      buildRequest({
        id: 'rejected-request',
        request_type: 'day_off',
        start_time: toApiDateTimeFromJst('2026-07-03', '10:45'),
        end_time: toApiDateTimeFromJst('2026-07-03', '22:30'),
        status: 'rejected',
        rejection_reason: '理由を確認してください',
      }),
    ];
    const draft = buildUpsertDraft({
      date: '2026-07-04',
      request_type: 'unavailable',
      time_preset: 'full_day',
      note: '予定あり',
    });

    const days = buildCalendarDays({
      period: PERIOD,
      requests,
      drafts: [draft],
      now: new Date('2026-06-25T00:00:00.000Z'),
    });
    const summary = summarizeCalendarDays(days);

    expect(summary.totalDays).toBe(7);
    expect(summary.enteredDays).toBe(3);
    expect(summary.missingDays).toBe(4);
    expect(summary.afternoonDays).toBe(1);
    expect(summary.dayOffDays).toBe(1);
    expect(summary.unavailableDays).toBe(1);
    expect(summary.dirtyDays).toBe(1);
    expect(summary.rejectedDays).toBe(1);
    expect(summary.noteDays).toBe(1);
    expect(days.find(day => day.date === '2026-07-04')?.ariaLabel).toContain(
      '未保存の変更あり'
    );
  });

  it('returns disabled reasons for closed or expired periods', () => {
    expect(
      getPeriodEditability(
        { ...PERIOD, status: 'closed' },
        new Date('2026-06-25T00:00:00.000Z')
      ).reason
    ).toBe('受付中ではないため本人編集できません');
    expect(
      getPeriodEditability(PERIOD, new Date('2026-07-01T00:00:00.000Z')).reason
    ).toBe('提出期限を過ぎたため本人編集できません');
  });

  it('builds weekday bulk drafts with overwrite counts', () => {
    const days = buildCalendarDays({
      period: PERIOD,
      requests: [buildRequest({ id: 'existing-tuesday' })],
      drafts: [],
      now: new Date('2026-06-25T00:00:00.000Z'),
    });
    const result = buildWeekdayBulkDrafts({
      days,
      input: {
        weekday: 4,
        request_type: 'day_off',
        time_preset: 'full_day',
      },
    });

    expect(result.targetDates).toEqual(['2026-07-02']);
    expect(result.overwriteDates).toEqual(['2026-07-02']);
    expect(result.drafts[0]?.request_type).toBe('day_off');
  });

  it('copies previous requests by same weekday occurrence without submitting', () => {
    const currentDays = buildCalendarDays({
      period: PERIOD,
      requests: [],
      drafts: [],
      now: new Date('2026-06-25T00:00:00.000Z'),
    });
    const previousRequests = [
      buildRequest({
        id: 'previous-monday',
        period_id: PREVIOUS_PERIOD.id,
        request_type: 'available',
        start_time: toApiDateTimeFromJst('2026-06-01', '15:00'),
        end_time: toApiDateTimeFromJst('2026-06-01', '22:30'),
      }),
    ];

    const result = copyPreviousRequestsByWeekday({
      currentPeriod: PERIOD,
      currentDays,
      previousPeriod: PREVIOUS_PERIOD,
      previousRequests,
    });

    expect(result.targetDates).toEqual(['2026-07-06']);
    expect(result.drafts[0]?.time_preset).toBe('afternoon');
    expect(result.drafts[0]?.status).toBe('submitted');
  });
});
