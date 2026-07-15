import { NextRequest } from 'next/server';

import { ADMIN_USER_ROLE_VALUES, normalizeRole } from '@/lib/constants/roles';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';
import { AppError } from '@/lib/error-handler';
import { createLogger } from '@/lib/logger';
import {
  evaluateMobileUiuxEnvRollout,
  resolveMobileUiuxPrincipal,
} from '@/lib/mobile-uiux/access';
import { fetchClinicNames } from '@/lib/mobile-uiux/clinic-names';
import type {
  MobileUiuxHomeClinicCard,
  MobileUiuxHomeResponse,
} from '@/lib/mobile-uiux/contracts';
import { prefetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
  type MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import { fetchManagerRevenuePeriodTotals } from '@/lib/services/manager-revenue-service';
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
import {
  createAdminClient,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { getJstDateUtcRange, toJstDateKey } from '@/lib/manager-dashboard';
import {
  AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE,
  isAuthorityUnavailableError,
} from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/home';
const JST_TIMEZONE = 'Asia/Tokyo' as const;
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const CLINIC_CARD_ROLES = ['manager', 'admin'] as const;

const log = createLogger('MobileUiuxHome');

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

/**
 * manager/admin 向けの院別当日実績カード。RPC (service_role、p_clinic_ids を
 * 無検証に信頼) には principal 解決済みの clinic id 以外を渡さない —
 * これがテナント分離の唯一の保証。スコープ解決や取得に失敗した場合は
 * null を返してカードを省略する (閲覧専用の補足データのため fail-soft)。
 */
async function fetchHomeClinicCards(params: {
  supabase: SupabaseServerClient;
  analyticsSupabase: SupabaseServerClient;
  userId: string;
  permissions: UserPermissions | null;
  flags: MobileUiuxFlags;
  date: string;
}): Promise<MobileUiuxHomeClinicCard[] | null> {
  try {
    const principal = await resolveMobileUiuxPrincipal({
      userId: params.userId,
      permissions: params.permissions,
      flags: params.flags,
      adminClient: params.analyticsSupabase,
    });
    if (principal.allowed === false) {
      return null;
    }

    const rollout = evaluateMobileUiuxEnvRollout(principal, params.flags);
    if (rollout.allowed === false || rollout.clinicIds.length === 0) {
      return null;
    }

    const clinicIds = rollout.clinicIds;
    const [totals, names] = await Promise.all([
      fetchManagerRevenuePeriodTotals(
        params.analyticsSupabase,
        clinicIds,
        params.date,
        params.date
      ),
      fetchClinicNames(params.supabase, clinicIds),
    ]);

    const nameById = new Map(names.map(clinic => [clinic.id, clinic.name]));
    const totalsById = new Map(totals.map(row => [row.clinic_id, row]));

    const cards: MobileUiuxHomeClinicCard[] = [];
    for (const clinicId of clinicIds) {
      const name = nameById.get(clinicId);
      if (!name) {
        continue;
      }
      const row = totalsById.get(clinicId);
      cards.push({
        clinicId,
        name,
        revenue: row ? Number(row.operating_revenue) || 0 : 0,
        visitCount: row ? Number(row.visit_count) || 0 : 0,
      });
    }

    return cards.length > 0 ? cards : null;
  } catch (error) {
    log.warn('Failed to build mobile home clinic cards', {
      errorName: error instanceof Error ? error.name : null,
    });
    return null;
  }
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
    if (isAuthorityUnavailableError(error)) {
      return buildMobileUiuxFailure(
        503,
        'INTERNAL',
        AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE
      );
    }

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

  const entitlement = await entitlementPromise;
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    logMobileUiuxEntitlementDenied({
      flags,
      writeTarget: 'home',
      status: 403,
    });
    return buildRealDataDisabledResponse();
  }

  // Clinic scope and entitlement are both proven before service credentials
  // are created. Only the clinic-scoped analytics RPCs receive this client;
  // canonical reads continue through the authenticated RLS client.
  const legacyAnalyticsSupabase = createAdminClient();
  const role = normalizeRole(access.permissions?.role);
  const clinicCardsPromise = CLINIC_CARD_ROLES.some(
    cardRole => cardRole === role
  )
    ? fetchHomeClinicCards({
        supabase: access.supabase,
        analyticsSupabase: legacyAnalyticsSupabase,
        userId: access.user.id,
        permissions: access.permissions,
        flags,
        date,
      })
    : Promise.resolve(null);

  const [dashboard, reservationSummary, dailyReportStatus, clinicCards] =
    await Promise.all([
      fetchDashboardReadModel({
        supabase: createDashboardSupabaseReadModelClient(
          access.supabase,
          legacyAnalyticsSupabase
        ),
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
      clinicCardsPromise,
    ]);

  const data: MobileUiuxHomeResponse = {
    clinicId,
    date,
    timezone: JST_TIMEZONE,
    dashboard,
    reservationSummary,
    dailyReportStatus,
    ...(clinicCards ? { clinicCards } : {}),
  };

  return buildMobileUiuxSuccess(data);
}
