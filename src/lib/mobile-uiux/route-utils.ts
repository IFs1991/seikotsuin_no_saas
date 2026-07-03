import { NextResponse } from 'next/server';

import type {
  MobileUiuxApiErrorCode,
  MobileUiuxApiFailure,
  MobileUiuxApiSuccess,
} from '@/lib/mobile-uiux/contracts';
import type { MobileUiuxFlags } from '@/lib/mobile-uiux/flags';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const NO_STORE_CACHE_CONTROL = 'no-store';

const JSON_RESPONSE_HEADERS = {
  'Content-Type': JSON_CONTENT_TYPE,
  'Cache-Control': NO_STORE_CACHE_CONTROL,
} as const;

export type MobileUiuxDeniedReasonCode =
  | 'flag_disabled'
  | 'entitlement_denied'
  | 'clinic_scope_denied'
  | 'role_denied'
  | 'write_flag_disabled';

export type MobileUiuxDeniedAccessLogDetails = {
  reasonCode: MobileUiuxDeniedReasonCode;
  role: string | null;
  allowedClinicCount: number;
  scopedClinicCount: number;
  writeTarget: string;
  featureFlagEnabled: boolean;
  status?: number;
};

type MobileUiuxDeniedAccessLogParams = {
  writeTarget: string;
  flags?: Pick<MobileUiuxFlags, 'allowedClinicIds' | 'enabled'>;
  role?: string | null;
  scopedClinicCount?: number;
  featureFlagEnabled?: boolean;
  status?: number;
};

export function logMobileUiuxDeniedAccess(
  details: MobileUiuxDeniedAccessLogDetails
): void {
  console.warn('[mobile-uiux] access denied', details);
}

export function logMobileUiuxDeniedReason(
  reasonCode: MobileUiuxDeniedReasonCode,
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedAccess({
    reasonCode,
    role: params.role ?? null,
    allowedClinicCount: params.flags?.allowedClinicIds.length ?? 0,
    scopedClinicCount: params.scopedClinicCount ?? 0,
    writeTarget: params.writeTarget,
    featureFlagEnabled:
      params.featureFlagEnabled ?? params.flags?.enabled ?? false,
    status: params.status,
  });
}

export function logMobileUiuxFlagDenied(
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedReason('flag_disabled', params);
}

export function logMobileUiuxEntitlementDenied(
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedReason('entitlement_denied', params);
}

export function logMobileUiuxClinicScopeDenied(
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedReason('clinic_scope_denied', params);
}

export function logMobileUiuxRoleDenied(
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedReason('role_denied', params);
}

export function logMobileUiuxWriteFlagDenied(
  params: MobileUiuxDeniedAccessLogParams
): void {
  logMobileUiuxDeniedReason('write_flag_disabled', params);
}

export function mapMobileUiuxPrincipalDeniedReason(
  reason: 'role_denied' | 'clinic_scope_empty'
): MobileUiuxDeniedReasonCode {
  return reason === 'role_denied' ? 'role_denied' : 'clinic_scope_denied';
}

export function mapMobileUiuxRolloutDeniedReason(
  reason: 'clinic_denied' | 'feature_entitlement_denied'
): MobileUiuxDeniedReasonCode {
  return reason === 'clinic_denied'
    ? 'clinic_scope_denied'
    : 'entitlement_denied';
}

export function buildMobileUiuxFailure(
  status: number,
  code: MobileUiuxApiErrorCode,
  message: string
): NextResponse<MobileUiuxApiFailure> {
  const responseCode =
    code === getMobileUiuxErrorCode(status)
      ? code
      : getMobileUiuxErrorCode(status);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: responseCode,
        message,
      },
    },
    {
      status,
      headers: JSON_RESPONSE_HEADERS,
    }
  );
}

export function buildMobileUiuxSuccess<T>(
  data: T,
  status = 200
): NextResponse<MobileUiuxApiSuccess<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      generatedAt: new Date().toISOString(),
    },
    {
      status,
      headers: JSON_RESPONSE_HEADERS,
    }
  );
}

export function getMobileUiuxErrorCode(status: number): MobileUiuxApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 409:
      return 'CONFLICT';
    default:
      return 'INTERNAL';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveFailureMessage(
  payload: unknown,
  fallbackMessage: string
): string {
  if (!isRecord(payload)) {
    return fallbackMessage;
  }

  const error = payload.error;
  if (typeof error === 'string') {
    return error;
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return typeof payload.message === 'string'
    ? payload.message
    : fallbackMessage;
}

export async function buildMobileUiuxFailureFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<NextResponse<MobileUiuxApiFailure>> {
  let message = fallbackMessage;

  try {
    const payload: unknown = await response.clone().json();
    message = resolveFailureMessage(payload, fallbackMessage);
  } catch {
    message = fallbackMessage;
  }

  return buildMobileUiuxFailure(
    response.status,
    getMobileUiuxErrorCode(response.status),
    message
  );
}

export async function resolveMobileUiuxDeniedReasonFromResponse(
  response: Response,
  fallbackReason: MobileUiuxDeniedReasonCode
): Promise<MobileUiuxDeniedReasonCode> {
  if (response.status !== 403) {
    return fallbackReason;
  }

  try {
    const payload: unknown = await response.clone().json();
    const message = resolveFailureMessage(payload, '');
    if (message.includes('クリニック')) {
      return 'clinic_scope_denied';
    }
    if (
      message.includes('マネージャー') ||
      message.includes('ロール') ||
      message.includes('許可') ||
      message.includes('権限')
    ) {
      return 'role_denied';
    }
  } catch {
    return fallbackReason;
  }

  return fallbackReason;
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function dateKeyToUtcMidnight(dateKey: string): Date {
  const [yearText, monthText, dayText] = dateKey.split('-');
  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))
  );
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function getRequiredClinicId(value: string | null): string | null {
  if (!value || !isValidUuid(value)) {
    return null;
  }

  return value;
}
