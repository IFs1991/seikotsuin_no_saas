/**
 * 環境に応じたロガー
 * - 開発: consoleに出力
 * - 本番: デフォルトは無効（必要に応じてサーバーログ連携を実装）
 */
type LogArgs = unknown[];

const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: LogArgs) => {
    if (isDev) {
      console.log(...args);
    }
  },
  info: (...args: LogArgs) => {
    if (isDev) {
      console.info(...args);
    }
  },
  warn: (...args: LogArgs) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: LogArgs) => {
    if (isDev) {
      console.error(...args);
    }
  },
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.debug(...args);
    }
  },
};
