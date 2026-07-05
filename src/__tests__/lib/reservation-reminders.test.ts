import {
  createReminderWindow,
  getDueReservationReminders,
} from '@/lib/notifications/reservation-reminders';
import { DEFAULT_BOOKING_CALENDAR_REMINDERS } from '@/lib/booking-calendar/settings';

describe('reservation reminder scheduling', () => {
  it('extracts day-before reminders inside the JST send window', () => {
    const window = createReminderWindow(
      new Date('2026-07-09T09:00:00.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T01:00:00.000Z',
      DEFAULT_BOOKING_CALENDAR_REMINDERS,
      window
    );

    expect(due).toEqual([
      {
        notificationType: 'reminder_day_before',
        scheduledFor: '2026-07-09T09:00:00.000Z',
      },
    ]);
  });

  it('extracts same-day reminders when enabled and inside the window', () => {
    const window = createReminderWindow(
      new Date('2026-07-10T01:00:00.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T04:00:00.000Z',
      {
        dayBefore: { enabled: false, sendAtHour: 18 },
        sameDay: { enabled: true, hoursBefore: 3 },
      },
      window
    );

    expect(due).toEqual([
      {
        notificationType: 'reminder_same_day',
        scheduledFor: '2026-07-10T01:00:00.000Z',
      },
    ]);
  });

  it('does not include reminders outside the previous-to-current window', () => {
    const window = createReminderWindow(
      new Date('2026-07-09T08:44:59.000Z'),
      15
    );

    const due = getDueReservationReminders(
      '2026-07-10T01:00:00.000Z',
      DEFAULT_BOOKING_CALENDAR_REMINDERS,
      window
    );

    expect(due).toEqual([]);
  });
});
