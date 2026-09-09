/**
 * JST (Asia/Tokyo) を基準にした日付ユーティリティ。
 *
 * 整骨院管理 SaaS では report_date を JST で扱うため、
 * クライアント側 / サーバー側で「今日」の判定がずれないように
 * 共通ヘルパーを提供する。
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type JSTWeekdayKey = (typeof WEEKDAY_KEYS)[number];

/**
 * JST 基準で `YYYY-MM-DD` 形式の日付文字列を返す。
 * 引数なしの場合は現在時刻 (Date.now()) を使用する。
 */
export function toJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

export function isJSTDateString(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseJSTDateStart(value: string): Date {
  if (!isJSTDateString(value)) {
    throw new Error('Expected YYYY-MM-DD date string');
  }

  return new Date(`${value}T00:00:00+09:00`);
}

export function addJSTCalendarDays(value: string, days: number): string {
  const start = parseJSTDateStart(value);
  const shifted = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return toJSTDateString(shifted);
}

export function differenceInJSTCalendarDays(
  fromDate: string,
  toDate: string
): number {
  const from = parseJSTDateStart(fromDate);
  const to = parseJSTDateStart(toDate);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function getJSTWeekdayKey(dateString: string): JSTWeekdayKey {
  const date = parseJSTDateStart(dateString);
  const weekday = new Date(date.getTime() + JST_OFFSET_MS).getUTCDay();
  return WEEKDAY_KEYS[weekday];
}

export function jstDateTimeToDate(dateString: string, time: string): Date {
  const start = parseJSTDateStart(dateString);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(start.getTime() + (hour * 60 + minute) * 60 * 1000);
}

export function getJSTMinutesOfDay(date: Date): number {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}
