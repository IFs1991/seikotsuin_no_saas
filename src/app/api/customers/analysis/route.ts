import { NextRequest } from 'next/server';
import {
  normalizeSupabaseError,
  createApiError,
  ERROR_CODES,
  AppError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { z } from 'zod';
import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';

const analysisQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  analysis: z.enum(['conversion', 'ltv', 'churn', 'segment']).optional(),
});

export async function GET(request: NextRequest) {
  const path = '/api/customers/analysis';
  const { ipAddress, userAgent } = getRequestInfo(request);

  try {
    const rawParams = {
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      analysis: request.nextUrl.searchParams.get('analysis') ?? undefined,
    };

    const parsedQuery = analysisQuerySchema.safeParse(rawParams);
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, analysis } = parsedQuery.data;

    const { supabase, user } = await ensureClinicAccess(
      request,
      path,
      clinic_id,
      {
        requireClinicMatch: true,
      }
    );

    await AuditLogger.logDataAccess(
      user.id,
      user.email || '',
      'patient_visit_summary',
      clinic_id,
      clinic_id,
      ipAddress,
      {
        analysis_type: analysis,
        request_params: rawParams,
      }
    );

    // 共有ヘルパーを使用して分析データを生成
    const patientAnalysisData = await generatePatientAnalysis(
      supabase,
      clinic_id
    );

    return createSuccessResponse(patientAnalysisData);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Customer analysis failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
      clinicId: request.nextUrl.searchParams.get('clinic_id'),
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
