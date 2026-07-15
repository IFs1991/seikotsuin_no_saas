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
import type {
  ManagerAssignedClinic,
  ManagerAssignedClinicsResponse,
} from '@/types/manager-assigned-clinics';

const PATH = '/api/manager/assigned-clinics';
const MANAGER_ASSIGNED_CLINICS_ALLOWED_ROLES = ['manager'] as const;

function toAssignedClinic(
  assignment: Awaited<
    ReturnType<typeof resolveManagerAssignedClinicsWithinScope>
  >[number]
): ManagerAssignedClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_ASSIGNED_CLINICS_ALLOWED_ROLES),
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
    const response: ManagerAssignedClinicsResponse = {
      generatedAt: new Date().toISOString(),
      clinics: assignments.map(toAssignedClinic),
    };

    return createSuccessResponse(response);
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
