import { NextRequest } from 'next/server';

import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import {
  fetchDailyReportsReadModel,
  type DailyReportsReadModel,
} from '@/lib/daily-reports/read-model';
import {
  DAILY_REPORT_MUTATION_ROLES,
  dailyReportPayloadSchema,
} from '@/lib/daily-reports/schema';
import {
  upsertDailyReport,
  validateDailyReportWriteScope,
} from '@/lib/daily-reports/write-model';
import { AppError } from '@/lib/error-handler';
import type { MobileUiuxDailyReportsResponse } from '@/lib/mobile-uiux/contracts';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  areMobileUiuxWritesEnabled,
  getMobileUiuxFlags,
  type MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
  isValidDateKey,
} from '@/lib/mobile-uiux/route-utils';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/daily-reports';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

type MobileUiuxDailyReportMutationResponse = {
  clinicId: string;
  reportDate: string;
  report: {
    id: string;
  };
  dailyReports: DailyReportsReadModel;
};

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

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
}

function canUseWriteRoutes(flags: MobileUiuxFlags): boolean {
  return (
    flags.enabled &&
    flags.realDataEnabled &&
    areMobileUiuxWritesEnabled(flags, 'dailyReport')
  );
}

function buildScopedBodyFailure(status: number) {
  if (status === 400) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      '日報データのバリデーションに失敗しました'
    );
  }

  if (status === 401) {
    return buildMobileUiuxFailure(401, 'UNAUTHORIZED', '認証が必要です');
  }

  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    '日報を書き込む権限がありません'
  );
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildRealDataDisabledResponse();
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

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: access.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    return buildRealDataDisabledResponse();
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

export async function POST(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!canUseWriteRoutes(flags)) {
    return buildWriteDisabledResponse();
  }

  try {
    const result = await processClinicScopedBody(
      request,
      dailyReportPayloadSchema,
      {
        allowedRoles: Array.from(DAILY_REPORT_MUTATION_ROLES),
      }
    );
    if (!result.success) {
      return buildScopedBodyFailure(result.error.status);
    }

    const entitlement = await fetchMobileUiuxClinicEntitlement({
      supabase: result.supabase,
      flags,
      clinicId: result.dto.clinic_id,
    });
    if (!areMobileUiuxWritesEnabled(flags, 'dailyReport', entitlement)) {
      return buildWriteDisabledResponse();
    }

    const scope = await validateDailyReportWriteScope(
      result.supabase,
      result.dto
    );
    if (scope.ok === false) {
      return buildMobileUiuxFailure(
        scope.status,
        'FORBIDDEN',
        '日報を書き込む権限がありません'
      );
    }

    const report = await upsertDailyReport(result.supabase, result.dto);
    const dailyReports = await fetchDailyReportsReadModel({
      supabase: result.supabase,
      clinicId: result.dto.clinic_id,
      startDate: result.dto.report_date,
      endDate: result.dto.report_date,
    });
    const response: MobileUiuxDailyReportMutationResponse = {
      clinicId: result.dto.clinic_id,
      reportDate: result.dto.report_date,
      report: {
        id: report.id,
      },
      dailyReports,
    };

    return buildMobileUiuxSuccess(response);
  } catch {
    return buildMobileUiuxFailure(500, 'INTERNAL', '日報の保存に失敗しました');
  }
}
