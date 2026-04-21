import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import {
  buildAdminDashboardPayload,
  createEmptyAdminDashboardPayload,
  type ClinicDashboardRow,
  type DailyReportAggregateRow,
  type StaffPerformanceAggregateRow,
} from '@/lib/admin/dashboard';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

type ClinicRow = ClinicDashboardRow & {
  is_active?: boolean | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicParam = searchParams.get('clinic_id');

  try {
    const normalizedClinicId = clinicParam ?? undefined;
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: normalizedClinicId ?? null,
      requireClinicMatch: Boolean(normalizedClinicId),
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, permissions, auth } = processResult;

    let clinicFilter = normalizedClinicId;
    if (!clinicFilter && permissions.role === 'clinic_admin') {
      clinicFilter = permissions.clinic_id ?? undefined;
    }

    let clinicQuery = supabase
      .from('clinics')
      .select('id, name, is_active')
      .order('name');

    if (clinicFilter) {
      clinicQuery = clinicQuery.in('id', [clinicFilter]);
    }

    const { data: clinics, error: clinicError } = await clinicQuery;
    if (clinicError) {
      logError(clinicError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('クリニック情報の取得に失敗しました', 500);
    }

    const clinicRows: ClinicRow[] = (clinics ?? []) as ClinicRow[];

    const clinicIds = clinicRows.map(clinic => clinic.id);
    if (clinicIds.length === 0) {
      return createSuccessResponse(createEmptyAdminDashboardPayload());
    }

    const { data: dailyReports, error: reportsError } = await supabase
      .from('daily_reports')
      .select('clinic_id, total_patients, total_revenue')
      .in('clinic_id', clinicIds);

    if (reportsError) {
      logError(reportsError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('日報データの取得に失敗しました', 500);
    }

    const { data: staffPerformance, error: staffError } = await supabase
      .from('staff_performance')
      .select('clinic_id, performance_score')
      .in('clinic_id', clinicIds);

    if (staffError) {
      logError(staffError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        'スタッフパフォーマンスの取得に失敗しました',
        500
      );
    }

    const reportRows: DailyReportAggregateRow[] = (dailyReports ??
      []) as DailyReportAggregateRow[];
    const performanceRows: StaffPerformanceAggregateRow[] = (staffPerformance ??
      []) as unknown as StaffPerformanceAggregateRow[];

    return createSuccessResponse(
      buildAdminDashboardPayload(clinicRows, reportRows, performanceRows)
    );
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/dashboard',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
