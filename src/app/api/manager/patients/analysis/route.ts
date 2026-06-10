import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeRole } from '@/lib/constants/roles';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { createAdminClient } from '@/lib/supabase';
import { fetchPatientVisitSummaryRowsForClinicIds } from '@/lib/services/patient-analysis-service';
import {
  buildManagerPatientAnalysis,
  parseManagerPatientAnalysisQuery,
  type ManagerPatientAssignedClinic,
} from '@/lib/manager-patient-analysis';

const PATH = '/api/manager/patients/analysis';
const MANAGER_PATIENT_ANALYSIS_ALLOWED_ROLES = ['manager'] as const;

function toAssignedClinic(
  assignment: Awaited<ReturnType<typeof resolveManagerAssignedClinics>>[number]
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
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
    );
    const assignedClinics = assignments.map(toAssignedClinic);
    const assignedClinicIds = assignedClinics.map(clinic => clinic.clinicId);

    if (assignedClinicIds.length === 0) {
      return createSuccessResponse(
        buildManagerPatientAnalysis({
          assignedClinics: [],
          rows: [],
          selectedClinicId: null,
          period: parsedQuery.query.period,
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

    const rows = await fetchPatientVisitSummaryRowsForClinicIds(
      adminClient,
      assignedClinicIds
    );

    return createSuccessResponse(
      buildManagerPatientAnalysis({
        assignedClinics,
        rows,
        selectedClinicId: parsedQuery.query.clinicId,
        period: parsedQuery.query.period,
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
