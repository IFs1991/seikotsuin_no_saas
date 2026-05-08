/**
 * JST (Asia/Tokyo) を基準にした日付ユーティリティ。
 *
 * 整骨院管理 SaaS では report_date を JST で扱うため、
 * クライアント側 / サーバー側で「今日」の判定がずれないように
 * 共通ヘルパーを提供する。
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * JST 基準で `YYYY-MM-DD` 形式の日付文字列を返す。
 * 引数なしの場合は現在時刻 (Date.now()) を使用する。
 */
export function toJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}
