import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import {
  buildManagerDashboardResponse,
  getJstDateUtcRange,
  getManagerDashboardDateKeys,
  REVIEW_SIGNAL_STATUSES,
  type ManagerDashboardDailyReportRow,
  type ManagerDashboardReservationRow,
  type ManagerDashboardReviewSignalRow,
} from '@/lib/manager-dashboard';
import { createAdminClient } from '@/lib/supabase';

const PATH = '/api/manager/dashboard';
const MANAGER_DASHBOARD_ALLOWED_ROLES = ['manager'] as const;
const DAILY_REPORT_SELECT =
  'id, clinic_id, report_date, total_patients, total_revenue, insurance_revenue, private_revenue, updated_at';
const DAILY_REPORT_ITEM_SELECT = 'clinic_id, report_date, estimate_status';
const RESERVATION_SELECT = 'clinic_id, start_time, status';

type AdminClient = ReturnType<typeof createAdminClient>;

function toAssignedClinic(
  assignment: Awaited<
    ReturnType<typeof resolveManagerAssignedClinicsWithinScope>
  >[number]
) {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

async function fetchDailyReportsForDashboard(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  startDate: string,
  endDate: string
): Promise<ManagerDashboardDailyReportRow[]> {
  const { data, error } = await adminClient
    .from('daily_reports')
    .select(DAILY_REPORT_SELECT)
    .in('clinic_id', [...clinicIds])
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .returns<ManagerDashboardDailyReportRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchReviewSignalsForDashboard(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  today: string
): Promise<ManagerDashboardReviewSignalRow[]> {
  const { data, error } = await adminClient
    .from('daily_report_items')
    .select(DAILY_REPORT_ITEM_SELECT)
    .in('clinic_id', [...clinicIds])
    .eq('report_date', today)
    .in('estimate_status', [...REVIEW_SIGNAL_STATUSES])
    .returns<ManagerDashboardReviewSignalRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchReservationsForDashboard(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  previousWeekday: string,
  today: string
): Promise<ManagerDashboardReservationRow[]> {
  const previousWeekdayRange = getJstDateUtcRange(previousWeekday);
  const todayRange = getJstDateUtcRange(today);
  const dateFilter = [
    `and(start_time.gte.${previousWeekdayRange.startIso},start_time.lt.${previousWeekdayRange.endIso})`,
    `and(start_time.gte.${todayRange.startIso},start_time.lt.${todayRange.endIso})`,
  ].join(',');
  const { data, error } = await adminClient
    .from('reservation_list_view')
    .select(RESERVATION_SELECT)
    .in('clinic_id', [...clinicIds])
    .or(dateFilter)
    .returns<ManagerDashboardReservationRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_DASHBOARD_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinicsWithinScope(
      adminClient,
      authResult.auth.id,
      authResult.permissions.clinic_scope_ids ?? []
    );
    const clinics = assignments.map(toAssignedClinic);
    const clinicIds = clinics.map(clinic => clinic.id);
    const now = new Date();
    const generatedAt = now.toISOString();
    const date = getManagerDashboardDateKeys(now);

    if (clinicIds.length === 0) {
      return createSuccessResponse(
        buildManagerDashboardResponse({
          generatedAt,
          date,
          clinics: [],
          dailyReports: [],
          reviewSignals: [],
          reservations: [],
        })
      );
    }

    const [dailyReports, reviewSignals, reservations] = await Promise.all([
      fetchDailyReportsForDashboard(
        adminClient,
        clinicIds,
        date.previousDay,
        date.today
      ),
      fetchReviewSignalsForDashboard(adminClient, clinicIds, date.today),
      fetchReservationsForDashboard(
        adminClient,
        clinicIds,
        date.previousWeekday,
        date.today
      ),
    ]);

    return createSuccessResponse(
      buildManagerDashboardResponse({
        generatedAt,
        date,
        clinics,
        dailyReports,
        reviewSignals,
        reservations,
      })
    );
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
    });
    if (
      error instanceof AppError &&
      error.code === ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE &&
      error.statusCode === 503
    ) {
      return createErrorResponse(
        '認証情報を確認できません。時間をおいて再度お試しください',
        503
      );
    }
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
