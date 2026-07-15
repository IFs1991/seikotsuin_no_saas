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
import { createAdminClient } from '@/lib/supabase';
import {
  buildManagerRevenueAnalysis,
  parseManagerRevenueAnalysisQuery,
  resolveManagerRevenueAnalysisPeriod,
  resolveManagerRevenueComparisonPeriod,
  type ManagerRevenueAssignedClinic,
} from '@/lib/manager-revenue-analysis';
import {
  fetchManagerRevenueContextBreakdown,
  fetchManagerRevenuePeriodSeries,
  fetchManagerRevenuePeriodTotals,
} from '@/lib/services/manager-revenue-service';

const PATH = '/api/manager/revenue/analysis';
const MANAGER_REVENUE_ALLOWED_ROLES = ['manager'] as const;

function toAssignedClinic(
  assignment: Awaited<
    ReturnType<typeof resolveManagerAssignedClinicsWithinScope>
  >[number]
): ManagerRevenueAssignedClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_REVENUE_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = parseManagerRevenueAnalysisQuery(
      request.nextUrl.searchParams
    );
    if (parsedQuery.success === false) {
      return createErrorResponse(parsedQuery.message, 400);
    }

    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinicsWithinScope(
      adminClient,
      authResult.auth.id,
      authResult.permissions.clinic_scope_ids ?? []
    );
    const assignedClinics = assignments.map(toAssignedClinic);
    const assignedClinicIds = assignedClinics.map(clinic => clinic.id);

    if (
      parsedQuery.query.clinicId &&
      !assignedClinicIds.includes(parsedQuery.query.clinicId)
    ) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const period = resolveManagerRevenueAnalysisPeriod(
      parsedQuery.query.period
    );
    const comparisonPeriod = resolveManagerRevenueComparisonPeriod(
      period,
      parsedQuery.query.compare
    );
    const selectedClinicId =
      parsedQuery.query.target === 'clinic' ? parsedQuery.query.clinicId : null;

    if (assignedClinicIds.length === 0) {
      return createSuccessResponse(
        buildManagerRevenueAnalysis({
          assignedClinics: [],
          target: parsedQuery.query.target,
          selectedClinicId,
          period,
          comparisonPeriod,
          allPeriodTotals: [],
          previousPeriodTotals: [],
          periodSeries: [],
          contextBreakdown: [],
        })
      );
    }

    const targetClinicIds =
      parsedQuery.query.target === 'clinic' && parsedQuery.query.clinicId
        ? [parsedQuery.query.clinicId]
        : assignedClinicIds;

    const previousTotalsPromise = comparisonPeriod.active
      ? fetchManagerRevenuePeriodTotals(
          adminClient,
          assignedClinicIds,
          comparisonPeriod.previousStartDate,
          comparisonPeriod.previousEndDate
        )
      : Promise.resolve([]);

    const [
      allPeriodTotals,
      previousPeriodTotals,
      periodSeries,
      contextBreakdown,
    ] = await Promise.all([
      fetchManagerRevenuePeriodTotals(
        adminClient,
        assignedClinicIds,
        period.startDate,
        period.endDate
      ),
      previousTotalsPromise,
      fetchManagerRevenuePeriodSeries(
        adminClient,
        targetClinicIds,
        period.startDate,
        period.endDate,
        period.bucket
      ),
      fetchManagerRevenueContextBreakdown(
        adminClient,
        targetClinicIds,
        period.startDate,
        period.endDate
      ),
    ]);

    return createSuccessResponse(
      buildManagerRevenueAnalysis({
        assignedClinics,
        target: parsedQuery.query.target,
        selectedClinicId,
        period,
        comparisonPeriod,
        allPeriodTotals,
        previousPeriodTotals,
        periodSeries,
        contextBreakdown,
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
