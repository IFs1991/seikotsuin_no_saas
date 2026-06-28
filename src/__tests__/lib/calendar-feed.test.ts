import {
  buildCalendarIcs,
  createCalendarFeedToken,
  hashCalendarFeedToken,
  type CalendarIcsShiftRow,
} from '@/lib/calendar-feed';

function shift(
  overrides: Partial<CalendarIcsShiftRow> = {}
): CalendarIcsShiftRow {
  return {
    id: 'shift-a',
    clinic_id: 'clinic-a',
    staff_id: 'staff-a',
    staff_profile_id: 'profile-a',
    home_clinic_id: 'clinic-home',
    assignment_type: 'help',
    time_preset: 'afternoon',
    start_time: '2026-07-01T06:00:00.000Z',
    end_time: '2026-07-01T13:30:00.000Z',
    status: 'confirmed',
    notes: null,
    resources: { id: 'staff-a', name: '佐藤 太郎', clinic_id: 'clinic-home' },
    clinics: { id: 'clinic-a', name: '道玄坂院' },
    ...overrides,
  };
}

describe('calendar-feed utilities', () => {
  it('creates random raw tokens and stores deterministic hashes only', () => {
    const token = createCalendarFeedToken();
    const secondToken = createCalendarFeedToken();

    expect(token).not.toBe(secondToken);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashCalendarFeedToken(token)).toBe(hashCalendarFeedToken(token));
    expect(hashCalendarFeedToken(token)).not.toContain(token);
  });

  it('builds a staff ICS feed with help shift summary', () => {
    const ics = buildCalendarIcs({
      feedName: '個人シフト',
      feedType: 'staff',
      shifts: [shift()],
      generatedAt: new Date('2026-06-26T00:00:00.000Z'),
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:ヘルプ勤務：道玄坂院');
    expect(ics).toContain('DTSTART:20260701T060000Z');
    expect(ics).toContain('DTEND:20260701T133000Z');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('builds a clinic ICS feed with staff name and help suffix', () => {
    const ics = buildCalendarIcs({
      feedName: '院ロスター',
      feedType: 'clinic',
      shifts: [shift()],
      generatedAt: new Date('2026-06-26T00:00:00.000Z'),
    });

    expect(ics).toContain('SUMMARY:佐藤 太郎 15:00-22:30 ヘルプ');
  });
});
