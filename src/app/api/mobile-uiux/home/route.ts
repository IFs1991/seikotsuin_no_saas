import { NextRequest } from 'next/server';

import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';
import { AppError } from '@/lib/error-handler';
import type { MobileUiuxHomeResponse } from '@/lib/mobile-uiux/contracts';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  dateKeyToUtcMidnight,
  isValidDateKey,
  logMobileUiuxClinicScopeDenied,
  logMobileUiuxEntitlementDenied,
  logMobileUiuxFlagDenied,
} from '@/lib/mobile-uiux/route-utils';
import {
  summarizeReservationStatuses,
  type ReservationStatusRow,
} from '@/lib/reservations/status';
import type { SupabaseServerClient } from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { getJstDateUtcRange, toJstDateKey } from '@/lib/manager-dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/home';
const JST_TIMEZONE = 'Asia/Tokyo' as const;
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

type HomeReservationSummary = MobileUiuxHomeResponse['reservationSummary'];
type HomeDailyReportStatus = MobileUiuxHomeResponse['dailyReportStatus'];

function resolveDateKey(value: string | null): string | null {
  if (value === null) {
    return toJstDateKey(new Date());
  }

  return isValidDateKey(value) ? value : null;
}

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
}

async function fetchHomeReservationSummary(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  date: string;
}): Promise<HomeReservationSummary> {
  const range = getJstDateUtcRange(params.date);
  const { data, error } = await params.supabase
    .from('reservation_list_view')
    .select('status')
    .eq('clinic_id', params.clinicId)
    .gte('start_time', range.startIso)
    .lt('start_time', range.endIso)
    .returns<ReservationStatusRow[]>();

  if (error) {
    throw error;
  }

  return summarizeReservationStatuses(data ?? []);
}

async function fetchHomeDailyReportStatus(params: {
  supabase: SupabaseServerClient;
  clinicId: string;
  date: string;
}): Promise<HomeDailyReportStatus> {
  const dailyReports = await fetchDailyReportsReadModel({
    supabase: params.supabase,
    clinicId: params.clinicId,
    startDate: params.date,
    endDate: params.date,
  });
  const submitted = dailyReports.reports.length > 0;

  return {
    done: submitted ? 1 : 0,
    review: 0,
    missing: submitted ? 0 : 1,
    rows: [
      {
        name: '本日の日報',
        status: submitted ? 'submitted' : 'missing',
      },
    ],
  };
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    logMobileUiuxFlagDenied({ flags, writeTarget: 'home', status: 403 });
    return buildRealDataDisabledResponse();
  }

  const clinicId = request.nextUrl.searchParams.get('clinic_id');
  if (!clinicId) {
    return buildMobileUiuxFailure(400, 'BAD_REQUEST', 'clinic_id は必須です');
  }

  const date = resolveDateKey(request.nextUrl.searchParams.get('date'));
  if (!date) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'date は YYYY-MM-DD 形式で指定してください'
    );
  }

  let access;
  try {
    access = await ensureClinicAccess(request, PATH, clinicId, {
      allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 403) {
        logMobileUiuxClinicScopeDenied({
          flags,
          writeTarget: 'home',
          status: error.statusCode,
        });
      }
      const code =
        error.statusCode === 401
          ? 'UNAUTHORIZED'
          : error.statusCode === 400
            ? 'BAD_REQUEST'
            : 'FORBIDDEN';
      return buildMobileUiuxFailure(
        error.statusCode,
        code,
        error.statusCode === 401
          ? '認証が必要です'
          : '対象クリニックへのアクセス権がありません'
      );
    }

    logMobileUiuxClinicScopeDenied({
      flags,
      writeTarget: 'home',
      status: 403,
    });
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      '対象クリニックへのアクセス権がありません'
    );
  }

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: access.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    logMobileUiuxEntitlementDenied({
      flags,
      writeTarget: 'home',
      status: 403,
    });
    return buildRealDataDisabledResponse();
  }

  const [dashboard, reservationSummary, dailyReportStatus] = await Promise.all([
    fetchDashboardReadModel({
      supabase: createDashboardSupabaseReadModelClient(access.supabase),
      clinicId,
      now: dateKeyToUtcMidnight(date),
    }),
    fetchHomeReservationSummary({
      supabase: access.supabase,
      clinicId,
      date,
    }),
    fetchHomeDailyReportStatus({
      supabase: access.supabase,
      clinicId,
      date,
    }),
  ]);

  const data: MobileUiuxHomeResponse = {
    clinicId,
    date,
    timezone: JST_TIMEZONE,
    dashboard,
    reservationSummary,
    dailyReportStatus,
  };

  return buildMobileUiuxSuccess(data);
}
