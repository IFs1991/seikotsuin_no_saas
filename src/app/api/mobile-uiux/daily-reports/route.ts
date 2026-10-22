import { NextRequest } from 'next/server';

import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import {
  fetchDailyReportsReadModel,
  type DailyReportAggregateSource,
  type DailyReportsReadModel,
} from '@/lib/daily-reports/read-model';
import {
  DAILY_REPORT_MUTATION_ROLES,
  dailyReportPayloadSchema,
} from '@/lib/daily-reports/schema';
import { saveDailyReport } from '@/lib/daily-reports/write-model';
import { AppError } from '@/lib/error-handler';
import type { MobileUiuxDailyReportsResponse } from '@/lib/mobile-uiux/contracts';
import {
  fetchMobileUiuxClinicEntitlement,
  prefetchMobileUiuxClinicEntitlement,
} from '@/lib/mobile-uiux/entitlements';
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
  logMobileUiuxClinicScopeDenied,
  logMobileUiuxDeniedReason,
  logMobileUiuxEntitlementDenied,
  logMobileUiuxFlagDenied,
  logMobileUiuxWriteFlagDenied,
  resolveMobileUiuxDeniedReasonFromResponse,
} from '@/lib/mobile-uiux/route-utils';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE,
  isAuthorityUnavailableError,
} from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/daily-reports';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

type MobileUiuxDailyReportMutationResponse = {
  clinicId: string;
  reportDate: string;
  report: {
    id: string;
    // 'manual' means the submitted totals were saved as the report's totals.
    aggregateSource: DailyReportAggregateSource;
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
  if (isAuthorityUnavailableError(error)) {
    return buildMobileUiuxFailure(
      503,
      'INTERNAL',
      AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE
    );
  }

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
  if (status === 503) {
    return buildMobileUiuxFailure(
      503,
      'INTERNAL',
      AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE
    );
  }

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
    logMobileUiuxFlagDenied({
      flags,
      writeTarget: 'daily-reports',
      status: 403,
    });
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

  // Overlaps the entitlement lookup with the access check; the result is
  // consumed only after access passes (fail-closed on any lookup error).
  const entitlementPromise = prefetchMobileUiuxClinicEntitlement({
    flags,
    clinicId,
  });

  let access;
  try {
    access = await ensureClinicAccess(request, PATH, clinicId, {
      allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 403) {
      logMobileUiuxClinicScopeDenied({
        flags,
        writeTarget: 'daily-reports',
        status: error.statusCode,
      });
    } else if (!(error instanceof AppError)) {
      logMobileUiuxClinicScopeDenied({
        flags,
        writeTarget: 'daily-reports',
        status: 403,
      });
    }
    return buildAccessError(error);
  }

  const entitlement = await entitlementPromise;
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    logMobileUiuxEntitlementDenied({
      flags,
      writeTarget: 'daily-reports',
      status: 403,
    });
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
    logMobileUiuxWriteFlagDenied({
      flags,
      writeTarget: 'daily-reports',
      status: 403,
    });
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
      if (result.error.status === 403) {
        logMobileUiuxDeniedReason(
          await resolveMobileUiuxDeniedReasonFromResponse(
            result.error,
            'clinic_scope_denied'
          ),
          {
            flags,
            writeTarget: 'daily-reports',
            status: result.error.status,
          }
        );
      }
      return buildScopedBodyFailure(result.error.status);
    }

    const entitlement = await fetchMobileUiuxClinicEntitlement({
      supabase: result.supabase,
      flags,
      clinicId: result.dto.clinic_id,
    });
    if (!areMobileUiuxWritesEnabled(flags, 'dailyReport', entitlement)) {
      logMobileUiuxWriteFlagDenied({
        flags,
        writeTarget: 'daily-reports',
        status: 403,
      });
      return buildWriteDisabledResponse();
    }

    // report_id/staff_id scope, the manual/items decision and validation are
    // resolved atomically by the shared write-model (fail-closed). The mobile
    // form only edits hand-entered totals, so an item-derived report is
    // refused (409) without any write instead of being reported as saved.
    const saved = await saveDailyReport(result.supabase, result.dto, {
      requireManual: true,
    });
    if (saved.ok === false) {
      if (saved.status === 403) {
        logMobileUiuxClinicScopeDenied({
          flags,
          writeTarget: 'daily-reports',
          status: saved.status,
        });
        return buildMobileUiuxFailure(
          403,
          'FORBIDDEN',
          '日報を書き込む権限がありません'
        );
      }
      if (saved.status === 409) {
        return buildMobileUiuxFailure(409, 'CONFLICT', saved.message);
      }
      return buildMobileUiuxFailure(400, 'BAD_REQUEST', saved.message);
    }

    const report = saved.report;
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
        aggregateSource:
          report.aggregate_source === 'items' ? 'items' : 'manual',
      },
      dailyReports,
    };

    return buildMobileUiuxSuccess(response);
  } catch {
    return buildMobileUiuxFailure(500, 'INTERNAL', '日報の保存に失敗しました');
  }
}
