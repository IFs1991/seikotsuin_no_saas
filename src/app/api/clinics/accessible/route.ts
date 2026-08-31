import { NextRequest } from 'next/server';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';
import { ScopeNotConfiguredError } from '@/lib/supabase';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { resolveAccessibleClinics } from '@/lib/app-bootstrap/service';

const ACCESSIBLE_CLINICS_ENDPOINT = '/api/clinics/accessible';

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(STAFF_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { supabase, auth, permissions } = processResult;

    try {
      const accessibleClinics = await resolveAccessibleClinics({
        supabase,
        userId: auth.id,
        authRole: auth.role,
        permissions,
        profileClinicId: permissions.clinic_id,
      });

      return createSuccessResponse({
        clinics: accessibleClinics.clinics,
        currentClinicId: accessibleClinics.currentClinicId,
      });
    } catch (error) {
      if (error instanceof ScopeNotConfiguredError) {
        return createErrorResponse(error.message, 403);
      }

      logError(error, {
        endpoint: ACCESSIBLE_CLINICS_ENDPOINT,
        method: 'GET',
        userId: auth.id,
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

      return createErrorResponse(
        '利用可能なクリニック一覧の取得に失敗しました',
        500
      );
    }
  } catch (error) {
    logError(error, {
      endpoint: ACCESSIBLE_CLINICS_ENDPOINT,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
