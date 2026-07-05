import { z } from 'zod';

export type BookingCalendarReminderSettings = {
  dayBefore: {
    enabled: boolean;
    sendAtHour: number;
  };
  sameDay: {
    enabled: boolean;
    hoursBefore: number;
  };
};

export const DEFAULT_BOOKING_CALENDAR_REMINDERS: BookingCalendarReminderSettings =
  {
    dayBefore: { enabled: true, sendAtHour: 18 },
    sameDay: { enabled: false, hoursBefore: 3 },
  };

export const BookingCalendarRemindersSchema = z.object({
  dayBefore: z
    .object({
      enabled: z.boolean().optional(),
      sendAtHour: z
        .number()
        .int()
        .min(8, '前日リマインダーは8時以降にしてください')
        .max(21, '前日リマインダーは21時以前にしてください')
        .optional(),
    })
    .optional(),
  sameDay: z
    .object({
      enabled: z.boolean().optional(),
      hoursBefore: z
        .number()
        .int()
        .min(1, '当日リマインダーは1時間前以上にしてください')
        .max(12, '当日リマインダーは12時間前以内にしてください')
        .optional(),
    })
    .optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getBoundedInteger(
  value: unknown,
  min: number,
  max: number
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

export function normalizeBookingCalendarReminders(
  value: unknown
): BookingCalendarReminderSettings {
  if (!isRecord(value)) {
    return DEFAULT_BOOKING_CALENDAR_REMINDERS;
  }

  const dayBefore = isRecord(value.dayBefore) ? value.dayBefore : {};
  const sameDay = isRecord(value.sameDay) ? value.sameDay : {};

  return {
    dayBefore: {
      enabled:
        getOptionalBoolean(dayBefore.enabled) ??
        DEFAULT_BOOKING_CALENDAR_REMINDERS.dayBefore.enabled,
      sendAtHour:
        getBoundedInteger(dayBefore.sendAtHour, 8, 21) ??
        DEFAULT_BOOKING_CALENDAR_REMINDERS.dayBefore.sendAtHour,
    },
    sameDay: {
      enabled:
        getOptionalBoolean(sameDay.enabled) ??
        DEFAULT_BOOKING_CALENDAR_REMINDERS.sameDay.enabled,
      hoursBefore:
        getBoundedInteger(sameDay.hoursBefore, 1, 12) ??
        DEFAULT_BOOKING_CALENDAR_REMINDERS.sameDay.hoursBefore,
    },
  };
}
