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
  getManagerDashboardDateKeys,
  type ManagerDashboardDailyReportRow,
} from '@/lib/manager-dashboard';
import { fetchManagerDashboardCounts } from '@/lib/manager-dashboard-counts';
import { createAdminClient } from '@/lib/supabase';

const PATH = '/api/manager/dashboard';
const MANAGER_DASHBOARD_ALLOWED_ROLES = ['manager'] as const;
const DAILY_REPORT_SELECT =
  'id, clinic_id, report_date, total_patients, total_revenue, insurance_revenue, private_revenue, updated_at';

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

    const [dailyReports, counts] = await Promise.all([
      fetchDailyReportsForDashboard(
        adminClient,
        clinicIds,
        date.previousDay,
        date.today
      ),
      fetchManagerDashboardCounts(adminClient, clinicIds, date),
    ]);

    return createSuccessResponse(
      buildManagerDashboardResponse({
        generatedAt,
        date,
        clinics,
        dailyReports,
        reviewSignals: [],
        reservations: [],
        counts,
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
