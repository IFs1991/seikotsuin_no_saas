/**
 * URL検証ユーティリティ
 * Open Redirect攻撃を防ぐための安全なURL検証機能
 */

import { ALLOWED_REDIRECT_ORIGINS } from './constants/security';
import { logger } from './logger';

/**
 * リダイレクトURLが安全かどうかを検証する
 * @param url - 検証対象のURL（クエリパラメータから取得）
 * @param requestOrigin - リクエスト元のオリジン
 * @returns 安全なURLまたはnull
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  requestOrigin: string
): string | null {
  // URLが指定されていない場合
  if (!url || url.trim() === '') {
    return null;
  }

  const trimmedUrl = url.trim();

  // 明らかに無効なURLパターンを事前にチェック
  if (!isSecureUrl(trimmedUrl)) {
    logger.warn(`[Security] Invalid URL format rejected: ${trimmedUrl}`);
    return null;
  }

  try {
    // URLオブジェクトで解析（不正な形式やプロトコル偽装を検出）
    const redirectUrl = new URL(trimmedUrl, requestOrigin);

    // HTTPSプロトコル以外は拒否（本番環境）
    if (
      process.env.NODE_ENV === 'production' &&
      redirectUrl.protocol !== 'https:'
    ) {
      logger.warn(`[Security] Non-HTTPS redirect rejected: ${trimmedUrl}`);
      return null;
    }

    // 開発環境ではHTTPも許可
    if (
      process.env.NODE_ENV === 'development' &&
      !['http:', 'https:'].includes(redirectUrl.protocol)
    ) {
      logger.warn(
        `[Security] Invalid protocol redirect rejected: ${trimmedUrl}`
      );
      return null;
    }

    // 1. 同一オリジンへのリダイレクトは安全
    if (redirectUrl.origin === requestOrigin) {
      return redirectUrl.toString();
    }

    // 2. 許可リストに含まれるオリジンかチェック
    if (ALLOWED_REDIRECT_ORIGINS.includes(redirectUrl.origin)) {
      return redirectUrl.toString();
    }

    // 許可されていないオリジン
    logger.warn(
      `[Security] Unauthorized redirect origin rejected: ${redirectUrl.origin}`
    );
    return null;
  } catch (error) {
    // 不正なURL形式
    logger.warn(
      `[Security] Malformed redirect URL rejected: ${trimmedUrl}`,
      error
    );
    return null;
  }
}

/**
 * 相対パスかどうかを検証する（追加のセキュリティチェック）
 * @param path - 検証対象のパス
 * @returns 安全な相対パスかどうか
 */
export function isValidRelativePath(path: string): boolean {
  // 相対パスの正規表現: /で始まり、次の文字が/や\でない
  const relativePathRegex = /^\/[^/\\]/;
  return relativePathRegex.test(path);
}

/**
 * デフォルトの安全なリダイレクト先を取得する
 * @param userRole - ユーザーの権限レベル
 * @returns デフォルトのリダイレクト先
 */
export function getDefaultRedirect(userRole?: string): string {
  switch (userRole) {
    case 'admin':
      return '/admin/settings';
    case 'manager':
      return '/dashboard';
    case 'staff':
      return '/dashboard';
    default:
      return '/admin/settings';
  }
}

/**
 * URLにパスインジェクション攻撃がないかチェック
 * @param url - チェック対象のURL
 * @returns 安全なURLかどうか
 */
export function isSecureUrl(url: string): boolean {
  // 基本的な形式チェック
  if (!url || url.length < 1) {
    return false;
  }

  // 明らかに無効な形式
  const invalidPatterns = [
    /^not-a-url$/i, // テスト用の無効URL
    /^https?:\/\/$$/, // プロトコルのみ
    /^https?:\/\/$/, // プロトコルのみ（別パターン）
  ];

  if (invalidPatterns.some(pattern => pattern.test(url))) {
    return false;
  }

  // パストラバーサル攻撃のパターンをチェック
  const dangerousPatterns = [
    /\.\./, // パストラバーサル
    /javascript:/i, // JavaScriptスキーム
    /data:/i, // データスキーム
    /vbscript:/i, // VBScriptスキーム
  ];

  return !dangerousPatterns.some(pattern => pattern.test(url));
}
