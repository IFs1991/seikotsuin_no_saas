import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeRole } from '@/lib/constants/roles';
import {
  buildManagerDailyReportsOverview,
  parseManagerOverviewQuery,
  type ManagerDailyReportOverviewRow,
} from '@/lib/manager-daily-reports';
import { createAdminClient } from '@/lib/supabase';

const PATH = '/api/manager/daily-reports/overview';
const MANAGER_OVERVIEW_ALLOWED_ROLES = ['manager'] as const;
const DAILY_REPORT_OVERVIEW_SELECT =
  'id, report_date, total_patients, total_revenue, insurance_revenue, private_revenue, updated_at';

type ClinicRow = {
  id: string;
  name: string;
};

type AssignedClinicRelation =
  | {
      id: string;
      name: string;
      is_active: boolean | null;
    }
  | {
      id: string;
      name: string;
      is_active: boolean | null;
    }[]
  | null;

type ManagerAssignmentClinicRow = {
  clinics: AssignedClinicRelation;
};

type AdminClient = ReturnType<typeof createAdminClient>;

function readAssignedClinic(clinics: AssignedClinicRelation): ClinicRow | null {
  if (!clinics) {
    return null;
  }

  const clinic = Array.isArray(clinics) ? (clinics[0] ?? null) : clinics;
  if (!clinic || clinic.is_active !== true) {
    return null;
  }

  return {
    id: clinic.id,
    name: clinic.name,
  };
}

async function fetchAssignedClinic(
  adminClient: AdminClient,
  managerUserId: string,
  clinicId: string
): Promise<ClinicRow | null> {
  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select('clinics!inner(id, name, is_active)')
    .eq('manager_user_id', managerUserId)
    .eq('clinic_id', clinicId)
    .is('revoked_at', null)
    .eq('clinics.is_active', true)
    .maybeSingle<ManagerAssignmentClinicRow>();

  if (error) {
    throw error;
  }

  return readAssignedClinic(data?.clinics ?? null);
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_OVERVIEW_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = parseManagerOverviewQuery(request.nextUrl.searchParams);
    if (parsedQuery.success === false) {
      return createErrorResponse(parsedQuery.message, 400);
    }

    const adminClient = createAdminClient();
    const assignedClinic = await fetchAssignedClinic(
      adminClient,
      authResult.auth.id,
      parsedQuery.query.clinicId
    );

    if (!assignedClinic) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const reportsResult = await adminClient
      .from('daily_reports')
      .select(DAILY_REPORT_OVERVIEW_SELECT)
      .eq('clinic_id', parsedQuery.query.clinicId)
      .gte('report_date', parsedQuery.query.startDate)
      .lte('report_date', parsedQuery.query.endDate)
      .returns<ManagerDailyReportOverviewRow[]>()
      .order('report_date', { ascending: true });

    if (reportsResult.error) {
      throw reportsResult.error;
    }

    return createSuccessResponse(
      buildManagerDailyReportsOverview({
        clinic: assignedClinic,
        startDate: parsedQuery.query.startDate,
        endDate: parsedQuery.query.endDate,
        status: parsedQuery.query.status,
        dateRange: parsedQuery.dateRange,
        reports: reportsResult.data ?? [],
      })
    );
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
