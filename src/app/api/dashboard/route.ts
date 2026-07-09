import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, DashboardData, ApiError } from '../../../types/api';
import {
  normalizeSupabaseError,
  createApiError,
  ERROR_CODES,
  AppError,
  logError,
  validation,
  ValidationErrorCollector,
} from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import {
  createDashboardSupabaseReadModelClient,
  fetchDashboardReadModel,
} from '@/lib/dashboard/read-model';

const DASHBOARD_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<DashboardData>>> {
  const path = '/api/dashboard';

  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    void searchParams.get('period'); // reserved for future aggregation

    // バリデーション
    const validator = new ValidationErrorCollector();

    const clinicIdError = validation.required(clinicId, 'clinic_id');
    if (clinicIdError) {
      validator.add(clinicIdError.field, clinicIdError.message);
    }

    const uuidError = clinicId ? validation.uuid(clinicId, 'clinic_id') : null;
    if (uuidError) {
      validator.add(uuidError.field, uuidError.message);
    }

    if (validator.hasErrors()) {
      return NextResponse.json(
        { success: false, error: validator.getApiError() },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, path, clinicId, {
      allowedRoles: DASHBOARD_ALLOWED_ROLES,
    });

    const resolvedClinicId = clinicId!;
    const dashboardData = await fetchDashboardReadModel({
      supabase: createDashboardSupabaseReadModelClient(supabase),
      clinicId: resolvedClinicId,
    });

    const response: ApiResponse<DashboardData> = {
      success: true,
      data: dashboardData,
    };

    return NextResponse.json(response);
  } catch (error) {
    let apiError: ApiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
      statusCode = 500;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Dashboard data fetch failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
      clinicId: request.nextUrl.searchParams.get('clinic_id'),
    });

    const response: ApiResponse<DashboardData> = {
      success: false,
      error: apiError,
    };

    return NextResponse.json(response, { status: statusCode });
  }
}
