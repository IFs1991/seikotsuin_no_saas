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
import type { SupabaseServerClient } from '@/lib/supabase';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

type ClinicRow = ClinicDashboardRow & {
  is_active?: boolean | null;
  parent_id?: string | null;
};

const DASHBOARD_CLINIC_SELECT = 'id, name, parent_id, is_active';
const CLINIC_SCOPE_FILTER_COLUMNS = ['id', 'parent_id'] as const;

const STAFF_PERFORMANCE_SELECTORS = [
  'clinic_id, performance_score:satisfaction_score.avg()',
  'clinic_id, performance_score:performance_score.avg()',
  'clinic_id, performance_score:satisfaction_score',
  'clinic_id, performance_score:performance_score',
] as const;

async function fetchStaffPerformanceRows(
  supabase: SupabaseServerClient,
  clinicIds: string[],
  userId: string
): Promise<StaffPerformanceAggregateRow[]> {
  let lastError: unknown = null;

  for (const selector of STAFF_PERFORMANCE_SELECTORS) {
    const { data, error } = await supabase
      .from('staff_performance')
      .select(selector)
      .in('clinic_id', clinicIds)
      .returns<StaffPerformanceAggregateRow[]>();

    if (!error) {
      return data ?? [];
    }

    lastError = error;
  }

  logError(lastError, {
    endpoint: '/api/admin/dashboard',
    method: 'GET',
    userId,
    params: {
      metric: 'staff_performance',
      fallback: 'empty_staff_performance_rows',
    },
  });

  return [];
}

function buildClinicScopeOrFilter(scopedClinicIds: readonly string[]) {
  const scopeValues = scopedClinicIds.join(',');
  return CLINIC_SCOPE_FILTER_COLUMNS.map(
    column => `${column}.in.(${scopeValues})`
  ).join(',');
}

async function fetchScopedChildClinicRows(
  supabase: SupabaseServerClient,
  scopedClinicIds: string[],
  userId: string
): Promise<ClinicRow[] | Response> {
  const { data, error } = await supabase
    .from('clinics')
    .select(DASHBOARD_CLINIC_SELECT)
    .or(buildClinicScopeOrFilter(scopedClinicIds))
    .order('name')
    .returns<ClinicRow[]>();

  if (error) {
    logError(error, {
      endpoint: '/api/admin/dashboard',
      method: 'GET',
      userId,
    });
    return createErrorResponse('クリニック情報の取得に失敗しました', 500);
  }

  return (data ?? []).filter(clinic => clinic.parent_id !== null);
}

async function fetchSingleClinicRow(
  supabase: SupabaseServerClient,
  clinicId: string,
  userId: string
): Promise<ClinicRow[] | Response> {
  const { data, error } = await supabase
    .from('clinics')
    .select(DASHBOARD_CLINIC_SELECT)
    .eq('id', clinicId)
    .returns<ClinicRow[]>();

  if (error) {
    logError(error, {
      endpoint: '/api/admin/dashboard',
      method: 'GET',
      userId,
    });
    return createErrorResponse('クリニック情報の取得に失敗しました', 500);
  }

  return data ?? [];
}

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
      return processResult.error;
    }

    const { supabase, permissions, auth } = processResult;

    let analyticsClient = supabase;
    let clinicRows: ClinicRow[] = [];

    if (normalizedClinicId) {
      const rows = await fetchSingleClinicRow(
        supabase,
        normalizedClinicId,
        auth.id
      );
      if (rows instanceof Response) {
        return rows;
      }
      clinicRows = rows;
    } else if (auth.role === 'admin') {
      try {
        const adminCtx = createScopedAdminContext(permissions);
        analyticsClient = adminCtx.client;
        const rows = await fetchScopedChildClinicRows(
          analyticsClient,
          adminCtx.scopedClinicIds,
          auth.id
        );
        if (rows instanceof Response) {
          return rows;
        }
        clinicRows = rows;
      } catch (error) {
        if (error instanceof ScopeNotConfiguredError) {
          return createErrorResponse(error.message, 403);
        }
        throw error;
      }
    } else if (permissions.clinic_id) {
      const rows = await fetchSingleClinicRow(
        supabase,
        permissions.clinic_id,
        auth.id
      );
      if (rows instanceof Response) {
        return rows;
      }
      clinicRows = rows;
    }

    const clinicIds = clinicRows.map(clinic => clinic.id);
    if (clinicIds.length === 0) {
      return createSuccessResponse(createEmptyAdminDashboardPayload());
    }

    const [reportsResult, staffPerformance] = await Promise.all([
      analyticsClient
        .from('daily_reports')
        .select(
          'clinic_id, total_patients:total_patients.sum(), total_revenue:total_revenue.sum()'
        )
        .in('clinic_id', clinicIds)
        .returns<DailyReportAggregateRow[]>(),
      fetchStaffPerformanceRows(analyticsClient, clinicIds, auth.id),
    ]);

    let dailyReports = reportsResult.data;
    let reportsError = reportsResult.error;
    if (reportsError) {
      const rawReportsResult = await analyticsClient
        .from('daily_reports')
        .select('clinic_id, total_patients, total_revenue')
        .in('clinic_id', clinicIds)
        .returns<DailyReportAggregateRow[]>();

      dailyReports = rawReportsResult.data;
      reportsError = rawReportsResult.error;
    }

    if (reportsError) {
      logError(reportsError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('日報データの取得に失敗しました', 500);
    }

    return createSuccessResponse(
      buildAdminDashboardPayload(
        clinicRows,
        dailyReports ?? [],
        staffPerformance
      )
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
