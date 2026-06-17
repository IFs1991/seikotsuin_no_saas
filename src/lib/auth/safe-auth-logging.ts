import { createLogger, type Logger } from '@/lib/logger';

type SafeAuthLogValue = string | number | boolean | null | undefined;
export type SafeAuthLogData = Record<string, SafeAuthLogValue>;

export function createAuthLog(scope: string): Logger {
  return createLogger(scope);
}

export function getEmailDomain(email: string): string | undefined {
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 0 || atIndex === email.length - 1) {
    return undefined;
  }

  return email.slice(atIndex + 1).toLowerCase();
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : undefined;
}

function readNumberProperty(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'number' ? property : undefined;
}

function classifyErrorMessage(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? '';

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.includes('invalid') ||
    normalized.includes('wrong') ||
    normalized.includes('credential')
  ) {
    return 'invalid_credentials';
  }

  if (
    normalized.includes('expired') ||
    normalized.includes('token') ||
    normalized.includes('session')
  ) {
    return 'invalid_or_expired_session';
  }

  if (
    normalized.includes('already registered') ||
    normalized.includes('already exists')
  ) {
    return 'account_already_exists';
  }

  return 'provider_error';
}

export function getSafeAuthErrorLogData(error: unknown): SafeAuthLogData {
  const message =
    error instanceof Error
      ? error.message
      : readStringProperty(error, 'message');
  const status =
    readNumberProperty(error, 'status') ??
    readNumberProperty(error, 'statusCode');

  return {
    errorName:
      error instanceof Error ? error.name : readStringProperty(error, 'name'),
    errorCode: readStringProperty(error, 'code'),
    reason: classifyErrorMessage(message),
    status,
  };
}

export function getEmailDomainLogData(email: string): SafeAuthLogData {
  return {
    emailDomain: getEmailDomain(email),
  };
}
