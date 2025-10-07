/**
 * 統一ロガーシステム
 * Phase 3 M3: 本番環境対応・構造化ログ・ログレベル制御
 *
 * Features:
 * - 環境に応じた出力制御（開発/本番）
 * - 構造化ログ（JSON形式）
 * - ログレベル制御
 * - サーバー/クライアント両対応
 * - スコープ付きロガー作成
 */

// ログレベル定義
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

// ログエントリの型定義
export interface LogEntry {
  timestamp: string;
  level: string;
  scope?: string;
  message: string;
  data?: unknown;
  environment: string;
  context?: {
    userId?: string;
    clinicId?: string;
    sessionId?: string;
    ipAddress?: string;
    requestId?: string;
  };
}

// 環境判定
const isServer = typeof window === 'undefined';
const env =
  typeof process !== 'undefined' ? process.env.NODE_ENV : 'development';
const isProd = env === 'production';
const isTest =
  env === 'test' ||
  (typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined);

// ログレベル設定（環境変数から取得可能）
const getLogLevel = (): LogLevel => {
  if (isTest) return LogLevel.NONE; // テスト環境ではログを抑制

  const envLevel =
    typeof process !== 'undefined' ? process.env.LOG_LEVEL : undefined;

  switch (envLevel?.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'NONE':
      return LogLevel.NONE;
    default:
      return isProd ? LogLevel.INFO : LogLevel.DEBUG;
  }
};

const currentLogLevel = getLogLevel();

type LevelLabel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const normalizeMessage = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (message instanceof Error) {
    return message.stack || message.message || message.name;
  }

  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
};

const pickData = (extra: unknown[]): unknown => {
  if (extra.length === 0) return undefined;
  if (extra.length === 1) return extra[0];
  return extra;
};

function logWithScope(
  level: LogLevel,
  label: LevelLabel,
  scope: string | undefined,
  message: unknown,
  extra: unknown[],
  context?: LogEntry['context']
) {
  if (!shouldLog(level)) return;

  const structuredData = pickData(extra);

  if (isProd && isServer) {
    outputStructuredLog(
      formatLogEntry(label, scope, message, structuredData, context)
    );
    return;
  }

  const contextPayload =
    context && Object.keys(context).length > 0 ? { context } : undefined;

  const consoleArgs = formatForConsole(
    scope,
    message,
    ...extra,
    contextPayload
  );

  switch (label) {
    case 'DEBUG':
      if (!isProd) {
        console.debug(...consoleArgs);
      }
      break;
    case 'INFO':
      if (!isProd) {
        console.info(...consoleArgs);
      }
      break;
    case 'WARN':
      console.warn(...consoleArgs);
      break;
    case 'ERROR':
      console.error(...consoleArgs);
      break;
  }
}

const logInternal = (level: LogLevel, label: LevelLabel, args: unknown[]) => {
  if (args.length === 0) return;
  const [message, ...extra] = args;
  logWithScope(level, label, undefined, message, extra);
};

/**
 * ログエントリをフォーマット
 */
function formatLogEntry(
  level: string,
  scope: string | undefined,
  message: unknown,
  data?: unknown,
  context?: LogEntry['context']
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: normalizeMessage(message),
    environment: env,
  };

  if (scope !== undefined) {
    entry.scope = scope;
  }

  if (data !== undefined) {
    entry.data = data;
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  return entry;
}

/**
 * コンソール出力用フォーマット（開発環境）
 */
function formatForConsole(
  scope: string | undefined,
  message: unknown,
  ...args: unknown[]
): unknown[] {
  if (scope !== undefined) {
    return [scope, message, ...args];
  }

  return [message, ...args];
}

/**
 * 構造化ログ出力（本番環境）
 */
function outputStructuredLog(entry: LogEntry): void {
  // 本番環境では JSON 形式で出力（ログ収集サービス連携用）
  console.log(JSON.stringify(entry));
}

/**
 * ログ出力判定
 */
function shouldLog(level: LogLevel): boolean {
  return level >= currentLogLevel;
}

/**
 * メインロガーオブジェクト
 */
export const logger = {
  debug: (...args: unknown[]) => logInternal(LogLevel.DEBUG, 'DEBUG', args),
  info: (...args: unknown[]) => logInternal(LogLevel.INFO, 'INFO', args),
  warn: (...args: unknown[]) => logInternal(LogLevel.WARN, 'WARN', args),
  error: (...args: unknown[]) => logInternal(LogLevel.ERROR, 'ERROR', args),
  log: (...args: unknown[]) => logInternal(LogLevel.INFO, 'INFO', args),
} as const;

/**
 * スコープ付きロガーを作成
 *
 * @example
 * const log = createLogger('AuthService');
 * log.info('User logged in', { userId: '123' });
 */
export function createLogger(scope?: string) {
  return {
    debug: (message: unknown, ...args: unknown[]) =>
      logWithScope(LogLevel.DEBUG, 'DEBUG', scope, message, args),
    info: (message: unknown, ...args: unknown[]) =>
      logWithScope(LogLevel.INFO, 'INFO', scope, message, args),
    warn: (message: unknown, ...args: unknown[]) =>
      logWithScope(LogLevel.WARN, 'WARN', scope, message, args),
    error: (message: unknown, ...args: unknown[]) =>
      logWithScope(LogLevel.ERROR, 'ERROR', scope, message, args),
    log: (message: unknown, ...args: unknown[]) =>
      logWithScope(LogLevel.INFO, 'INFO', scope, message, args),
  } as const;
}

/**
 * コンテキスト付きロガー（セキュリティログ用）
 */
export function createContextLogger(
  scope: string,
  context: LogEntry['context']
) {
  return {
    debug: (message: unknown, data?: unknown) =>
      logWithScope(
        LogLevel.DEBUG,
        'DEBUG',
        scope,
        message,
        data !== undefined ? [data] : [],
        context
      ),
    info: (message: unknown, data?: unknown) =>
      logWithScope(
        LogLevel.INFO,
        'INFO',
        scope,
        message,
        data !== undefined ? [data] : [],
        context
      ),
    warn: (message: unknown, data?: unknown) =>
      logWithScope(
        LogLevel.WARN,
        'WARN',
        scope,
        message,
        data !== undefined ? [data] : [],
        context
      ),
    error: (message: unknown, data?: unknown) =>
      logWithScope(
        LogLevel.ERROR,
        'ERROR',
        scope,
        message,
        data !== undefined ? [data] : [],
        context
      ),
  } as const;
}

export type Logger = ReturnType<typeof createLogger>;
export type ContextLogger = ReturnType<typeof createContextLogger>;
