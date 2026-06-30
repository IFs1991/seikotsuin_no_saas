import { NextResponse } from 'next/server';

import type {
  MobileUiuxApiFailure,
  MobileUiuxApiSuccess,
} from '@/lib/mobile-uiux/contracts';

export function buildMobileUiuxFailure(
  status: number,
  code: string,
  message: string
): NextResponse<MobileUiuxApiFailure> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status }
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
    { status }
  );
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
