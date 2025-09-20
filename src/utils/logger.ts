'use client';

/* eslint-disable no-console */

const env =
  typeof process !== 'undefined' ? process.env.NODE_ENV : 'development';
const isProd = env === 'production';

function format(
  scope: string | undefined,
  message: unknown,
  ...args: unknown[]
) {
  const prefix = scope ? `[${scope}]` : '';
  return [prefix, message, ...args].filter(Boolean);
}

export const logger = {
  debug(scope: string | undefined, message: unknown, ...args: unknown[]) {
    if (!isProd) console.debug(...format(scope, message, ...args));
  },
  info(scope: string | undefined, message: unknown, ...args: unknown[]) {
    if (!isProd) console.info(...format(scope, message, ...args));
  },
  warn(scope: string | undefined, message: unknown, ...args: unknown[]) {
    console.warn(...format(scope, message, ...args));
  },
  error(scope: string | undefined, message: unknown, ...args: unknown[]) {
    console.error(...format(scope, message, ...args));
  },
};

export function createLogger(scope?: string) {
  return {
    debug: (message: unknown, ...args: unknown[]) =>
      logger.debug(scope, message, ...args),
    info: (message: unknown, ...args: unknown[]) =>
      logger.info(scope, message, ...args),
    warn: (message: unknown, ...args: unknown[]) =>
      logger.warn(scope, message, ...args),
    error: (message: unknown, ...args: unknown[]) =>
      logger.error(scope, message, ...args),
  } as const;
}
export type Logger = ReturnType<typeof createLogger>;
