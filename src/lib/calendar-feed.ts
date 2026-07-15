import { createHash, randomBytes } from 'crypto';

export type CalendarFeedType = 'staff' | 'clinic';

export type CalendarFeedTokenRow = {
  id: string;
  clinic_id: string | null;
  staff_profile_id: string | null;
  feed_type: CalendarFeedType;
  token_hash: string;
  label: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type CalendarIcsShiftRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  staff_profile_id: string | null;
  home_clinic_id: string | null;
  assignment_type: string | null;
  time_preset: string | null;
  start_time: string;
  end_time: string;
  status: string;
  resources:
    | {
        id: string;
        name: string;
        clinic_id: string | null;
      }
    | Array<{
        id: string;
        name: string;
        clinic_id: string | null;
      }>
    | null;
  clinics:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
};

export function createCalendarFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashCalendarFeedToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function toIcsDateTime(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function staffName(row: CalendarIcsShiftRow): string {
  return normalizeSingle(row.resources)?.name ?? row.staff_id;
}

function clinicName(row: CalendarIcsShiftRow): string {
  return normalizeSingle(row.clinics)?.name ?? row.clinic_id;
}

function staffSummary(row: CalendarIcsShiftRow): string {
  const prefix = row.assignment_type === 'help' ? 'ヘルプ勤務' : '勤務';
  return `${prefix}：${clinicName(row)}`;
}

function clinicSummary(row: CalendarIcsShiftRow): string {
  const suffix = row.assignment_type === 'help' ? ' ヘルプ' : '';
  return `${staffName(row)} ${formatTime(row.start_time)}-${formatTime(row.end_time)}${suffix}`;
}

function eventDescription(
  row: CalendarIcsShiftRow,
  feedType: CalendarFeedType
) {
  if (feedType === 'clinic') {
    return 'Tiramisu confirmed shift';
  }
  return row.assignment_type === 'help'
    ? '所属：別院 / Tiramisu confirmed shift'
    : 'Tiramisu confirmed shift';
}

export function buildCalendarIcs(input: {
  feedName: string;
  feedType: CalendarFeedType;
  shifts: readonly CalendarIcsShiftRow[];
  generatedAt?: Date;
}): string {
  const generatedAt = toIcsDateTime(
    (input.generatedAt ?? new Date()).toISOString()
  );
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tiramisu//Clinic Roster//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(input.feedName)}`,
  ];

  for (const shift of input.shifts) {
    const summary =
      input.feedType === 'staff' ? staffSummary(shift) : clinicSummary(shift);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${shift.id}@tiramisu-roster`,
      `DTSTAMP:${generatedAt}`,
      `DTSTART:${toIcsDateTime(shift.start_time)}`,
      `DTEND:${toIcsDateTime(shift.end_time)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(eventDescription(shift, input.feedType))}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
