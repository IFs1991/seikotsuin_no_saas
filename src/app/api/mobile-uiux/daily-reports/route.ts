import { NextRequest } from 'next/server';

import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';
import { AppError } from '@/lib/error-handler';
import type { MobileUiuxDailyReportsResponse } from '@/lib/mobile-uiux/contracts';
import {
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
  isValidDateKey,
} from '@/lib/mobile-uiux/route-utils';
import { ensureClinicAccess } from '@/lib/supabase/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/daily-reports';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

function getOptionalDateKey(value: string | null, field: string) {
  if (value === null) {
    return { ok: true as const, value: null };
  }

  if (!isValidDateKey(value)) {
    return {
      ok: false as const,
      response: buildMobileUiuxFailure(
        400,
        'BAD_REQUEST',
        `${field} は YYYY-MM-DD 形式で指定してください`
      ),
    };
  }

  return { ok: true as const, value };
}

function buildAccessError(error: unknown) {
  if (error instanceof AppError) {
    return buildMobileUiuxFailure(
      error.statusCode,
      error.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      error.statusCode === 401
        ? '認証が必要です'
        : '対象クリニックへのアクセス権がありません'
    );
  }

  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    '対象クリニックへのアクセス権がありません'
  );
}

function buildWriteDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の日報書き込みは無効です'
  );
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'モバイル UI/UX の実データ参照は無効です'
    );
  }

  const clinicId = getRequiredClinicId(
    request.nextUrl.searchParams.get('clinic_id')
  );
  if (!clinicId) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'clinic_id はUUID形式で指定してください'
    );
  }

  const startDate = getOptionalDateKey(
    request.nextUrl.searchParams.get('start_date'),
    'start_date'
  );
  if (!startDate.ok) {
    return startDate.response;
  }

  const endDate = getOptionalDateKey(
    request.nextUrl.searchParams.get('end_date'),
    'end_date'
  );
  if (!endDate.ok) {
    return endDate.response;
  }

  let access;
  try {
    access = await ensureClinicAccess(request, PATH, clinicId, {
      allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    });
  } catch (error) {
    return buildAccessError(error);
  }

  const data: MobileUiuxDailyReportsResponse = {
    clinicId,
    startDate: startDate.value,
    endDate: endDate.value,
    dailyReports: await fetchDailyReportsReadModel({
      supabase: access.supabase,
      clinicId,
      startDate: startDate.value,
      endDate: endDate.value,
    }),
  };

  return buildMobileUiuxSuccess(data);
}

export async function POST(_request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!areMobileUiuxWritesEnabled(flags, 'dailyReport')) {
    return buildWriteDisabledResponse();
  }

  return buildWriteDisabledResponse();
}
