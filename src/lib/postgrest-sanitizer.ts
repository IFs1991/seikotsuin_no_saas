/**
 * PostgRESTクエリ用サニタイザー
 * フィルター構文インジェクションを防止するためのユーティリティ
 *
 * セキュリティ設計方針：Allowlist方式
 * - 許可された文字のみを通過させる
 * - エスケープ方式は.or()構文でバイパス可能なリスクがあるため不採用
 *
 * 許可文字：
 * - 日本語文字（ひらがな、カタカナ、漢字）
 * - 英数字（a-z, A-Z, 0-9）
 * - ハイフン、スペース（電話番号・姓名区切り用）
 * - 一部記号（@._- メールアドレス用）
 */

// 許可文字のパターン（Allowlist）
// 日本語: \u3040-\u309F（ひらがな）, \u30A0-\u30FF（カタカナ）, \u4E00-\u9FFF（漢字）
// 英数字: a-zA-Z0-9
// 許可記号: スペース, ハイフン, アンダースコア, @, .（メールアドレス用）
const ALLOWED_CHARS_PATTERN =
  /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEFa-zA-Z0-9\s\-_@.]+$/;

// 許可されていない文字を削除するパターン
const DISALLOWED_CHARS_PATTERN =
  /[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEFa-zA-Z0-9\s\-_@.]/g;

/**
 * PostgRESTフィルター値をサニタイズする（Allowlist方式）
 * 許可されていない文字を削除
 *
 * @param value - サニタイズする値
 * @returns サニタイズされた値
 *
 * @example
 * sanitizePostgrestValue('田中太郎') // '田中太郎'
 * sanitizePostgrestValue('test,injection') // 'testinjection'
 * sanitizePostgrestValue('%,is_deleted.eq.true') // 'is_deleted.eq.true'
 */
export function sanitizePostgrestValue(
  value: string | null | undefined
): string {
  if (value == null) return '';
  // 許可されていない文字を削除
  return value.replace(DISALLOWED_CHARS_PATTERN, '');
}

/**
 * 入力値がAllowlistに適合しているか検証
 *
 * @param value - 検証する値
 * @returns 適合している場合true
 */
export function isValidSearchInput(value: string): boolean {
  if (!value) return true;
  return ALLOWED_CHARS_PATTERN.test(value);
}

/**
 * 安全な検索フィルター文字列を構築する
 *
 * @param query - 検索クエリ
 * @param columns - 検索対象カラム配列
 * @returns フィルター文字列、またはクエリが空の場合はnull
 *
 * @example
 * buildSafeSearchFilter('田中', ['name', 'phone'])
 * // 'name.ilike.%田中%,phone.ilike.%田中%'
 *
 * buildSafeSearchFilter('test,injection', ['name'])
 * // 'name.ilike.%test\\,injection%'
 */
export function buildSafeSearchFilter(
  query: string,
  columns: string[]
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const sanitized = sanitizePostgrestValue(trimmed);
  return columns.map(col => `${col}.ilike.%${sanitized}%`).join(',');
}
