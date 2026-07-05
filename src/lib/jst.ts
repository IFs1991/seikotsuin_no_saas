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
  return DATE_ONLY_PATTERN.test(value);
}

export function parseJSTDateStart(value: string): Date {
  if (!isJSTDateString(value)) {
    throw new Error('Expected YYYY-MM-DD date string');
  }

  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
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
  const [year, month, day] = dateString.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_KEYS[weekday];
}

export function jstDateTimeToDate(dateString: string, time: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS);
}

export function getJSTMinutesOfDay(date: Date): number {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}
