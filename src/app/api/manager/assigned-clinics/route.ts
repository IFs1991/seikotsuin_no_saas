import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';
import type {
  ManagerAssignedClinic,
  ManagerAssignedClinicsResponse,
} from '@/types/manager-assigned-clinics';

const PATH = '/api/manager/assigned-clinics';
const MANAGER_ASSIGNED_CLINICS_ALLOWED_ROLES = ['manager'] as const;

function toAssignedClinic(
  assignment: Awaited<ReturnType<typeof resolveManagerAssignedClinics>>[number]
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
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
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
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
