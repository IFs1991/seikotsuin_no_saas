import { NextRequest } from 'next/server';
import {
  AppError,
  ERROR_CODES,
  logError,
  validation,
  ValidationErrorCollector,
} from '@/lib/error-handler';
import { createAdminClient } from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createSuccessResponse, createErrorResponse } from '@/lib/api-helpers';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import type { AnalysisData } from '@/lib/ai/analysis-client';

const PATH = '/api/clinic/analysis';

type TherapistPerformanceRow = {
  staff_name?: unknown;
  average_satisfaction_score?: unknown;
};

function isTherapistPerformanceRow(
  value: unknown
): value is TherapistPerformanceRow {
  return typeof value === 'object' && value !== null;
}

export async function GET(request: NextRequest) {
  const clinicId = request.nextUrl.searchParams.get('clinic_id');

  const validator = new ValidationErrorCollector();

  const requiredError = validation.required(clinicId, 'clinic_id');
  if (requiredError) {
    validator.add(requiredError.field, requiredError.message);
  }

  const uuidError = clinicId ? validation.uuid(clinicId, 'clinic_id') : null;
  if (uuidError) {
    validator.add(uuidError.field, uuidError.message);
  }

  if (!clinicId || validator.hasErrors()) {
    return createErrorResponse(
      'バリデーションエラー',
      400,
      validator.getApiError()
    );
  }

  try {
    const { supabase } = await ensureClinicAccess(request, PATH, clinicId, {
      requireClinicMatch: true,
    });

    const resolvedClinicId = clinicId;
    // The guard above proves both authentication and clinic scope before a
    // service client is created. Only the quarantined legacy revenue read uses
    // this client, and the clinic_id predicate remains mandatory.
    const legacyAnalyticsSupabase = createAdminClient();

    // 新規患者の判定基準: 過去30日以内に登録
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const analyticsService = new AnalyticsReadService(supabase);

    const [revenueRes, patientRes, therapistData] = await Promise.all([
      legacyAnalyticsSupabase
        .from('revenues')
        .select('amount, created_at')
        .eq('clinic_id', resolvedClinicId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('patients')
        .select('registration_date, created_at')
        .eq('clinic_id', resolvedClinicId)
        .order('created_at', { ascending: false }),
      analyticsService.fetchStaffPerformance(resolvedClinicId, {
        columns: 'staff_name, average_satisfaction_score',
        orderBy: 'average_satisfaction_score',
      }),
    ]);

    if (revenueRes.error) {
      throw new AppError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        revenueRes.error.message,
        500
      );
    }
    if (patientRes.error) {
      throw new AppError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        patientRes.error.message,
        500
      );
    }

    const data: AnalysisData = {
      salesData: (revenueRes.data ?? []).map(row => ({
        amount: Number(row.amount) || 0,
        created_at: row.created_at ?? '',
      })),
      patientData: (patientRes.data ?? []).map(row => ({
        is_new:
          row.registration_date != null &&
          row.registration_date >= thirtyDaysAgo,
        created_at: row.created_at ?? '',
      })),
      therapistData: therapistData.map(row => {
        const performanceRow = isTherapistPerformanceRow(row) ? row : {};

        return {
          staff_name:
            typeof performanceRow.staff_name === 'string'
              ? performanceRow.staff_name
              : '',
          performance_score:
            Number(performanceRow.average_satisfaction_score) || 0,
        };
      }),
    };

    return createSuccessResponse(data);
  } catch (error) {
    if (error instanceof AppError) {
      return createErrorResponse(error.message, error.statusCode);
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
      clinicId,
    });

    return createErrorResponse('分析データの取得に失敗しました', 500);
  }
}
