import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeRole } from '@/lib/constants/roles';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { createAdminClient } from '@/lib/supabase';
import { fetchManagerPatientVisitSummaryRows } from '@/lib/services/patient-analysis-service';
import {
  fetchManagerPatientPeriodSeries,
  fetchManagerPatientPeriodTotals,
} from '@/lib/services/manager-patient-period-service';
import {
  buildManagerPatientAnalysis,
  parseManagerPatientAnalysisQuery,
  resolveManagerPatientSelectedClinicId,
  resolveManagerPatientAnalysisPeriod,
  resolveManagerPatientAnalysisRpcBounds,
  type ManagerPatientAssignedClinic,
} from '@/lib/manager-patient-analysis';

const PATH = '/api/manager/patients/analysis';
const MANAGER_PATIENT_ANALYSIS_ALLOWED_ROLES = ['manager'] as const;

function toAssignedClinic(
  assignment: Awaited<
    ReturnType<typeof resolveManagerAssignedClinicsWithinScope>
  >[number]
): ManagerPatientAssignedClinic {
  return {
    clinicId: assignment.clinic_id,
    clinicName: assignment.clinic_name ?? '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_PATIENT_ANALYSIS_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = parseManagerPatientAnalysisQuery(
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
    const assignedClinicIds = assignedClinics.map(clinic => clinic.clinicId);

    if (assignedClinicIds.length === 0) {
      const period = resolveManagerPatientAnalysisPeriod(
        parsedQuery.query.period
      );
      return createSuccessResponse(
        buildManagerPatientAnalysis({
          assignedClinics: [],
          patientRows: [],
          periodTotals: [],
          periodSeries: [],
          selectedClinicId: null,
          target: parsedQuery.query.target,
          period,
        })
      );
    }

    if (
      parsedQuery.query.clinicId &&
      !assignedClinicIds.includes(parsedQuery.query.clinicId)
    ) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const period = resolveManagerPatientAnalysisPeriod(
      parsedQuery.query.period
    );
    const { startIso, endIso } = resolveManagerPatientAnalysisRpcBounds(period);
    const selectedClinicId = resolveManagerPatientSelectedClinicId({
      assignedClinics,
      requestedClinicId: parsedQuery.query.clinicId,
    });
    const seriesClinicIds =
      parsedQuery.query.target === 'clinic' && parsedQuery.query.clinicId
        ? [parsedQuery.query.clinicId]
        : assignedClinicIds;
    const [patientRows, periodTotals, periodSeries] = await Promise.all([
      fetchManagerPatientVisitSummaryRows({
        supabase: adminClient,
        clinicIds: assignedClinicIds,
        selectedClinicId,
      }),
      fetchManagerPatientPeriodTotals(
        adminClient,
        assignedClinicIds,
        startIso,
        endIso
      ),
      fetchManagerPatientPeriodSeries(
        adminClient,
        seriesClinicIds,
        startIso,
        endIso,
        period.bucket
      ),
    ]);

    return createSuccessResponse(
      buildManagerPatientAnalysis({
        assignedClinics,
        patientRows,
        periodTotals,
        periodSeries,
        selectedClinicId: parsedQuery.query.clinicId,
        target: parsedQuery.query.target,
        period,
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
